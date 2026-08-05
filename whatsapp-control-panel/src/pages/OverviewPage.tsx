import { useOverviewQuery } from '../api/queries';
import { MetricCard } from '../components/MetricCard';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import type { AdminUser } from '../api/contracts';
import { navigate } from '../routing/navigation';

const stateTone = (state: string): StatusTone => {
  if (state === 'connected' || state === 'low') return 'success';
  if (state === 'connecting' || state === 'qr_required' || state === 'medium') {
    return 'warning';
  }
  if (
    state === 'disconnected' ||
    state === 'high' ||
    state === 'critical' ||
    state === 'paused'
  ) {
    return 'danger';
  }
  return 'neutral';
};

const formatPercent = (used: number, limit: number): number =>
  Math.min(100, Math.round((used / limit) * 100));

const sessionLabel: Record<string, string> = {
  starting: 'Memulai',
  connecting: 'Menghubungkan',
  qr_required: 'Perlu scan QR',
  connected: 'Terhubung',
  reconnecting: 'Menghubungkan ulang',
  paused: 'Dijeda',
  logged_out: 'Keluar',
  bad_session: 'Sesi bermasalah',
  disconnected: 'Terputus',
  shutting_down: 'Menghentikan layanan'
};

const capabilityLabel = (value: string) =>
  value === 'enabled'
    ? 'Aktif'
    : value === 'not_configured'
      ? 'Belum tersedia'
      : value.replaceAll('_', ' ');

const rateWindowLabel: Record<string, string> = {
  minute: 'Menit',
  hour: 'Jam',
  day: 'Hari'
};

const riskLabel: Record<string, string> = {
  low: 'rendah',
  medium: 'sedang',
  high: 'tinggi',
  critical: 'kritis'
};

const readinessLabels: Record<string, string> = {
  connected: 'Terhubung',
  available: 'Tersedia',
  unavailable: 'Tidak tersedia',
  degraded: 'Terganggu'
};

const readinessLabel = (value: string) =>
  readinessLabels[value] ?? value.replaceAll('_', ' ');

type OverviewPageProps = {
  user?: AdminUser;
};

