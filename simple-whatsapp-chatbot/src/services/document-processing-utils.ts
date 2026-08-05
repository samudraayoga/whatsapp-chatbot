import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { AppError } from '../middleware/error.middleware.js';

export const supportedDocumentExtensions = ['pdf', 'docx', 'txt', 'md', 'csv'] as const;
export type SupportedDocumentExtension = (typeof supportedDocumentExtensions)[number];

const mimeByExtension: Record<SupportedDocumentExtension, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv'
};

export type ValidatedDocumentFile = {
  originalFilename: string;
  sanitizedFilename: string;
  extension: SupportedDocumentExtension;
  mimeType: string;
  size: number;
  sha256: string;
  buffer: Buffer;
};

export interface MalwareScanner {
  scan(buffer: Buffer): Promise<'clean' | 'infected'>;
}

export class BaselineMalwareScanner implements MalwareScanner {
  async scan(buffer: Buffer): Promise<'clean' | 'infected'> {
    return buffer.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))
      ? 'infected'
      : 'clean';
  }
}

const safeFilename = (filename: string, extension: SupportedDocumentExtension): string => {
  const stem = path.basename(filename, path.extname(filename))
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || 'document';
  return `${stem}.${extension}`;
};

const decodeText = (buffer: Buffer): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new AppError('Text document must use valid UTF-8 encoding', 400, 'DOCUMENT_ENCODING_INVALID');
  }
};

export const validateDocumentFile = async (
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  maxBytes: number,
  scanner: MalwareScanner = new BaselineMalwareScanner()
): Promise<ValidatedDocumentFile> => {
  if (!file.buffer.length || file.size < 1) {
    throw new AppError('Document file must not be empty', 400, 'DOCUMENT_EMPTY');
  }
  if (file.size > maxBytes) {
    throw new AppError(`Document exceeds the ${maxBytes} byte limit`, 413, 'DOCUMENT_TOO_LARGE');
  }
  const extension = path.extname(file.originalname).slice(1).toLocaleLowerCase('en-US');
  if (!supportedDocumentExtensions.includes(extension as SupportedDocumentExtension)) {
    throw new AppError('Document extension must be PDF, DOCX, TXT, MD, or CSV', 400, 'DOCUMENT_EXTENSION_UNSUPPORTED');
  }
  const supportedExtension = extension as SupportedDocumentExtension;
  const detected = await fileTypeFromBuffer(file.buffer);
  if (supportedExtension === 'pdf' && detected?.mime !== 'application/pdf') {
    throw new AppError('File content does not match the PDF extension', 400, 'DOCUMENT_MIME_MISMATCH');
  }
  if (supportedExtension === 'docx' && detected?.mime !== mimeByExtension.docx) {
    throw new AppError('File content does not match the DOCX extension', 400, 'DOCUMENT_MIME_MISMATCH');
  }
  if (supportedExtension === 'txt' || supportedExtension === 'md' || supportedExtension === 'csv') {
    if (detected && !detected.mime.startsWith('text/')) {
      throw new AppError('File content does not match a text document', 400, 'DOCUMENT_MIME_MISMATCH');
    }
    const decoded = decodeText(file.buffer);
    if (!decoded.trim()) throw new AppError('Document contains no readable text', 400, 'DOCUMENT_EMPTY');
  }
  if (await scanner.scan(file.buffer) !== 'clean') {
    throw new AppError('Document failed malware scanning', 422, 'DOCUMENT_MALWARE_DETECTED');
  }
  return {
    originalFilename: path.basename(file.originalname).slice(0, 255),
    sanitizedFilename: safeFilename(file.originalname, supportedExtension),
    extension: supportedExtension,
    mimeType: mimeByExtension[supportedExtension],
    size: file.size,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    buffer: file.buffer
  };
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
};

const normalizeCsv = (value: string): string => {
  const rows = value.split(/\r?\n/).filter((row) => row.trim()).map(parseCsvLine);
  const headers = rows[0] ?? [];
  return rows.slice(1).map((row, rowIndex) =>
    `Baris ${rowIndex + 1}: ${headers.map((header, index) => `${header || `Kolom ${index + 1}`}: ${row[index] ?? ''}`).join('; ')}`
  ).join('\n');
};

