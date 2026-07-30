import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import type { AdminUser, ConnectionState } from '../api/contracts';
import type { StreamState } from '../api/events';
import {
  overviewQueryKey,
  sessionQueryKey,
  useSessionQuery
} from '../api/queries';
import {
  getPairingQr,
  pauseSending,
  reconnectSession
} from '../api/session';
import { ApiClientError } from '../api/client';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';

const stateCopy: Record<
  ConnectionState,
  { title: string; description: string; tone: StatusTone }
> = {
  starting: {
    title: 'Service starting',
    description: 'Backend sedang menyiapkan auth state dan socket WhatsApp.',
    tone: 'info'
  },
  connecting: {
    title: 'Connecting',
    description: 'Socket sedang membuka koneksi ke WhatsApp.',
    tone: 'info'
  },
  qr_required: {
    title: 'Pairing required',
    description: 'Scan QR aktif dari WhatsApp → Perangkat Tertaut.',
    tone: 'warning'
  },
  connected: {
    title: 'Connected',
    description: 'Session aktif. Readiness pengiriman tetap mengikuti safety policy.',
    tone: 'success'
  },
  reconnecting: {
    title: 'Reconnecting',
    description: 'Backend sedang menjalankan satu percobaan reconnect terkontrol.',
    tone: 'warning'
  },
  paused: {
    title: 'Sending paused',
    description: 'Koneksi tersedia, tetapi seluruh pengiriman baru sedang diblokir.',
    tone: 'danger'
  },
  logged_out: {
    title: 'Logged out',
    description: 'Credential ditolak WhatsApp. Admin perlu melakukan reset/re-pair.',
    tone: 'danger'
  },
  bad_session: {
    title: 'Bad session',
    description: 'Auth state tidak valid. Reconnect otomatis sengaja dihentikan.',
    tone: 'danger'
  },
  disconnected: {
    title: 'Disconnected',
    description: 'Tidak ada koneksi aktif. Reconnect dapat diminta jika eligible.',
    tone: 'danger'
  },
  shutting_down: {
    title: 'Shutting down',
    description: 'Service sedang berhenti dan tidak menerima action baru.',
    tone: 'neutral'
  }
};

const disabledReasonCopy: Record<string, string> = {
  session_starting: 'Service masih starting',
  connection_in_progress: 'Koneksi sedang diproses',
  pairing_required: 'Selesaikan pairing QR',
  already_connected: 'Session sudah connected',
  reconnect_in_progress: 'Reconnect sedang berjalan',
  sending_paused: 'Sending sedang paused',
  auth_reset_required: 'Auth reset oleh Admin diperlukan',
  service_shutting_down: 'Service sedang shutdown',
  reconnect_not_available: 'Reconnect tidak tersedia'
};

const formatDate = (value: string | null): string =>
  value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      }).format(new Date(value))
    : 'Belum tersedia';

type SessionPageProps = {
  user: AdminUser;
  streamState: StreamState;
};

