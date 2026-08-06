import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAiAnalytics,
  getAiOperationalSettings,
  getAiVersionChanges,
  updateAiOperationalSettings
} from '../api/ai-operations';
import type { AiOperationalSettings } from '../api/contracts';
import { StatusBadge } from '../components/StatusBadge';

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const money = (value: number | null) => value === null ? 'Belum diinstrumentasi' : `$${value.toFixed(4)}`;
const startOfDay = (daysAgo: number) => {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo); value.setHours(0, 0, 0, 0);
  return value.toISOString().slice(0, 10);
};
const endExclusive = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString();
};

const SettingsEditor = ({ initial }: { initial: AiOperationalSettings }) => {
  const [draft, setDraft] = useState(initial);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => updateAiOperationalSettings({ ...draft }),
    onSuccess: (result) => {
      setDraft(result.data);
      client.invalidateQueries({ queryKey: ['ai-analytics'] });
      client.setQueryData(['ai-operational-settings'], result);
    }
  });
  const setNumber = (key: keyof AiOperationalSettings, value: string, nullable = false) =>
    setDraft((current) => ({ ...current, [key]: nullable && value === '' ? null : Number(value) }));
  return <details className="panel ai-analytics-settings">
    <summary><span><span className="eyebrow">Operations control</span><strong>Budget, alert, cache & retention</strong></span></summary>
    <div className="ai-filter-grid">
      <label>Retention log (hari)<input type="number" min="1" max="3650" value={draft.logRetentionDays} onChange={(event) => setNumber('logRetentionDays', event.target.value)} /></label>
      <label>Cache TTL (detik)<input type="number" min="60" max="86400" value={draft.cacheTtlSeconds} onChange={(event) => setNumber('cacheTtlSeconds', event.target.value)} /></label>
      <label>Budget USD<input type="number" min="0" step="0.0001" value={draft.dailyBudgetUsd ?? ''} onChange={(event) => setNumber('dailyBudgetUsd', event.target.value, true)} /></label>
      <label>Input / 1M token<input type="number" min="0" step="0.000001" value={draft.chatInputCostPerMillionUsd ?? ''} onChange={(event) => setNumber('chatInputCostPerMillionUsd', event.target.value, true)} /></label>
      <label>Output / 1M token<input type="number" min="0" step="0.000001" value={draft.chatOutputCostPerMillionUsd ?? ''} onChange={(event) => setNumber('chatOutputCostPerMillionUsd', event.target.value, true)} /></label>
      <label>Embedding / 1M token<input type="number" min="0" step="0.000001" value={draft.embeddingCostPerMillionUsd ?? ''} onChange={(event) => setNumber('embeddingCostPerMillionUsd', event.target.value, true)} /></label>
      <label>Alert fallback rate<input type="number" min="0" max="1" step="0.01" value={draft.fallbackAlertRate} onChange={(event) => setNumber('fallbackAlertRate', event.target.value)} /></label>
      <label>Alert latency (ms)<input type="number" min="100" value={draft.latencyAlertMs} onChange={(event) => setNumber('latencyAlertMs', event.target.value)} /></label>
      <label>Alert queue depth<input type="number" min="1" value={draft.queueAlertDepth} onChange={(event) => setNumber('queueAlertDepth', event.target.value)} /></label>
    </div>
    <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Menyimpan…' : 'Simpan operational settings'}</button>
    {save.isError && <p className="form-error" role="alert">{save.error.message}</p>}
  </details>;
};

