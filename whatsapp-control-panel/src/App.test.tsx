import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { App } from './App';
import { currentAdminQueryKey } from './api/queries';
import { sessionExpiredEvent } from './api/client';
import { server } from './mocks/server';

const sessionResponse = {
  data: {
    id: 'local-admin',
    username: 'admin',
    displayName: 'Local Admin',
    role: 'admin',
    permissions: ['dashboard.read']
  },
  meta: {
    requestId: 'req_test_session',
    generatedAt: '2026-07-30T03:00:00.000Z'
  }
};

const previousAccountQueryKey = ['previous-account', 'sensitive-data'] as const;
const pairingQrQueryKey = ['pairing-qr'] as const;

const aiAdminSessionResponse = {
  ...sessionResponse,
  data: {
    ...sessionResponse.data,
    permissions: ['dashboard.read', 'chatbot.manage']
  }
};

const renderApp = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
};

const seedPreviousAccountCache = (queryClient: QueryClient) => {
  queryClient.setQueryData(previousAccountQueryKey, {
    contactName: 'Previous account customer'
  });
  queryClient.setQueryData(pairingQrQueryKey, {
    data: { qr: 'raw-private-pairing-qr' }
  });
};

const expectPreviousAccountCachePurged = (queryClient: QueryClient) => {
  expect(queryClient.getQueryData(previousAccountQueryKey)).toBeUndefined();
  expect(queryClient.getQueryData(pairingQrQueryKey)).toBeUndefined();
};

describe('authenticated app shell', () => {
  it('guards a protected route and preserves it through session expiry', async () => {
    window.history.replaceState(null, '', '/overview');
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Masuk ke control panel' })
    ).toBeInTheDocument();
    expect(screen.getByText('Session berakhir. Silakan masuk kembali.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(
      '/overview'
    );
  });

  it('opens the shell and health overview for an authenticated user', async () => {
    server.use(
      http.get('*/api/admin/v1/me', () => HttpResponse.json(sessionResponse))
    );
    window.history.replaceState(null, '', '/overview');
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Halo, Local Admin.' })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Status operasional')
    ).toHaveTextContent('Sesi: Terhubung');
    expect(screen.getByText('3 menunggu')).toBeInTheDocument();
  });

  it('provides keyboard-safe navigation and user disclosures', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/admin/v1/me', () => HttpResponse.json(sessionResponse))
    );
    window.history.replaceState(null, '', '/overview');
    renderApp();

    await screen.findByRole('heading', { name: 'Halo, Local Admin.' });
    expect(screen.getByRole('link', { name: 'Beranda' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Integrasi Chatbot AI' })
    ).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Buka menu pengguna' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Keluar' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    const navigationTrigger = screen.getByRole('button', {
      name: 'Buka navigasi utama'
    });
    await user.click(navigationTrigger);
    expect(navigationTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Beranda' })).toHaveFocus();

    screen.getByRole('link', { name: 'Keamanan' }).focus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Beranda' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('link', { name: 'Keamanan' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(navigationTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(navigationTrigger).toHaveFocus();
  });

  it('places Integrasi Chatbot AI in the left sidebar and keeps it active on subroutes', async () => {
    server.use(
      http.get('*/api/admin/v1/me', () =>
        HttpResponse.json(aiAdminSessionResponse)
      )
    );
    window.history.replaceState(null, '', '/ai-chatbot/knowledge');
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Knowledge Base' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Integrasi Chatbot AI' })
    ).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe(
      'Integrasi Chatbot AI · WhatsApp Control Room'
    );
  });

  it('does not claim near-prefix routes as part of Integrasi Chatbot AI', async () => {
    server.use(
      http.get('*/api/admin/v1/me', () =>
        HttpResponse.json(aiAdminSessionResponse)
      )
    );
    window.history.replaceState(null, '', '/ai-chatbot-legacy');
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Halaman tidak ditemukan' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Integrasi Chatbot AI' })
    ).not.toHaveAttribute('aria-current');
  });

  it('logs in with the backend contract and returns to overview', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/login?returnTo=%2Foverview');
    const { queryClient } = renderApp();

    await screen.findByRole('heading', { name: 'Masuk ke control panel' });
    act(() => seedPreviousAccountCache(queryClient));
    await user.type(screen.getByLabelText('Password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(
      await screen.findByRole('heading', { name: 'Halo, Local Admin.' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/overview');
    expectPreviousAccountCachePurged(queryClient);
    expect(queryClient.getQueryData(currentAdminQueryKey)).toMatchObject({
      data: { username: 'admin' }
    });
  });

  it('cancels active requests and purges all previous-account data on logout', async () => {
    const user = userEvent.setup();
    const requestAborted = vi.fn();
    server.use(
      http.get('*/api/admin/v1/me', () => HttpResponse.json(sessionResponse)),
      http.post('*/api/admin/v1/auth/logout', () => new HttpResponse(null, { status: 204 }))
    );
    window.history.replaceState(null, '', '/overview');
    const { queryClient } = renderApp();

    await screen.findByRole('heading', { name: 'Halo, Local Admin.' });
    act(() => seedPreviousAccountCache(queryClient));
    const pendingRequest = queryClient.fetchQuery({
      queryKey: ['previous-account', 'in-flight'],
      queryFn: ({ signal }) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            requestAborted();
            reject(new DOMException('Request cancelled', 'AbortError'));
          });
        })
    }).catch((error: unknown) => error);

    await user.click(screen.getByRole('button', { name: /Buka menu pengguna/ }));
    await user.click(screen.getByRole('button', { name: 'Keluar' }));

    await screen.findByRole('heading', { name: 'Masuk ke control panel' });
    await expect(pendingRequest).resolves.toMatchObject({ message: 'CancelledError' });
    expect(requestAborted).toHaveBeenCalledOnce();
    expectPreviousAccountCachePurged(queryClient);
  });

  it('purges all previous-account data when the session expires', async () => {
    server.use(
      http.get('*/api/admin/v1/me', () => HttpResponse.json(sessionResponse))
    );
    window.history.replaceState(null, '', '/overview');
    const { queryClient } = renderApp();

    await screen.findByRole('heading', { name: 'Halo, Local Admin.' });
    act(() => {
      seedPreviousAccountCache(queryClient);
      window.dispatchEvent(new CustomEvent(sessionExpiredEvent));
    });

    await screen.findByRole('heading', { name: 'Masuk ke control panel' });
    await waitFor(() => expectPreviousAccountCachePurged(queryClient));
    expect(screen.getByText('Session berakhir. Silakan masuk kembali.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