export const OverviewPage = ({ user }: OverviewPageProps) => {
  const overviewQuery = useOverviewQuery();

  const data = overviewQuery.data?.data;

  if (overviewQuery.isPending) {
    return (
      <section className="page-state" aria-live="polite">
        <span className="loader" aria-hidden="true" />
        <h1>Memuat control room…</h1>
        <p>Mengambil status service, session, dan safety.</p>
      </section>
    );
  }

  if (overviewQuery.isError || !data) {
    return (
      <section className="page-state page-state--error" role="alert">
        <p className="eyebrow">API unavailable</p>
        <h1>Overview belum dapat dimuat</h1>
        <p>
          {overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : 'Terjadi kesalahan yang tidak diketahui.'}
        </p>
        <button type="button" onClick={() => overviewQuery.refetch()}>
          Coba lagi
        </button>
      </section>
    );
  }

  return (
    <>
      {!data.readiness.readyToSend && (
        <section className="incident-banner" role="alert">
          <div>
            <p className="eyebrow">Perlu perhatian</p>
            <strong>Pengiriman pesan sedang tertahan</strong>
          </div>
          <p>
            Periksa koneksi dan keamanan pengiriman sebelum mencoba kembali.{' '}
            <span className="technical-id">
              {data.readiness.blockers.join(', ').replaceAll('_', ' ')}
            </span>
          </p>
        </section>
      )}

      <header className="page-heading">
        <div>
          <p className="eyebrow">Ringkasan operasional</p>
          <h1>Halo, {user?.displayName ?? 'Admin'}.</h1>
          <p>Pantau koneksi, keamanan, dan antrean pesan dari satu tempat.</p>
        </div>
        <div className="page-heading__actions">
          <button
            className="button button--primary"
            onClick={() => navigate('/messages/compose')}
            type="button"
          >
            Tulis pesan
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Ringkasan operasional">
        <MetricCard
          eyebrow="Koneksi WhatsApp"
          title={sessionLabel[data.session.state] ?? data.session.state.replaceAll('_', ' ')}
          description={
            data.readiness.readyToSend
              ? 'WhatsApp terhubung dan siap menerima pesan baru.'
              : 'Selesaikan kendala koneksi atau keamanan sebelum mengirim.'
          }
          badge={
            <StatusBadge tone={stateTone(data.session.state)}>
              {data.readiness.readyToSend ? 'Siap mengirim' : 'Belum siap'}
            </StatusBadge>
          }
        >
          <dl className="metric-list">
            <div>
              <dt>Database</dt>
              <dd>{readinessLabel(data.readiness.database)}</dd>
            </div>
            <div>
              <dt>Pembaruan status</dt>
              <dd>{readinessLabel(data.readiness.eventStream)}</dd>
            </div>
          </dl>
        </MetricCard>

        <MetricCard
          eyebrow="Keamanan pengiriman"
          title={
            data.safety.score === null
              ? 'Belum tersedia'
              : `${data.safety.score}/100`
          }
          description={data.safety.recommendation}
          badge={
            <StatusBadge tone={stateTone(data.safety.risk)}>
              Risiko {riskLabel[data.safety.risk] ?? data.safety.risk}
            </StatusBadge>
          }
        >
          <p className="reason">{data.safety.reasons[0]}</p>
        </MetricCard>

        <MetricCard
          eyebrow="Antrean pengiriman"
          title={data.outbox ? `${data.outbox.queued} menunggu` : 'Belum tersedia'}
          description={
            data.outbox
              ? 'Pesan yang menunggu, dijadwalkan, atau sedang dicoba kembali.'
              : 'Antrean pengiriman belum tersedia saat ini.'
          }
          badge={
            <StatusBadge tone={data.outbox?.failed ? 'danger' : 'neutral'}>
              {capabilityLabel(data.capabilities.outbox)}
            </StatusBadge>
          }
        >
          {data.outbox && (
            <dl className="metric-list">
              <div>
                <dt>Dicoba kembali</dt>
                <dd>{data.outbox.retrying}</dd>
              </div>
              <div>
                <dt>Antrean terlama</dt>
                <dd>{Math.round(data.outbox.oldestAgeMs / 1_000)}s</dd>
              </div>
            </dl>
          )}
        </MetricCard>

        <MetricCard
          eyebrow="Tindak lanjut admin"
          title={data.followUp ? `${data.followUp.open} terbuka` : 'Belum tersedia'}
          description={
            data.followUp
              ? 'Percakapan yang membutuhkan bantuan langsung dari admin.'
              : 'Tindak lanjut admin belum tersedia saat ini.'
          }
          badge={
            <StatusBadge tone={data.followUp?.overdue ? 'warning' : 'neutral'}>
              {capabilityLabel(data.capabilities.followUp)}
            </StatusBadge>
          }
        >
          {data.followUp && (
            <dl className="metric-list">
              <div>
                <dt>Belum ditangani</dt>
                <dd>{data.followUp.unassigned}</dd>
              </div>
              <div>
                <dt>Sedang ditangani</dt>
                <dd>{data.followUp.open - data.followUp.unassigned}</dd>
              </div>
            </dl>
          )}
        </MetricCard>
      </section>

      <section className="panel">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Batas pengiriman</p>
            <h2>Pemakaian batas aman</h2>
          </div>
          <StatusBadge tone={data.warmup ? 'success' : 'neutral'}>
            {data.warmup
              ? `Masa pemanasan hari ${data.warmup.day}/${data.warmup.totalDays}`
              : 'Data keamanan belum tersedia'}
          </StatusBadge>
        </div>

        <div className="rate-grid">
          {Object.entries(data.rates).map(([window, rate]) => {
            if (!rate) {
              return (
                <div className="rate-item" key={window}>
                  <div>
                    <span>{rateWindowLabel[window] ?? window}</span>
                    <strong>Belum tersedia</strong>
                  </div>
                  <div className="progress progress--unknown" aria-hidden="true" />
                </div>
              );
            }
            const percent = formatPercent(rate.used, rate.limit);
            return (
              <div className="rate-item" key={window}>
                <div>
                  <span>{rateWindowLabel[window] ?? window}</span>
                  <strong>
                    {rate.used} / {rate.limit}
                  </strong>
                </div>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`Pemakaian rate ${window}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel events-panel">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Aktivitas sistem</p>
            <h2>Kejadian terbaru</h2>
          </div>
          <StatusBadge tone={data.capabilities.eventStream === 'enabled' ? 'success' : 'neutral'}>
            {capabilityLabel(data.capabilities.eventStream)}
          </StatusBadge>
        </div>
        {data.recentEvents.length > 0 ? (
          <ol className="event-list">
            {data.recentEvents.map((event) => (
              <li key={event.id}>
                <StatusBadge
                  tone={
                    event.severity === 'critical'
                      ? 'danger'
                      : event.severity === 'warning'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {event.severity}
                </StatusBadge>
                <strong>{event.type.replaceAll('.', ' ')}</strong>
                <time dateTime={event.occurredAt}>
                  {new Intl.DateTimeFormat('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'medium'
                  }).format(new Date(event.occurredAt))}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">Belum ada operational event yang tersimpan.</p>
        )}
      </section>
    </>
  );
};
