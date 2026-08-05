import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ChatbotRule } from '../api/contracts';
import { server } from '../mocks/server';
import { navigate } from '../routing/navigation';
import { ChatbotRulesPage } from './ChatbotRulesPage';

const timestamp = '2026-07-30T07:00:00.000Z';
const meta = { requestId: 'req_chatbot', generatedAt: timestamp };

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

const configPayload = (revision = 7, nextRules = rules) => ({
  data: {
    revision,
    updatedAt: timestamp,
    rules: nextRules.map((rule) => ({ ...rule }))
  },
  meta
});

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <ChatbotRulesPage />
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
};

describe('active chatbot configuration editor', () => {
  it('opens the active rules directly without version lifecycle controls', async () => {
    server.use(
      http.get('*/api/admin/v1/chatbot/config', () =>
        HttpResponse.json(configPayload())
      )
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Jawaban chatbot' })
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Jawaban')).toHaveLength(3);
    expect(
      screen.getByRole('button', { name: 'Simpan & aktifkan' })
    ).toBeDisabled();
    expect(screen.queryByText('Immutable history')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nama draft')).not.toBeInTheDocument();
    expect(screen.queryByText(/publish draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rollback/i)).not.toBeInTheDocument();
  });

  it('adds, deletes, and discards local changes directly', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/admin/v1/chatbot/config', () =>
        HttpResponse.json(configPayload())
      )
    );

    renderPage();
    const responses = await screen.findAllByLabelText('Jawaban');
    await user.clear(responses[0]);
    await user.type(responses[0], 'Menu yang diubah');

    expect(screen.getByText('Ada perubahan belum disimpan')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Batalkan perubahan' })
    );
    expect(screen.getAllByLabelText('Jawaban')[0]).toHaveValue('Menu utama');

    await user.click(screen.getByRole('button', { name: 'Tambah jawaban' }));
    expect(screen.getAllByRole('button', { name: /Hapus jawaban \d+/ })).toHaveLength(
      4
    );
    await user.click(screen.getByRole('button', { name: 'Hapus jawaban 3' }));
    expect(screen.getAllByRole('button', { name: /Hapus jawaban \d+/ })).toHaveLength(
      3
    );
  });

  it('tests unsaved editor rules without sending or saving them first', async () => {
    const user = userEvent.setup();
    let previewBody: { input: string; rules: ChatbotRule[] } | undefined;

    server.use(
      http.get('*/api/admin/v1/chatbot/config', () =>
        HttpResponse.json(configPayload())
      ),
      http.post('*/api/admin/v1/chatbot/test', async ({ request }) => {
        previewBody = (await request.json()) as {
          input: string;
          rules: ChatbotRule[];
        };
        return HttpResponse.json({
          data: {
            normalizedInput: previewBody.input.trim().toLowerCase(),
            matchedRule: {
              id: previewBody.rules[0].id,
              triggerType: previewBody.rules[0].triggerType,
              priority: previewBody.rules[0].priority,
              matchedTrigger: 'menu',
              action: previewBody.rules[0].action
            },
            response: previewBody.rules[0].responseText
          },
          meta
        });
      })
    );

    renderPage();
    const response = (await screen.findAllByLabelText('Jawaban'))[0];
    await user.clear(response);
    await user.type(response, 'Menu preview terbaru');

    const testInput = screen.getByLabelText('Input test chatbot');
    await user.clear(testInput);
    await user.type(testInput, '  MENU  ');
    const testButton = screen.getByRole('button', { name: 'Jalankan test' });
    expect(testButton).toBeEnabled();
    await user.click(testButton);

    expect(await screen.findByText('menu')).toBeInTheDocument();
    const preview = await screen.findByLabelText('Simulasi percakapan chatbot');
    expect(within(preview).getByText('Menu preview terbaru')).toBeInTheDocument();
    expect(previewBody?.input).toBe('  MENU  ');
    expect(previewBody?.rules[0].responseText).toBe('Menu preview terbaru');
  });

  it('saves and activates with the latest hidden revision', async () => {
    const user = userEvent.setup();
    const revisions: number[] = [];

    server.use(
      http.get('*/api/admin/v1/chatbot/config', () =>
        HttpResponse.json(configPayload())
      ),
      http.put('*/api/admin/v1/chatbot/config', async ({ request }) => {
        const body = (await request.json()) as {
          expectedRevision: number;
          rules: ChatbotRule[];
        };
        revisions.push(body.expectedRevision);
        return HttpResponse.json(
          configPayload(body.expectedRevision + 1, body.rules)
        );
      })
    );

    renderPage();
    const firstResponse = (await screen.findAllByLabelText('Jawaban'))[0];
    await user.clear(firstResponse);
    await user.type(firstResponse, 'Menu aktif terbaru');
    await user.click(screen.getByRole('button', { name: 'Simpan & aktifkan' }));

    expect(
      await screen.findByText('Konfigurasi aktif berhasil disimpan.')
    ).toBeInTheDocument();
    expect(revisions).toEqual([7]);

    const secondResponse = screen.getAllByLabelText('Jawaban')[1];
    await user.clear(secondResponse);
    await user.type(secondResponse, 'Balasan kosong terbaru');
    await user.click(screen.getByRole('button', { name: 'Simpan & aktifkan' }));

    await waitFor(() => expect(revisions).toEqual([7, 8]));
  });

  it('does not attach a refetched revision to stale local rules', async () => {
    const user = userEvent.setup();
    const remoteRules = rules.map((rule, index) =>
      index === 0 ? { ...rule, responseText: 'Menu dari admin lain' } : rule
    );
    server.use(
      http.get('*/api/admin/v1/chatbot/config', () =>
        HttpResponse.json(configPayload())
      )
    );

    const { queryClient } = renderPage();
    const firstResponse = (await screen.findAllByLabelText('Jawaban'))[0];
    await user.clear(firstResponse);
    await user.type(firstResponse, 'Edit lokal yang belum disimpan');

    queryClient.setQueryData(
      ['chatbot', 'config'],
      configPayload(8, remoteRules)
    );

    expect(
      await screen.findByText(
        'Konfigurasi aktif berubah di tab lain. Batalkan perubahan untuk memuat konfigurasi terbaru.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Simpan & aktifkan' })
    ).toBeDisabled();
    expect(firstResponse).toHaveValue('Edit lokal yang belum disimpan');

    await user.click(
      screen.getByRole('button', { name: 'Batalkan perubahan' })
    );
    expect(screen.getAllByLabelText('Jawaban')[0]).toHaveValue(
      'Menu dari admin lain'
    );
  });

  it('keeps spaces while typing multi-word triggers and normalizes the payload', async () => {
    const user = userEvent.setup();
    let previewRules: ChatbotRule[] | undefined;
    server.use(
      http.get('*/api/admin/v1/chatbot/config', () =>
        HttpResponse.json(configPayload())
      ),
      http.post('*/api/admin/v1/chatbot/test', async ({ request }) => {
        const body = (await request.json()) as {
          input: string;
          rules: ChatbotRule[];
        };
        previewRules = body.rules;
        return HttpResponse.json({
          data: {
            normalizedInput: 'apa itu raho',
            matchedRule: {
              id: body.rules[0].id,
              triggerType: body.rules[0].triggerType,
              priority: body.rules[0].priority,
              matchedTrigger: 'apa itu raho',
              action: body.rules[0].action
            },
            response: body.rules[0].responseText
          },
          meta
        });
      })
    );

    renderPage();
    const triggerInput = (await screen.findAllByLabelText('Kata kunci'))[0];
    await user.clear(triggerInput);
    await user.type(triggerInput, 'apa itu  raho, halo dunia');
    expect(triggerInput).toHaveValue('apa itu  raho, halo dunia');

    const testInput = screen.getByLabelText('Input test chatbot');
    await user.clear(testInput);
    await user.type(testInput, 'apa itu raho');
    await user.click(screen.getByRole('button', { name: 'Jalankan test' }));

    await waitFor(() =>
      expect(previewRules?.[0].triggerValues).toEqual([
        'apa itu raho',
        'halo dunia'
      ])
    );
  });

  it('refetches after a revision conflict while preserving local edits', async () => {
    const user = userEvent.setup();
    let configReads = 0;
    const remoteRules = rules.map((rule, index) =>
      index === 0 ? { ...rule, responseText: 'Menu aktif terbaru' } : rule
    );
    server.use(
      http.get('*/api/admin/v1/chatbot/config', () => {
        configReads += 1;
        return HttpResponse.json(
          configReads === 1
            ? configPayload()
            : configPayload(8, remoteRules)
        );
      }),
      http.put('*/api/admin/v1/chatbot/config', () =>
        HttpResponse.json(
          {
            error: {
              code: 'CHATBOT_CONFIG_CONFLICT',
              message: 'Konfigurasi chatbot sudah diubah Admin lain.',
              requestId: 'req_conflict'
            }
          },
          { status: 409 }
        )
      )
    );

    renderPage();
    const firstResponse = (await screen.findAllByLabelText('Jawaban'))[0];
    await user.clear(firstResponse);
    await user.type(firstResponse, 'Edit lokal tetap dipertahankan');
    await user.click(screen.getByRole('button', { name: 'Simpan & aktifkan' }));

    expect(
      await screen.findByText(
        'Konfigurasi aktif berubah di tab lain. Batalkan perubahan untuk memuat konfigurasi terbaru.'
      )
    ).toBeInTheDocument();
    expect(firstResponse).toHaveValue('Edit lokal tetap dipertahankan');
    expect(configReads).toBeGreaterThanOrEqual(2);
  });

  it('warns before internal navigation discards unsaved changes', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    server.use(
      http.get('*/api/admin/v1/chatbot/config', () =>
        HttpResponse.json(configPayload())
      )
    );
    window.history.replaceState(null, '', '/chatbot/rules');

    renderPage();
    const firstResponse = (await screen.findAllByLabelText('Jawaban'))[0];
    await user.type(firstResponse, ' diubah');

    act(() => {
      navigate('/overview');
    });
    expect(confirm).toHaveBeenCalledWith(
      'Perubahan chatbot belum disimpan. Tinggalkan halaman ini?'
    );
    expect(window.location.pathname).toBe('/chatbot/rules');

    confirm.mockReturnValue(true);
    act(() => {
      navigate('/overview');
    });
    expect(window.location.pathname).toBe('/overview');
  });
});
