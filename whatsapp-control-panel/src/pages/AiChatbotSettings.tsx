import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deactivateAiIntegration,
  getAiIntegration,
  requestAiActivation,
  testAiConnection,
  updateAiIntegration,
  type UpdateAiIntegrationInput
} from '../api/ai-chatbot';
import { StatusBadge } from '../components/StatusBadge';
import { AiLaunchReadiness } from './AiLaunchReadiness';

const integrationKey = ['ai-chatbot', 'integration'] as const;

type SettingsDraft = {
  name: string;
  provider: string;
  chatModel: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: string;
  apiKey: string;
  clearApiKey: boolean;
  maxResponseTokens: string;
  temperature: string;
  timeoutMs: string;
  retryCount: string;
  topK: string;
  finalContextCount: string;
  minimumSimilarity: string;
  maximumContextTokens: string;
  keywordSearchEnabled: boolean;
  rerankerEnabled: boolean;
  documentUpload: boolean;
  autoHandoff: boolean;
  analytics: boolean;
};

const fromIntegration = (
  integration: Awaited<ReturnType<typeof getAiIntegration>>['data']['integration']
): SettingsDraft => ({
  name: integration.name,
  provider: integration.provider ?? '',
  chatModel: integration.chatModel ?? '',
  embeddingProvider: integration.embeddingProvider ?? '',
  embeddingModel: integration.embeddingModel ?? '',
  embeddingDimensions: integration.embeddingDimensions?.toString() ?? '',
  apiKey: '',
  clearApiKey: false,
  maxResponseTokens: integration.maxResponseTokens.toString(),
  temperature: integration.temperature.toString(),
  timeoutMs: integration.timeoutMs.toString(),
  retryCount: integration.retryCount.toString(),
  topK: integration.retrieval.topK.toString(),
  finalContextCount: integration.retrieval.finalContextCount.toString(),
  minimumSimilarity: integration.retrieval.minimumSimilarity?.toString() ?? '',
  maximumContextTokens:
    integration.retrieval.maximumContextTokens?.toString() ?? '',
  keywordSearchEnabled: integration.retrieval.keywordSearchEnabled,
  rerankerEnabled: integration.retrieval.rerankerEnabled,
  documentUpload: integration.featureFlags.documentUpload,
  autoHandoff: integration.featureFlags.autoHandoff,
  analytics: integration.featureFlags.analytics
});

const nullableNumber = (value: string) =>
  value.trim() ? Number(value) : null;

const readinessTone = (state: string) =>
  state === 'reachable'
    ? 'success'
    : state === 'unreachable'
      ? 'danger'
      : 'warning';

