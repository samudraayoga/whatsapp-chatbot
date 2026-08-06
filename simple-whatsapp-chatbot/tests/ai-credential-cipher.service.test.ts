import { AiCredentialCipher } from '../src/services/ai-credential-cipher.service.js';

describe('AI provider credential encryption', () => {
  it('round-trips an API key without placing plaintext in the stored reference', () => {
    const cipher = new AiCredentialCipher('unit-test-master-key');
    const apiKey = 'sk-test-provider-key-123456789';
    const sealed = cipher.seal(apiKey);

    expect(sealed).toMatch(/^encrypted:\/\/v1\./);
    expect(sealed).not.toContain(apiKey);
    expect(cipher.open(sealed)).toBe(apiKey);
  });

  it('rejects tampered ciphertext and a different master key', () => {
    const sealed = new AiCredentialCipher('first-master-key').seal(
      'sk-test-provider-key-123456789'
    );
    const tampered = `${sealed.slice(0, -1)}${sealed.endsWith('A') ? 'B' : 'A'}`;

    expect(() => new AiCredentialCipher('first-master-key').open(tampered)).toThrow(
      /cannot be opened/
    );
    expect(() => new AiCredentialCipher('second-master-key').open(sealed)).toThrow(
      /cannot be opened/
    );
  });
});
