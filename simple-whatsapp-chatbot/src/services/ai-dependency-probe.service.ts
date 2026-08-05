import net from 'node:net';
import tls from 'node:tls';
import { pool } from '../database/connection.js';
import { env } from '../config/env.js';
import type { QueryExecutor } from './message.service.js';
import { AiProviderRegistry } from './ai-provider.service.js';

export type DependencyProbeState =
  | 'reachable'
  | 'unreachable'
  | 'not_configured'
  | 'not_instrumented';

export type AiDependencySnapshot = {
  vectorStore: DependencyProbeState;
  queue: DependencyProbeState;
  objectStorage: DependencyProbeState;
  chatProvider: DependencyProbeState;
  embeddingProvider: DependencyProbeState;
  checkedAt: string;
};

const redisCommand = (parts: string[]): string =>
  `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join('')}`;

const pingRedis = async (redisUrl: string, timeoutMs: number): Promise<boolean> => {
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') return false;

  const port = Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let output = '';
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    const options = { host: parsed.hostname, port };
    const socket =
      parsed.protocol === 'rediss:'
        ? tls.connect(options)
        : net.createConnection(options);

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('connect', () => {
      const password = decodeURIComponent(parsed.password);
      const username = decodeURIComponent(parsed.username);
      if (password) {
        socket.write(
          redisCommand(
            username ? ['AUTH', username, password] : ['AUTH', password]
          )
        );
      }
      socket.write(redisCommand(['PING']));
    });
    socket.on('data', (chunk) => {
      output += chunk.toString('utf8');
      if (output.includes('+PONG')) finish(true);
      if (output.includes('-ERR') || output.includes('-NOAUTH')) finish(false);
    });
  });
};

export class AiDependencyProbeService {
  constructor(
    private readonly database: QueryExecutor = pool,
    private readonly providers = new AiProviderRegistry(),
    private readonly timeoutMs = 1_500
  ) {}

  private async probeVectorStore(): Promise<DependencyProbeState> {
    try {
      const result = await this.database.query<{ installed: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'vector'
          ) AS installed;
        `
      );
      return result.rows[0]?.installed ? 'reachable' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  private async probeQueue(): Promise<DependencyProbeState> {
    if (!env.REDIS_URL) return 'not_configured';
    return (await pingRedis(env.REDIS_URL, this.timeoutMs))
      ? 'reachable'
      : 'unreachable';
  }

  private async probeObjectStorage(): Promise<DependencyProbeState> {
    if (!env.OBJECT_STORAGE_ENDPOINT || !env.OBJECT_STORAGE_BUCKET) {
      return 'not_configured';
    }
    try {
      const response = await fetch(env.OBJECT_STORAGE_ENDPOINT, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      return response.status < 500 ? 'reachable' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  private async probeProvider(
    kind: 'chat' | 'embedding',
    providerId: string | null,
    model: string | null,
    secretReference?: string | null,
    timeoutMs?: number
  ): Promise<DependencyProbeState> {
    if (!providerId || !model) return 'not_configured';
    const provider =
      kind === 'chat'
        ? this.providers.getChatProvider(providerId)
        : this.providers.getEmbeddingProvider(providerId);
    if (!provider) return 'not_instrumented';
    return (await provider.testConnection(model, { secretReference, timeoutMs })) === 'reachable'
      ? 'reachable'
      : 'unreachable';
  }

  async probe(input: {
    provider: string | null;
    chatModel: string | null;
    embeddingProvider: string | null;
    embeddingModel: string | null;
    secretReference?: string | null;
    timeoutMs?: number;
  }): Promise<AiDependencySnapshot> {
    const [
      vectorStore,
      queue,
      objectStorage,
      chatProvider,
      embeddingProvider
    ] = await Promise.all([
      this.probeVectorStore(),
      this.probeQueue(),
      this.probeObjectStorage(),
      this.probeProvider(
        'chat', input.provider, input.chatModel,
        input.secretReference, input.timeoutMs
      ),
      this.probeProvider(
        'embedding',
        input.embeddingProvider,
        input.embeddingModel,
        input.secretReference,
        input.timeoutMs
      )
    ]);

    return {
      vectorStore,
      queue,
      objectStorage,
      chatProvider,
      embeddingProvider,
      checkedAt: new Date().toISOString()
    };
  }
}
