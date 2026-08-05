import { pool, closeDatabase } from '../src/database/connection.js';
import { DocumentService } from '../src/services/document.service.js';
import { S3DocumentObjectStorage } from '../src/services/document-storage.service.js';
import { BullMqProcessingQueue, createProcessingWorker } from '../src/services/document-queue.service.js';
import { KnowledgeService } from '../src/services/knowledge.service.js';

const tenantId = '00000000-0000-4000-8000-000000000001';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const storage = new S3DocumentObjectStorage(
  process.env.OBJECT_STORAGE_BUCKET ?? 'raho-ai-knowledge',
  {
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
    accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? 'minioadmin'
  }
);
const queue = new BullMqProcessingQueue(redisUrl);
const documents = new DocumentService(pool, storage, queue);
const knowledge = new KnowledgeService(pool);
const worker = createProcessingWorker(redisUrl, (job, attempt) => documents.processJob(job, attempt), 1)!;
let documentId: string | null = null;
let knowledgeItemId: string | null = null;

const waitForDocument = async (id: string, revision: number) => {
  let current = await documents.get(tenantId, id);
  for (let index = 0; index < 80 && !(current.processingRevision === revision && ['ready', 'failed'].includes(current.status)); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    current = await documents.get(tenantId, id);
  }
  return current;
};

try {
  const admin = await pool.query<{ id: string }>('SELECT id FROM admin_users ORDER BY created_at LIMIT 1;');
  if (!admin.rows[0]) throw new Error('Smoke test requires a bootstrap admin');
  await pool.query(
    `UPDATE ai_integrations SET embedding_provider = 'mock', embedding_model = 'mock-embed-v1'
     WHERE tenant_id = $1;`,
    [tenantId]
  );
  const smokeBody = Buffer.from('# Panduan Sprint 3\n\nInformasi resmi RAHO dapat dicari melalui vector knowledge setelah document processing selesai.');
  const uploaded = await documents.upload(tenantId, admin.rows[0].id, null, {
    originalname: `sprint-3-smoke-${Date.now()}.txt`,
    mimetype: 'text/plain',
    buffer: smokeBody,
    size: smokeBody.length
  });
  documentId = uploaded.id;
  worker.start();
  const firstQueue = await documents.enqueueDocument(tenantId, uploaded.id, `smoke-${Date.now()}`, false);
  let current = await waitForDocument(uploaded.id, firstQueue.processingRevision);
  if (current.status !== 'ready') throw new Error(`Document smoke ended with ${current.status}: ${current.errorMessage ?? 'unknown'}`);
  const secondQueue = await documents.enqueueDocument(tenantId, uploaded.id, `smoke-reprocess-${Date.now()}`, true);
  current = await waitForDocument(uploaded.id, secondQueue.processingRevision);
  if (current.status !== 'ready') throw new Error(`Document reprocess ended with ${current.status}: ${current.errorMessage ?? 'unknown'}`);
  const preview = await documents.preview(tenantId, uploaded.id);
  const search = await documents.searchTest(tenantId, 'informasi resmi RAHO', 3);

  let item = await knowledge.createKnowledge(tenantId, admin.rows[0].id, {
    categoryId: null,
    sourceType: 'faq',
    title: 'FAQ smoke indexing Sprint 3',
    question: 'Apakah FAQ published dapat dicari?',
    questionVariants: ['FAQ ini searchable?'],
    content: 'FAQ published RAHO masuk ke vector index melalui processing queue.',
    sourceReference: 'Synthetic Sprint 3 smoke',
    internalNotes: null,
    tags: ['smoke'],
    metadata: { synthetic: true },
    requiresDisclaimer: false,
    priority: 1,
    validFrom: null,
    validUntil: null
  });
  knowledgeItemId = item.id;
  for (const action of ['submit_review', 'approve', 'publish'] as const) {
    item = (await knowledge.transitionKnowledge(
      tenantId, item.id, admin.rows[0].id, item.version, item.revision,
      action, `Sprint 3 smoke ${action}`
    )).after;
  }
  await documents.enqueueKnowledgeIndex({
    tenantId,
    knowledgeItemId: item.id,
    knowledgeVersionId: item.versionId,
    traceId: `smoke-knowledge-${Date.now()}`
  });
  let activeFaqChunks = 0;
  for (let index = 0; index < 80 && activeFaqChunks === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM knowledge_chunks
       WHERE tenant_id = $1 AND knowledge_item_version_id = $2 AND status = 'active';`,
      [tenantId, item.versionId]
    );
    activeFaqChunks = Number(result.rows[0]?.count ?? 0);
  }
  if (!activeFaqChunks) throw new Error('Published FAQ was not indexed');
  const faqSearch = await documents.searchTest(tenantId, 'FAQ published vector index', 5);
  item = (await knowledge.transitionKnowledge(
    tenantId, item.id, admin.rows[0].id, item.version, item.revision,
    'archive', 'Sprint 3 archive smoke'
  )).after;
  await documents.deactivateKnowledge(tenantId, item.id);
  const inactive = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM knowledge_chunks chunk
     INNER JOIN knowledge_item_versions version ON version.id = chunk.knowledge_item_version_id
     WHERE chunk.tenant_id = $1 AND version.knowledge_item_id = $2 AND chunk.status = 'active';`,
    [tenantId, item.id]
  );
  process.stdout.write(`${JSON.stringify({
    status: current.status,
    reprocessedRevision: current.processingRevision,
    chunks: preview.chunks.length,
    searchHits: search.length,
    embeddingModel: preview.chunks[0]?.embeddingModel ?? null,
    publishedFaqChunks: activeFaqChunks,
    faqSearchHits: faqSearch.length,
    activeFaqChunksAfterArchive: Number(inactive.rows[0]?.count ?? 0)
  })}\n`);
} finally {
  if (documentId) {
    await documents.archive(tenantId, documentId).catch(() => undefined);
    await documents.delete(tenantId, documentId).catch(() => undefined);
  }
  if (knowledgeItemId) {
    await pool.query('DELETE FROM knowledge_items WHERE tenant_id = $1 AND id = $2;', [tenantId, knowledgeItemId]).catch(() => undefined);
  }
  await pool.query(
    `UPDATE ai_integrations SET embedding_provider = NULL, embedding_model = NULL WHERE tenant_id = $1;`,
    [tenantId]
  ).catch(() => undefined);
  await worker.close();
  await queue.close();
  await closeDatabase();
}
