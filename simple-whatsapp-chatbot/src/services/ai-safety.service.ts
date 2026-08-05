import type { QueryExecutor } from './message.service.js';
import { pool } from '../database/connection.js';

export type AiSafetyCategory =
  | 'emergency'
  | 'medical_personal'
  | 'diagnosis_request'
  | 'medication_dosage'
  | 'stop_treatment'
  | 'prompt_injection'
  | 'explicit_admin'
  | 'normal_faq';

export type AiSafetyDecision = {
  category: AiSafetyCategory;
  flags: string[];
  skipRag: boolean;
  requiresDisclaimer: boolean;
  requiresHandoff: boolean;
  priority: 'normal' | 'high';
  handoffReason: string | null;
};

export type AiInterestDecision = {
  interested: boolean;
  confidence: number;
  reason: string | null;
};

export type AiSafetyPolicy = {
  historyLimit: number;
  emergencyMessage: string;
  medicalMessage: string;
  promptInjectionMessage: string;
  rules: Record<Exclude<AiSafetyCategory, 'normal_faq'>, string[]>;
};

export type AiOutputValidationInput = {
  answer: string;
  context: string;
  maximumLength: number;
  requiresDisclaimer: boolean;
  disclaimerText: string | null;
};

export type AiOutputValidation = {
  valid: boolean;
  reasons: string[];
};

const emergencyMessage = 'Chatbot ini tidak dapat menangani kondisi darurat. Segera hubungi layanan darurat atau fasilitas kesehatan terdekat. Admin RAHO juga dapat membantu mengarahkan informasi lebih lanjut.';
const medicalMessage = 'Kesesuaian program perlu dinilai melalui konsultasi dan evaluasi dokter karena kondisi setiap orang berbeda. Informasi dari chatbot bersifat umum dan tidak menggantikan diagnosis atau pengobatan dokter. Admin RAHO dapat membantu memberikan informasi lanjutan.';
const promptInjectionMessage = 'Maaf, saya hanya dapat membantu menggunakan informasi resmi RAHO yang telah disetujui. Admin RAHO dapat membantu jika Anda membutuhkan informasi lain.';

export const defaultAiSafetyPolicy: AiSafetyPolicy = {
  historyLimit: 8,
  emergencyMessage,
  medicalMessage,
  promptInjectionMessage,
  rules: {
    emergency: [
      'sesak napas berat', 'sesak nafas berat', 'sulit bernapas', 'tidak sadarkan diri',
      'tidak sadar', 'ga sadar', 'gak sadar', 'pingsan',
      'nyeri dada berat', 'kejang', 'pendarahan berat', 'perdarahan berat',
      'kondisi darurat', 'darurat medis', 'gawat darurat'
    ],
    medical_personal: [
      'saya punya diabetes', 'saya memiliki diabetes', 'saya punya hipertensi',
      'saya memiliki hipertensi', 'apakah saya boleh ikut', 'aman untuk saya'
    ],
    diagnosis_request: [
      'diagnosis saya', 'diagnosa saya', 'saya sakit apa', 'penyakit apa yang saya alami',
      'tolong diagnosis', 'tolong diagnosa'
    ],
    medication_dosage: [
      'berapa dosis', 'dosis obat', 'obat apa yang harus', 'minum obat berapa',
      'aturan pakai obat'
    ],
    stop_treatment: [
      'berhenti minum obat', 'hentikan obat', 'stop obat', 'tidak usah minum obat',
      'berhenti terapi', 'hentikan pengobatan'
    ],
    prompt_injection: [
      'abaikan instruksi', 'ignore previous', 'ignore all previous', 'system prompt',
      'tampilkan prompt', 'bocorkan prompt', 'dump knowledge', 'tampilkan semua knowledge',
      'developer message', 'reveal your instructions', 'apa instruksi rahasiamu',
      'tulis ulang konteks internal', 'print hidden prompt'
    ],
    explicit_admin: [
      'hubungkan ke admin', 'bicara dengan admin', 'minta admin', 'kontak admin',
      'ingin dihubungi', 'tolong hubungi saya', 'customer service', 'orang manusia'
    ]
  }
};

const normalize = (value: string): string =>
  value.normalize('NFKC').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}%]+/gu, ' ').replace(/\s+/g, ' ').trim();

const hasPhrase = (value: string, phrases: string[]): boolean =>
  phrases.some((phrase) => value.includes(normalize(phrase)));

const stringArray = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value.map((item) => item.trim()).filter(Boolean).slice(0, 100)
    : null;

const policyFromRow = (value: unknown): AiSafetyPolicy => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultAiSafetyPolicy;
  const row = value as Record<string, unknown>;
  const rulesValue = row.rules && typeof row.rules === 'object' && !Array.isArray(row.rules)
    ? row.rules as Record<string, unknown> : {};
  const rules = { ...defaultAiSafetyPolicy.rules };
  for (const category of Object.keys(rules) as Array<keyof typeof rules>) {
    rules[category] = stringArray(rulesValue[category]) ?? rules[category];
  }
  return {
    historyLimit: Number.isInteger(row.historyLimit)
      ? Math.min(Math.max(Number(row.historyLimit), 6), 10) : 8,
    emergencyMessage: typeof row.emergencyMessage === 'string' && row.emergencyMessage.trim()
      ? row.emergencyMessage.trim().slice(0, 2000) : emergencyMessage,
    medicalMessage: typeof row.medicalMessage === 'string' && row.medicalMessage.trim()
      ? row.medicalMessage.trim().slice(0, 2000) : medicalMessage,
    promptInjectionMessage: typeof row.promptInjectionMessage === 'string' && row.promptInjectionMessage.trim()
      ? row.promptInjectionMessage.trim().slice(0, 2000) : promptInjectionMessage,
    rules
  };
};

