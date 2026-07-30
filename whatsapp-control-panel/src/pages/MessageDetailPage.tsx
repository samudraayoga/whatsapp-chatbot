import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMessageDetail, reconcileOutbox } from '../api/messages';
import type { AdminUser } from '../api/contracts';
import { StatusBadge } from '../components/StatusBadge';
import { navigate } from '../routing/navigation';

type MessageDetailPageProps = { messageId: string; user: AdminUser };

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      }).format(new Date(value))
    : 'Belum ada';

export const MessageDetailPage = ({
  messageId,
  user
}: MessageDetailPageProps) => {
  const [note, setNote] = useState('');
  const [providerMessageId, setProviderMessageId] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['message-detail', messageId],
    queryFn: () => getMessageDetail(messageId),
    refetchInterval: (current) => {
      const state = current.state.data?.data.message.state;
      return ['sent', 'delivered', 'read', 'failed', 'canceled', 'unknown_outcome'].includes(
        state ?? ''
      )
        ? false
        : 3_000;
    }
  });
  const reconcile = useMutation({
    mutationFn: reconcileOutbox,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['message-detail', messageId]
      });
      void queryClient.invalidateQueries({ queryKey: ['outbox'] });
    }
  });

  if (query.isPending) {
    return <section className="page-state"><p>Memuat message timeline…</p></section>;
  }
  if (query.isError) {
    return (
      <section className="page-state page-state--error">
        <h1>Message tidak ditemukan</h1>
        <button type="button" onClick={() => navigate('/messages/outbox')}>Kembali ke outbox</button>
      </section>
    );
  }

  const { message, outbox, events } = query.data.data;
  const unknown = message.state === 'unknown_outcome';
  return (
    <section>
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Immutable message timeline</p>
          <h1>{message.recipient.displayName ?? 'Outgoing message'}</h1>
          <p>{message.recipient.maskedPhone ?? 'Nomor tidak tersedia'} · {message.id}</p>
        </div>
        <button className="button" type="button" onClick={() => navigate('/messages/outbox')}>
          Kembali ke outbox
        </button>
      </header>

      {unknown && (
        <div className="unknown-banner">
          <strong>Provider outcome tidak dapat dipastikan.</strong>
          <p>Pesan mungkin sudah diterima WhatsApp. Blind retry dinonaktifkan untuk mencegah pesan ganda; lakukan reconciliation terlebih dahulu.</p>
        </div>
      )}

      {unknown && outbox && user.role === 'admin' && (
        <div className="panel reconciliation-panel">
          <div>
            <p className="eyebrow">Admin reconciliation</p>
            <h2>Konfirmasi outcome provider</h2>
            <p>
              Gunakan bukti provider/device. Semua keputusan dan catatan akan
              diaudit.
            </p>
          </div>
          <div className="reconciliation-fields">
            <input
              aria-label="Provider message ID"
              placeholder="Provider ID (wajib jika confirmed sent)"
              value={providerMessageId}
              onChange={(event) => setProviderMessageId(event.target.value)}
            />
            <input
              aria-label="Catatan reconciliation"
              placeholder="Catatan wajib"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <button
              className="button"
              disabled={!note.trim() || reconcile.isPending}
              type="button"
              onClick={() =>
                reconcile.mutate({
                  outboxId: outbox.id,
                  resolution: 'confirmed_not_sent',
                  note: note.trim()
                })
              }
            >
              Confirm not sent
            </button>
            <button
              className="button button--primary"
              disabled={
                !note.trim() ||
                !providerMessageId.trim() ||
                reconcile.isPending
              }
              type="button"
              onClick={() =>
                reconcile.mutate({
                  outboxId: outbox.id,
                  resolution: 'confirmed_sent',
                  note: note.trim(),
                  providerMessageId: providerMessageId.trim()
                })
              }
            >
              Confirm sent
            </button>
          </div>
          {reconcile.isError && (
            <p className="form-alert form-alert--error">
              Reconciliation gagal atau state sudah berubah.
            </p>
          )}
        </div>
      )}

      <div className="message-detail-layout">
        <article className="panel message-detail-card">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Logical message</p>
              <h2>Command detail</h2>
            </div>
            <StatusBadge tone={unknown ? 'danger' : message.state === 'sent' ? 'success' : 'info'}>
              {message.state}
            </StatusBadge>
          </div>
          <blockquote>{message.content}</blockquote>
          <dl className="contact-facts">
            <div><dt>Priority</dt><dd>{message.priority}</dd></div>
            <div><dt>Provider ID</dt><dd>{message.providerMessageId ?? 'Belum tersedia'}</dd></div>
            <div><dt>Queued</dt><dd>{formatDate(message.queuedAt)}</dd></div>
            <div><dt>Sending</dt><dd>{formatDate(message.sendingAt)}</dd></div>
            <div><dt>Sent</dt><dd>{formatDate(message.sentAt)}</dd></div>
            <div><dt>Scheduled</dt><dd>{formatDate(message.scheduledAt)}</dd></div>
          </dl>
          {message.errorCode && (
            <div className="form-alert form-alert--error">
              <strong>{message.errorCode}</strong>
              <span>{message.errorMessage}</span>
            </div>
          )}
          {outbox && (
            <p className="technical-id">
              Outbox {outbox.id} · attempt {outbox.attempts}/{outbox.maxAttempts}
            </p>
          )}
        </article>

        <article className="panel timeline-panel">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Append-only events</p>
              <h2>Timeline</h2>
            </div>
          </div>
          <ol className="message-timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <strong>{event.eventType.replaceAll('_', ' ')}</strong>
                  <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                  {event.reasonCode && <small>{event.reasonCode}</small>}
                </div>
              </li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  );
};
