import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AdminUser } from '../api/contracts';
import { disconnectedOverview } from '../mocks/fixtures';
import { setOverviewScenario } from '../mocks/scenario';
import { server } from '../mocks/server';
import { SessionPage } from './SessionPage';

const operator: AdminUser = {
  id: 'operator-id',
  username: 'operator',
  displayName: 'Operations User',
  role: 'operator',
  permissions: ['dashboard.read', 'session.reconnect', 'safety.pause']
};

const renderPage = (user: AdminUser = operator) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionPage streamState="polling" user={user} />
    </QueryClientProvider>
  );
};

describe('SessionPage', () => {
  it('renders a scannable ephemeral QR only for an operator', async () => {
    setOverviewScenario('qr_required');
    renderPage();

    expect(
      await screen.findByRole('img', { name: 'QR pairing WhatsApp yang aktif' })
    ).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/));
    expect(screen.getByText(/QR hanya berada di memory backend/)).toBeInTheDocument();
  });

  it('hides pairing and control actions from a viewer', async () => {
    setOverviewScenario('qr_required');
    renderPage({
      ...operator,
      role: 'viewer',
      permissions: ['dashboard.read']
    });

    expect(
      await screen.findByText('Pairing membutuhkan permission operator')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Emergency pause' })
    ).not.toBeInTheDocument();
  });

  it('explains why reconnect is disabled while already connected', async () => {
    setOverviewScenario('healthy');
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Reconnect' })
    ).toBeDisabled();
    expect(screen.getByText('Session sudah connected')).toBeInTheDocument();
  });

  it('lets an eligible operator request reconnect', async () => {
    const user = userEvent.setup();
    let reconnectRequests = 0;
    server.use(
      http.post('*/api/admin/v1/session/reconnect', () => {
        reconnectRequests += 1;
        return HttpResponse.json(
          {
            data: {
              session: disconnectedOverview.data.session,
              readiness: disconnectedOverview.data.readiness
            },
            meta: disconnectedOverview.meta
          },
          { status: 202 }
        );
      })
    );
    setOverviewScenario('disconnected');
    renderPage();

    const reconnect = await screen.findByRole('button', { name: 'Reconnect' });
    expect(reconnect).toBeEnabled();
    await user.click(reconnect);
    expect(reconnectRequests).toBe(1);
  });

  it('disables reconnect and explains a terminal pairing rejection', async () => {
    const fatalSession = structuredClone(disconnectedOverview);
    fatalSession.data.session.lastDisconnect = {
      code: 405,
      reason: 'Connection Failure',
      classification: 'fatal',
      occurredAt: '2026-07-30T08:51:26.199Z'
    };
    fatalSession.data.session.reconnect = {
      attempt: 1,
      nextRetryAt: null,
      eligible: false,
      disabledReason: 'terminal_disconnect'
    };
    server.use(
      http.get('*/api/admin/v1/session', () =>
        HttpResponse.json({
          data: {
            session: fatalSession.data.session,
            readiness: fatalSession.data.readiness
          },
          meta: fatalSession.meta
        })
      )
    );

    renderPage();

    expect(
      await screen.findByText('Pairing ditolak WhatsApp')
    ).toBeInTheDocument();
    expect(screen.getByText(/kode/)).toHaveTextContent('405');
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled();
    expect(
      screen.getByText(
        'WhatsApp menolak koneksi secara terminal; reconnect session tidak tersedia'
      )
    ).toBeInTheDocument();
  });

  it('requires confirmation before applying emergency pause', async () => {
    const user = userEvent.setup();
    setOverviewScenario('healthy');
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Emergency pause' })
    );
    expect(
      screen.getByText('Blokir seluruh pengiriman baru sekarang?')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ya, pause sending' }));
    expect(
      await screen.findByRole('button', { name: 'Emergency pause' })
    ).toBeInTheDocument();
  });
});