const categoryDecision = (category: AiSafetyCategory): AiSafetyDecision => {
  const medical = ['medical_personal', 'diagnosis_request', 'medication_dosage', 'stop_treatment'].includes(category);
  return {
    category,
    flags: category === 'normal_faq' ? [] : [category],
    skipRag: category !== 'normal_faq',
    requiresDisclaimer: medical,
    requiresHandoff: category === 'emergency' || medical || category === 'explicit_admin',
    priority: category === 'emergency' ? 'high' : 'normal',
    handoffReason: category === 'emergency' ? 'emergency'
      : medical ? 'medical_question'
        : category === 'explicit_admin' ? 'customer_requested_admin'
          : category === 'prompt_injection' ? 'unsupported_request' : null
  };
};

const priceClaims = (value: string): string[] =>
  value.match(/(?:rp\.?\s*\d[\d.,]*|\d[\d.,]*\s*(?:ribu|juta))/gi)?.map(normalize) ?? [];

const locationClaims = (value: string): string[] =>
  value.match(/(?:berlokasi|lokasi|alamat|cabang)\s+(?:di\s+)?[\p{L}\p{N} .,-]{3,80}/giu)?.map(normalize) ?? [];

export class AiSafetyService {
  constructor(private readonly database: QueryExecutor = pool) {}

  async getPolicy(tenantId: string): Promise<AiSafetyPolicy> {
    const result = await this.database.query<{ policy: unknown }>(
      'SELECT policy FROM ai_safety_policies WHERE tenant_id = $1::uuid LIMIT 1;',
      [tenantId]
    );
    return policyFromRow(result.rows[0]?.policy);
  }

  classify(message: string, policy: AiSafetyPolicy = defaultAiSafetyPolicy): AiSafetyDecision {
    const value = normalize(message);
    const precedence: Array<Exclude<AiSafetyCategory, 'normal_faq'>> = [
      'emergency', 'stop_treatment', 'medication_dosage', 'diagnosis_request',
      'medical_personal', 'prompt_injection', 'explicit_admin'
    ];
    const category = precedence.find((candidate) => hasPhrase(value, policy.rules[candidate])) ?? 'normal_faq';
    return categoryDecision(category);
  }

  detectInterest(message: string): AiInterestDecision {
    const value = normalize(message);
    const strong = [
      'saya tertarik', 'saya berminat', 'ingin mencoba', 'ingin bergabung',
      'cara bergabung', 'langkah berikutnya', 'mau daftar', 'ingin konsultasi'
    ];
    const contextual = ['bagaimana caranya', 'selanjutnya bagaimana', 'bisa daftar'];
    if (hasPhrase(value, strong)) {
      return { interested: true, confidence: 0.95, reason: 'Customer meminta langkah berikutnya' };
    }
    if (hasPhrase(value, contextual)) {
      return { interested: true, confidence: 0.82, reason: 'Customer menunjukkan niat melanjutkan' };
    }
    return { interested: false, confidence: 0, reason: null };
  }

  validateOutput(input: AiOutputValidationInput): AiOutputValidation {
    const answer = normalize(input.answer);
    const context = normalize(input.context);
    const reasons: string[] = [];
    if (!answer || input.answer.length > input.maximumLength) reasons.push('excessive_or_empty_answer');
    if (/(pasti|dijamin|jaminan|100%)\s+(sembuh|berhasil|aman)/u.test(answer)) reasons.push('guaranteed_result_claim');
    if (/(anda|kamu)\s+(menderita|mengidap|terdiagnosis)/u.test(answer)) reasons.push('diagnosis_wording');
    if (/(berhenti|hentikan|stop|tidak usah)\s+(minum\s+)?(obat|pengobatan|terapi)/u.test(answer)) reasons.push('stop_treatment_wording');
    if (/(system prompt|developer message|instruksi internal|knowledge_context|customer_question)/u.test(answer)) reasons.push('internal_prompt_disclosure');
    for (const claim of priceClaims(input.answer)) if (!context.includes(claim)) reasons.push('unsupported_price');
    for (const claim of locationClaims(input.answer)) if (!context.includes(claim)) reasons.push('unsupported_location');
    if (input.requiresDisclaimer && input.disclaimerText && !answer.includes(normalize(input.disclaimerText))) {
      reasons.push('missing_disclaimer');
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
  }

  appendDisclaimer(answer: string, disclaimerText: string | null): string {
    const disclaimer = disclaimerText?.trim();
    if (!disclaimer || normalize(answer).includes(normalize(disclaimer))) return answer.trim();
    return `${answer.trim()}\n\n${disclaimer}`;
  }
}
