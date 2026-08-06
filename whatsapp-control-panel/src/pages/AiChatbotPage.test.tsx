import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AiChatbotErrorBoundary } from './AiChatbotErrorBoundary';
import { AiChatbotPage } from './AiChatbotPage';
import { server } from '../mocks/server';
import {
  mockAiChatbotFoundation,
  mockAiPrompts,
  mockKnowledge,
  mockKnowledgeDocuments
} from '../mocks/ai-chatbot-fixtures';

const renderPage = (pathname = '/ai-chatbot/overview') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AiChatbotPage pathname={pathname} />
    </QueryClientProvider>
  );
};

describe('AiChatbotPage', () => {
  it('shows the simplified foundation without the horizontal sprint menu', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Integrasi Chatbot AI' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('AI WhatsApp sedang nonaktif')
    ).toBeInTheDocument();
    expect(screen.getByText('RAG terkontrol')).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Menu Integrasi Chatbot AI' })
    ).not.toBeInTheDocument();
  });

  it('renders the Sprint 7 analytics dashboard from actual KPI contracts', async () => {
    renderPage('/ai-chatbot/analytics');

    expect(
      await screen.findByRole('heading', { name: 'Statistik Chatbot' })
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Analytics & Observability' })).toBeInTheDocument();
    expect(screen.getByText('82.0%')).toBeInTheDocument();
    expect(screen.getByText('HIGH_FALLBACK')).toBeInTheDocument();
    expect(screen.getByText('$0.0230')).toBeInTheDocument();
    expect(await screen.findByText(/systemInstruction, fallbackMessage/)).toBeInTheDocument();
  });

  it('opens a nested Sprint 6 Conversation Logs route and traces its response to source', async () => {
    const conversationId = '56aeb539-514a-4eb0-a44c-5f34cc29e5a2';
    server.use(
      http.get('*/api/admin/v1/ai-chatbot/conversations', () => HttpResponse.json({
        data: [{ id: conversationId, contactId: '42',
          customer: { displayName: 'Rina', maskedIdentifier: '6281***890' },
          channel: 'playground', channelSessionId: 'internal', status: 'active',
          topic: 'RAHO Club', interested: false, summary: 'Customer bertanya layanan.',
          lastKnowledgeIds: [], handoffStatus: null, traceCount: 1, fallbackCount: 0,
          handoff: false, lastAnswerStatus: 'supported', lastModel: 'mock-chat-v1',
          lastTraceId: 'trace-log', reviewedBy: null,
          startedAt: '2026-08-05T01:00:00.000Z', lastMessageAt: '2026-08-05T01:01:00.000Z', closedAt: null }],
        meta: { requestId: 'mock', generatedAt: '2026-08-05T01:02:00.000Z', nextCursor: null }
      })),
      http.get('*/api/admin/v1/ai-chatbot/conversations/:id/messages', () => HttpResponse.json({
        data: [{ id: 'f03c6dbb-5e82-47d6-b6b9-7aa0113456b1', sourceMessageId: '1', responseMessageId: '2',
          customerMessage: 'Apa itu RAHO Club?', assistantMessage: 'Jawaban resmi RAHO Club.',
          answerStatus: 'supported', validationStatus: 'validated', fallbackReason: null,
          safetyCategory: 'normal_faq', handoff: false, requiresDisclaimer: false,
          model: 'mock-chat-v1', promptVersionId: '2502fb9f-7007-457b-a318-a3a1a64e8bc4',
          inputTokens: 20, outputTokens: 8, retrievalLatencyMs: 2, providerLatencyMs: 3,
          latencyMs: 7, traceId: 'trace-log', sources: [{
            chunkId: '115c1792-2d09-4438-a214-d773231bb499', title: 'RAHO Club', section: null,
            sourceType: 'faq', score: 0.91, rank: 1, usedInPrompt: true, usedInAnswer: true,
            knowledgeVersionId: 'cb0ad6bf-50a2-4b1d-aa7c-eb8291799c60', documentId: null
          }], feedback: null, createdAt: '2026-08-05T01:01:00.000Z' }],
        meta: { requestId: 'mock', generatedAt: '2026-08-05T01:02:00.000Z', nextCursor: null }
      }))
    );
    renderPage(`/ai-chatbot/conversations/${conversationId}`);
    expect(await screen.findByText('Rina')).toBeInTheDocument();
    expect(await screen.findByText('Apa itu RAHO Club?')).toBeInTheDocument();
    expect(screen.getByText(/score 0.9100/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tipe feedback')).toBeInTheDocument();
  });

  it('shows aggregated Sprint 6 unanswered questions and the draft FAQ workflow', async () => {
    server.use(http.get('*/api/admin/v1/ai-chatbot/unanswered', () => HttpResponse.json({
      data: [{ id: 'bd5875bf-c78f-492f-a736-886aedf219b9',
        sampleQuestion: 'Apakah ada layanan di Bandung?', normalizedQuestion: 'apakah ada layanan di bandung',
        occurrenceCount: 3, bestSimilarity: 0.41, nearestKnowledgeIds: [],
        predictedCategoryId: null, predictedCategoryName: null, status: 'new',
        reviewedBy: null, resolvedKnowledgeItemId: null, reviewNote: null,
        conversationIds: ['56aeb539-514a-4eb0-a44c-5f34cc29e5a2'],
        firstSeenAt: '2026-08-01T01:00:00.000Z', lastSeenAt: '2026-08-05T01:00:00.000Z' }],
      meta: { requestId: 'mock', generatedAt: '2026-08-05T01:02:00.000Z', nextCursor: null }
    })));
    renderPage('/ai-chatbot/unanswered');
    expect(await screen.findByText('Apakah ada layanan di Bandung?')).toBeInTheDocument();
    expect(screen.getByText(/3 kemunculan/)).toBeInTheDocument();
    expect(screen.getByLabelText('Jawaban draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buat draft FAQ' })).toBeDisabled();
  });

  it('runs the simplified Playground and keeps safety trace evidence available', async () => {
    const user = userEvent.setup();
    renderPage('/ai-chatbot/playground');

    expect(await screen.findByRole('heading', { name: 'Coba jawaban chatbot' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Pertanyaan'), 'Apa itu RAHO Club?');
    await user.click(screen.getByRole('button', { name: 'Tes jawaban' }));

    expect(await screen.findByText('RAHO Club menyediakan informasi layanan berdasarkan knowledge resmi.')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    await user.click(screen.getByText('Lihat detail teknis'));
    expect(screen.getByText('af924761-829f-41b3-ac80-01163852cb76')).toBeInTheDocument();
    expect(screen.getByText('normal_faq')).toBeInTheDocument();
    expect(screen.getByText('2 pesan')).toBeInTheDocument();
  });

  it('shows AI handoff reason, summary, safety and trace in the Sprint 5 queue', async () => {
    renderPage('/ai-chatbot/handoffs');
    expect(await screen.findByRole('heading', { name: 'Safe Chatbot Beta Queue' })).toBeInTheDocument();
    expect(await screen.findByText('customer_interested')).toBeInTheDocument();
    expect(screen.getByText(/Customer ingin bicara dengan operator/)).toBeInTheDocument();
    expect(screen.getByText('trace_mock_handoff')).toBeInTheDocument();
  });

  it('runs the Sprint 2 knowledge review workflow', async () => {
    let status: 'draft' | 'review' = 'draft';
    server.use(
      http.get('*/api/admin/v1/ai-chatbot/knowledge', () => {
        const response = structuredClone(mockKnowledge);
        response.data[0]!.status = status;
        return HttpResponse.json(response);
      }),
      http.post('*/api/admin/v1/ai-chatbot/knowledge/:knowledgeId/submit-review', () => {
        status = 'review';
        return HttpResponse.json({
          data: { ...mockKnowledge.data[0], status: 'review', revision: 2 },
          meta: mockKnowledge.meta
        });
      })
    );
    const user = userEvent.setup();
    renderPage('/ai-chatbot/knowledge');

    expect(await screen.findByText('Keamanan terapi untuk lansia')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('opens the FAQ editor from the nested Knowledge Base route', async () => {
    renderPage('/ai-chatbot/knowledge/new-faq');

    expect(await screen.findByRole('heading', { name: 'Tambah FAQ' })).toBeInTheDocument();
    expect(screen.getByLabelText('Pertanyaan utama')).toBeInTheDocument();
    expect(screen.getByLabelText('Jawaban resmi / konten Markdown')).toBeInTheDocument();
  });

  it('shows the Sprint 3 document library and processing controls', async () => {
    renderPage('/ai-chatbot/knowledge/documents');

    expect(await screen.findByRole('heading', { name: 'Upload dokumen' })).toBeInTheDocument();
    expect(await screen.findByText('panduan-layanan.txt')).toBeInTheDocument();
    expect(screen.getByText('PDF, DOCX, TXT, Markdown, atau CSV')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reprocess' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
  });

  it('shows a dedicated asynchronous processing queue view', async () => {
    server.use(
      http.get('*/api/admin/v1/ai-chatbot/documents', () =>
        HttpResponse.json({
          ...mockKnowledgeDocuments,
          data: [{ ...mockKnowledgeDocuments.data[0], status: 'queued' }]
        })
      )
    );
    renderPage('/ai-chatbot/knowledge/processing');
    expect(await screen.findByRole('heading', { name: 'Processing Queue' })).toBeInTheDocument();
    expect(await screen.findByText('panduan-layanan.txt')).toBeInTheDocument();
  });

  it('renders operational Sprint 1 settings with redacted credential state', async () => {
    const user = userEvent.setup();
    renderPage('/ai-chatbot/settings');

    expect(
      await screen.findByRole('heading', { name: 'Provider dan retrieval' })
    ).toBeInTheDocument();
    expect(screen.getByText('API key tersimpan')).toBeInTheDocument();
    expect(screen.getByText('Nonaktif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aktifkan AI WhatsApp' })).toBeDisabled();
    expect(await screen.findByRole('heading', { name: 'Launch Readiness & Pilot Gate' })).toBeInTheDocument();
    expect(screen.getByText('EVALUATION_GATE')).toBeInTheDocument();
    expect(screen.getByText(/effective traffic/)).toHaveTextContent('0%');

    const name = screen.getByLabelText('Nama integrasi');
    const apiKey = screen.getByLabelText(/API key provider/);
    expect(apiKey).toHaveAttribute('type', 'password');
    await user.clear(name);
    await user.type(name, 'RAHO AI Updated');
    await user.type(apiKey, 'sk-test-provider-key-123456789');
    await user.click(screen.getByRole('button', { name: 'Simpan settings' }));

    await waitFor(() =>
      expect(screen.getByText(/revision 2/i)).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/API key provider/)).toHaveValue('');
  });

  it('tests the deterministic provider connection without exposing a secret', async () => {
    const user = userEvent.setup();
    renderPage('/ai-chatbot/settings');

    await screen.findByRole('heading', { name: 'Provider dan retrieval' });
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(
      await screen.findByText('Chat: reachable · Embedding: reachable')
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('AI_CHATBOT_MOCK_KEY');
  });

  it('moves an instruction from draft to approved through the guarded workflow', async () => {
    let approved = false;
    server.use(
      http.get('*/api/admin/v1/ai-chatbot/prompts', () => {
        const response = structuredClone(mockAiPrompts);
        if (approved) response.data[0]!.status = 'approved';
        return HttpResponse.json(response);
      }),
      http.post(
        '*/api/admin/v1/ai-chatbot/prompts/:promptId/approve',
        () => {
          approved = true;
          return HttpResponse.json({
            data: { ...mockAiPrompts.data[0], status: 'approved' },
            meta: mockAiPrompts.meta
          });
        }
      )
    );
    const user = userEvent.setup();
    renderPage('/ai-chatbot/instructions');

    expect(
      await screen.findByRole('heading', { name: 'Gaya & Aturan Jawaban', level: 1 })
    ).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByRole('button', { name: 'Publish' })
    ).toBeInTheDocument();
  });

  it('keeps nested Knowledge Base routes inside the friendly module heading', async () => {
    renderPage('/ai-chatbot/knowledge/new-faq');

    await screen.findByRole('heading', { name: 'Informasi Chatbot' });
    expect(screen.getByRole('heading', { name: 'Tambah FAQ' })).toBeInTheDocument();
  });

  it('does not present a blocked foundation as development-ready', async () => {
    server.use(
      http.get('*/api/admin/v1/ai-chatbot/foundation', () =>
        HttpResponse.json({
          ...mockAiChatbotFoundation,
          data: {
            ...mockAiChatbotFoundation.data,
            status: 'blocked',
            runtime: {
              ...mockAiChatbotFoundation.data.runtime,
              strictGrounding: false
            },
            tenant: {
              ...mockAiChatbotFoundation.data.tenant,
              state: 'not_instrumented',
              tenantId: null
            }
          }
        })
      )
    );
    renderPage();

    expect((await screen.findAllByText('Perlu disiapkan')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Siap diuji')).not.toBeInTheDocument();
  });

  it('keeps unknown AI routes inside a feature-local not-found state', async () => {
    renderPage('/ai-chatbot/not-real');

    expect(
      await screen.findByRole('heading', { name: 'Modul tidak ditemukan' })
    ).toBeInTheDocument();
  });

  it('offers a retry when the foundation endpoint is unavailable', async () => {
    server.use(
      http.get('*/api/admin/v1/ai-chatbot/foundation', () =>
        HttpResponse.json(
          {
            error: {
              code: 'AI_FOUNDATION_UNAVAILABLE',
              message: 'Foundation unavailable',
              requestId: 'req_error'
            }
          },
          { status: 503 }
        )
      )
    );
    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: 'Integrasi Chatbot AI belum dapat dimuat'
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('AiChatbotErrorBoundary', () => {
  it('contains a feature render failure without replacing the control room', async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const BrokenFeature = () => {
      throw new Error('Feature render failed');
    };

    render(
      <AiChatbotErrorBoundary resetKey="/ai-chatbot/overview">
        <BrokenFeature />
      </AiChatbotErrorBoundary>
    );

    expect(
      screen.getByRole('heading', {
        name: 'Modul Integrasi Chatbot AI mengalami kendala'
      })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Kembali ke beranda' }));
    expect(window.location.pathname).toBe('/overview');
    consoleError.mockRestore();
  });
});
