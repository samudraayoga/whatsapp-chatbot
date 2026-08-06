import { routeHybridChatbotMessage } from '../src/services/hybrid-chatbot-router.js';

describe('hybrid chatbot router', () => {
  it.each([
    ['menu?', 'menu', 'menu'],
    ['Tolong hubungkan saya ke admin.', 'admin', 'admin'],
    ['Saya ingin buat reservasi!', 'booking', 'booking terapi']
  ])('routes %s to the legacy %s command', (message, command, canonicalInput) => {
    expect(routeHybridChatbotMessage(message)).toEqual({
      kind: 'legacy',
      command,
      canonicalInput
    });
  });

  it.each([
    'Apa itu RAHO Premier?',
    'Berapa harga terapi untuk tujuh sesi?',
    'Di mana lokasi cabang RAHO yang paling dekat?'
  ])('routes ordinary customer question to AI: %s', (message) => {
    expect(routeHybridChatbotMessage(message)).toEqual({ kind: 'ai' });
  });
});
