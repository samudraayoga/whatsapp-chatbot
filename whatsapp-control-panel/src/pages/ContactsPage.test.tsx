import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ContactsPage } from './ContactsPage';

describe('Sprint 3 contact identity', () => {
  it('warns the operator when a LID is unresolved', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    window.history.replaceState(null, '', '/contacts/102');

    render(
      <QueryClientProvider client={queryClient}>
        <ContactsPage pathname="/contacts/102" />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Jangan merge contact ini secara manual.')).toBeInTheDocument();
    expect(screen.getByText('LID belum memiliki pemetaan PN yang tepercaya.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buka histori pesan' })).toBeInTheDocument();
  });
});
