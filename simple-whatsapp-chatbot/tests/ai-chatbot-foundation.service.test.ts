import { AiChatbotFoundationService } from '../src/services/ai-chatbot-foundation.service.js';

const config = {
  enabled: false,
  strictGrounding: true,
  tenantId: '00000000-0000-4000-8000-000000000001',
  provider: 'example-provider',
  chatModel: 'small-chat-model',
  embeddingModel: 'embedding-model',
  providerSecretReference: 'secret/raho/ai-provider',
  redisUrl: 'redis://redis:6379',
  objectStorageEndpoint: 'http://object-storage:9000',
  objectStorageBucket: 'raho-ai-knowledge'
};

describe('AiChatbotFoundationService', () => {
  it('publishes a fail-closed Sprint 6 contract without exposing secrets', () => {
    const result = new AiChatbotFoundationService(config).getFoundation();

    expect(result).toMatchObject({
      phase: 'sprint_6',
      status: 'development_ready',
      runtime: {
        enabled: false,
        customerTraffic: 'disabled',
        sourceOfTruth: 'knowledge_base',
        strictGrounding: true
      },
      provider: {
        state: 'disabled',
        secretReferenceConfigured: true
      },
      guardrails: {
        booking: false,
        payments: false,
        diagnosis: false,
        freeGenerationWithoutContext: false
      }
    });
    expect(result.modules).toHaveLength(9);
    expect(result.modules.filter((module) => module.state === 'available')).toHaveLength(8);
    expect(JSON.stringify(result)).not.toContain(
      config.providerSecretReference
    );
  });

  it('blocks the foundation status when strict grounding is disabled', () => {
    const result = new AiChatbotFoundationService({
      ...config,
      strictGrounding: false
    }).getFoundation();

    expect(result.status).toBe('blocked');
    expect(result.runtime.strictGrounding).toBe(false);
  });

  it('never exposes customer traffic during Sprint 6 Admin Operations Beta', () => {
    const result = new AiChatbotFoundationService({
      ...config,
      enabled: true
    }).getFoundation();

    expect(result.runtime.enabled).toBe(false);
    expect(result.runtime.customerTraffic).toBe('disabled');
  });

  it('blocks development readiness until the bootstrap tenant is defined', () => {
    const result = new AiChatbotFoundationService({
      ...config,
      tenantId: null
    }).getFoundation();

    expect(result.status).toBe('blocked');
    expect(result.tenant.state).toBe('not_instrumented');
  });

  it('reports missing optional infrastructure instead of claiming zero usage', () => {
    const result = new AiChatbotFoundationService({
      ...config,
      provider: null,
      chatModel: null,
      embeddingModel: null,
      providerSecretReference: null,
      redisUrl: null,
      objectStorageEndpoint: null,
      objectStorageBucket: null
    }).getFoundation();

    expect(result.provider.state).toBe('not_instrumented');
    expect(result.infrastructure.queue.state).toBe('not_instrumented');
    expect(result.infrastructure.objectStorage.state).toBe('not_instrumented');
  });
});
