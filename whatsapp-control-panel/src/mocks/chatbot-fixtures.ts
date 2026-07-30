import type {
  ChatbotRule,
  ChatbotVersion,
  ChatbotVersionDetailResponse
} from '../api/contracts';

const now = '2026-07-30T07:00:00.000Z';
const activeId = '9db7b148-f0c3-4b54-9f5f-935aa343e34a';

const menu = `Halo! 👋

1. Tentang Raho Club Premier
2. Layanan dan Program Kesehatan
3. Lokasi Cabang
4. Reservasi
5. Hubungi Admin`;

const initialRules: ChatbotRule[] = [
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

export const mockChatbotDetails: ChatbotVersionDetailResponse['data'][] = [
  {
    version: {
      id: activeId,
      versionNumber: 1,
      name: 'Initial migrated rules',
      status: 'published',
      changeSummary: 'Migrated from source code',
      basedOnVersionId: null,
      revision: 0,
      contentHash: 'mock-active-hash',
      createdBy: null,
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      ruleCount: initialRules.length
    },
    rules: initialRules
  }
];

export const mockMeta = () => ({
  requestId: 'req_mock_sprint_5',
  generatedAt: new Date().toISOString()
});

export const mockVersions = (): ChatbotVersion[] =>
  mockChatbotDetails
    .map((detail) => detail.version)
    .sort((left, right) => right.versionNumber - left.versionNumber);

export const mockCreateDraft = (
  name: string
): ChatbotVersionDetailResponse['data'] => {
  const active = mockChatbotDetails.find(
    (detail) => detail.version.status === 'published'
  )!;
  const timestamp = new Date().toISOString();
  const nextVersion =
    Math.max(...mockChatbotDetails.map((detail) => detail.version.versionNumber)) +
    1;
  const detail: ChatbotVersionDetailResponse['data'] = {
    version: {
      id: crypto.randomUUID(),
      versionNumber: nextVersion,
      name,
      status: 'draft',
      changeSummary: null,
      basedOnVersionId: active.version.id,
      revision: 0,
      contentHash: active.version.contentHash,
      createdBy: 'local-admin',
      publishedBy: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: null,
      ruleCount: active.rules.length
    },
    rules: active.rules.map((rule) => ({ ...rule, id: crypto.randomUUID() }))
  };
  mockChatbotDetails.push(detail);
  return detail;
};
