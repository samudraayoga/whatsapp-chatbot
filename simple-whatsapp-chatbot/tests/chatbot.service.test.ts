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
        '1. Tentang Raho Club Premier'
      );
      expect(result.rule.responseText).toContain('5. Hubungi Admin');
    }
  );

  it('normalizes casing and repeated whitespace deterministically', () => {
    expect(normalizeChatbotInput('  HaI   Teman  ')).toBe('hai teman');
  });

  it.each([
    ['1', 'layanan kesehatan'],
    ['2', 'program kesehatan'],
    ['3', 'lokasi layanan'],
    ['4', 'melakukan reservasi'],
    ['5', 'Admin Raho Club Premier']
  ])('matches numeric menu %s', (input, expected) => {
    expect(matchChatbotRule(rules, input).rule.responseText).toContain(expected);
  });

  it('marks menu 5 as a durable handoff action', () => {
    expect(matchChatbotRule(rules, '5').rule.action).toBe('create_handoff');
  });

  it('uses the fallback for unsupported input', () => {
    expect(matchChatbotRule(rules, 'tidak ada').rule.responseText).toContain(
      'belum tersedia'
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
