import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AdminUser, OverviewData } from '../api/contracts';
import { createMessage } from '../api/messages';
import { navigate } from '../routing/navigation';

type MessageComposerProps = {
  recipient: { contactId?: string; phone?: string };
  recipientLabel: string;
  user: AdminUser;
  overview?: OverviewData;
  variant?: 'thread' | 'page';
};

const toLocalDateTimeInput = (date: Date): string => {
  const offsetMilliseconds = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMilliseconds)
    .toISOString()
    .slice(0, 16);
};

export const MessageComposer = ({
  recipient,
  recipientLabel,
  user,
  overview,
  variant = 'thread'
}: MessageComposerProps) => {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [minimumSchedule] = useState(() =>
    toLocalDateTimeInput(new Date(Date.now() + 60_000))
  );
  const [lastSubmission, setLastSubmission] = useState<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const canSend = user.permissions.includes('messages.send');
  const blockers = overview?.readiness.blockers ?? ['readiness_loading'];
  const ready = overview?.readiness.readyToSend ?? false;
  const mutation = useMutation({
    mutationFn: createMessage,
    onSuccess: (result) => {
      navigate(`/messages/${result.data.id}`);
    }
  });

  const normalizedText = text.replace(/\r\n?/g, '\n').trim();
  const scheduledAt = scheduledLocal
    ? new Date(scheduledLocal).toISOString()
    : null;
  const fingerprint = JSON.stringify({
    recipient,
    text: normalizedText,
    priority,
    scheduledAt
  });
  const disabledReason = !canSend
    ? 'Akun ini tidak memiliki permission messages.send.'
    : !ready
      ? `Pengiriman belum aman: ${blockers.join(', ')}.`
      : !recipient.contactId && !recipient.phone
        ? 'Pilih recipient terlebih dahulu.'
        : !normalizedText
          ? 'Tulis pesan sebelum submit.'
          : normalizedText.length > 4096
            ? 'Pesan melewati batas 4.096 karakter.'
            : null;

  return (
    <form
      className={`message-composer message-composer--${variant}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (disabledReason || mutation.isPending) return;
        const idempotencyKey =
          lastSubmission?.fingerprint === fingerprint
            ? lastSubmission.key
            : crypto.randomUUID();
        setLastSubmission({ fingerprint, key: idempotencyKey });
        mutation.mutate({
          idempotencyKey,
          recipient,
          text: normalizedText,
          priority,
          scheduledAt
        });
      }}
    >
      <div className="message-composer__heading">
        <div>
          <strong>Safe compose</strong>
          <span>Ke {recipientLabel}</span>
        </div>
        <span
          className="compose-readiness"
          data-ready={ready && canSend}
        >
          {ready && canSend ? 'Ready to queue' : 'Blocked'}
        </span>
      </div>

      <label>
        <span className="sr-only">Isi pesan</span>
        <textarea
          aria-label="Isi pesan"
          maxLength={4097}
          placeholder="Tulis pesan WhatsApp…"
          rows={variant === 'page' ? 8 : 3}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="message-composer__options">
        <label>
          Priority
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as typeof priority)
            }
          >
            <option value="normal">Normal</option>
            {user.role === 'admin' && <option value="high">High</option>}
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Schedule (opsional)
          <input
            min={minimumSchedule}
            type="datetime-local"
            value={scheduledLocal}
            onChange={(event) => setScheduledLocal(event.target.value)}
          />
        </label>
        <span
          className="character-count"
          data-invalid={normalizedText.length > 4096}
        >
          {normalizedText.length}/4096
        </span>
      </div>

      <div className="message-composer__submit">
        <div aria-live="polite">
          {disabledReason && <small>{disabledReason}</small>}
          {mutation.isError && (
            <small className="compose-error">
              Submit gagal. Request yang sama tetap memakai idempotency key yang sama.
            </small>
          )}
        </div>
        <button
          className="button button--primary"
          disabled={Boolean(disabledReason) || mutation.isPending}
          type="submit"
        >
          {mutation.isPending
            ? 'Menerima command…'
            : scheduledAt
              ? 'Jadwalkan'
              : 'Masukkan ke outbox'}
        </button>
      </div>
    </form>
  );
};
