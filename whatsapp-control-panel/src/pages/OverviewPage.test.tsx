import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { OverviewPage } from './OverviewPage';

describe('OverviewPage', () => {
  it('renders the operational summary from the API contract', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false }
      }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OverviewPage />
      </QueryClientProvider>
    );

    expect(
      await screen.findByRole('heading', { name: 'connected' })
    ).toBeInTheDocument();
    expect(screen.getByText('4/100')).toBeInTheDocument();
    expect(screen.getByText('3 queued')).toBeInTheDocument();
    expect(screen.getByText('7 open')).toBeInTheDocument();
  });
});
