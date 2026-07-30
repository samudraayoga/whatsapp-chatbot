import {
  maskPhoneNumber,
  normalizePhoneNumber,
  phoneFromJid,
  toWhatsAppJid,
  validatePhoneNumber
} from '../src/utils/phone.js';

describe('phone utilities', () => {
  it.each([
    ['081234567890', '6281234567890'],
    ['81234567890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890']
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it('rejects empty input and invalid lengths', () => {
    expect(() => normalizePhoneNumber('---')).toThrow('Phone number is required');
    expect(validatePhoneNumber('6281')).toBe(false);
    expect(validatePhoneNumber('6281234567890')).toBe(true);
  });

  it('converts between phone and WhatsApp JID presentation', () => {
    expect(toWhatsAppJid('6281234567890')).toBe('6281234567890@s.whatsapp.net');
    expect(phoneFromJid('6281234567890@s.whatsapp.net')).toBe('6281234567890');
    expect(maskPhoneNumber('6281234567890')).toBe('6281***890');
  });
});
