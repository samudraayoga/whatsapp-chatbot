import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AdminUser } from '../api/contracts';
import { mockSafetyCenter } from '../mocks/safety-fixtures';
import { server } from '../mocks/server';
import { SafetyCenterPage } from './SafetyCenterPage';

const operator: AdminUser = {
  id: 'operator-id',
  username: 'operator',
  displayName: 'Operations User',
  role: 'operator',
  permissions: ['dashboard.read', 'safety.pause']
};

const admin: AdminUser = {
  ...operator,
  id: 'admin-id',
  username: 'admin',
  displayName: 'Admin User',
  role: 'admin',
  permissions: [
    'dashboard.read',
    'safety.pause',
    'safety.resume',
    'session.reset'
  ]
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
      <SafetyCenterPage user={user} />
    </QueryClientProvider>
  );
};

describe('SafetyCenterPage', () => {
  it('explains blockers and keeps guarded recovery unavailable to operators', async () => {
    renderPage();

    expect(
      await screen.findByText('Pengiriman otomatis dihentikan karena risiko mencapai ambang.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tinjau penyebab health, tunggu risiko turun/)
    ).toBeInTheDocument();
    expect(screen.getByText('Resume memerlukan Admin')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Resume sending' })
    ).not.toBeInTheDocument();
  });

  it('labels disabled telemetry explicitly instead of showing a zero metric', async () => {
    renderPage();

    expect(await screen.findByText('Retry tracker')).toBeInTheDocument();
    expect(screen.getAllByText('Not enabled')).toHaveLength(4);
    expect(screen.getAllByText('Not instrumented')).toHaveLength(2);
    expect(
      screen.getByText('Retry tracker is disabled by the active preset')
    ).toBeInTheDocument();
  });

  it('enables admin resume only after reason, password, and acknowledgement', async () => {
    const user = userEvent.setup();
    let submittedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('*/api/admin/v1/safety/resume', async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(structuredClone(mockSafetyCenter));
      })
    );
    renderPage(admin);

    const resume = await screen.findByRole('button', {
      name: 'Resume sending'
    });
    expect(resume).toBeDisabled();

    await user.type(
      screen.getByLabelText('Alasan keputusan'),
      'Health sudah ditinjau dan stabil'
    );
    await user.type(screen.getByLabelText('Password saat ini'), 'admin123');
    expect(resume).toBeDisabled();

    await user.click(
      screen.getByLabelText(
        'Saya sudah meninjau blocker dan memahami risiko resume.'
      )
    );
    expect(resume).toBeEnabled();
    await user.click(resume);

    expect(submittedBody).toEqual({
      reason: 'Health sudah ditinjau dan stabil',
      currentPassword: 'admin123',
      acknowledgement: 'I_UNDERSTAND_THE_RISK'
    });
  });

  it('shows why reset is unavailable even to an admin', async () => {
    renderPage(admin);

    expect(await screen.findByText('Reset tidak tersedia')).toBeInTheDocument();
    expect(screen.getByText('SAFETY_RESET_ENABLED is false')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset safety state' })
    ).not.toBeInTheDocument();
  });
});
