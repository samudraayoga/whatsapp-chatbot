import {
  ChatbotRuleValidationError,
  initialChatbotRules,
  matchChatbotRule,
  normalizeChatbotInput,
  validateChatbotRules,
  type ChatbotRuleDefinition,
  type StoredChatbotRule
} from '../src/services/chatbot-rules.js';
import { pool } from '../src/database/connection.js';
import { ChatbotService } from '../src/services/chatbot.service.js';

const rules: StoredChatbotRule[] = initialChatbotRules.map((rule, index) => ({
  ...rule,
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
}));

describe('Chatbot rule engine', () => {
  it.each(['halo', 'Hai', ' HELLO ', 'menu', '', '   '])(
    'matches the main menu golden case for %j',
    (input) => {
      const result = matchChatbotRule(rules, input);
      expect(result.rule.responseText).toContain(
        '1. Tentang RAHO'
      );
      expect(result.rule.responseText).toContain('0. Hubungi Admin');
    }
  );

  it('normalizes casing and repeated whitespace deterministically', () => {
    expect(normalizeChatbotInput('  HaI   Teman  ')).toBe('hai teman');
  });

  it.each([
    ['1', 'komunitas kesehatan'],
    ['2', 'Nano Bubble Therapy'],
    ['3', 'Paket 7 sesi'],
    ['4', 'nama kota atau area'],
    ['5', 'Keamanan member'],
    ['6', 'gelembung gas'],
    ['7', 'evaluasi dokter'],
    ['8', 'membuat janji'],
    ['9', 'program terapi'],
    ['10', 'Informasi karier'],
    ['0', 'diteruskan kepada Admin RAHO']
  ])('matches numeric menu %s', (input, expected) => {
    expect(matchChatbotRule(rules, input).rule.responseText).toContain(expected);
  });

  it.each(['0', '4', '8', 'jadwal dokter'])(
    'marks conversion intent %j as a durable handoff action',
    (input) => {
      expect(matchChatbotRule(rules, input).rule.action).toBe('create_handoff');
    }
  );

  it.each([
    ['berapa harga terapi di raho club', 'Rp12.500.000'],
    ['apakah terapi raho sudah diteliti', 'supportive therapy'],
    ['apakah terapi ini bisa untuk lansia', 'evaluasi dokter'],
    ['apa itu igds', 'menyesuaikan proses penghantaran']
  ])('answers Google Search intent %j', (input, expected) => {
    expect(matchChatbotRule(rules, input).rule.responseText).toContain(expected);
  });

  it('uses the fallback for unsupported input', () => {
    expect(matchChatbotRule(rules, 'tidak ada').rule.responseText).toContain(
      'belum menemukan jawaban'
    );
  });

  it('rejects duplicate priority and trigger values', () => {
    const invalid = initialChatbotRules.map((rule) => ({
      ...rule,
      triggerValues: [...rule.triggerValues]
    }));
    invalid[1].priority = invalid[0].priority;
    invalid[1].triggerValues = ['1'];

    expect(() => validateChatbotRules(invalid)).toThrow(
      ChatbotRuleValidationError
    );
    try {
      validateChatbotRules(invalid);
    } catch (error) {
      expect((error as ChatbotRuleValidationError).problems).toEqual(
        expect.arrayContaining([
          expect.stringContaining('duplicated'),
          expect.stringContaining('Trigger "1"')
        ])
      );
    }
  });
});

const candidateRules: ChatbotRuleDefinition[] = [
  {
    triggerType: 'empty',
    triggerValues: [],
    responseText: 'Empty',
    priority: 0,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'exact',
    triggerValues: ['menu'],
    responseText: 'Unsaved menu response',
    priority: 10,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'fallback',
    triggerValues: [],
    responseText: 'Fallback',
    priority: 1000,
    enabled: true,
    action: 'reply'
  }
];

