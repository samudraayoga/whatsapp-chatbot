import { env } from '../config/env.js';

export type AiChatbotCapabilityState =
  | 'enabled'
  | 'disabled'
  | 'not_instrumented'
  | 'unavailable';

export type AiChatbotModule = {
  key:
    | 'overview'
    | 'knowledge'
    | 'instructions'
    | 'playground'
    | 'conversations'
    | 'unanswered'
    | 'handoffs'
    | 'analytics'
    | 'settings';
  label: string;
  path: string;
  state: 'available' | 'planned';
  targetSprint: number;
};

export type AiChatbotFoundationConfig = {
  enabled: boolean;
  strictGrounding: boolean;
  tenantId: string | null;
  provider: string | null;
  chatModel: string | null;
  embeddingModel: string | null;
  providerSecretReference: string | null;
  redisUrl: string | null;
  objectStorageEndpoint: string | null;
  objectStorageBucket: string | null;
};

const modules: AiChatbotModule[] = [
  {
    key: 'overview',
    label: 'Overview',
    path: '/ai-chatbot/overview',
    state: 'available',
    targetSprint: 0
  },
  {
    key: 'knowledge',
    label: 'Knowledge Base',
    path: '/ai-chatbot/knowledge',
    state: 'available',
    targetSprint: 2
  },
  {
    key: 'instructions',
    label: 'AI Instructions',
    path: '/ai-chatbot/instructions',
    state: 'available',
    targetSprint: 1
  },
  {
    key: 'playground',
    label: 'Testing Playground',
    path: '/ai-chatbot/playground',
    state: 'available',
    targetSprint: 4
  },
  {
    key: 'conversations',
    label: 'Conversation Logs',
    path: '/ai-chatbot/conversations',
    state: 'available',
    targetSprint: 6
  },
  {
    key: 'unanswered',
    label: 'Unanswered Questions',
    path: '/ai-chatbot/unanswered',
    state: 'available',
    targetSprint: 6
  },
  {
    key: 'handoffs',
    label: 'Handoff Queue',
    path: '/ai-chatbot/handoffs',
    state: 'available',
    targetSprint: 5
  },
  {
    key: 'analytics',
    label: 'Analytics',
    path: '/ai-chatbot/analytics',
    state: 'planned',
    targetSprint: 7
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/ai-chatbot/settings',
    state: 'available',
    targetSprint: 1
  }
];

const capabilityState = (
  configured: boolean,
  runtimeEnabled: boolean
): AiChatbotCapabilityState =>
  configured ? (runtimeEnabled ? 'enabled' : 'disabled') : 'not_instrumented';

export class AiChatbotFoundationService {
  constructor(
    private readonly config: AiChatbotFoundationConfig = {
      enabled: env.AI_CHATBOT_ENABLED,
      strictGrounding: env.AI_CHATBOT_STRICT_GROUNDING,
      tenantId: env.AI_CHATBOT_DEFAULT_TENANT_ID,
      provider: env.AI_CHATBOT_PROVIDER,
      chatModel: env.AI_CHATBOT_CHAT_MODEL,
      embeddingModel: env.AI_CHATBOT_EMBEDDING_MODEL,
      providerSecretReference: env.AI_CHATBOT_PROVIDER_SECRET_REF,
      redisUrl: env.REDIS_URL,
      objectStorageEndpoint: env.OBJECT_STORAGE_ENDPOINT,
      objectStorageBucket: env.OBJECT_STORAGE_BUCKET
    }
  ) {}

  getFoundation(tenantId: string | null = this.config.tenantId) {
    const providerConfigured = Boolean(
      this.config.provider &&
        this.config.chatModel &&
        this.config.embeddingModel &&
        this.config.providerSecretReference
    );
    const tenantConfigured = Boolean(tenantId);
    const redisConfigured = Boolean(this.config.redisUrl);
    const objectStorageConfigured = Boolean(
      this.config.objectStorageEndpoint && this.config.objectStorageBucket
    );

    return {
      apiVersion: 'v1' as const,
      phase: 'sprint_6' as const,
      status: this.config.strictGrounding && tenantConfigured
        ? ('development_ready' as const)
        : ('blocked' as const),
      runtime: {
        enabled: false as const,
        customerTraffic: 'disabled' as const,
        mode: 'rag' as const,
        sourceOfTruth: 'knowledge_base' as const,
        strictGrounding: this.config.strictGrounding
      },
      tenant: {
        state: capabilityState(tenantConfigured, false),
        strategy: 'single_tenant_bootstrap' as const,
        tenantId
      },
      provider: {
        state: capabilityState(providerConfigured, false),
        name: this.config.provider,
        chatModel: this.config.chatModel,
        embeddingModel: this.config.embeddingModel,
        secretReferenceConfigured: Boolean(
          this.config.providerSecretReference
        )
      },
      infrastructure: {
        vectorStore: {
          state: capabilityState(tenantConfigured, false),
          adapter: 'postgresql_pgvector' as const
        },
        queue: {
          state: capabilityState(redisConfigured, false),
          adapter: 'redis' as const
        },
        objectStorage: {
          state: capabilityState(objectStorageConfigured, false),
          adapter: 's3_compatible' as const
        }
      },
      guardrails: {
        faqOnly: true,
        booking: false,
        payments: false,
        diagnosis: false,
        personalizedMedicalAdvice: false,
        freeGenerationWithoutContext: false,
        fallbackAndHandoff: true
      },
      modules
    };
  }
}
