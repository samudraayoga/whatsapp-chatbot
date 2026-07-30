export type ChatbotTriggerType =
  | 'exact'
  | 'alias'
  | 'empty'
  | 'fallback';

export type ChatbotRuleDefinition = {
  id?: string;
  triggerType: ChatbotTriggerType;
  triggerValues: string[];
  responseText: string;
  priority: number;
  enabled: boolean;
  action: 'reply' | 'create_handoff';
};

export type StoredChatbotRule = ChatbotRuleDefinition & {
  id: string;
};

export type RuleMatch = {
  rule: StoredChatbotRule;
  normalizedInput: string;
  matchedTrigger: string | null;
};

export class ChatbotRuleValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('; '));
    this.name = 'ChatbotRuleValidationError';
  }
}

export const normalizeChatbotInput = (
  input: string | undefined | null
): string =>
  (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const validateChatbotRules = (
  rules: ChatbotRuleDefinition[]
): ChatbotRuleDefinition[] => {
  const problems: string[] = [];
  if (rules.length < 1 || rules.length > 100) {
    problems.push('Rule count must be between 1 and 100');
  }
  const priorities = new Set<number>();
  const triggerOwners = new Map<string, number>();

  const normalized = rules.map((rule, index) => {
    if (
      !['exact', 'alias', 'empty', 'fallback'].includes(rule.triggerType)
    ) {
      problems.push(`Rule ${index + 1} has an invalid trigger type`);
    }
    if (!['reply', 'create_handoff'].includes(rule.action)) {
      problems.push(`Rule ${index + 1} has an invalid action`);
    }
    if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 9999) {
      problems.push(`Rule ${index + 1} priority must be an integer from 0 to 9999`);
    } else if (priorities.has(rule.priority)) {
      problems.push(`Priority ${rule.priority} is duplicated`);
    }
    priorities.add(rule.priority);

    const responseText = rule.responseText.replace(/\r\n?/g, '\n').trim();
    if (!responseText || responseText.length > 4096) {
      problems.push(`Rule ${index + 1} response must contain 1 to 4096 characters`);
    }
    const triggerValues = Array.from(
      new Set(rule.triggerValues.map(normalizeChatbotInput).filter(Boolean))
    );
    if (
      rule.triggerValues.length > 20 ||
      triggerValues.some((value) => value.length > 100)
    ) {
      problems.push(
        `Rule ${index + 1} may contain at most 20 triggers of 100 characters`
      );
    }
    if (
      (rule.triggerType === 'exact' || rule.triggerType === 'alias') &&
      triggerValues.length === 0
    ) {
      problems.push(`Rule ${index + 1} requires at least one trigger value`);
    }
    if (
      (rule.triggerType === 'empty' || rule.triggerType === 'fallback') &&
      triggerValues.length > 0
    ) {
      problems.push(`Rule ${index + 1} must not define trigger values`);
    }
    for (const value of triggerValues) {
      const owner = triggerOwners.get(value);
      if (owner !== undefined && rule.enabled) {
        problems.push(
          `Trigger "${value}" is duplicated by rules ${owner + 1} and ${index + 1}`
        );
      }
      if (rule.enabled) triggerOwners.set(value, index);
    }
    return {
      ...rule,
      triggerValues,
      responseText
    };
  });

  const enabledFallbacks = normalized.filter(
    (rule) => rule.enabled && rule.triggerType === 'fallback'
  );
  const enabledEmpty = normalized.filter(
    (rule) => rule.enabled && rule.triggerType === 'empty'
  );
  if (enabledFallbacks.length !== 1) {
    problems.push('Exactly one enabled fallback rule is required');
  }
  if (enabledEmpty.length !== 1) {
    problems.push('Exactly one enabled empty-input rule is required');
  }
  if (problems.length > 0) throw new ChatbotRuleValidationError(problems);
  return normalized;
};

export const matchChatbotRule = (
  rules: StoredChatbotRule[],
  input: string | undefined | null
): RuleMatch => {
  const normalizedInput = normalizeChatbotInput(input);
  const enabled = rules
    .filter((rule) => rule.enabled)
    .slice()
    .sort((left, right) => left.priority - right.priority);
  const matched = enabled.find((rule) => {
    if (rule.triggerType === 'empty') return normalizedInput === '';
    if (rule.triggerType === 'fallback') return false;
    return rule.triggerValues.includes(normalizedInput);
  });
  const fallback = enabled.find((rule) => rule.triggerType === 'fallback');
  const rule = matched ?? fallback;
  if (!rule) {
    throw new ChatbotRuleValidationError([
      'No enabled rule matched and no fallback rule exists'
    ]);
  }
  return {
    rule,
    normalizedInput,
    matchedTrigger:
      rule.triggerType === 'exact' || rule.triggerType === 'alias'
        ? normalizedInput
        : null
  };
};

const mainMenu = `Halo! 👋

Terima kasih telah menghubungi Raho Club Premier.

Saya siap membantu Anda mendapatkan informasi seputar layanan kami.

Silakan pilih menu di bawah ini:

1. Tentang Raho Club Premier
2. Layanan dan Program Kesehatan
3. Lokasi Cabang
4. Reservasi
5. Hubungi Admin

Balas dengan angka 1–5.`;

export const initialChatbotRules: ChatbotRuleDefinition[] = [
  {
    triggerType: 'exact',
    triggerValues: ['1'],
    responseText: `Raho Club Premier adalah layanan kesehatan yang membantu masyarakat memperoleh layanan kesehatan sesuai kebutuhan.

Balas *menu* untuk kembali ke menu utama atau balas *5* jika ingin dihubungi admin.`,
    priority: 10,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'exact',
    triggerValues: ['2'],
    responseText: `Raho Club Premier menyediakan berbagai program kesehatan yang dapat disesuaikan dengan kebutuhan Anda.

Balas *menu* untuk kembali ke menu utama atau balas *5* jika ingin dihubungi admin.`,
    priority: 20,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'exact',
    triggerValues: ['3'],
    responseText: `Raho Club Premier memiliki beberapa lokasi layanan yang dapat dipilih sesuai kebutuhan Anda.

Balas *5* agar admin dapat membantu memberikan informasi lokasi lebih lanjut.`,
    priority: 30,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'exact',
    triggerValues: ['4'],
    responseText: `Untuk melakukan reservasi, balas *5* agar admin Raho Club Premier dapat membantu menentukan layanan dan jadwal yang sesuai.`,
    priority: 40,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'exact',
    triggerValues: ['5'],
    responseText: `Terima kasih! 👋

Admin Raho Club Premier akan segera menghubungi Anda melalui nomor WhatsApp ini.`,
    priority: 50,
    enabled: true,
    action: 'create_handoff'
  },
  {
    triggerType: 'alias',
    triggerValues: ['halo', 'hai', 'hello', 'menu'],
    responseText: mainMenu,
    priority: 100,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'empty',
    triggerValues: [],
    responseText: mainMenu,
    priority: 110,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'fallback',
    triggerValues: [],
    responseText: `Maaf, pilihan yang Anda masukkan belum tersedia.

Silakan balas *menu* untuk melihat menu utama atau balas *5* jika ingin dihubungi admin.`,
    priority: 1000,
    enabled: true,
    action: 'reply'
  }
];
