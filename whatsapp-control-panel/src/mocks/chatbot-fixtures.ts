import type {
  ChatbotConfigResponse,
  ChatbotRule
} from '../api/contracts';

const menu = `Halo! 👋

1. Tentang Raho Club Premier
2. Layanan dan Program Kesehatan
3. Lokasi Cabang
4. Reservasi
5. Hubungi Admin`;

export const mockChatbotRules: ChatbotRule[] = [
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f01',
    triggerType: 'exact',
    triggerValues: ['3'],
    responseText: 'Informasi lokasi cabang tersedia melalui admin.',
    priority: 30,
    enabled: true,
    action: 'reply'
  },
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f02',
    triggerType: 'exact',
    triggerValues: ['4'],
    responseText: 'Balas 5 untuk bantuan reservasi.',
    priority: 40,
    enabled: true,
    action: 'reply'
  },
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f03',
    triggerType: 'alias',
    triggerValues: ['halo', 'hai', 'hello', 'menu'],
    responseText: menu,
    priority: 100,
    enabled: true,
    action: 'reply'
  },
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f04',
    triggerType: 'empty',
    triggerValues: [],
    responseText: menu,
    priority: 110,
    enabled: true,
    action: 'reply'
  },
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f05',
    triggerType: 'fallback',
    triggerValues: [],
    responseText: 'Pilihan belum tersedia. Balas menu.',
    priority: 1000,
    enabled: true,
    action: 'reply'
  }
];

export const mockChatbotConfig: ChatbotConfigResponse['data'] = {
  revision: 1,
  updatedAt: '2026-07-30T07:00:00.000Z',
  rules: mockChatbotRules
};

export const mockChatbotMeta = () => ({
  requestId: 'req_mock_chatbot',
  generatedAt: new Date().toISOString()
});
