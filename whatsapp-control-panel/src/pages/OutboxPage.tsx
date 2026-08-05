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
  { label: 'Antrean', state: 'queued' },
  { label: 'Terjadwal', state: 'scheduled' },
  { label: 'Coba ulang', state: 'retrying' },
  { label: 'Gagal', state: 'failed' },
  { label: 'Perlu dicek', state: 'unknown_outcome' },
  { label: 'Selesai', state: 'completed' }
];

const stateLabels: Record<OutboxState, string> = {
  queued: 'Dalam antrean',
  scheduled: 'Terjadwal',
  leased: 'Sedang diproses',
  retrying: 'Mencoba ulang',
  safety_delayed: 'Ditunda sistem keamanan',
  failed: 'Gagal',
  completed: 'Selesai',
  canceled: 'Dibatalkan',
  unknown_outcome: 'Perlu diperiksa'
};

const priorityLabels = {
  high: 'Tinggi',
  normal: 'Normal',
  low: 'Rendah'
} as const;

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
          <p className="eyebrow">Pengiriman pesan</p>
          <h1>Antrean pesan</h1>
          <p>Pantau pesan yang menunggu, dijadwalkan, gagal, atau sudah selesai.</p>
        </div>
        <button className="button button--primary" type="button" onClick={() => navigate('/messages/compose')}>
          Tulis pesan
        </button>
      </header>

      <div className="outbox-tabs" role="group" aria-label="Filter status antrean pesan">
        {tabs.map((tab) => (
          <button
            aria-pressed={state === tab.state}
            data-active={state === tab.state}
            key={tab.state}
            onClick={() => setState(tab.state)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(cancel.isError || retry.isError) && (
        <p className="form-alert form-alert--error" role="alert">
          Status pesan gagal diperbarui. Data mungkin sudah berubah; muat ulang lalu
          coba lagi.
        </p>
      )}

      {query.isPending ? (
        <p className="empty-copy">Memuat antrean pesan…</p>
      ) : query.isError ? (
        <p className="form-alert form-alert--error">Antrean pesan gagal dimuat.</p>
      ) : items.length === 0 ? (
        <div className="empty-stage"><p>Tidak ada pesan dengan status ini.</p></div>
      ) : (
        <div className="outbox-table-wrap">
          <table className="outbox-table">
            <caption className="sr-only">Daftar pesan dalam antrean pengiriman</caption>
            <thead>
              <tr>
                <th>Kontak / pesan</th>
                <th>Status</th>
                <th>Prioritas</th>
                <th>Percobaan</th>
                <th>Percobaan berikutnya</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr data-state={item.state} key={item.id}>
                  <td data-label="Kontak / pesan">
                    <strong>{item.contact.displayName ?? 'Kontak tanpa nama'}</strong>
                    <span>{item.contact.maskedPhone ?? 'Nomor tidak tersedia'}</span>
                    <small>{item.preview}</small>
                  </td>
                  <td data-label="Status">
                    <StatusBadge tone={toneFor(item.state)}>
                      {stateLabels[item.state]}
                    </StatusBadge>
                    {item.lastErrorCode && <small>{item.lastErrorCode}</small>}
                  </td>
                  <td data-label="Prioritas">{priorityLabels[item.priority]}</td>
                  <td data-label="Percobaan">{item.attempts}/{item.maxAttempts}</td>
                  <td data-label="Percobaan berikutnya">{formatDate(item.nextAttemptAt)}</td>
                  <td data-label="Aksi">
                    <div className="table-actions">
                      <button className="button" type="button" onClick={() => navigate(`/messages/${item.messageId}`)}>
                        Lihat detail
                      </button>
                      {['queued', 'scheduled', 'retrying', 'safety_delayed'].includes(item.state) && (
                        <button
                          className="button button--danger"
                          disabled={!canCancel || cancel.isPending}
                          type="button"
                          onClick={() => cancel.mutate(item.id)}
                        >
                          Batalkan
                        </button>
                      )}
                      {item.state === 'failed' && (
                        <button
                          className="button"
                          disabled={!canRetry || retry.isPending}
                          type="button"
                          onClick={() => retry.mutate(item.id)}
                        >
                          Coba kirim lagi
                        </button>
                      )}
                      {item.state === 'unknown_outcome' && (
                        <small className="unknown-label">
                          Hasil pengiriman belum pasti — periksa manual sebelum mencoba ulang.
                        </small>
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
