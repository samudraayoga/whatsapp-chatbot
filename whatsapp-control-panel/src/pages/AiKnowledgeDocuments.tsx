import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveKnowledgeDocument,
  deleteKnowledgeDocument,
  getKnowledgeDocumentPreview,
  listKnowledgeDocuments,
  processKnowledgeDocument,
  reprocessKnowledgeDocument,
  searchKnowledgeChunks,
  uploadKnowledgeDocument
} from '../api/documents';
import type {
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeDocumentStatus
} from '../api/contracts';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';

const documentsKey = ['ai-chatbot', 'documents'] as const;
const activeStatuses: KnowledgeDocumentStatus[] = [
  'queued', 'extracting', 'cleaning', 'chunking', 'embedding'
];
const statusTone: Record<KnowledgeDocumentStatus, StatusTone> = {
  uploaded: 'neutral', queued: 'info', extracting: 'info', cleaning: 'info',
  chunking: 'warning', embedding: 'warning', ready: 'success', failed: 'danger', archived: 'neutral'
};
const steps: KnowledgeDocumentStatus[] = ['uploaded', 'extracting', 'cleaning', 'chunking', 'embedding', 'ready'];

const prettyBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ProcessingSteps = ({ document }: { document: KnowledgeDocument }) => {
  const normalized = document.status === 'queued' ? 'uploaded' : document.status;
  const current = steps.indexOf(normalized);
  return (
    <ol className="document-steps" aria-label={`Progress ${document.filename}`}>
      {steps.map((step, index) => (
        <li key={step} data-state={document.status === 'failed' && index === Math.max(current, 0) ? 'failed' : index <= current ? 'done' : 'pending'}>
          <span aria-hidden="true" />{step}
        </li>
      ))}
    </ol>
  );
};

