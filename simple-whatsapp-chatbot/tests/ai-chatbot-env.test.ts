const importEnv = async () => {
  vi.resetModules();
  return import('../src/config/env.js');
};

afterEach(() => {
  process.env.AI_CHATBOT_ENABLED = 'false';
  process.env.AI_CHATBOT_STRICT_GROUNDING = 'true';
  process.env.AI_CHATBOT_DEFAULT_TENANT_ID =
    '00000000-0000-4000-8000-000000000001';
  process.env.AI_CHATBOT_PROVIDER_SECRET_REF = '';
  process.env.AI_CHATBOT_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
  process.env.AI_CHATBOT_ALPHA_RUNTIME_ENABLED = 'false';
  vi.resetModules();
});

describe('AI chatbot environment guard', () => {
  it('rejects runtime activation while Sprint 1 remains hard-off', async () => {
    process.env.AI_CHATBOT_ENABLED = 'true';

    await expect(importEnv()).rejects.toThrow(
      'AI_CHATBOT_ENABLED must remain false'
    );
  });

  it('rejects an invalid strict-grounding boolean', async () => {
    process.env.AI_CHATBOT_STRICT_GROUNDING = 'sometimes';

    await expect(importEnv()).rejects.toThrow(
      'AI_CHATBOT_STRICT_GROUNDING must be either true or false'
    );
  });

  it('rejects a malformed bootstrap tenant identifier', async () => {
    process.env.AI_CHATBOT_DEFAULT_TENANT_ID = 'raho';

    await expect(importEnv()).rejects.toThrow(
      'AI_CHATBOT_DEFAULT_TENANT_ID must be a valid UUID'
    );
  });

  it('rejects a plaintext provider credential during bootstrap', async () => {
    process.env.AI_CHATBOT_PROVIDER_SECRET_REF = 'sk-plaintext-secret';

    await expect(importEnv()).rejects.toThrow(
      'AI_CHATBOT_PROVIDER_SECRET_REF must be an approved secret-manager URI'
    );
  });

  it('accepts an approved provider secret reference', async () => {
    process.env.AI_CHATBOT_PROVIDER_SECRET_REF = 'env://AI_CHATBOT_MOCK_KEY';

    await expect(importEnv()).resolves.toBeDefined();
  });

  it('rejects an invalid provider base URL and invalid Alpha flag', async () => {
    process.env.AI_CHATBOT_PROVIDER_BASE_URL = 'file:///tmp/provider';
    await expect(importEnv()).rejects.toThrow('AI_CHATBOT_PROVIDER_BASE_URL');

    process.env.AI_CHATBOT_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_CHATBOT_ALPHA_RUNTIME_ENABLED = 'sometimes';
    await expect(importEnv()).rejects.toThrow(
      'AI_CHATBOT_ALPHA_RUNTIME_ENABLED must be either true or false'
    );
  });
});
