import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { App } from './App';
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

const renderApp = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
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
    ).toHaveTextContent('Session: connected');
    expect(screen.getByText('3 queued')).toBeInTheDocument();
  });

  it('logs in with the backend contract and returns to overview', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/login?returnTo=%2Foverview');
    renderApp();

    await screen.findByRole('heading', { name: 'Masuk ke control panel' });
    await user.type(screen.getByLabelText('Password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(
      await screen.findByRole('heading', { name: 'Halo, Local Admin.' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/overview');
  });
});
