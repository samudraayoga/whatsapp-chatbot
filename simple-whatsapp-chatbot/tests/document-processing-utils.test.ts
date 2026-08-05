import { readFile } from 'node:fs/promises';
import {
  chunkDocumentText,
  cleanExtractedText,
  estimateTokenCount,
  extractDocumentText,
  validateDocumentFile
} from '../src/services/document-processing-utils.js';

const uploaded = (originalname: string, mimetype: string, buffer: Buffer) => ({
  originalname, mimetype, buffer, size: buffer.length
});

describe('Sprint 3 document validation and extraction', () => {
  it('accepts and extracts UTF-8 TXT and Markdown', async () => {
    for (const [filename, mime] of [['panduan.txt', 'text/plain'], ['panduan.md', 'text/markdown']] as const) {
      const buffer = Buffer.from('# Panduan RAHO\n\nInformasi resmi layanan RAHO tersedia untuk pelanggan.');
      const validated = await validateDocumentFile(uploaded(filename, mime, buffer), 1024);
      const extracted = await extractDocumentText(buffer, validated.extension);
      expect(extracted.text).toContain('Informasi resmi');
    }
  });

  it('normalizes CSV rows into readable labeled text', async () => {
    const buffer = Buffer.from('Cabang,Alamat\nJakarta,"Jalan Sehat, Nomor 1"');
    const validated = await validateDocumentFile(uploaded('cabang.csv', 'text/csv', buffer), 1024);
    const extracted = await extractDocumentText(buffer, validated.extension);
    expect(extracted.text).toContain('Cabang: Jakarta');
    expect(extracted.text).toContain('Alamat: Jalan Sehat, Nomor 1');
  });

  it('validates and extracts real PDF and DOCX fixtures', async () => {
    const pdfBuffer = await readFile('node_modules/pdf-parse/test/data/01-valid.pdf');
    const pdfFile = await validateDocumentFile(uploaded('sample.pdf', 'application/pdf', pdfBuffer), 2_000_000);
    expect((await extractDocumentText(pdfBuffer, pdfFile.extension)).text.length).toBeGreaterThan(10);

    const docxBuffer = await readFile('node_modules/mammoth/test/test-data/single-paragraph.docx');
    const docxFile = await validateDocumentFile(uploaded('sample.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docxBuffer), 2_000_000);
    expect((await extractDocumentText(docxBuffer, docxFile.extension)).text.length).toBeGreaterThan(0);
  });

  it('rejects empty, oversized, fake MIME, and malware test files', async () => {
    await expect(validateDocumentFile(uploaded('empty.txt', 'text/plain', Buffer.alloc(0)), 1024)).rejects.toThrow('must not be empty');
    await expect(validateDocumentFile(uploaded('large.txt', 'text/plain', Buffer.from('large content')), 2)).rejects.toThrow('exceeds');
    await expect(validateDocumentFile(uploaded('fake.pdf', 'application/pdf', Buffer.from('not a PDF')), 1024)).rejects.toThrow('does not match');
    await expect(validateDocumentFile(uploaded('eicar.txt', 'text/plain', Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')), 1024)).rejects.toThrow('malware');
  });
});

describe('Sprint 3 cleaning and chunking', () => {
  it('normalizes whitespace without changing list lines', () => {
    expect(cleanExtractedText('Judul\r\n\r\n- Item   satu\r\n- Item dua'))
      .toBe('Judul\n\n- Item satu\n- Item dua');
  });

  it('creates bounded overlapping chunks with section metadata', () => {
    const sentences = Array.from({ length: 180 }, (_, index) =>
      `Kalimat ${index + 1} menjelaskan layanan resmi RAHO untuk kebutuhan informasi pelanggan.`
    );
    const chunks = chunkDocumentText(`# Kelayakan\n\n${sentences.join(' ')}`);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.tokenCount <= 600)).toBe(true);
    expect(chunks.every((chunk) => chunk.section === 'Kelayakan')).toBe(true);
    expect(chunks[1]!.content).toContain('Kalimat');
    expect(estimateTokenCount(chunks[0]!.content)).toBe(chunks[0]!.tokenCount);
  });
});
