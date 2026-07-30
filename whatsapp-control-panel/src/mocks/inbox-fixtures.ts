import type {
  Contact,
  Conversation,
  Handoff,
  Message
} from '../api/contracts';

export const mockContacts: Contact[] = [
  {
    id: '101',
    displayName: 'Nadia Putri',
    maskedPhone: '6281•••••120',
    identity: {
      status: 'resolved',
      whatsappJid: '6281•••••120@s.whatsapp.net',
      pnJid: '6281•••••120@s.whatsapp.net',
      lidJid: null,
      canonicalJid: '6281•••••120@s.whatsapp.net'
    },
    counts: { incoming: 12, outgoing: 8 },
    lastOutgoingStatus: 'delivered',
    lastInteractionAt: '2026-07-30T04:26:00.000Z',
    createdAt: '2026-07-22T02:00:00.000Z',
    updatedAt: '2026-07-30T04:26:00.000Z'
  },
  {
    id: '102',
    displayName: 'Raka Studio',
    maskedPhone: '6285•••••808',
    identity: {
      status: 'unresolved',
      whatsappJid: '142•••••889@lid',
      pnJid: null,
      lidJid: '142•••••889@lid',
      canonicalJid: null
    },
    counts: { incoming: 5, outgoing: 3 },
    lastOutgoingStatus: 'failed',
    lastInteractionAt: '2026-07-30T03:40:00.000Z',
    createdAt: '2026-07-25T02:00:00.000Z',
    updatedAt: '2026-07-30T03:40:00.000Z'
  },
  {
    id: '103',
    displayName: null,
    maskedPhone: '6287•••••441',
    identity: {
      status: 'conflict',
      whatsappJid: '6287•••••441@s.whatsapp.net',
      pnJid: '6287•••••441@s.whatsapp.net',
      lidJid: '845•••••123@lid',
      canonicalJid: null
    },
    counts: { incoming: 2, outgoing: 1 },
    lastOutgoingStatus: 'sent',
    lastInteractionAt: '2026-07-29T09:10:00.000Z',
    createdAt: '2026-07-28T02:00:00.000Z',
    updatedAt: '2026-07-29T09:10:00.000Z'
  }
];

export const mockMessages: Record<string, Message[]> = {
  '101': [
    {
      id: '1005',
      providerMessageId: 'wamid.mock.1005',
      direction: 'incoming',
      messageType: 'text',
      content: '5',
      state: 'received',
      createdAt: '2026-07-30T04:26:00.000Z'
    },
    {
      id: '1004',
      providerMessageId: 'wamid.mock.1004',
      direction: 'outgoing',
      messageType: 'text',
      content: 'Baik, operator kami akan menindaklanjuti percakapan ini.',
      state: 'delivered',
      createdAt: '2026-07-30T04:25:30.000Z'
    },
    {
      id: '1003',
      providerMessageId: 'wamid.mock.1003',
      direction: 'incoming',
      messageType: 'image',
      content: null,
      state: 'received',
      createdAt: '2026-07-30T04:24:00.000Z'
    },
    {
      id: '1002',
      providerMessageId: 'wamid.mock.1002',
      direction: 'incoming',
      messageType: 'text',
      content: 'Saya ingin bicara dengan operator.',
      state: 'received',
      createdAt: '2026-07-30T04:23:00.000Z'
    }
  ],
  '102': [
    {
      id: '2002',
      providerMessageId: 'wamid.mock.2002',
      direction: 'outgoing',
      messageType: 'text',
      content: 'Pesan tindak lanjut untuk pesanan Anda.',
      state: 'failed',
      createdAt: '2026-07-30T03:40:00.000Z'
    },
    {
      id: '2001',
      providerMessageId: 'wamid.mock.2001',
      direction: 'incoming',
      messageType: 'text',
      content: 'Bisa bantu cek status pesanan?',
      state: 'received',
      createdAt: '2026-07-30T03:35:00.000Z'
    }
  ],
  '103': [
    {
      id: '3001',
      providerMessageId: null,
      direction: 'incoming',
      messageType: 'text',
      content: 'Halo',
      state: 'received',
      createdAt: '2026-07-29T09:10:00.000Z'
    }
  ]
};

export const mockConversations: Conversation[] = mockContacts.map(
  (contact) => {
    const lastMessage = mockMessages[contact.id][0];
    return {
      id: contact.id,
      displayName: contact.displayName,
      maskedPhone: contact.maskedPhone,
      identityStatus: contact.identity.status,
      lastMessage: {
        id: lastMessage.id,
        preview:
          lastMessage.messageType === 'text'
            ? (lastMessage.content ?? '')
            : `[Unsupported: ${lastMessage.messageType}]`,
        direction: lastMessage.direction,
        messageType: lastMessage.messageType,
        occurredAt: lastMessage.createdAt
      },
      lastOutgoingStatus: contact.lastOutgoingStatus,
      counts: contact.counts
    };
  }
);

export const mockHandoffs: Handoff[] = [
  {
    id: '9b5fd595-cfb4-48f0-8a64-d64a130176ba',
    contactId: '101',
    sourceMessageId: '1005',
    state: 'open',
    assigneeUserId: null,
    dueAt: '2026-07-31T04:26:00.000Z',
    resolvedAt: null,
    resolutionNote: null,
    createdAt: '2026-07-30T04:26:00.000Z',
    updatedAt: '2026-07-30T04:26:00.000Z',
    contact: {
      displayName: 'Nadia Putri',
      maskedPhone: '6281•••••120'
    },
    sourcePreview: '5'
  }
];
