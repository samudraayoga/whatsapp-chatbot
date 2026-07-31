import {
  ChatbotRuleValidationError,
  initialChatbotRules,
  matchChatbotRule,
  normalizeChatbotInput,
  validateChatbotRules,
  type StoredChatbotRule
} from '../src/services/chatbot-rules.js';

const rules: StoredChatbotRule[] = initialChatbotRules.map((rule, index) => ({
  ...rule,
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
}));

describe('Versioned chatbot rule engine', () => {
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
