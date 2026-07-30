import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InboxPage } from './InboxPage';
import type { AdminUser } from '../api/contracts';

const operator: AdminUser = {
  id: '84f36c8c-cf8f-4cb3-88fd-936b915edc34',
  username: 'operator',
  displayName: 'Operator Test',
  role: 'operator',
  permissions: ['messages.read', 'contacts.read', 'handoffs.manage']
};

const renderInbox = (pathname = '/inbox/101') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  window.history.replaceState(null, '', pathname);
  return render(
    <QueryClientProvider client={queryClient}>
      <InboxPage pathname={pathname} user={operator} />
    </QueryClientProvider>
  );
};

describe('Sprint 3 inbox', () => {
  it('opens a deep-linked conversation and renders history oldest to newest', async () => {
    renderInbox();

    expect(await screen.findByText('Saya ingin bicara dengan operator.')).toBeInTheDocument();
    expect(
      screen.getByText('Konten image belum didukung di control panel.')
    ).toBeInTheDocument();
    expect(screen.getByText('Baik, operator kami akan menindaklanjuti percakapan ini.')).toBeInTheDocument();

    const oldest = screen.getByText('Saya ingin bicara dengan operator.');
    const newest = within(screen.getByTestId('message-1005')).getByText('5');
    expect(
      oldest.compareDocumentPosition(newest) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(window.location.pathname).toBe('/inbox/101');
    expect(window.location.search).toBe('');
  });

  it('searches contacts through the conversation query', async () => {
    const user = userEvent.setup();
    renderInbox();

    const search = screen.getByLabelText('Cari contact atau nomor');
    await user.clear(search);
    await user.type(search, 'Raka');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Raka Studio/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Nadia Putri/ })).not.toBeInTheDocument();
  });
});
