import { readCookie } from './auth';
import { requestJson } from './client';
import { resolveApiUrl } from './client';
import {
  knowledgeDocumentListResponseSchema,
  knowledgeDocumentPreviewResponseSchema,
  knowledgeDocumentResponseSchema,
  knowledgeSearchTestResponseSchema,
  type KnowledgeDocumentListResponse,
  type KnowledgeDocumentPreviewResponse,
  type KnowledgeDocumentResponse,
  type KnowledgeDocumentStatus,
  type KnowledgeSearchTestResponse
} from './contracts';

const csrfHeader = (): HeadersInit => {
  const token = readCookie('admin_csrf');
  return token ? { 'X-CSRF-Token': token } : {};
};

export const uploadKnowledgeDocument = async (
  file: File,
  categoryId: string | null,
  onProgress?: (percentage: number) => void
): Promise<KnowledgeDocumentResponse> => {
  const body = new FormData();
  body.append('file', file);
  if (categoryId) body.append('categoryId', categoryId);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', resolveApiUrl('/api/admin/v1/ai-chatbot/documents/upload'));
    request.withCredentials = true;
    request.setRequestHeader('Accept', 'application/json');
    const csrf = readCookie('admin_csrf');
    if (csrf) request.setRequestHeader('X-CSRF-Token', csrf);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      let payload: unknown = null;
      try { payload = JSON.parse(request.responseText) as unknown; } catch { /* safe fallback below */ }
      if (request.status >= 200 && request.status < 300) {
        try { resolve(knowledgeDocumentResponseSchema.parse(payload)); } catch (error) { reject(error); }
        return;
      }
      const apiMessage = payload && typeof payload === 'object' && 'error' in payload
        ? (payload.error as { message?: unknown }).message : null;
      reject(new Error(typeof apiMessage === 'string' ? apiMessage : 'Upload dokumen gagal.'));
    });
    request.addEventListener('error', () => reject(new Error('Upload dokumen gagal karena koneksi terputus.')));
    request.send(body);
  });
};

export const listKnowledgeDocuments = async (filter: {
  status?: KnowledgeDocumentStatus;
  query?: string;
  cursor?: string;
} = {}): Promise<KnowledgeDocumentListResponse> => {
  const params = new URLSearchParams({ limit: '50' });
  Object.entries(filter).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return knowledgeDocumentListResponseSchema.parse(
    await requestJson(`/api/admin/v1/ai-chatbot/documents?${params}`)
  );
};

export const getKnowledgeDocumentPreview = async (
  documentId: string
): Promise<KnowledgeDocumentPreviewResponse> =>
  knowledgeDocumentPreviewResponseSchema.parse(
    await requestJson(`/api/admin/v1/ai-chatbot/documents/${encodeURIComponent(documentId)}/preview`)
  );

const documentAction = async (
  documentId: string,
  action: 'process' | 'reprocess' | 'archive'
): Promise<KnowledgeDocumentResponse> =>
  knowledgeDocumentResponseSchema.parse(
    await requestJson(`/api/admin/v1/ai-chatbot/documents/${encodeURIComponent(documentId)}/${action}`, {
      method: 'POST', headers: csrfHeader()
    })
  );

export const processKnowledgeDocument = (documentId: string) => documentAction(documentId, 'process');
export const reprocessKnowledgeDocument = (documentId: string) => documentAction(documentId, 'reprocess');
export const archiveKnowledgeDocument = (documentId: string) => documentAction(documentId, 'archive');

export const deleteKnowledgeDocument = async (documentId: string): Promise<void> => {
  await requestJson(`/api/admin/v1/ai-chatbot/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE', headers: csrfHeader()
  });
};

export const searchKnowledgeChunks = async (
  query: string,
  limit = 5
): Promise<KnowledgeSearchTestResponse> =>
  knowledgeSearchTestResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/knowledge/search-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({ query, limit })
    })
  );