export type ExtractedDocument = {
  text: string;
  pageCount: number | null;
};

export const extractDocumentText = async (
  buffer: Buffer,
  extension: SupportedDocumentExtension
): Promise<ExtractedDocument> => {
  if (extension === 'pdf') {
    const result = await pdf(buffer);
    return { text: result.text, pageCount: result.numpages || null };
  }
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, pageCount: null };
  }
  const value = decodeText(buffer);
  return {
    text: extension === 'csv' ? normalizeCsv(value) : value,
    pageCount: null
  };
};

export const cleanExtractedText = (value: string): string => {
  const cleaned = value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  if (cleaned.length < 10) {
    throw new AppError('Document extraction produced too little readable text', 422, 'DOCUMENT_EXTRACTION_EMPTY');
  }
  const replacementCharacters = (cleaned.match(/�/g) ?? []).length;
  if (replacementCharacters / cleaned.length > 0.01) {
    throw new AppError('Document extraction appears garbled', 422, 'DOCUMENT_EXTRACTION_GARBLED');
  }
  return cleaned;
};

export const estimateTokenCount = (value: string): number =>
  Math.max(1, Math.ceil(value.trim().split(/\s+/).length * 1.3));

export type TextChunk = {
  content: string;
  section: string | null;
  tokenCount: number;
};

const isHeading = (line: string): boolean =>
  /^#{1,6}\s+/.test(line) || (/^[A-Z0-9][^.!?]{2,80}$/.test(line) && line.split(/\s+/).length <= 10);

export const chunkDocumentText = (
  text: string,
  targetTokens = 450,
  maximumTokens = 600,
  overlapTokens = 75
): TextChunk[] => {
  const units: Array<{ text: string; section: string | null }> = [];
  let section: string | null = null;
  for (const paragraph of text.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/u)) {
    const normalized = paragraph.trim();
    if (!normalized) continue;
    if (isHeading(normalized)) {
      section = normalized.replace(/^#{1,6}\s+/, '').slice(0, 255);
      continue;
    }
    units.push({ text: normalized, section });
  }
  const chunks: TextChunk[] = [];
  let current: Array<{ text: string; section: string | null }> = [];
  let currentTokens = 0;
  const flush = (): void => {
    if (!current.length) return;
    const content = current.map((unit) => unit.text).join('\n\n');
    chunks.push({
      content,
      section: current.find((unit) => unit.section)?.section ?? null,
      tokenCount: estimateTokenCount(content)
    });
    const overlap: typeof current = [];
    let overlapCount = 0;
    for (let index = current.length - 1; index >= 0; index -= 1) {
      const unit = current[index]!;
      const tokens = estimateTokenCount(unit.text);
      if (overlap.length && overlapCount + tokens > overlapTokens) break;
      overlap.unshift(unit);
      overlapCount += tokens;
    }
    current = overlap;
    currentTokens = overlapCount;
  };
  for (const unit of units) {
    const tokens = estimateTokenCount(unit.text);
    if (current.length && (currentTokens >= targetTokens || currentTokens + tokens > maximumTokens)) flush();
    if (tokens > maximumTokens) {
      const words = unit.text.split(/\s+/);
      const wordLimit = Math.floor(maximumTokens / 1.3);
      for (let index = 0; index < words.length; index += wordLimit) {
        const content = words.slice(index, index + wordLimit).join(' ');
        chunks.push({ content, section: unit.section, tokenCount: estimateTokenCount(content) });
      }
      current = [];
      currentTokens = 0;
    } else {
      current.push(unit);
      currentTokens += tokens;
    }
  }
  if (current.length) {
    const content = current.map((unit) => unit.text).join('\n\n');
    chunks.push({ content, section: current.find((unit) => unit.section)?.section ?? null, tokenCount: estimateTokenCount(content) });
  }
  return chunks.filter((chunk, index, all) =>
    index === 0 || chunk.content !== all[index - 1]?.content
  );
};