describe('Single active chatbot configuration', () => {
  it('previews unsaved candidate rules without reading the database', () => {
    const service = new ChatbotService();
    const query = vi.spyOn(pool, 'query');

    expect(service.preview('  MENU  ', candidateRules)).toEqual({
      normalizedInput: 'menu',
      matchedRule: {
        triggerType: 'exact',
        priority: 10,
        matchedTrigger: 'menu',
        action: 'reply'
      },
      response: 'Unsaved menu response'
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('does not repopulate the active cache from a read started before invalidation', async () => {
    let finishRead!: (result: { rows: unknown[] }) => void;
    const pendingRead = new Promise<{ rows: unknown[] }>((resolve) => {
      finishRead = resolve;
    });
    vi.spyOn(pool, 'query').mockReturnValue(pendingRead as never);
    const service = new ChatbotService();

    const configRead = service.getConfig();
    service.invalidateCache();
    finishRead({
      rows: candidateRules.map((rule, index) => ({
        id: '3ca59c93-89f4-4c34-bb27-7d9e0887781b',
        revision: 3,
        content_hash: 'old-hash',
        updated_at: new Date('2026-07-30T03:00:00.000Z'),
        rule_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        trigger_type: rule.triggerType,
        trigger_values: rule.triggerValues,
        response_text: rule.responseText,
        priority: rule.priority,
        enabled: rule.enabled,
        action: rule.action
      }))
    });

    await expect(configRead).resolves.toMatchObject({ revision: 3 });
    expect(
      (service as unknown as { activeCache: unknown }).activeCache
    ).toBeNull();
  });

  it('replaces active rules, bumps revision, and invalidates the cache in one transaction', async () => {
    let inserted = 0;
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes("WHERE status = 'published'")) {
        return {
          rows: [
            {
              id: '3ca59c93-89f4-4c34-bb27-7d9e0887781b',
              revision: 3,
              content_hash: 'old-hash',
              updated_at: new Date('2026-07-30T03:00:00.000Z')
            }
          ]
        };
      }
      if (text.includes('COUNT(*)')) return { rows: [{ count: '24' }] };
      if (text.includes('INSERT INTO chatbot_rules')) {
        inserted += 1;
        return {
          rows: [
            {
              id: `00000000-0000-4000-8000-${String(inserted).padStart(12, '0')}`,
              trigger_type: values?.[1],
              trigger_values: JSON.parse(String(values?.[2])),
              response_text: values?.[3],
              priority: values?.[4],
              enabled: values?.[5],
              action: values?.[6]
            }
          ]
        };
      }
      if (text.includes('UPDATE chatbot_rule_versions')) {
        return {
          rows: [
            {
              revision: 4,
              updated_at: new Date('2026-07-30T04:00:00.000Z')
            }
          ]
        };
      }
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    vi.spyOn(pool, 'connect').mockResolvedValue(client as never);
    const service = new ChatbotService();
    (service as unknown as { activeCache: unknown }).activeCache = {
      expiresAt: Date.now() + 5_000
    };

    const result = await service.updateConfig({
      expectedRevision: 3,
      rules: [...candidateRules].reverse()
    });

    expect(result.config).toMatchObject({
      revision: 4,
      updatedAt: '2026-07-30T04:00:00.000Z'
    });
    expect(result.config.rules).toHaveLength(3);
    expect(result.config.rules.map((rule) => rule.priority)).toEqual([
      0, 10, 1000
    ]);
    expect(result.audit).toMatchObject({
      before: { revision: 3, contentHash: 'old-hash', ruleCount: 24 },
      after: { revision: 4, ruleCount: 3 }
    });
    expect(query.mock.calls.map(([sql]) => String(sql).trim())).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('FOR UPDATE'),
        expect.stringContaining('DELETE FROM chatbot_rules'),
        expect.stringContaining('UPDATE chatbot_rule_versions'),
        'COMMIT'
      ])
    );
    expect(query).toHaveBeenCalledTimes(9);
    expect(
      (service as unknown as {
        activeCache: { revision: number; rules: StoredChatbotRule[] } | null;
      }).activeCache
    ).toMatchObject({ revision: 4, rules: result.config.rules });
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects a stale revision before deleting any active rule', async () => {
    const query = vi.fn(async (text: string) => {
      if (text.includes("WHERE status = 'published'")) {
        return {
          rows: [
            {
              id: '3ca59c93-89f4-4c34-bb27-7d9e0887781b',
              revision: 4,
              content_hash: 'current-hash',
              updated_at: new Date('2026-07-30T04:00:00.000Z')
            }
          ]
        };
      }
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    vi.spyOn(pool, 'connect').mockResolvedValue(client as never);

    await expect(
      new ChatbotService().updateConfig({
        expectedRevision: 3,
        rules: candidateRules
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'CHATBOT_CONFIG_CONFLICT',
      details: { currentRevision: 4 }
    });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('DELETE FROM chatbot_rules')
      )
    ).toBe(false);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back a failed replacement without invalidating the active cache', async () => {
    const failure = new Error('Rule insert failed');
    const query = vi.fn(async (text: string) => {
      if (text.includes("WHERE status = 'published'")) {
        return {
          rows: [
            {
              id: '3ca59c93-89f4-4c34-bb27-7d9e0887781b',
              revision: 3,
              content_hash: 'old-hash',
              updated_at: new Date('2026-07-30T03:00:00.000Z')
            }
          ]
        };
      }
      if (text.includes('COUNT(*)')) return { rows: [{ count: '24' }] };
      if (text.includes('INSERT INTO chatbot_rules')) throw failure;
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    vi.spyOn(pool, 'connect').mockResolvedValue(client as never);
    const service = new ChatbotService();
    const cached = { expiresAt: Date.now() + 5_000 };
    (service as unknown as { activeCache: unknown }).activeCache = cached;

    await expect(
      service.updateConfig({ expectedRevision: 3, rules: candidateRules })
    ).rejects.toBe(failure);

    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect((service as unknown as { activeCache: unknown }).activeCache).toBe(
      cached
    );
    expect(client.release).toHaveBeenCalledOnce();
  });
});