export const AiKnowledgeDocuments = ({
  categories,
  processingOnly = false
}: {
  categories: KnowledgeCategory[];
  processingOnly?: boolean;
}) => {
  const queryClient = useQueryClient();
  const [queryText, setQueryText] = useState('');
  const [status, setStatus] = useState<KnowledgeDocumentStatus | ''>('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const documents = useQuery({
    queryKey: [...documentsKey, queryText, status, processingOnly],
    queryFn: () => listKnowledgeDocuments({
      ...(queryText.trim() ? { query: queryText.trim() } : {}),
      ...(status ? { status } : {})
    }),
    refetchInterval: (query) =>
      query.state.data?.data.some((document) => activeStatuses.includes(document.status)) ? 2_000 : false
  });
  const rows = useMemo(() => {
    const all = documents.data?.data ?? [];
    return processingOnly
      ? all.filter((document) => activeStatuses.includes(document.status) || document.status === 'failed')
      : all;
  }, [documents.data, processingOnly]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: documentsKey });
  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Pilih file terlebih dahulu.');
      setProgress(0);
      return uploadKnowledgeDocument(file, categoryId, setProgress);
    },
    onSuccess: async () => { setFile(null); setProgress(100); await refresh(); }
  });
  const action = useMutation({
    mutationFn: async ({ id, actionName }: { id: string; actionName: 'process' | 'reprocess' | 'archive' | 'delete' }) => {
      if (actionName === 'process') await processKnowledgeDocument(id);
      else if (actionName === 'reprocess') await reprocessKnowledgeDocument(id);
      else if (actionName === 'archive') await archiveKnowledgeDocument(id);
      else await deleteKnowledgeDocument(id);
    },
    onSuccess: refresh
  });
  const preview = useQuery({
    queryKey: [...documentsKey, 'preview', previewId],
    queryFn: () => getKnowledgeDocumentPreview(previewId!),
    enabled: Boolean(previewId)
  });
  const search = useMutation({ mutationFn: () => searchKnowledgeChunks(searchQuery) });

  const acceptDropped = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    setFile(event.dataTransfer.files[0] ?? null);
  };
  const submitUpload = (event: FormEvent) => { event.preventDefault(); upload.mutate(); };

  return (
    <div className="document-page">
      {!processingOnly && (
        <section className="panel document-upload-panel">
          <div className="panel__heading"><div><p className="eyebrow">Private object storage</p><h2>Upload dokumen</h2></div><StatusBadge tone="info">Maks. 10 MB</StatusBadge></div>
          <form onSubmit={submitUpload}>
            <div className="document-dropzone" data-dragging={dragging} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={acceptDropped}>
              <strong>{file ? file.name : 'Tarik file ke sini'}</strong>
              <span>PDF, DOCX, TXT, Markdown, atau CSV</span>
              <label className="button button--secondary">Pilih file<input className="sr-only" type="file" accept=".pdf,.docx,.txt,.md,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
            </div>
            <label>Kategori<select value={categoryId ?? ''} onChange={(event) => setCategoryId(event.target.value || null)}><option value="">Tanpa kategori</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            {upload.isPending && <progress max="100" value={progress}>{progress}%</progress>}
            <button type="submit" disabled={!file || upload.isPending}>{upload.isPending ? `Mengunggah ${progress}%` : 'Upload dokumen'}</button>
            {upload.isError && <p className="form-error" role="alert">{upload.error.message}</p>}
          </form>
        </section>
      )}

      <section className="panel document-list-panel">
        <div className="panel__heading"><div><p className="eyebrow">{processingOnly ? 'Async worker queue' : 'Document library'}</p><h2>{processingOnly ? 'Processing Queue' : 'Dokumen knowledge'}</h2></div><button className="button button--secondary" type="button" onClick={() => documents.refetch()}>Refresh</button></div>
        <div className="knowledge-filters">
          <label>Search<input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Nama file" /></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as KnowledgeDocumentStatus | '')}><option value="">Semua</option>{(['uploaded', 'queued', 'extracting', 'cleaning', 'chunking', 'embedding', 'ready', 'failed', 'archived'] as KnowledgeDocumentStatus[]).map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        {documents.isPending ? <div className="page-state"><span className="loader" aria-hidden="true" /><h3>Memuat dokumen…</h3></div>
          : documents.isError ? <p className="form-error" role="alert">{documents.error.message}</p>
          : rows.length === 0 ? <div className="empty-stage"><h3>{processingOnly ? 'Queue sedang kosong' : 'Belum ada dokumen'}</h3></div>
          : <div className="document-list">{rows.map((document) => (
            <article key={document.id} className="document-card">
              <div className="document-card__heading"><div><strong>{document.filename}</strong><span>{document.extension.toUpperCase()} · {prettyBytes(document.fileSize)} · {document.categoryName ?? 'Tanpa kategori'}</span></div><StatusBadge tone={statusTone[document.status]}>{document.status}</StatusBadge></div>
              <ProcessingSteps document={document} />
              <dl><div><dt>Chunk</dt><dd>{document.totalChunks}</dd></div><div><dt>Attempt</dt><dd>{document.attemptCount}</dd></div><div><dt>Uploader</dt><dd>{document.uploadedByName}</dd></div><div><dt>Processed</dt><dd>{document.processedAt ? new Date(document.processedAt).toLocaleString('id-ID') : '—'}</dd></div></dl>
              {document.errorMessage && <p className="form-error">{document.errorCode}: {document.errorMessage}</p>}
              <div className="table-actions">
                {document.status === 'uploaded' && <button className="text-button" type="button" onClick={() => action.mutate({ id: document.id, actionName: 'process' })}>Process</button>}
                {(document.status === 'ready' || document.status === 'failed') && <button className="text-button" type="button" onClick={() => action.mutate({ id: document.id, actionName: 'reprocess' })}>Reprocess</button>}
                {(document.status === 'ready' || document.status === 'failed' || document.status === 'uploaded') && <button className="text-button" type="button" onClick={() => action.mutate({ id: document.id, actionName: 'archive' })}>Archive</button>}
                {['uploaded', 'failed', 'archived'].includes(document.status) && <button className="text-button text-button--danger" type="button" onClick={() => action.mutate({ id: document.id, actionName: 'delete' })}>Delete</button>}
                <button className="text-button" type="button" onClick={() => setPreviewId(document.id)}>Preview</button>
              </div>
            </article>
          ))}</div>}
        {action.isError && <p className="form-error" role="alert">{action.error.message}</p>}
      </section>

      {!processingOnly && <section className="panel vector-search-test"><div className="panel__heading"><div><p className="eyebrow">Internal only</p><h2>Uji vector search</h2></div></div><form onSubmit={(event) => { event.preventDefault(); search.mutate(); }}><label>Pertanyaan<input minLength={2} maxLength={500} required value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label><button type="submit" disabled={search.isPending}>Cari chunk</button></form>{search.data && <ol>{search.data.data.map((result) => <li key={result.chunkId}><strong>{result.title ?? result.sourceType}</strong><span>Score {result.score.toFixed(4)}</span><p>{result.content}</p></li>)}</ol>}{search.isError && <p className="form-error" role="alert">{search.error.message}</p>}</section>}

      {previewId && <section className="panel document-preview"><div className="panel__heading"><h2>Preview extraction dan chunk</h2><button type="button" className="button button--secondary" onClick={() => setPreviewId(null)}>Tutup</button></div>{preview.isPending ? <span className="loader" /> : preview.isError ? <p className="form-error">{preview.error.message}</p> : preview.data && <><pre>{preview.data.data.extractionPreview ?? 'Belum ada extraction preview.'}</pre><ol>{preview.data.data.chunks.map((chunk) => <li key={chunk.id}><strong>Chunk {chunk.chunkIndex + 1} · {chunk.tokenCount} token</strong><p>{chunk.content}</p></li>)}</ol></>}</section>}
    </div>
  );
};
