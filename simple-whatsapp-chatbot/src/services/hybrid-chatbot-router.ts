export type HybridChatbotRoute =
  | { kind: 'legacy'; command: 'menu' | 'admin' | 'booking'; canonicalInput: string }
  | { kind: 'ai' };

const normalize = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('id-ID')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const exactMenuCommands = new Set([
  'halo', 'hai', 'hello', 'menu', 'help', 'bantuan',
  'tolong tampilkan menu', 'tampilkan menu'
]);

const exactAdminCommands = new Set([
  '0', 'admin', 'cs', 'customer service', 'hubungi admin',
  'bicara dengan admin', 'saya mau bicara dengan admin',
  'bantuan manusia'
]);

const exactBookingCommands = new Set([
  '8', 'booking', 'reservasi', 'booking terapi', 'cara booking raho',
  'saya mau booking', 'saya mau reservasi', 'buat janji',
  'membuat janji', 'bagaimana cara membuat janji'
]);

export const routeHybridChatbotMessage = (message: string): HybridChatbotRoute => {
  const normalized = normalize(message);

  if (
    exactAdminCommands.has(normalized) ||
    /^(tolong )?(hubungkan|sambungkan|teruskan) (saya )?(ke|dengan) (admin|cs)$/.test(normalized)
  ) {
    return { kind: 'legacy', command: 'admin', canonicalInput: 'admin' };
  }

  if (
    exactBookingCommands.has(normalized) ||
    /^(saya )?(ingin|mau) (buat )?(booking|reservasi|janji)( terapi)?$/.test(normalized)
  ) {
    return { kind: 'legacy', command: 'booking', canonicalInput: 'booking terapi' };
  }

  if (exactMenuCommands.has(normalized)) {
    return { kind: 'legacy', command: 'menu', canonicalInput: 'menu' };
  }

  return { kind: 'ai' };
};
