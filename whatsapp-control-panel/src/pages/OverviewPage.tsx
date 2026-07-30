import { lazy, Suspense } from 'react';
import { useOverviewQuery } from '../api/queries';
import { MetricCard } from '../components/MetricCard';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import type { AdminUser } from '../api/contracts';

const DevScenarioControl = import.meta.env.DEV
  ? lazy(() => import('../dev/ScenarioControl'))
  : null;

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
            <p className="eyebrow">Sending blocked</p>
            <strong>Session belum siap mengirim pesan</strong>
          </div>
          <p>{data.readiness.blockers.join(', ').replaceAll('_', ' ')}</p>
        </section>
      )}

      <header className="page-heading">
        <div>
          <p className="eyebrow">Operations / Overview</p>
          <h1>Halo, {user?.displayName ?? 'Admin'}.</h1>
          <p>Ini kondisi sistem WhatsApp Anda saat ini.</p>
        </div>
        <div className="page-heading__actions">
          {DevScenarioControl && (
            <Suspense fallback={null}>
              <DevScenarioControl />
            </Suspense>
          )}
          <button className="button button--primary" disabled type="button">
            Compose message
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Ringkasan operasional">
        <MetricCard
          eyebrow="WhatsApp session"
          title={data.session.state.replaceAll('_', ' ')}
          description={
            data.readiness.readyToSend
              ? 'Session dan safety policy siap menerima pengiriman.'
              : 'Pengiriman ditahan sampai seluruh blocker selesai.'
          }
          badge={
            <StatusBadge tone={stateTone(data.session.state)}>
              {data.readiness.readyToSend ? 'Send ready' : 'Not ready'}
            </StatusBadge>
          }
        >
          <dl className="metric-list">
            <div>
              <dt>Database</dt>
              <dd>{data.readiness.database}</dd>
            </div>
            <div>
              <dt>Event stream</dt>
              <dd>{data.readiness.eventStream}</dd>
            </div>
          </dl>
        </MetricCard>

        <MetricCard
          eyebrow="Safety health"
          title={
            data.safety.score === null
              ? 'Not available'
              : `${data.safety.score}/100`
          }
          description={data.safety.recommendation}
          badge={
            <StatusBadge tone={stateTone(data.safety.risk)}>
              {data.safety.risk} risk
            </StatusBadge>
          }
        >
          <p className="reason">{data.safety.reasons[0]}</p>
        </MetricCard>

        <MetricCard
          eyebrow="Outbox"
          title={data.outbox ? `${data.outbox.queued} queued` : 'Not configured'}
          description={
            data.outbox
              ? 'Pesan belum dikirim dan tetap berada pada durable outbox.'
              : 'Durable outbox belum tersedia pada backend saat ini.'
          }
          badge={
            <StatusBadge tone={data.outbox?.failed ? 'danger' : 'neutral'}>
              {data.capabilities.outbox.replaceAll('_', ' ')}
            </StatusBadge>
          }
        >
          {data.outbox && (
            <dl className="metric-list">
              <div>
                <dt>Retrying</dt>
                <dd>{data.outbox.retrying}</dd>
              </div>
              <div>
                <dt>Oldest age</dt>
                <dd>{Math.round(data.outbox.oldestAgeMs / 1_000)}s</dd>
              </div>
            </dl>
          )}
        </MetricCard>

        <MetricCard
          eyebrow="Human follow-up"
          title={data.followUp ? `${data.followUp.open} open` : 'Not configured'}
          description={
            data.followUp
              ? 'Permintaan menu 5 yang memerlukan tindak lanjut operator.'
              : 'Workflow human follow-up belum tersedia pada backend saat ini.'
          }
          badge={
            <StatusBadge tone={data.followUp?.overdue ? 'warning' : 'neutral'}>
              {data.capabilities.followUp.replaceAll('_', ' ')}
            </StatusBadge>
          }
        >
          {data.followUp && (
            <dl className="metric-list">
              <div>
                <dt>Unassigned</dt>
                <dd>{data.followUp.unassigned}</dd>
              </div>
              <div>
                <dt>Assigned</dt>
                <dd>{data.followUp.open - data.followUp.unassigned}</dd>
              </div>
            </dl>
          )}
        </MetricCard>
      </section>

      <section className="panel">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Rate utilization</p>
            <h2>Conservative safety budget</h2>
          </div>
          <StatusBadge tone={data.warmup ? 'success' : 'neutral'}>
            {data.warmup
              ? `Warm-up day ${data.warmup.day}/${data.warmup.totalDays}`
              : 'Safety unavailable'}
          </StatusBadge>
        </div>

        <div className="rate-grid">
          {Object.entries(data.rates).map(([window, rate]) => {
            if (!rate) {
              return (
                <div className="rate-item" key={window}>
                  <div>
                    <span>{window}</span>
                    <strong>Not available</strong>
                  </div>
                  <div className="progress progress--unknown" aria-hidden="true" />
                </div>
              );
            }
            const percent = formatPercent(rate.used, rate.limit);
            return (
              <div className="rate-item" key={window}>
                <div>
                  <span>{window}</span>
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
            <p className="eyebrow">Operational timeline</p>
            <h2>Recent events</h2>
          </div>
          <StatusBadge tone={data.capabilities.eventStream === 'enabled' ? 'success' : 'neutral'}>
            {data.capabilities.eventStream.replaceAll('_', ' ')}
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
