import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  emergencyPauseAiPilot,
  generateAiEvaluationReport,
  getAiReleaseReadiness,
  updateAiPilotConfiguration,
  updateAiReleaseGate
} from '../api/ai-operations';
import { StatusBadge } from '../components/StatusBadge';

const gateLabels: Record<string, string> = {
  knowledge: 'Knowledge owner', uat: 'UAT', medical: 'Medical reviewer', security: 'Security',
  monitoring: 'Monitoring', rollback: 'Rollback', admin_training: 'Admin training',
  alert_owner: 'Alert owner', handoff_owner: 'Handoff owner', product: 'Product Owner'
};
const percentage = (value: number) => `${(value * 100).toFixed(1)}%`;

export const AiLaunchReadiness = () => {
  const client = useQueryClient();
  const readiness = useQuery({ queryKey: ['ai-release-readiness'], queryFn: getAiReleaseReadiness });
  const [gateKey, setGateKey] = useState('uat');
  const [gateStatus, setGateStatus] = useState<'pending' | 'passed' | 'failed'>('pending');
  const [evidence, setEvidence] = useState('');
  const [pilotPercentage, setPilotPercentage] = useState<number | null>(null);
  const [pilotNote, setPilotNote] = useState<string | null>(null);
  const refresh = (result?: unknown) => {
    if (result) client.setQueryData(['ai-release-readiness'], result);
    else client.invalidateQueries({ queryKey: ['ai-release-readiness'] });
  };
  const evaluate = useMutation({ mutationFn: generateAiEvaluationReport, onSuccess: () => refresh() });
  const gate = useMutation({ mutationFn: () => updateAiReleaseGate(gateKey, {
    status: gateStatus, evidence: evidence.trim(), expectedRevision: readiness.data!.data.revision
  }), onSuccess: (result) => { setEvidence(''); refresh(result); } });
  const selectedPilotPercentage = pilotPercentage ?? readiness.data?.data.requestedPilotPercentage ?? 0;
  const selectedPilotNote = pilotNote ?? readiness.data?.data.pilotNote ?? '';
  const pilot = useMutation({ mutationFn: () => updateAiPilotConfiguration({ percentage: selectedPilotPercentage,
    channels: selectedPilotPercentage ? ['internal'] : [], note: selectedPilotNote.trim(), expectedRevision: readiness.data!.data.revision
  }), onSuccess: (result) => { setPilotPercentage(null); setPilotNote(null); refresh(result); } });
  const pause = useMutation({ mutationFn: () => emergencyPauseAiPilot('Emergency pause dari Admin Control Panel.'), onSuccess: refresh });

  if (readiness.isPending) return <section className="panel"><p>Memuat launch readiness…</p></section>;
  if (readiness.isError) return <section className="panel page-state--error" role="alert"><h2>Launch readiness gagal dimuat</h2><p>{readiness.error.message}</p></section>;
  const data = readiness.data.data;
  const report = data.latestEvaluation;
  return <section className="ai-launch-readiness">
    <section className="panel">
      <div className="panel__heading"><div><p className="eyebrow">Sprint 8 · Controlled launch</p><h2>Launch Readiness & Pilot Gate</h2></div><StatusBadge tone={data.status === 'ready' ? 'success' : 'danger'}>{data.status}</StatusBadge></div>
      <p>Requested pilot {data.requestedPilotPercentage}% · effective traffic <strong>{data.effectivePilotPercentage}%</strong>. Effective tetap 0 sampai adapter customer dan seluruh approval tersedia.</p>
      <div className="ai-handoff-actions"><button type="button" disabled={evaluate.isPending} onClick={() => evaluate.mutate()}>{evaluate.isPending ? 'Menghitung…' : 'Generate evaluation report'}</button><button type="button" className="button button--danger" disabled={pause.isPending} onClick={() => { if (window.confirm('Pause pilot dan nonaktifkan integration sekarang?')) pause.mutate(); }}>Emergency pause</button></div>
      {report ? <dl className="alpha-rag-metrics"><div><dt>Dataset</dt><dd>{report.datasetSize}/{data.targets.minimumDatasetSize}</dd></div><div><dt>Accuracy</dt><dd>{percentage(report.supportedAccuracy)}</dd></div><div><dt>Retrieval</dt><dd>{percentage(report.retrievalHitRate)}</dd></div><div><dt>Handoff</dt><dd>{percentage(report.handoffSuccessRate)}</dd></div><div><dt>Error</dt><dd>{percentage(report.systemErrorRate)}</dd></div><div><dt>Critical safety</dt><dd>{report.criticalSafetyFailures}</dd></div></dl> : <p className="notice notice--warning">Belum ada formal evaluation report.</p>}
      <h3>Release blockers ({data.blockers.length})</h3><ul className="ai-blocker-list">{data.blockers.map((item) => <li key={item.code}><strong>{item.code}</strong><span>{item.message}</span></li>)}</ul>
    </section>
    <section className="panel"><h2>Stakeholder evidence</h2><div className="ai-gate-grid">{Object.entries(gateLabels).map(([key, label]) => { const value = data.gates[key]; return <article key={key}><div><strong>{label}</strong><StatusBadge tone={value?.status === 'passed' ? 'success' : value?.status === 'failed' ? 'danger' : 'warning'}>{value?.status ?? 'pending'}</StatusBadge></div><small>{value?.evidence ?? 'Belum ada evidence.'}</small></article>; })}</div>
      <div className="ai-filter-grid"><label>Gate<select value={gateKey} onChange={(event) => setGateKey(event.target.value)}>{Object.entries(gateLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Status<select value={gateStatus} onChange={(event) => setGateStatus(event.target.value as typeof gateStatus)}><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option></select></label><label>Evidence<input maxLength={2000} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Ticket, report, atau nama approver" /></label></div><button type="button" disabled={!evidence.trim() || gate.isPending} onClick={() => gate.mutate()}>Record evidence</button>
    </section>
    <section className="panel"><h2>Pilot configuration</h2><p>Urutan rollout yang diizinkan: 5–10% → 25% → 50% → 100%. Menyimpan angka tidak mengaktifkan adapter hard-off.</p><div className="ai-filter-grid"><label>Requested traffic<select value={selectedPilotPercentage} onChange={(event) => setPilotPercentage(Number(event.target.value))}>{[0,5,10,25,50,100].map((value) => <option value={value} key={value}>{value}%</option>)}</select></label><label>Approval note<input value={selectedPilotNote} maxLength={2000} onChange={(event) => setPilotNote(event.target.value)} /></label></div><button type="button" disabled={!selectedPilotNote.trim() || pilot.isPending} onClick={() => pilot.mutate()}>Save pilot request</button>{(pilot.isError || gate.isError || evaluate.isError || pause.isError) && <p className="form-error" role="alert">{pilot.error?.message ?? gate.error?.message ?? evaluate.error?.message ?? pause.error?.message}</p>}</section>
  </section>;
};
