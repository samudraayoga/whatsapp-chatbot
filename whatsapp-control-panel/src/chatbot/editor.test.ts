import type { ChatbotRule } from '../api/contracts';
import {
  findChatbotRuleProblems,
  parseTriggerEditorValue,
  reviseChatbotEditSession
} from './editor';

const baseRules: ChatbotRule[] = [
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f01',
    triggerType: 'alias',
    triggerValues: ['halo dunia'],
    responseText: 'Halo',
    priority: 10,
    enabled: true,
    action: 'reply'
  },
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f02',
    triggerType: 'empty',
    triggerValues: [],
    responseText: 'Pesan awal',
    priority: 900,
    enabled: true,
    action: 'reply'
  },
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f03',
    triggerType: 'fallback',
    triggerValues: [],
    responseText: 'Fallback',
    priority: 1000,
    enabled: true,
    action: 'reply'
  }
];

describe('chatbot editor model', () => {
  it('preserves spaces needed to type a multi-word trigger', () => {
    expect(parseTriggerEditorValue('apa itu  raho, halo dunia')).toEqual([
      'apa itu  raho',
      'halo dunia'
    ]);
  });

  it('uses backend-equivalent whitespace normalization for duplicates', () => {
    const duplicate = {
      ...baseRules[0],
      id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f04',
      triggerValues: ['halo  dunia'],
      priority: 20
    };

    expect(findChatbotRuleProblems([...baseRules, duplicate])).toContain(
      'Trigger aktif tidak boleh duplikat.'
    );
  });

  it('pins the base revision while an edit session is active', () => {
    const config = {
      revision: 7,
      updatedAt: '2026-07-30T07:00:00.000Z',
      rules: baseRules
    };
    const session = reviseChatbotEditSession(null, config, (rules) =>
      rules.map((rule, index) =>
        index === 0 ? { ...rule, responseText: 'Edit lokal' } : rule
      )
    );

    expect(session).toMatchObject({ baseRevision: 7 });
    expect(session?.rules[0].clientKey).toBe(
      `stored-rule-${baseRules[0].id}`
    );
  });
});
