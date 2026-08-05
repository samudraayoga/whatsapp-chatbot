import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

export type DocumentProcessingJob =
  | {
      kind: 'document';
      tenantId: string;
      documentId: string;
      processingRevision: number;
      traceId: string;
    }
  | {
      kind: 'knowledge';
      tenantId: string;
      knowledgeItemId: string;
      knowledgeVersionId: string;
      traceId: string;
    };

export interface ProcessingQueue {
  readonly available: boolean;
  enqueue(job: DocumentProcessingJob): Promise<string>;
  close(): Promise<void>;
}

const QUEUE_NAME = 'ai-knowledge-processing';

const connectionFromUrl = (redisUrl: string): ConnectionOptions => {
  const parsed = new URL(redisUrl);
  const database = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(Number.isInteger(database) && database >= 0 ? { db: database } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {})
  };
};

export class BullMqProcessingQueue implements ProcessingQueue {
  readonly available = true;
  private readonly queue: Queue<DocumentProcessingJob>;

  constructor(redisUrl: string) {
    this.queue = new Queue<DocumentProcessingJob>(QUEUE_NAME, {
      connection: connectionFromUrl(redisUrl),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 }
      }
    });
    this.queue.on('error', (error) => {
      logger.error('AI knowledge processing queue error', { error: error.message });
    });
  }

  async enqueue(job: DocumentProcessingJob): Promise<string> {
    const queued = await this.queue.add(job.kind, job, {
      jobId: `${job.kind}-${randomUUID()}`
    });
    return queued.id ?? '';
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

}

export class DisabledProcessingQueue implements ProcessingQueue {
  readonly available = false;

  async enqueue(): Promise<string> {
    throw new Error('AI processing queue is not configured');
  }

  async close(): Promise<void> {}
}

export class DocumentProcessingWorker {
  private readonly worker: Worker<DocumentProcessingJob>;

  constructor(
    redisUrl: string,
    handler: (job: DocumentProcessingJob, attempt: number) => Promise<void>,
    concurrency: number
  ) {
    this.worker = new Worker<DocumentProcessingJob>(
      QUEUE_NAME,
      async (job: Job<DocumentProcessingJob>) => handler(job.data, job.attemptsMade + 1),
      {
        connection: connectionFromUrl(redisUrl),
        concurrency,
        autorun: false
      }
    );
    this.worker.on('error', (error) => {
      logger.error('AI knowledge processing worker error', { error: error.message });
    });
    this.worker.on('failed', (job, error) => {
      logger.warn('AI knowledge processing job failed', {
        jobId: job?.id,
        kind: job?.data.kind,
        attemptsMade: job?.attemptsMade,
        error: error.message
      });
    });
  }

  start(): void {
    void this.worker.run();
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export const createProcessingQueue = (redisUrl: string | null): ProcessingQueue =>
  redisUrl ? new BullMqProcessingQueue(redisUrl) : new DisabledProcessingQueue();

export const createProcessingWorker = (
  redisUrl: string | null,
  handler: (job: DocumentProcessingJob, attempt: number) => Promise<void>,
  concurrency: number
): DocumentProcessingWorker | null =>
  redisUrl ? new DocumentProcessingWorker(redisUrl, handler, concurrency) : null;
