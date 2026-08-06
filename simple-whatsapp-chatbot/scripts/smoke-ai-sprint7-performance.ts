import { closeDatabase, pool } from '../src/database/connection.js';
import { AiOperationsService } from '../src/services/ai-operations.service.js';

const tenantId = process.env.AI_CHATBOT_DEFAULT_TENANT_ID ?? '00000000-0000-4000-8000-000000000001';
const operations = new AiOperationsService(pool);
const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const to = new Date(Date.now() + 60_000).toISOString();
const latencies: number[] = [];

try {
  await Promise.all(Array.from({ length: 30 }, async () => {
    const started = performance.now();
    const result = await operations.getAnalytics(tenantId, from, to);
    if (!result.kpis || !result.cost || !result.series) throw new Error('Analytics response was incomplete');
    latencies.push(performance.now() - started);
  }));
  latencies.sort((left, right) => left - right);
  const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1] ?? 0;
  if (p95 >= 2_000) throw new Error(`Analytics p95 ${p95.toFixed(2)}ms exceeded the initial 2000ms target`);
  process.stdout.write(`${JSON.stringify({ concurrentRequests: latencies.length,
    minimumMs: Number(latencies[0]?.toFixed(2)), p95Ms: Number(p95.toFixed(2)),
    maximumMs: Number(latencies.at(-1)?.toFixed(2)), targetMs: 2000, passed: true })}\n`);
} finally {
  await closeDatabase();
}
