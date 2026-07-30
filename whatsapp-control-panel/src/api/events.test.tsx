import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { useOperationalEvents } from './events';

class FakeEventSource {
  static latest: FakeEventSource | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly url: string,
    readonly options?: EventSourceInit
  ) {
    FakeEventSource.latest = this;
  }

  addEventListener() {}
  close = vi.fn();
}

const Harness = () => <span>{useOperationalEvents(true)}</span>;

describe('operational SSE fallback', () => {
  it('falls back to polling when the event stream disconnects', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    );

    expect(screen.getByText('connecting')).toBeInTheDocument();
    expect(FakeEventSource.latest?.url).toBe('/api/admin/v1/events/stream');
    await act(async () => {
      FakeEventSource.latest?.onopen?.();
    });
    expect(screen.getByText('live')).toBeInTheDocument();
    await act(async () => {
      FakeEventSource.latest?.onerror?.();
    });
    expect(screen.getByText('polling')).toBeInTheDocument();

    vi.unstubAllGlobals();
    FakeEventSource.latest = null;
  });
});
