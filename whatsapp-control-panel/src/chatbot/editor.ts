import type { ChatbotConfigResponse, ChatbotRule } from '../api/contracts';

export type EditableChatbotRule = ChatbotRule & { clientKey: string };

export type ChatbotEditSession = {
  baseRevision: number;
  baseRules: ChatbotRule[];
  rules: EditableChatbotRule[];
};

type ActiveChatbotConfig = ChatbotConfigResponse['data'];

export const createChatbotRuleClientKey = () =>
  `local-rule-${globalThis.crypto.randomUUID()}`;

export const normalizeChatbotTrigger = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

export const parseTriggerEditorValue = (value: string): string[] =>
  value
    .split(',')
    .map((trigger, index) =>
      index === 0 ? trigger : trigger.replace(/^\s+/, '')
    );

export const toEditableRules = (
  rules: ChatbotRule[]
): EditableChatbotRule[] =>
  rules.map((rule) => ({
    ...rule,
    clientKey: rule.id
      ? `stored-rule-${rule.id}`
      : createChatbotRuleClientKey()
  }));

export const stripEditorMetadata = (
  rules: EditableChatbotRule[]
): ChatbotRule[] =>
  rules.map((rule) => ({
    ...(rule.id ? { id: rule.id } : {}),
    triggerType: rule.triggerType,
    triggerValues: rule.triggerValues,
    responseText: rule.responseText,
    priority: rule.priority,
    enabled: rule.enabled,
    action: rule.action
  }));

export const toChatbotPayloadRules = (
  rules: EditableChatbotRule[]
): ChatbotRule[] =>
  stripEditorMetadata(rules).map((rule) => ({
    ...rule,
    triggerValues: rule.triggerValues
      .map(normalizeChatbotTrigger)
      .filter(Boolean)
  }));

export const reviseChatbotEditSession = (
  current: ChatbotEditSession | null,
  config: ActiveChatbotConfig,
  revise: (rules: EditableChatbotRule[]) => EditableChatbotRule[]
): ChatbotEditSession | null => {
  const baseRules = current?.baseRules ?? config.rules;
  const editableRules = current?.rules ?? toEditableRules(config.rules);
  const nextRules = revise(editableRules);

  if (
    JSON.stringify(stripEditorMetadata(nextRules)) === JSON.stringify(baseRules)
  ) {
    return null;
  }

  return {
    baseRevision: current?.baseRevision ?? config.revision,
    baseRules,
    rules: nextRules
  };
};

export const findChatbotRuleProblems = (rules: ChatbotRule[]) => {
  const problems: string[] = [];
  if (rules.length < 1 || rules.length > 100) {
    problems.push('Jumlah rule harus antara 1 dan 100.');
  }

  const priorities = rules.map((rule) => rule.priority);
  if (new Set(priorities).size !== priorities.length) {
    problems.push('Priority harus unik.');
  }
  if (
    rules.some(
      (rule) =>
        !Number.isInteger(rule.priority) ||
        rule.priority < 0 ||
        rule.priority > 9999
    )
  ) {
    problems.push('Priority harus berupa angka bulat antara 0 dan 9999.');
  }
  if (
    rules.filter((rule) => rule.enabled && rule.triggerType === 'empty')
      .length !== 1
  ) {
    problems.push('Harus ada tepat satu rule pesan awal yang aktif.');
  }
  if (
    rules.filter((rule) => rule.enabled && rule.triggerType === 'fallback')
      .length !== 1
  ) {
    problems.push('Harus ada tepat satu fallback rule aktif.');
  }
  if (
    rules.some(
      (rule) =>
        !rule.responseText.trim() || rule.responseText.trim().length > 4096
    )
  ) {
    problems.push('Semua response wajib berisi 1–4.096 karakter.');
  }
  if (
    rules.some(
      (rule) =>
        ['exact', 'alias'].includes(rule.triggerType) &&
        !rule.triggerValues.some(normalizeChatbotTrigger)
    )
  ) {
    problems.push('Rule exact dan alias wajib memiliki minimal satu trigger.');
  }
  if (
    rules.some(
      (rule) =>
        ['empty', 'fallback'].includes(rule.triggerType) &&
        rule.triggerValues.some(normalizeChatbotTrigger)
    )
  ) {
    problems.push('Rule pesan awal dan fallback tidak boleh memiliki trigger.');
  }
  if (
    rules.some(
      (rule) =>
        rule.triggerValues.length > 20 ||
        rule.triggerValues.some(
          (value) => normalizeChatbotTrigger(value).length > 100
        )
    )
  ) {
    problems.push('Maksimal 20 trigger per rule dan 100 karakter per trigger.');
  }

  const triggers = rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) => rule.triggerValues.map(normalizeChatbotTrigger))
    .filter(Boolean);
  if (new Set(triggers).size !== triggers.length) {
    problems.push('Trigger aktif tidak boleh duplikat.');
  }

  return problems;
};

export const nextAvailablePriority = (rules: ChatbotRule[]) => {
  const used = new Set(rules.map((rule) => rule.priority));
  const normalPriorities = rules
    .filter((rule) => ['exact', 'alias'].includes(rule.triggerType))
    .map((rule) => rule.priority);
  const preferredStart = Math.max(0, ...normalPriorities) + 10;

  for (let priority = preferredStart; priority <= 9999; priority += 10) {
    if (!used.has(priority)) return priority;
  }
  for (let priority = 0; priority <= 9999; priority += 1) {
    if (!used.has(priority)) return priority;
  }
  return 9999;
};

export const createEditableRule = (
  rules: EditableChatbotRule[],
  clientKey: string
): EditableChatbotRule => ({
  clientKey,
  triggerType: 'exact',
  triggerValues: [''],
  responseText: '',
  priority: nextAvailablePriority(rules),
  enabled: true,
  action: 'reply'
});
