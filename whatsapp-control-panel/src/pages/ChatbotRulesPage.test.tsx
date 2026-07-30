import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type {
  ChatbotRule,
  ChatbotVersionDetailResponse
} from '../api/contracts';
import { server } from '../mocks/server';
import { ChatbotRulesPage } from './ChatbotRulesPage';

const activeId = '9db7b148-f0c3-4b54-9f5f-935aa343e34a';
const draftId = '51e91ca6-8d87-40f8-a931-bf6514104258';
const timestamp = '2026-07-30T07:00:00.000Z';
const meta = { requestId: 'req_sprint_5', generatedAt: timestamp };

const rules: ChatbotRule[] = [
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f01',
    triggerType: 'alias',
    triggerValues: ['menu', 'halo'],
    responseText: 'Menu utama',
    priority: 100,
    enabled: true,
    action: 'reply'
  },
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f02',
    triggerType: 'empty',
    triggerValues: [],
    responseText: 'Menu utama',
    priority: 110,
    enabled: true,
    action: 'reply'
  },
  {
    id: '50ae7063-6b7f-4b8b-aaf1-0c0c77a19f03',
    triggerType: 'fallback',
    triggerValues: [],
    responseText: 'Pilihan tidak tersedia',
    priority: 1000,
    enabled: true,
    action: 'reply'
  }
];

const makeDetail = (
  id: string,
  status: 'draft' | 'published',
  versionNumber: number
): ChatbotVersionDetailResponse['data'] => ({
  version: {
    id,
    versionNumber,
    name: status === 'draft' ? 'Draft changes' : 'Initial rules',
    status,
    changeSummary: status === 'published' ? 'Initial migration' : null,
    basedOnVersionId: status === 'draft' ? activeId : null,
    revision: 0,
    contentHash: `${status}-hash`,
    createdBy: null,
    publishedBy: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: status === 'published' ? timestamp : null,
    ruleCount: rules.length
  },
  rules: rules.map((rule) => ({ ...rule }))
});

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatbotRulesPage />
    </QueryClientProvider>
  );
};

describe('Sprint 5 chatbot rule management', () => {
  it('edits a draft, saves it, and dry-runs normalized input without sending', async () => {
    const user = userEvent.setup();
    const active = makeDetail(activeId, 'published', 1);
    const draft = makeDetail(draftId, 'draft', 2);
    let savedRules = draft.rules;
    let revision = 0;
    let previewRequests = 0;

    server.use(
      http.get('*/api/admin/v1/chatbot/versions', () =>
        HttpResponse.json({
          data: [draft.version, active.version],
          meta
        })
      ),
      http.get('*/api/admin/v1/chatbot/versions/:versionId', ({ params }) => {
        const data = params.versionId === draftId
          ? {
              ...draft,
              version: { ...draft.version, revision },
              rules: savedRules
            }
          : active;
        return HttpResponse.json({ data, meta });
      }),
      http.put(
        '*/api/admin/v1/chatbot/versions/:versionId/rules',
        async ({ request }) => {
          const body = (await request.json()) as { rules: ChatbotRule[] };
          savedRules = body.rules;
          revision += 1;
          return HttpResponse.json({
            data: {
              ...draft,
              version: { ...draft.version, revision },
              rules: savedRules
            },
            meta
          });
        }
      ),
      http.post('*/api/admin/v1/chatbot/test', async ({ request }) => {
        previewRequests += 1;
        const body = (await request.json()) as { input: string };
        return HttpResponse.json({
          data: {
            versionId: draftId,
            versionNumber: 2,
            normalizedInput: body.input.trim().toLowerCase(),
            matchedRule: {
              id: rules[0].id,
              triggerType: 'alias',
              priority: 100,
              matchedTrigger: 'menu',
              action: 'reply'
            },
            response: savedRules[0].responseText
          },
          meta
        });
      })
    );

    renderPage();
    await user.click(await screen.findByRole('button', { name: /v2/i }));
    expect(
      await screen.findByRole('heading', { name: 'Draft changes' })
    ).toBeInTheDocument();

    const responseFields = screen.getAllByLabelText('Response');
    await user.clear(responseFields[0]);
    await user.type(responseFields[0], 'Menu aman terbaru');
    expect(
      screen.getByText('Perubahan lokal belum disimpan')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Jalankan test' })
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Simpan draft' }));
    await waitFor(() =>
      expect(screen.getByText('Draft tersimpan')).toBeInTheDocument()
    );

    const testInput = screen.getByLabelText('Input test chatbot');
    await user.clear(testInput);
    await user.type(testInput, '  MENU  ');
    await user.click(screen.getByRole('button', { name: 'Jalankan test' }));

    expect(await screen.findByText('menu')).toBeInTheDocument();
    expect(await screen.findAllByText('Menu aman terbaru')).toHaveLength(2);
    expect(previewRequests).toBe(1);
  });

  it('keeps publish disabled until summary and exact confirmation are present', async () => {
    const user = userEvent.setup();
    const active = makeDetail(activeId, 'published', 1);
    const draft = makeDetail(draftId, 'draft', 2);
    let publishRequests = 0;
    server.use(
      http.get('*/api/admin/v1/chatbot/versions', () =>
        HttpResponse.json({ data: [draft.version, active.version], meta })
      ),
      http.get('*/api/admin/v1/chatbot/versions/:versionId', ({ params }) =>
        HttpResponse.json({
          data: params.versionId === draftId ? draft : active,
          meta
        })
      ),
      http.post(
        '*/api/admin/v1/chatbot/versions/:versionId/publish',
        () => {
          publishRequests += 1;
          return HttpResponse.json({
            data: {
              ...draft,
              version: { ...draft.version, status: 'published' }
            },
            meta
          });
        }
      )
    );

    renderPage();
    await user.click(await screen.findByRole('button', { name: /v2/i }));
    const publish = await screen.findByRole('button', {
      name: 'Publish version'
    });
    expect(publish).toBeDisabled();

    await user.type(screen.getByLabelText('Ringkasan perubahan'), 'Update menu');
    await user.type(screen.getByLabelText('Ketik PUBLISH'), 'publish');
    expect(publish).toBeDisabled();
    await user.clear(screen.getByLabelText('Ketik PUBLISH'));
    await user.type(screen.getByLabelText('Ketik PUBLISH'), 'PUBLISH');
    expect(publish).toBeEnabled();

    await user.click(publish);
    await waitFor(() => expect(publishRequests).toBe(1));
  });
});
