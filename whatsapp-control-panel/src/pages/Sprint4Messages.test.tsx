import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { AdminUser } from '../api/contracts';
import { MessageComposer } from '../components/MessageComposer';
import { getOverviewScenario } from '../mocks/scenario';
import { server } from '../mocks/server';
import { MessageDetailPage } from './MessageDetailPage';
import { OutboxPage } from './OutboxPage';

const operator: AdminUser = {
  id: '84f36c8c-cf8f-4cb3-88fd-936b915edc34',
  username: 'operator',
  displayName: 'Operator Test',
  role: 'operator',
  permissions: [
    'dashboard.read',
    'contacts.read',
    'messages.read',
    'messages.send',
    'messages.cancel'
  ]
};

const renderWithQuery = (node: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
};

describe('Sprint 4 safe compose and timeline', () => {
  it('locks double-submit to one API command with an idempotency key', async () => {
    const user = userEvent.setup();
    const requests: string[] = [];
    server.use(
      http.post('*/api/admin/v1/messages', async ({ request }) => {
        requests.push(request.headers.get('Idempotency-Key') ?? '');
        await delay(80);
        return HttpResponse.json(
          {
            data: {
              id: '59942ce7-4f15-4a8b-9448-a98f39d70d10',
              outboxId: '2ddb725d-56c0-4708-8d81-1b868a3e8bd9',
              state: 'accepted'
            },
            meta: {
              requestId: 'req_compose',
              generatedAt: '2026-07-30T06:20:00.000Z'
            }
          },
          { status: 202 }
        );
      })
    );

    renderWithQuery(
      <MessageComposer
        overview={getOverviewScenario().data}
        recipient={{ contactId: '101' }}
        recipientLabel="Nadia Putri"
        user={operator}
      />
    );

    await user.type(screen.getByLabelText('Isi pesan'), 'Halo durable');
    await user.dblClick(screen.getByRole('button', { name: 'Masukkan ke outbox' }));

    expect(await screen.findByText('Menerima command…')).toBeDisabled();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toHaveLength(36);
  });

  it('shows immutable events on the message detail page', async () => {
    renderWithQuery(
      <MessageDetailPage
        messageId="59942ce7-4f15-4a8b-9448-a98f39d70d10"
        user={operator}
      />
    );

    expect(await screen.findByRole('heading', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByText('accepted')).toBeInTheDocument();
    expect(screen.getAllByText('queued')).toHaveLength(2);
    expect(
      screen.queryByText('Accepted bukan berarti sent.')
    ).not.toBeInTheDocument();
  });

  it('blocks blind retry for unknown provider outcomes', async () => {
    renderWithQuery(<OutboxPage user={operator} />);

    expect(
      await screen.findByText('Reconciliation required — blind retry disabled')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Controlled retry' })
    ).not.toBeInTheDocument();
  });
});
