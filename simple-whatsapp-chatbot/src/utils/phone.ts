export const normalizePhoneNumber = (input: string): string => {
  const digitsOnly = input.replace(/\D/g, '').trim();

  if (!digitsOnly) {
    throw new Error('Phone number is required');
  }

  if (digitsOnly.startsWith('0')) {
    return `62${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.startsWith('8')) {
    return `62${digitsOnly}`;
  }

  return digitsOnly;
};

export const validatePhoneNumber = (phone: string): boolean => /^\d{10,15}$/.test(phone);

export const toWhatsAppJid = (phone: string): string => `${phone}@s.whatsapp.net`;

export const phoneFromJid = (jid: string): string => jid.replace(/@.+$/, '');

export const maskPhoneNumber = (phone: string): string => {
  if (phone.length <= 4) {
    return phone;
  }

  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
};
