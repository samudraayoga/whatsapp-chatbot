import {
  parseBulkKnowledgeAction,
  parseCategoryWrite,
  parseKnowledgeLifecycle,
  parseKnowledgeWrite
} from '../src/services/knowledge-validation.js';

const validKnowledge = {
  categoryId: 'b1fc4d88-b493-4f49-a8f0-f03ac965db2c',
  sourceType: 'faq',
  title: 'Keamanan terapi untuk lansia',
  question: 'Apakah terapi RAHO aman untuk lansia?',
  questionVariants: ['Orang tua boleh ikut?', 'Lansia bisa menggunakan layanan RAHO?'],
  content: 'Kelayakan mengikuti layanan dikonfirmasi sesuai kebijakan resmi RAHO.',
  sourceReference: 'SOP layanan RAHO',
  internalNotes: 'Review bersama Knowledge Owner.',
  tags: ['lansia', 'kelayakan'],
  metadata: { owner: 'knowledge-team' },
  requiresDisclaimer: true,
  priority: 20,
  validFrom: '2026-08-05T00:00:00.000Z',
  validUntil: '2027-08-05T00:00:00.000Z'
};

describe('Sprint 2 knowledge validation', () => {
  it('accepts a complete tenant-agnostic FAQ payload', () => {
    expect(parseKnowledgeWrite(validKnowledge)).toMatchObject({
      sourceType: 'faq',
      questionVariants: validKnowledge.questionVariants,
      tags: validKnowledge.tags
    });
  });

  it('requires a canonical question for FAQ but not an article', () => {
    expect(() => parseKnowledgeWrite({ ...validKnowledge, question: null })).toThrow(
      'question is required for FAQ knowledge'
    );
    expect(parseKnowledgeWrite({
      ...validKnowledge,
      sourceType: 'article',
      question: null
    }).question).toBeNull();
  });

  it('rejects invalid validity periods and duplicate variants', () => {
    expect(() => parseKnowledgeWrite({
      ...validKnowledge,
      validUntil: '2025-01-01T00:00:00.000Z'
    })).toThrow('validUntil must be later');
    expect(() => parseKnowledgeWrite({
      ...validKnowledge,
      questionVariants: ['Sama', 'sama']
    })).toThrow('must not contain duplicates');
  });

  it('rejects raw HTML and javascript URLs before storage', () => {
    expect(() => parseKnowledgeWrite({
      ...validKnowledge,
      content: '<script>alert(1)</script>'
    })).toThrow('must not contain raw HTML');
    expect(() => parseKnowledgeWrite({
      ...validKnowledge,
      sourceReference: 'javascript:alert(1)'
    })).toThrow('must not contain raw HTML');
    expect(() => parseKnowledgeWrite({
      ...validKnowledge,
      metadata: { nested: { label: '<img src=x onerror=alert(1)>' } }
    })).toThrow('must not contain raw HTML');
  });

  it('validates category concurrency and lifecycle reason', () => {
    expect(parseCategoryWrite({
      name: 'Tentang RAHO', slug: 'tentang-raho', description: null,
      active: true, sortOrder: 1, expectedRevision: 2
    }).expectedRevision).toBe(2);
    expect(parseKnowledgeLifecycle({
      expectedVersion: 1, expectedRevision: 3, reason: 'Reviewed by owner'
    })).toEqual({ expectedVersion: 1, expectedRevision: 3, reason: 'Reviewed by owner' });
  });

  it('validates bounded, unique bulk actions', () => {
    expect(parseBulkKnowledgeAction({
      itemIds: ['8892899c-b84c-4afb-9d13-174fea4ff09b'],
      action: 'publish', reason: 'Approved batch'
    }).action).toBe('publish');
    expect(() => parseBulkKnowledgeAction({
      itemIds: [
        '8892899c-b84c-4afb-9d13-174fea4ff09b',
        '8892899c-b84c-4afb-9d13-174fea4ff09b'
      ],
      action: 'publish', reason: 'Approved batch'
    })).toThrow('must be unique');
  });
});
