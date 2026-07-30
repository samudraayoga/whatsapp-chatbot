import { useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient
} from '@tanstack/react-query';
import type { AdminUser, OutboxState } from '../api/contracts';
import { cancelOutbox, getOutbox, retryOutbox } from '../api/messages';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import { navigate } from '../routing/navigation';

type OutboxPageProps = { user: AdminUser };

const tabs: Array<{ label: string; state: OutboxState | 'all' }> = [
  { label: 'Semua', state: 'all' },
  { label: 'Queued', state: 'queued' },
  { label: 'Scheduled', state: 'scheduled' },
  { label: 'Retry', state: 'retrying' },
  { label: 'Failed', state: 'failed' },
  { label: 'Unknown', state: 'unknown_outcome' },
  { label: 'Completed', state: 'completed' }
];

const toneFor = (state: OutboxState): StatusTone => {
  if (state === 'completed') return 'success';
  if (state === 'failed' || state === 'unknown_outcome') return 'danger';
  if (state === 'retrying' || state === 'safety_delayed') return 'warning';
  return 'info';
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));

export const OutboxPage = ({ user }: OutboxPageProps) => {
  const [state, setState] = useState<OutboxState | 'all'>('all');
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['outbox', state],
    queryFn: ({ pageParam }) =>
      getOutbox({ state, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    refetchInterval: 5_000
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['outbox'] });
  const cancel = useMutation({ mutationFn: cancelOutbox, onSuccess: refresh });
  const retry = useMutation({ mutationFn: retryOutbox, onSuccess: refresh });
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const canCancel = user.permissions.includes('messages.cancel');
  const canRetry = user.permissions.includes('messages.send');

  return (
    <section>
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Sprint 4 · Durable delivery</p>
          <h1>Message outbox</h1>
          <p>Accepted bukan berarti sent. Pantau worker, attempt, dan outcome dari sini.</p>
        </div>
        <button className="button button--primary" type="button" onClick={() => navigate('/messages/compose')}>
          Compose message
        </button>
      </header>

      <div className="outbox-tabs" role="tablist" aria-label="Filter outbox">
        {tabs.map((tab) => (
          <button
            aria-selected={state === tab.state}
            data-active={state === tab.state}
            key={tab.state}
            onClick={() => setState(tab.state)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(cancel.isError || retry.isError) && (
        <p className="form-alert form-alert--error" role="alert">
          Transisi outbox ditolak. Item mungkin sudah berubah state.
        </p>
      )}

      {query.isPending ? (
        <p className="empty-copy">Memuat outbox…</p>
      ) : query.isError ? (
        <p className="form-alert form-alert--error">Outbox gagal dimuat.</p>
      ) : items.length === 0 ? (
        <div className="empty-stage"><p>Tidak ada item pada tab ini.</p></div>
      ) : (
        <div className="outbox-table-wrap">
          <table className="outbox-table">
            <thead>
              <tr>
                <th>Contact / message</th>
                <th>State</th>
                <th>Priority</th>
                <th>Attempt</th>
                <th>Next attempt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.contact.displayName ?? 'Contact tanpa nama'}</strong>
                    <span>{item.contact.maskedPhone ?? 'Nomor tidak tersedia'}</span>
                    <small>{item.preview}</small>
                  </td>
                  <td>
                    <StatusBadge tone={toneFor(item.state)}>{item.state}</StatusBadge>
                    {item.lastErrorCode && <small>{item.lastErrorCode}</small>}
                  </td>
                  <td>{item.priority}</td>
                  <td>{item.attempts}/{item.maxAttempts}</td>
                  <td>{formatDate(item.nextAttemptAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button className="button" type="button" onClick={() => navigate(`/messages/${item.messageId}`)}>
                        Timeline
                      </button>
                      {['queued', 'scheduled', 'retrying', 'safety_delayed'].includes(item.state) && (
                        <button
                          className="button button--danger"
                          disabled={!canCancel || cancel.isPending}
                          type="button"
                          onClick={() => cancel.mutate(item.id)}
                        >
                          Cancel
                        </button>
                      )}
                      {item.state === 'failed' && (
                        <button
                          className="button"
                          disabled={!canRetry || retry.isPending}
                          type="button"
                          onClick={() => retry.mutate(item.id)}
                        >
                          Controlled retry
                        </button>
                      )}
                      {item.state === 'unknown_outcome' && (
                        <small className="unknown-label">Reconciliation required — blind retry disabled</small>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.hasNextPage && (
        <button className="button load-more" type="button" onClick={() => query.fetchNextPage()}>
          Muat item berikutnya
        </button>
      )}
    </section>
  );
};
