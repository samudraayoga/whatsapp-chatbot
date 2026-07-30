import { ChatbotService } from '../src/services/chatbot.service.js';

describe('ChatbotService characterization', () => {
  const chatbot = new ChatbotService();

  it.each(['halo', 'Hai', ' HELLO ', 'menu', '', '   '])(
    'returns the main menu for %j',
    (input) => {
      expect(chatbot.getReply(input)).toContain('1. Tentang Raho Club Premier');
      expect(chatbot.getReply(input)).toContain('5. Hubungi Admin');
    }
  );

  it('documents the current numbered response behavior', () => {
    expect(chatbot.getReply('1')).toContain('layanan kesehatan');
    expect(chatbot.getReply('2')).toContain('program kesehatan');
    expect(chatbot.getReply('3')).toContain('layanan konsultasi');
    expect(chatbot.getReply('4')).toContain('lokasi layanan');
    expect(chatbot.getReply('5')).toContain('Admin Raho Club Premier');
  });

  it('returns a fallback for an unsupported choice', () => {
    expect(chatbot.getReply('tidak ada')).toContain('belum tersedia');
  });
});
