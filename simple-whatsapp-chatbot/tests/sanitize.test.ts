import { sanitizeOperationalError } from '../src/utils/sanitize.js';

describe('operational error sanitization', () => {
  it('redacts JIDs, phone numbers, and secret-shaped values', () => {
    const result = sanitizeOperationalError(
      new Error(
        'send to 628123456789@s.whatsapp.net (+62 812-3456-789) token=top-secret failed'
      )
    );

    expect(result).not.toContain('628123456789');
    expect(result).not.toContain('top-secret');
    expect(result).toContain('[redacted-jid]');
    expect(result).toContain('[redacted-phone]');
    expect(result).toContain('token=[redacted]');
  });
});