export const SessionPage = ({ user, streamState }: SessionPageProps) => {
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const session = sessionQuery.data?.data.session;
  const canReconnect = user.permissions.includes('session.reconnect');
  const canPause = user.permissions.includes('safety.pause');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmPause, setConfirmPause] = useState(false);

  const qrQuery = useQuery({
    queryKey: ['pairing-qr'],
    queryFn: getPairingQr,
    enabled: session?.state === 'qr_required' && canReconnect,
    refetchInterval: 10_000,
    retry: false
  });

  useEffect(() => {
    const rawQr = qrQuery.data?.data.qr;
    if (!rawQr) {
      return;
    }
    let active = true;
    void QRCode.toDataURL(rawQr, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#07110d', light: '#ffffff' }
    }).then((image) => {
      if (active) setQrImage(image);
    });
    return () => {
      active = false;
    };
  }, [qrQuery.data?.data.qr]);

  useEffect(() => {
    if (!qrQuery.data) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [qrQuery.data]);

  const qrSecondsRemaining = Math.max(
    0,
    Math.ceil(
      ((qrQuery.data
        ? new Date(qrQuery.data.data.expiresAt).getTime()
        : now) -
        now) /
        1_000
    )
  );

  const refreshOperationalData = () => {
    void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    void queryClient.invalidateQueries({ queryKey: overviewQueryKey });
  };
  const reconnectMutation = useMutation({
    mutationFn: reconnectSession,
    onSuccess: (result) => {
      queryClient.setQueryData(sessionQueryKey, result);
      refreshOperationalData();
    }
  });
  const pauseMutation = useMutation({
    mutationFn: pauseSending,
    onSuccess: () => {
      setConfirmPause(false);
      refreshOperationalData();
    }
  });

  const reconnectReason = useMemo(() => {
    const reason = session?.reconnect.disabledReason;
    return reason ? disabledReasonCopy[reason] ?? reason.replaceAll('_', ' ') : null;
  }, [session?.reconnect.disabledReason]);

  if (sessionQuery.isPending) {
    return (
      <section className="page-state" aria-live="polite">
        <span className="loader" aria-hidden="true" />
        <h1>Memuat session WhatsApp…</h1>
      </section>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <section className="page-state page-state--error" role="alert">
        <p className="eyebrow">Session unavailable</p>
        <h1>Status koneksi belum dapat dimuat</h1>
        <p>{sessionQuery.error?.message}</p>
        <button type="button" onClick={() => sessionQuery.refetch()}>
          Coba lagi
        </button>
      </section>
    );
  }

  const copy = stateCopy[session.state];
  const actionError = reconnectMutation.error ?? pauseMutation.error;

  return (
    <>
      {session.state !== 'connected' && (
        <section className="incident-banner" role="alert">
          <div>
            <p className="eyebrow">Session attention</p>
            <strong>{copy.title}</strong>
          </div>
          <p>{copy.description}</p>
        </section>
      )}

      <header className="page-heading">
        <div>
          <p className="eyebrow">Operations / WhatsApp Session</p>
          <h1>Connection control</h1>
          <p>Pahami lifecycle session, pairing, dan recovery dari satu tempat.</p>
        </div>
        <StatusBadge tone={streamState === 'live' ? 'success' : 'warning'}>
          {streamState === 'live' ? 'Live updates' : '10s polling fallback'}
        </StatusBadge>
      </header>

      {actionError && (
        <section className="form-alert form-alert--error" role="alert">
          {actionError.message}
          {actionError instanceof ApiClientError && actionError.requestId && (
            <small>Request ID: {actionError.requestId}</small>
          )}
        </section>
      )}

      <section className="session-layout">
        <article className="panel session-summary">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Operational state</p>
              <h2>{copy.title}</h2>
            </div>
            <StatusBadge tone={copy.tone}>{session.state.replaceAll('_', ' ')}</StatusBadge>
          </div>
          <p className="session-summary__copy">{copy.description}</p>
          <dl className="detail-list">
            <div>
              <dt>Send readiness</dt>
              <dd>{sessionQuery.data.data.readiness.readyToSend ? 'Ready' : 'Blocked'}</dd>
            </div>
            <div>
              <dt>Connected since</dt>
              <dd>{formatDate(session.connectedSince)}</dd>
            </div>
            <div>
              <dt>Reconnect attempt</dt>
              <dd>{session.reconnect.attempt}</dd>
            </div>
            <div>
              <dt>Next retry</dt>
              <dd>{formatDate(session.reconnect.nextRetryAt)}</dd>
            </div>
            <div>
              <dt>Browser profile</dt>
              <dd>{session.browser.name} · {session.browser.platform}</dd>
            </div>
            <div>
              <dt>Credential updated</dt>
              <dd>{formatDate(session.credentialUpdatedAt)}</dd>
            </div>
          </dl>

          {session.lastDisconnect && (
            <div className="disconnect-detail">
              <p className="eyebrow">Last disconnect</p>
              <strong>{session.lastDisconnect.classification.replaceAll('_', ' ')}</strong>
              <span>
                {session.lastDisconnect.code ?? 'unknown'} · {session.lastDisconnect.reason}
              </span>
              <small>{formatDate(session.lastDisconnect.occurredAt)}</small>
            </div>
          )}
        </article>

        <article className="panel pairing-panel">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Secure pairing</p>
              <h2>WhatsApp QR</h2>
            </div>
            {session.state === 'qr_required' && (
              <StatusBadge tone="warning">{qrSecondsRemaining}s</StatusBadge>
            )}
          </div>

          {session.state === 'qr_required' && canReconnect ? (
            <div className="qr-stage">
              {qrImage && qrSecondsRemaining > 0 ? (
                <img
                  alt="QR pairing WhatsApp yang aktif"
                  className="pairing-qr"
                  src={qrImage}
                />
              ) : (
                <div className="qr-waiting" aria-live="polite">
                  <span className="loader" aria-hidden="true" />
                  <span>
                    {qrQuery.isError || qrSecondsRemaining === 0
                      ? 'QR expired, menunggu rotasi berikutnya…'
                      : 'Membuat QR…'}
                  </span>
                </div>
              )}
              <strong>WhatsApp → Perangkat Tertaut → Tautkan Perangkat</strong>
              <p>
                QR hanya berada di memory backend, tidak dicatat ke database atau log,
                dan otomatis hilang setelah connected.
              </p>
            </div>
          ) : (
            <div className="empty-stage">
              <strong>
                {session.state === 'connected'
                  ? 'Pairing sudah selesai'
                  : canReconnect
                    ? 'QR belum tersedia'
                    : 'Pairing membutuhkan permission operator'}
              </strong>
              <p>
                QR hanya ditampilkan ketika backend melaporkan state
                <code> qr_required</code>.
              </p>
            </div>
          )}
        </article>
      </section>

      {(canReconnect || canPause) && (
        <section className="panel action-panel">
          <div>
            <p className="eyebrow">Guarded controls</p>
            <h2>Operational actions</h2>
            <p>Semua action diperiksa backend, dilindungi CSRF, dan masuk audit log.</p>
          </div>
          <div className="action-panel__buttons">
            {canReconnect && (
              <div>
                <button
                  className="button"
                  disabled={!session.reconnect.eligible || reconnectMutation.isPending}
                  onClick={() => reconnectMutation.mutate()}
                  type="button"
                >
                  {reconnectMutation.isPending ? 'Requesting…' : 'Reconnect'}
                </button>
                {!session.reconnect.eligible && reconnectReason && (
                  <small>{reconnectReason}</small>
                )}
              </div>
            )}
            {canPause && session.state !== 'paused' && !confirmPause && (
              <button
                className="button button--danger"
                onClick={() => setConfirmPause(true)}
                type="button"
              >
                Emergency pause
              </button>
            )}
            {canPause && session.state !== 'paused' && confirmPause && (
              <div className="pause-confirm" role="alert">
                <span>Blokir seluruh pengiriman baru sekarang?</span>
                <button
                  className="button button--danger"
                  disabled={pauseMutation.isPending}
                  onClick={() => pauseMutation.mutate()}
                  type="button"
                >
                  Ya, pause sending
                </button>
                <button
                  className="button"
                  onClick={() => setConfirmPause(false)}
                  type="button"
                >
                  Batal
                </button>
              </div>
            )}
            {canPause && session.state === 'paused' && (
              <StatusBadge tone="danger">Sending already paused</StatusBadge>
            )}
          </div>
        </section>
      )}
    </>
  );
};
