import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminUser,
  SafetyCenterData
} from '../api/contracts';
import {
  getSafetyCenter,
  pauseSafety,
  resetSafety,
  resumeSafety
} from '../api/safety';
import { overviewQueryKey, sessionQueryKey } from '../api/queries';
import { ApiClientError } from '../api/client';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';

const safetyCenterQueryKey = ['safety-center'] as const;

const formatDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      }).format(new Date(value))
    : 'Tidak ada';

const formatDuration = (milliseconds: number | null) => {
  if (milliseconds === null) return 'Tidak aktif';
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} menit`;
  return `${Math.ceil(minutes / 60)} jam`;
};

const riskTone: Record<string, StatusTone> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
  unknown: 'neutral'
};

const capabilityCopy: Record<string, string> = {
  enabled: 'Enabled',
  disabled: 'Not enabled',
  not_instrumented: 'Not instrumented',
  unavailable: 'Unavailable'
};

const FeaturePanel = ({
  title,
  state,
  reason,
  children
}: {
  title: string;
  state: string;
  reason: string | null;
  children?: ReactNode;
}) => (
  <article className="panel safety-feature">
    <div className="panel__heading">
      <h2>{title}</h2>
      <StatusBadge tone={state === 'enabled' ? 'success' : 'neutral'}>
        {capabilityCopy[state] ?? state}
      </StatusBadge>
    </div>
    {state === 'enabled' ? (
      children
    ) : (
      <div className="feature-empty">
        <strong>{capabilityCopy[state] ?? state}</strong>
        <p>{reason ?? 'Data belum tersedia.'}</p>
      </div>
    )}
  </article>
);

const RateBars = ({ rates }: { rates: SafetyCenterData['rates'] }) => (
  <div className="safety-rate-list">
    {(['minute', 'hour', 'day'] as const).map((window) => {
      const item = rates[window];
      return item ? (
        <div className="rate-item" key={window}>
          <div>
            <span>{window}</span>
            <strong>{item.used} / {item.limit}</strong>
          </div>
          <div
            aria-label={`${window} utilization ${Math.round(item.utilization * 100)}%`}
            className="progress"
          >
            <span style={{ width: `${item.utilization * 100}%` }} />
          </div>
        </div>
      ) : null;
    })}
  </div>
);

type SafetyCenterPageProps = {
  user: AdminUser;
};

export const SafetyCenterPage = ({ user }: SafetyCenterPageProps) => {
  const queryClient = useQueryClient();
  const safetyQuery = useQuery({
    queryKey: safetyCenterQueryKey,
    queryFn: getSafetyCenter,
    refetchInterval: 10_000
  });
  const [now, setNow] = useState(() => Date.now());
  const [pauseReason, setPauseReason] = useState('');
  const [resumeReason, setResumeReason] = useState('');
  const [resumePassword, setResumePassword] = useState('');
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const syncSafety = (result: Awaited<ReturnType<typeof getSafetyCenter>>) => {
    queryClient.setQueryData(safetyCenterQueryKey, result);
    void queryClient.invalidateQueries({ queryKey: overviewQueryKey });
    void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
  };

  const pauseMutation = useMutation({
    mutationFn: pauseSafety,
    onSuccess: (result) => {
      setPauseReason('');
      syncSafety(result);
    }
  });
  const resumeMutation = useMutation({
    mutationFn: resumeSafety,
    onSuccess: (result) => {
      setResumeReason('');
      setResumePassword('');
      setRiskAcknowledged(false);
      syncSafety(result);
    }
  });
  const resetMutation = useMutation({
    mutationFn: resetSafety,
    onSuccess: (result) => {
      setResetReason('');
      setResetPassword('');
      setResetConfirmation('');
      syncSafety(result);
    }
  });

  if (safetyQuery.isPending) {
    return (
      <section className="page-state" aria-live="polite">
        <span className="loader" aria-hidden="true" />
        <h1>Memuat Safety Center…</h1>
      </section>
    );
  }

  if (safetyQuery.isError || !safetyQuery.data) {
    return (
      <section className="page-state page-state--error" role="alert">
        <p className="eyebrow">Safety unavailable</p>
        <h1>State safety belum dapat dimuat</h1>
        <p>{safetyQuery.error?.message}</p>
        <button type="button" onClick={() => safetyQuery.refetch()}>
          Coba lagi
        </button>
      </section>
    );
  }

  const safety = safetyQuery.data.data;
  const canPause = user.permissions.includes('safety.pause');
  const canResume = user.permissions.includes('safety.resume');
  const canReset = user.permissions.includes('session.reset');
  const resetCapability = safety.capabilities.reset;
  const actionError =
    pauseMutation.error ?? resumeMutation.error ?? resetMutation.error;
  const retrySeconds = safety.blockers
    .map((blocker) =>
      blocker.retryAt
        ? Math.max(0, Math.ceil((new Date(blocker.retryAt).getTime() - now) / 1000))
        : null
    )
    .find((value) => value !== null);

  const submitPause = (event: FormEvent) => {
    event.preventDefault();
    pauseMutation.mutate(pauseReason);
  };
  const submitResume = (event: FormEvent) => {
    event.preventDefault();
    resumeMutation.mutate({
      reason: resumeReason,
      currentPassword: resumePassword
    });
  };
  const submitReset = (event: FormEvent) => {
    event.preventDefault();
    resetMutation.mutate({
      reason: resetReason,
      currentPassword: resetPassword,
      confirmation: resetConfirmation
    });
  };

  return (
    <>
      {safety.effectivePaused && (
        <section className="incident-banner" role="alert">
          <div>
            <p className="eyebrow">Sending blocked</p>
            <strong>{safety.mode.replaceAll('_', ' ')}</strong>
          </div>
          <p>
            {retrySeconds !== undefined
              ? `Evaluasi berikutnya ± ${retrySeconds} detik`
              : 'Menunggu tindakan atau pemulihan safety'}
          </p>
        </section>
      )}

      <header className="page-heading">
        <div>
          <p className="eyebrow">Operations / Safety Center</p>
          <h1>Safety & recovery</h1>
          <p>
            Pahami alasan pesan diblokir atau ditunda, lalu jalankan recovery
            sesuai guard.
          </p>
        </div>
        <div className="safety-heading-state">
          <StatusBadge tone={safety.effectivePaused ? 'danger' : 'success'}>
            {safety.effectivePaused ? 'Sending paused' : 'Sending active'}
          </StatusBadge>
          <StatusBadge tone={riskTone[safety.health.risk]}>
            Risk {safety.health.risk}
          </StatusBadge>
        </div>
      </header>

      {actionError && (
        <section className="form-alert form-alert--error" role="alert">
          {actionError.message}
          {actionError instanceof ApiClientError && actionError.requestId && (
            <small>Request ID: {actionError.requestId}</small>
          )}
        </section>
      )}

      <section className="safety-summary-grid" aria-label="Ringkasan safety">
        <article className="panel safety-score">
          <p className="eyebrow">Health score</p>
          <strong>{safety.health.score ?? '—'}</strong>
          <StatusBadge tone={riskTone[safety.health.risk]}>
            {safety.health.risk}
          </StatusBadge>
          <p>{safety.health.recommendation}</p>
        </article>
        <article className="panel">
          <div className="panel__heading">
            <h2>Active blockers</h2>
            <span className="count-chip">{safety.blockers.length}</span>
          </div>
          {safety.blockers.length ? (
            <div className="blocker-list">
              {safety.blockers.map((blocker) => (
                <div key={`${blocker.code}-${blocker.source}`}>
                  <strong>{blocker.code.replaceAll('_', ' ')}</strong>
                  <p>{blocker.message}</p>
                  <small>{blocker.recommendation}</small>
                  {blocker.retryAt && (
                    <small>Retry/evaluasi: {formatDate(blocker.retryAt)}</small>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="feature-empty">
              <strong>Tidak ada blocker aktif</strong>
              <p>Safety policy mengizinkan pengiriman saat ini.</p>
            </div>
          )}
        </article>
      </section>

      <section className="safety-feature-grid">
        <FeaturePanel
          title="Rate limits"
          state={safety.rates.state}
          reason={safety.rates.reason}
        >
          <RateBars rates={safety.rates} />
        </FeaturePanel>

        <FeaturePanel
          title="Warm-up"
          state={safety.warmup.state}
          reason={safety.warmup.reason}
        >
          {safety.warmup.data && (
            <dl className="detail-list detail-list--single">
              <div><dt>Day</dt><dd>{safety.warmup.data.day} / {safety.warmup.data.totalDays}</dd></div>
              <div><dt>Sent today</dt><dd>{safety.warmup.data.sentToday} / {safety.warmup.data.limitToday}</dd></div>
              <div><dt>Remaining</dt><dd>{safety.warmup.data.remainingToday}</dd></div>
            </dl>
          )}
        </FeaturePanel>

        <FeaturePanel
          title="Timelock"
          state={safety.timelock.state}
          reason={safety.timelock.reason}
        >
          <dl className="detail-list detail-list--single">
            <div><dt>Status</dt><dd>{safety.timelock.active ? 'Active' : 'Clear'}</dd></div>
            <div><dt>Expires</dt><dd>{formatDate(safety.timelock.expiresAt)}</dd></div>
            <div><dt>Errors</dt><dd>{safety.timelock.errorCount ?? '—'}</dd></div>
          </dl>
        </FeaturePanel>

        <FeaturePanel
          title="Recovery"
          state={safety.recovery.state}
          reason={safety.recovery.reason}
        >
          <dl className="detail-list detail-list--single">
            <div><dt>Phase</dt><dd>{safety.recovery.phase ?? '—'}</dd></div>
            <div><dt>Rate multiplier</dt><dd>{safety.recovery.rateMultiplier ?? '—'}×</dd></div>
            <div><dt>Pause remaining</dt><dd>{formatDuration(safety.recovery.pauseRemainingMs)}</dd></div>
            <div><dt>Full recovery</dt><dd>{formatDate(safety.recovery.estimatedFullRecoveryAt)}</dd></div>
          </dl>
        </FeaturePanel>

        <FeaturePanel
          title="Delivery"
          state={safety.delivery.state}
          reason={safety.delivery.reason}
        >
          {safety.delivery.data && (
            <dl className="detail-list detail-list--single">
              <div><dt>Sample</dt><dd>{safety.delivery.data.sampleState.replaceAll('_', ' ')}</dd></div>
              <div><dt>Delivered</dt><dd>{safety.delivery.data.deliveredInWindow} / {safety.delivery.data.sentInWindow}</dd></div>
              <div><dt>Rate</dt><dd>{safety.delivery.data.deliveryRate === null ? 'Belum cukup data' : `${Math.round(safety.delivery.data.deliveryRate * 100)}%`}</dd></div>
            </dl>
          )}
        </FeaturePanel>

        <div className="safety-module-stack">
          {([
            ['Retry tracker', safety.retry],
            ['Reconnect throttle', safety.reconnect],
            ['Session stability', safety.sessionStability]
          ] as const).map(([title, feature]) => (
            <FeaturePanel
              key={title}
              title={title}
              state={feature.state}
              reason={feature.reason}
            />
          ))}
        </div>
      </section>

      <section className="safety-lower-grid">
        <article className="panel">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Traceability</p>
              <h2>Recent safety delays</h2>
            </div>
          </div>
          {safety.recentDelays.length ? (
            <div className="safety-delay-list">
              {safety.recentDelays.map((delay) => (
                <div key={delay.id}>
                  <span>
                    <strong>{delay.reasonCode.replaceAll('_', ' ')}</strong>
                    <small>{formatDate(delay.occurredAt)}</small>
                  </span>
                  <p>{delay.message ?? 'Pesan ditunda oleh safety policy.'}</p>
                  <small>{delay.recommendation}</small>
                  <a href={`/messages/${delay.messageId}`}>Lihat timeline pesan</a>
                </div>
              ))}
            </div>
          ) : (
            <div className="feature-empty">
              <strong>Belum ada delay tercatat</strong>
              <p>Event safety-delayed akan muncul di sini.</p>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Read only</p>
              <h2>Active policy</h2>
            </div>
            <StatusBadge tone="info">{safety.config.preset}</StatusBadge>
          </div>
          {safety.config.values ? (
            <dl className="detail-list">
              <div><dt>Per minute</dt><dd>{safety.config.values.perMinute}</dd></div>
              <div><dt>Per hour</dt><dd>{safety.config.values.perHour}</dd></div>
              <div><dt>Per day</dt><dd>{safety.config.values.perDay}</dd></div>
              <div><dt>Delay range</dt><dd>{safety.config.values.minDelayMs}–{safety.config.values.maxDelayMs} ms</dd></div>
              <div><dt>Warm-up</dt><dd>{safety.config.values.warmupDays} days</dd></div>
              <div><dt>Auto pause</dt><dd>{safety.config.values.autoPauseAt}</dd></div>
            </dl>
          ) : (
            <p>Konfigurasi belum tersedia.</p>
          )}
          <p className="tool-hint">
            Preset ditampilkan read-only. Mutation konfigurasi belum diaktifkan.
          </p>
        </article>
      </section>

      <section className="safety-actions">
        {canPause && (
          <form className="panel guarded-action" onSubmit={submitPause}>
            <div>
              <p className="eyebrow">Operator action</p>
              <h2>Emergency pause</h2>
              <p>Pause bersifat durable dan seluruh delay tetap tercatat.</p>
            </div>
            <label>
              Alasan operasional
              <textarea
                minLength={5}
                maxLength={500}
                onChange={(event) => setPauseReason(event.target.value)}
                required
                rows={3}
                value={pauseReason}
              />
            </label>
            <button
              className="button button--danger"
              disabled={pauseMutation.isPending || pauseReason.trim().length < 5}
              type="submit"
            >
              {pauseMutation.isPending ? 'Pausing…' : 'Pause sending'}
            </button>
          </form>
        )}

        {canResume ? (
          <form className="panel guarded-action" onSubmit={submitResume}>
            <div>
              <p className="eyebrow">Admin · guarded recovery</p>
              <h2>Resume sending</h2>
              <p>
                Resume tidak dapat melewati recovery pause, dead state, atau
                timelock aktif.
              </p>
            </div>
            <label>
              Alasan keputusan
              <textarea
                minLength={5}
                maxLength={500}
                onChange={(event) => setResumeReason(event.target.value)}
                required
                rows={3}
                value={resumeReason}
              />
            </label>
            <label>
              Password saat ini
              <input
                autoComplete="current-password"
                onChange={(event) => setResumePassword(event.target.value)}
                required
                type="password"
                value={resumePassword}
              />
            </label>
            <label className="guard-checkbox">
              <input
                checked={riskAcknowledged}
                onChange={(event) => setRiskAcknowledged(event.target.checked)}
                type="checkbox"
              />
              Saya sudah meninjau blocker dan memahami risiko resume.
            </label>
            <button
              className="button button--primary"
              disabled={
                resumeMutation.isPending ||
                resumeReason.trim().length < 5 ||
                !resumePassword ||
                !riskAcknowledged
              }
              type="submit"
            >
              {resumeMutation.isPending ? 'Resuming…' : 'Resume sending'}
            </button>
          </form>
        ) : (
          <article className="panel guarded-action feature-empty">
            <strong>Resume memerlukan Admin</strong>
            <p>
              Operator dapat memahami state dan melakukan pause, tetapi recovery
              hanya tersedia untuk Admin.
            </p>
          </article>
        )}

        {canReset && (
          <form className="panel guarded-action" onSubmit={submitReset}>
            <div>
              <p className="eyebrow">Admin · destructive guard</p>
              <h2>Reset safety state</h2>
              <p>
                Reset selalu meninggalkan sending dalam keadaan manual pause.
              </p>
            </div>
            {resetCapability.state !== 'enabled' ? (
              <div className="feature-empty">
                <strong>Reset tidak tersedia</strong>
                <p>{resetCapability.reason}</p>
              </div>
            ) : (
              <>
                <label>
                  Alasan reset
                  <textarea
                    minLength={5}
                    maxLength={500}
                    onChange={(event) => setResetReason(event.target.value)}
                    required
                    rows={3}
                    value={resetReason}
                  />
                </label>
                <label>
                  Password saat ini
                  <input
                    autoComplete="current-password"
                    onChange={(event) => setResetPassword(event.target.value)}
                    required
                    type="password"
                    value={resetPassword}
                  />
                </label>
                <label>
                  Ketik RESET_SAFETY_STATE
                  <input
                    onChange={(event) => setResetConfirmation(event.target.value)}
                    value={resetConfirmation}
                  />
                </label>
                <button
                  className="button button--danger"
                  disabled={
                    resetMutation.isPending ||
                    !safety.recovery.resetEligible ||
                    resetReason.trim().length < 5 ||
                    !resetPassword ||
                    resetConfirmation !== 'RESET_SAFETY_STATE'
                  }
                  type="submit"
                >
                  Reset safety state
                </button>
              </>
            )}
          </form>
        )}
      </section>
    </>
  );
};