export const AiAnalytics = () => {
  const [from, setFrom] = useState(startOfDay(29));
  const [to, setTo] = useState(startOfDay(0));
  const analytics = useQuery({ queryKey: ['ai-analytics', from, to], queryFn: () => getAiAnalytics(new Date(`${from}T00:00:00.000Z`).toISOString(), endExclusive(to)) });
  const settings = useQuery({ queryKey: ['ai-operational-settings'], queryFn: getAiOperationalSettings });
  const changes = useQuery({ queryKey: ['ai-version-changes'], queryFn: getAiVersionChanges });
  if (analytics.isPending) return <p>Memuat analytics aktual…</p>;
  if (analytics.isError) return <section className="page-state page-state--error" role="alert"><h2>Analytics belum dapat dimuat</h2><p>{analytics.error.message}</p></section>;
  const data = analytics.data.data;
  const cards = [
    ['AI status', data.status], ['Conversations today', data.kpis.conversationsToday],
    ['Active knowledge', data.kpis.activeKnowledge], ['Processing jobs', data.kpis.processingJobs],
    ['Answer rate', percent(data.kpis.answerRate)], ['Fallback rate', percent(data.kpis.fallbackRate)],
    ['Handoff', data.kpis.handoffCount], ['Unanswered', data.kpis.unansweredCount],
    ['Average latency', `${Math.round(data.kpis.averageResponseMs)} ms`], ['Estimated cost', money(data.cost.totalUsd)]
  ];
  const maxTrend = Math.max(1, ...data.series.map((item) => item.conversations));
  return <div className="ai-analytics-page">
    <section className="panel ai-operations-toolbar"><div><p className="eyebrow">Sprint 7 · Release Candidate telemetry</p><h2>Analytics & Observability</h2><p>KPI dihitung langsung dari trace tenant, bukan angka demo.</p></div><div className="ai-filter-grid"><label>Dari<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Sampai<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div></section>
    {data.warnings.map((warning) => <div key={warning.code} className={`incident-banner ${warning.severity === 'critical' ? 'incident-banner--critical' : ''}`} role="alert"><strong>{warning.code}</strong><span>{warning.message}</span></div>)}
    <section className="ai-kpi-grid">{cards.map(([label, value]) => <article className="panel" key={String(label)}><small>{label}</small><strong>{value}</strong></article>)}</section>
    <div className="ai-analytics-grid">
      <section className="panel"><h3>Conversation / answer / fallback trend</h3>{data.series.length === 0 ? <p>Belum ada trace pada periode ini.</p> : <div className="ai-trend-chart">{data.series.map((point) => <div key={point.date}><span>{point.date.slice(5)}</span><div title={`${point.conversations} conversations`} style={{ height: `${Math.max(4, point.conversations / maxTrend * 120)}px` }} /><small>{point.answered}/{point.fallback}</small></div>)}</div>}</section>
      <section className="panel"><h3>Quality & runtime</h3><dl className="alpha-rag-metrics"><div><dt>Supported</dt><dd>{percent(data.kpis.supportedAnswerRate)}</dd></div><div><dt>Coverage</dt><dd>{percent(data.kpis.knowledgeCoverage)}</dd></div><div><dt>Correction</dt><dd>{percent(data.kpis.adminCorrectionRate)}</dd></div><div><dt>Cache hit</dt><dd>{percent(data.kpis.cacheHitRate)}</dd></div><div><dt>Retrieval</dt><dd>{Math.round(data.kpis.averageRetrievalMs)} ms</dd></div><div><dt>Provider</dt><dd>{Math.round(data.kpis.averageProviderMs)} ms</dd></div></dl></section>
      <section className="panel"><h3>Cost monitoring</h3><dl className="alpha-rag-metrics"><div><dt>Chat</dt><dd>{money(data.cost.chatUsd)}</dd></div><div><dt>Embedding</dt><dd>{money(data.cost.embeddingUsd)}</dd></div><div><dt>Per answered</dt><dd>{money(data.cost.perAnsweredConversationUsd)}</dd></div><div><dt>Budget</dt><dd>{money(data.cost.budgetUsd)}</dd></div><div><dt>Input token</dt><dd>{data.kpis.inputTokens}</dd></div><div><dt>Output token</dt><dd>{data.kpis.outputTokens}</dd></div></dl>{!data.cost.instrumented && <p className="notice notice--warning">Isi pricing provider di operational settings agar estimated cost aktif.</p>}</section>
      <section className="panel"><h3>Top questions</h3><ol>{data.topQuestions.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.count}</strong></li>)}</ol></section>
      <section className="panel"><h3>Top fallback</h3><ol>{data.topFallbackCategories.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.count}</strong></li>)}</ol></section>
      <section className="panel"><h3>Knowledge usage</h3><ol>{data.topKnowledge.map((item) => <li key={item.id}><span>{item.label}</span><strong>{item.count}</strong></li>)}</ol></section>
    </div>
    <section className="panel"><div className="panel__heading"><div><p className="eyebrow">Audit diff</p><h3>Prompt & knowledge changes</h3></div></div>{changes.isPending ? <p>Memuat version diff…</p> : changes.data?.data.length ? <div className="ai-change-list">{changes.data.data.map((item) => <article key={`${item.kind}-${item.id}`}><div><StatusBadge tone={item.kind === 'prompt' ? 'info' : 'success'}>{item.kind}</StatusBadge><strong>{item.title} · v{item.version}</strong></div><p>{item.changedFields.length ? item.changedFields.join(', ') : 'Versi awal'} · {item.reason ?? 'Tanpa alasan perubahan'}</p><small>{item.publishedAt ? new Date(item.publishedAt).toLocaleString('id-ID') : item.status}</small></article>)}</div> : <p>Belum ada version change.</p>}</section>
    {settings.data && <SettingsEditor key={settings.data.data.revision} initial={settings.data.data} />}
  </div>;
};
