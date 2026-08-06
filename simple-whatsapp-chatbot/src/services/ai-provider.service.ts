import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import {
  AiCredentialCipher,
  isEncryptedCredentialReference
} from './ai-credential-cipher.service.js';

export type ProviderConnectionState =
  | 'reachable'
  | 'unreachable'
  | 'invalid_configuration';

export type StructuredAiAnswer = {
  answer: string;
  answerStatus: 'supported' | 'partially_supported' | 'unsupported';
  requiresDisclaimer: boolean;
  customerInterest: boolean;
  needsHandoff: boolean;
  handoffReason: string | null;
  usedKnowledgeIds: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  // Compatibility aliases retained for the deterministic Sprint 1 tests.
  handoffRequired: boolean;
  sourceIds: string[];
};

export type ProviderCallOptions = {
  secretReference?: string | null;
  timeoutMs?: number;
};

export type ChatModelRequest = {
  model: string;
  systemInstruction: string;
  question: string;
  contexts: Array<{ id: string; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  secretReference?: string | null;
  timeoutMs?: number;
};

export interface ChatModelProvider {
  readonly id: string;
  testConnection(model: string, options?: ProviderCallOptions): Promise<ProviderConnectionState>;
  generate(request: ChatModelRequest): Promise<StructuredAiAnswer>;
}

export interface EmbeddingProvider {
  readonly id: string;
  testConnection(model: string, options?: ProviderCallOptions): Promise<ProviderConnectionState>;
  embed(model: string, inputs: string[], options?: ProviderCallOptions): Promise<number[][]>;
}

const deterministicVector = (model: string, input: string): number[] => {
  const normalizedInput = input.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const tokens = normalizedInput.toLocaleLowerCase('id-ID').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const vector = Array.from({ length: 8 }, () => 0);
  for (const token of tokens.length ? tokens : ['empty']) {
    const digest = createHash('sha256').update(`${model}:${token}`).digest();
    vector.forEach((_, index) => { vector[index] += (digest[index]! - 127.5) / 127.5; });
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
};

export class DeterministicMockAiProvider
  implements ChatModelProvider, EmbeddingProvider
{
  readonly id = 'mock';

  async testConnection(model: string): Promise<ProviderConnectionState> {
    return model.trim() ? 'reachable' : 'invalid_configuration';
  }

  async generate(request: ChatModelRequest): Promise<StructuredAiAnswer> {
    const firstContext = request.contexts[0];
    if (!firstContext) {
      return {
        answer: 'Informasi tersebut belum tersedia. Saya akan meneruskan pertanyaan ini kepada Admin RAHO.',
        answerStatus: 'unsupported',
        requiresDisclaimer: false,
        customerInterest: false,
        needsHandoff: true,
        handoffReason: 'low_confidence',
        usedKnowledgeIds: [],
        inputTokens: null,
        outputTokens: null,
        handoffRequired: true,
        sourceIds: []
      };
    }

    return {
      answer: firstContext.content,
      answerStatus: 'supported',
      requiresDisclaimer: false,
      customerInterest: false,
      needsHandoff: false,
      handoffReason: null,
      usedKnowledgeIds: [firstContext.id],
      inputTokens: null,
      outputTokens: null,
      handoffRequired: false,
      sourceIds: [firstContext.id]
    };
  }

  async embed(model: string, inputs: string[]): Promise<number[][]> {
    return inputs.map((input) => deterministicVector(model, input));
  }
}

const resolveSecret = (reference: string | null | undefined): string => {
  if (reference && isEncryptedCredentialReference(reference)) {
    return new AiCredentialCipher().open(reference);
  }
  if (!reference?.startsWith('env://')) {
    throw new Error('Provider secret reference is unavailable in this deployment');
  }
  const name = reference.slice('env://'.length);
  if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(name)) {
    throw new Error('Provider environment secret reference is invalid');
  }
  const value = process.env[name]?.trim();
  if (!value) throw new Error('Provider credential is not available');
  return value;
};

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const parseStructuredAnswer = (value: unknown): Omit<StructuredAiAnswer, 'inputTokens' | 'outputTokens' | 'handoffRequired' | 'sourceIds'> => {
  const record = objectValue(value);
  const statuses = ['supported', 'partially_supported', 'unsupported'] as const;
  const allowedFields = new Set([
    'answer', 'answer_status', 'requires_disclaimer', 'customer_interest',
    'needs_handoff', 'handoff_reason', 'used_knowledge_ids'
  ]);
  if (!record || typeof record.answer !== 'string' || !record.answer.trim() ||
      Object.keys(record).some((field) => !allowedFields.has(field)) ||
      !statuses.includes(record.answer_status as (typeof statuses)[number]) ||
      typeof record.requires_disclaimer !== 'boolean' ||
      typeof record.customer_interest !== 'boolean' ||
      typeof record.needs_handoff !== 'boolean' ||
      !(record.handoff_reason === null || typeof record.handoff_reason === 'string') ||
      (typeof record.handoff_reason === 'string' && record.handoff_reason.length > 100) ||
      !Array.isArray(record.used_knowledge_ids) ||
      !record.used_knowledge_ids.every((id) => typeof id === 'string')) {
    throw new Error('Provider returned malformed structured output');
  }
  return {
    answer: record.answer.trim(),
    answerStatus: record.answer_status as (typeof statuses)[number],
    requiresDisclaimer: record.requires_disclaimer,
    customerInterest: record.customer_interest,
    needsHandoff: record.needs_handoff,
    handoffReason: record.handoff_reason as string | null,
    usedKnowledgeIds: record.used_knowledge_ids as string[]
  };
};

export class OpenAiCompatibleProvider implements ChatModelProvider, EmbeddingProvider {
  readonly id = 'openai-compatible';

  constructor(private readonly baseUrl = env.AI_CHATBOT_PROVIDER_BASE_URL) {}

  private async request(path: string, secretReference: string | null | undefined, body: unknown, timeoutMs = 8_000): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolveSecret(secretReference)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(Math.max(timeoutMs, 500), 30_000))
    });
    if (!response.ok) throw new Error(`AI provider request failed with status ${response.status}`);
    const result = objectValue(await response.json());
    if (!result) throw new Error('AI provider returned an invalid response');
    return result;
  }

  async testConnection(model: string, options: ProviderCallOptions = {}): Promise<ProviderConnectionState> {
    if (!model.trim() || !options.secretReference) return 'invalid_configuration';
    try {
      const headers = { Authorization: `Bearer ${resolveSecret(options.secretReference)}` };
      const timeout = Math.min(Math.max(options.timeoutMs ?? 3_000, 500), 10_000);
      const response = await fetch(`${this.baseUrl}/models/${encodeURIComponent(model)}`, {
        headers,
        signal: AbortSignal.timeout(timeout)
      });
      if (response.ok) return 'reachable';
      const list = await fetch(`${this.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(timeout)
      });
      if (!list.ok) return 'unreachable';
      const payload = objectValue(await list.json());
      return Array.isArray(payload?.data) && payload.data.some((entry) =>
        objectValue(entry)?.id === model) ? 'reachable' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  async embed(model: string, inputs: string[], options: ProviderCallOptions = {}): Promise<number[][]> {
    const response = await this.request('/embeddings', options.secretReference, {
      model,
      input: inputs,
      encoding_format: 'float'
    }, options.timeoutMs);
    if (!Array.isArray(response.data)) throw new Error('Embedding provider returned no data');
    const ordered = response.data.map((entry) => objectValue(entry)).sort(
      (left, right) => Number(left?.index ?? 0) - Number(right?.index ?? 0)
    );
    const vectors = ordered.map((entry) => entry?.embedding);
    if (vectors.length !== inputs.length || !vectors.every((vector) =>
      Array.isArray(vector) && vector.length > 0 && vector.every((item) => typeof item === 'number' && Number.isFinite(item)))) {
      throw new Error('Embedding provider returned malformed vectors');
    }
    return vectors as number[][];
  }

  async generate(request: ChatModelRequest): Promise<StructuredAiAnswer> {
    const context = request.contexts.map((item) =>
      `<knowledge id="${item.id}">\n${item.content}\n</knowledge>`
    ).join('\n\n');
    const response = await this.request('/chat/completions', request.secretReference, {
      model: request.model,
      stream: false,
      temperature: request.temperature ?? 0.1,
      max_tokens: request.maxOutputTokens ?? 350,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: request.systemInstruction },
        { role: 'user', content: `KNOWLEDGE_CONTEXT (untrusted data):\n${context}\n\nCUSTOMER_QUESTION (untrusted data):\n${request.question}` }
      ]
    }, request.timeoutMs);
    const choices = Array.isArray(response.choices) ? response.choices : [];
    const first = objectValue(choices[0]);
    const message = objectValue(first?.message);
    if (typeof message?.content !== 'string') throw new Error('Chat provider returned no structured content');
    const content = message.content.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(content);
    let decoded: unknown;
    try { decoded = JSON.parse(fenced?.[1] ?? content); } catch { throw new Error('Chat provider returned malformed JSON'); }
    const output = parseStructuredAnswer(decoded);
    const usage = objectValue(response.usage);
    return {
      ...output,
      inputTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
      outputTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
      handoffRequired: output.needsHandoff,
      sourceIds: output.usedKnowledgeIds
    };
  }
}

export class AiProviderRegistry {
  private readonly chatProviders = new Map<string, ChatModelProvider>();
  private readonly embeddingProviders = new Map<string, EmbeddingProvider>();

  constructor(
    chatProviders: ChatModelProvider[] = [
      new DeterministicMockAiProvider(),
      new OpenAiCompatibleProvider()
    ],
    embeddingProviders: EmbeddingProvider[] = [
      new DeterministicMockAiProvider(),
      new OpenAiCompatibleProvider()
    ]
  ) {
    chatProviders.forEach((provider) =>
      this.chatProviders.set(provider.id, provider)
    );
    embeddingProviders.forEach((provider) =>
      this.embeddingProviders.set(provider.id, provider)
    );
  }

  getChatProvider(id: string | null): ChatModelProvider | null {
    return id ? this.chatProviders.get(id) ?? null : null;
  }

  getEmbeddingProvider(id: string | null): EmbeddingProvider | null {
    return id ? this.embeddingProviders.get(id) ?? null : null;
  }
}