const AiChatbotSettingsLoaded = ({
  response
}: {
  response: Awaited<ReturnType<typeof getAiIntegration>>;
}) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SettingsDraft>(() =>
    fromIntegration(response.data.integration)
  );
  const [dirty, setDirty] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: (input: UpdateAiIntegrationInput) => updateAiIntegration(input),
    onSuccess: (response) => {
      queryClient.setQueryData(integrationKey, response);
      setDraft(fromIntegration(response.data.integration));
      setDirty(false);
    }
  });
  const connection = useMutation({ mutationFn: testAiConnection });
  const activation = useMutation({
    mutationFn: (revision: number) => requestAiActivation(revision),
    onSuccess: (next) => queryClient.setQueryData(integrationKey, next)
  });
  const deactivation = useMutation({
    mutationFn: (revision: number) => deactivateAiIntegration({
      expectedRevision: revision,
      reason: 'Dinonaktifkan dari Settings Integrasi Chatbot AI'
    }),
    onSuccess: (next) => queryClient.setQueryData(integrationKey, next)
  });

  const update = <Key extends keyof SettingsDraft>(
    key: Key,
    value: SettingsDraft[Key]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const numericValid = useMemo(() => {
    const values = [
      draft.embeddingDimensions,
      draft.maxResponseTokens,
      draft.temperature,
      draft.timeoutMs,
      draft.retryCount,
      draft.topK,
      draft.finalContextCount
    ];
    return values.every((value) => value.trim() && Number.isFinite(Number(value)));
  }, [draft]);

  const { integration, readiness } = response.data;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!numericValid) return;
    save.mutate({
      expectedRevision: integration.revision,
      name: draft.name,
      provider: draft.provider,
      chatModel: draft.chatModel,
      embeddingProvider: draft.embeddingProvider,
      embeddingModel: draft.embeddingModel,
      embeddingDimensions: nullableNumber(draft.embeddingDimensions),
      ...(draft.clearApiKey
        ? { apiKey: null }
        : draft.apiKey.trim()
          ? { apiKey: draft.apiKey.trim() }
          : {}),
      strictGrounding: true,
      maxResponseTokens: Number(draft.maxResponseTokens),
      temperature: Number(draft.temperature),
      timeoutMs: Number(draft.timeoutMs),
      retryCount: Number(draft.retryCount),
      retrieval: {
        topK: Number(draft.topK),
        finalContextCount: Number(draft.finalContextCount),
        minimumSimilarity: nullableNumber(draft.minimumSimilarity),
        maximumContextTokens: nullableNumber(draft.maximumContextTokens),
        keywordSearchEnabled: draft.keywordSearchEnabled,
        rerankerEnabled: draft.rerankerEnabled
      },
      featureFlags: {
        documentUpload: draft.documentUpload,
        autoHandoff: draft.autoHandoff,
        analytics: draft.analytics
      }
    });
  };

  const dependencies = Object.entries(readiness.dependencies).filter(
    ([key]) => key !== 'checkedAt'
  );

  return (
    <div className="ai-sprint-one-layout">
      <section className="panel">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Tenant configuration · revision {integration.revision}</p>
            <h2>Provider dan retrieval</h2>
          </div>
          <StatusBadge tone={integration.secretReferenceConfigured ? 'success' : 'warning'}>
            API key {integration.secretReferenceConfigured ? 'tersimpan' : 'belum ada'}
          </StatusBadge>
        </div>

        <form className="ai-settings-form" onSubmit={submit}>
          <label>Nama integrasi<input value={draft.name} onChange={(event) => update('name', event.target.value)} required minLength={3} /></label>
          <label>Chat provider<input value={draft.provider} onChange={(event) => update('provider', event.target.value)} placeholder="openai-compatible" required /><small>Gunakan <code>mock</code> untuk local test atau <code>openai-compatible</code> untuk API nyata.</small></label>
          <label>Chat model<input value={draft.chatModel} onChange={(event) => update('chatModel', event.target.value)} required /></label>
          <label>Embedding provider<input value={draft.embeddingProvider} onChange={(event) => update('embeddingProvider', event.target.value)} required /></label>
          <label>Embedding model<input value={draft.embeddingModel} onChange={(event) => update('embeddingModel', event.target.value)} required /></label>
          <label>Embedding dimensions<input type="number" min="1" max="10000" value={draft.embeddingDimensions} onChange={(event) => update('embeddingDimensions', event.target.value)} required /></label>

          <label className="ai-settings-form__wide">
            API key provider
            <span className="ai-api-key-input">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={draft.apiKey}
                onChange={(event) => update('apiKey', event.target.value)}
                placeholder={integration.secretReferenceConfigured ? 'Masukkan hanya untuk mengganti API key' : 'Masukkan API key'}
                disabled={draft.clearApiKey}
                autoComplete="new-password"
                minLength={8}
                maxLength={500}
              />
              <button
                type="button"
                className="button button--secondary"
                disabled={draft.clearApiKey || !draft.apiKey}
                onClick={() => setShowApiKey((visible) => !visible)}
              >
                {showApiKey ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </span>
            <small>API key dienkripsi oleh server. Setelah disimpan, key tidak dapat dilihat kembali dari UI.</small>
          </label>
          <label className="check-row ai-settings-form__wide"><input type="checkbox" checked={draft.clearApiKey} onChange={(event) => update('clearApiKey', event.target.checked)} /> Hapus API key tersimpan saat menyimpan</label>

          <label>Max response tokens<input type="number" min="50" max="2000" value={draft.maxResponseTokens} onChange={(event) => update('maxResponseTokens', event.target.value)} /></label>
          <label>Temperature<input type="number" min="0" max="1" step="0.01" value={draft.temperature} onChange={(event) => update('temperature', event.target.value)} /></label>
          <label>Timeout (ms)<input type="number" min="500" max="60000" value={draft.timeoutMs} onChange={(event) => update('timeoutMs', event.target.value)} /></label>
          <label>Retry count<input type="number" min="0" max="3" value={draft.retryCount} onChange={(event) => update('retryCount', event.target.value)} /></label>
          <label>Retrieval top K<input type="number" min="1" max="20" value={draft.topK} onChange={(event) => update('topK', event.target.value)} /></label>
          <label>Final context count<input type="number" min="1" max="10" value={draft.finalContextCount} onChange={(event) => update('finalContextCount', event.target.value)} /></label>
          <label>Minimum similarity<input type="number" min="0" max="1" step="0.01" value={draft.minimumSimilarity} onChange={(event) => update('minimumSimilarity', event.target.value)} placeholder="Belum dikunci" /></label>
          <label>Maximum context tokens<input type="number" min="1" value={draft.maximumContextTokens} onChange={(event) => update('maximumContextTokens', event.target.value)} placeholder="Belum dikunci" /></label>

          <fieldset className="ai-settings-form__wide">
            <legend>Feature flags tenant</legend>
            <label className="check-row"><input type="checkbox" checked={draft.keywordSearchEnabled} onChange={(event) => update('keywordSearchEnabled', event.target.checked)} /> Keyword search</label>
            <label className="check-row"><input type="checkbox" checked={draft.rerankerEnabled} onChange={(event) => update('rerankerEnabled', event.target.checked)} /> Reranker</label>
            <label className="check-row"><input type="checkbox" checked={draft.documentUpload} onChange={(event) => update('documentUpload', event.target.checked)} /> Document upload</label>
            <label className="check-row"><input type="checkbox" checked={draft.autoHandoff} onChange={(event) => update('autoHandoff', event.target.checked)} /> Auto handoff</label>
            <label className="check-row"><input type="checkbox" checked={draft.analytics} onChange={(event) => update('analytics', event.target.checked)} /> Analytics</label>
          </fieldset>

          <fieldset className="ai-settings-form__wide">
            <legend>Safety dan memory Sprint 5</legend>
            <p><strong>Strict safety:</strong> selalu aktif dan tidak dapat dimatikan dari browser.</p>
            <p><strong>Bounded memory:</strong> default 8 (policy backend 6–10) pesan terakhir per conversation/session; tidak pernah memakai histori tanpa batas.</p>
            <p><strong>Emergency:</strong> selalu melewati RAG/provider dan membuat high-priority handoff.</p>
            <p><strong>Pesan handoff, disclaimer, dan panjang jawaban:</strong> dikelola sebagai bagian dari versi AI Instructions yang harus di-approve/publish.</p>
            <p><strong>Rule medis:</strong> tersimpan sebagai policy backend provisional dan tetap memerlukan approval klinis RAHO.</p>
          </fieldset>

          <div className="ai-form-actions ai-settings-form__wide">
            <button type="submit" disabled={!dirty || !numericValid || save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan settings'}</button>
            <button type="button" className="button button--secondary" disabled={connection.isPending || dirty} onClick={() => connection.mutate()}>{connection.isPending ? 'Menguji…' : 'Test connection'}</button>
          </div>
          {save.isError && <p className="form-error" role="alert">{save.error.message}</p>}
          {connection.data && <p className="form-success" role="status">Chat: {connection.data.data.chatProvider} · Embedding: {connection.data.data.embeddingProvider}</p>}
        </form>
      </section>

      <aside className="panel ai-readiness-panel">
        <div className="panel__heading">
          <div><p className="eyebrow">Balasan WhatsApp</p><h2>Status AI</h2></div>
          <StatusBadge tone={integration.active ? 'success' : 'warning'}>
            {integration.active ? 'Aktif' : 'Nonaktif'}
          </StatusBadge>
        </div>
        <p>
          Saat aktif, pertanyaan pelanggan dijawab AI dari Knowledge Base. Menu,
          Admin, dan booking tetap ditangani bot aturan.
        </p>
        <ul className="ai-readiness-list">
          {dependencies.map(([key, state]) => (
            <li key={key}><strong>{key}</strong><StatusBadge tone={readinessTone(String(state))}>{String(state)}</StatusBadge></li>
          ))}
        </ul>
        {readiness.blockers.length > 0 && (
          <>
            <h3>Yang perlu dibereskan</h3>
            <ul className="ai-blocker-list">
              {readiness.blockers.map((blocker) => <li key={blocker.code}><strong>{blocker.code}</strong><span>{blocker.message}</span></li>)}
            </ul>
          </>
        )}
        {integration.active ? (
          <button
            type="button"
            className="button button--danger"
            disabled={deactivation.isPending || dirty}
            onClick={() => deactivation.mutate(integration.revision)}
          >
            {deactivation.isPending ? 'Menonaktifkan…' : 'Matikan AI WhatsApp'}
          </button>
        ) : (
          <button
            type="button"
            disabled={activation.isPending || dirty || readiness.blockers.length > 0}
            onClick={() => activation.mutate(integration.revision)}
          >
            {activation.isPending ? 'Mengaktifkan…' : 'Aktifkan AI WhatsApp'}
          </button>
        )}
        {activation.isError && <p className="form-error" role="alert">{activation.error.message}</p>}
        {deactivation.isError && <p className="form-error" role="alert">{deactivation.error.message}</p>}
      </aside>
    </div>
  );
};

export const AiChatbotSettings = () => {
  const query = useQuery({ queryKey: integrationKey, queryFn: getAiIntegration });

  if (query.isPending) {
    return (
      <section className="page-state" aria-live="polite">
        <span className="loader" aria-hidden="true" />
        <h2>Memuat Settings AI…</h2>
      </section>
    );
  }
  if (query.isError || !query.data) {
    return (
      <section className="page-state page-state--error" role="alert">
        <h2>Settings AI belum dapat dimuat</h2>
        <p>{query.error instanceof Error ? query.error.message : 'Terjadi kesalahan.'}</p>
        <button type="button" onClick={() => query.refetch()}>Coba lagi</button>
      </section>
    );
  }

  return (
    <>
      <AiChatbotSettingsLoaded key={query.data.data.integration.revision} response={query.data} />
      <AiLaunchReadiness />
    </>
  );
};
