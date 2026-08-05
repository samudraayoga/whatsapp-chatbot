import {
  knowledgeFingerprint,
  normalizeKnowledgeQuestion,
  type KnowledgeWriteInput
} from '../src/services/knowledge.service.js';

const input: KnowledgeWriteInput = {
  categoryId: null,
  sourceType: 'faq',
  title: 'Keamanan terapi untuk lansia',
  question: 'Apakah terapi RAHO aman untuk lansia?',
  questionVariants: [' Orang tua boleh ikut? ', 'Umur 70 tahun bisa terapi?'],
  content: 'Jawaban resmi RAHO.',
  sourceReference: 'SOP layanan',
  internalNotes: null,
  tags: ['lansia', 'aman'],
  metadata: {},
  requiresDisclaimer: true,
  priority: 20,
  validFrom: null,
  validUntil: null
};

describe('KnowledgeService content primitives', () => {
  it('normalizes future exact-match candidates deterministically', () => {
    expect(normalizeKnowledgeQuestion('  ORANG   TUA boleh ikut?  ')).toBe(
      'orang tua boleh ikut?'
    );
  });

  it('creates a stable SHA-256 fingerprint independent of tag and variant order', () => {
    const first = knowledgeFingerprint(input);
    const second = knowledgeFingerprint({
      ...input,
      tags: [...input.tags].reverse(),
      questionVariants: [...input.questionVariants].reverse()
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it('changes the fingerprint when official content changes', () => {
    expect(knowledgeFingerprint({ ...input, content: 'Jawaban resmi baru.' }))
      .not.toBe(knowledgeFingerprint(input));
  });
});
