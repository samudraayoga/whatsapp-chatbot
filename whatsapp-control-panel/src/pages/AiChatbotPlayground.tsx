import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { testAlphaRag } from '../api/playground';
import { StatusBadge } from '../components/StatusBadge';
import { listAiPrompts } from '../api/ai-chatbot';
import { createAiTestCase, listAiTestCases, runAiTestBatch, runAiTestCase } from '../api/ai-operations';

export const AiChatbotPlayground = () => {
  const [message, setMessage] = useState('');
  const [recentContext, setRecentContext] = useState('');
  const [promptVersionId, setPromptVersionId] = useState('');
  const [caseName, setCaseName] = useState('');
  const [mustContain, setMustContain] = useState('');
  const [mustNotContain, setMustNotContain] = useState('');
  const queryClient = useQueryClient();
  const prompts = useQuery({ queryKey: ['ai-prompts'], queryFn: listAiPrompts });
  const testCases = useQuery({ queryKey: ['ai-test-cases'], queryFn: listAiTestCases });
  const context = recentContext.split('\n').map((line) => line.trim()).filter(Boolean).slice(-10);
  const test = useMutation({ mutationFn: () => testAlphaRag(message.trim(), {
    recentContext: context, promptVersionId: promptVersionId || null
  }) });
  const saveCase = useMutation({
    mutationFn: () => createAiTestCase({
      name: caseName.trim(), question: message.trim(), recentContext: context,
      promptVersionId: promptVersionId || null,
      expectedCategory: test.data?.data.safetyCategory ?? null,
      expectedKnowledgeIds: test.data?.data.usedKnowledge.map((source) => source.chunkId) ?? [],
      mustContain: mustContain.split(',').map((value) => value.trim()).filter(Boolean),
      mustNotContain: mustNotContain.split(',').map((value) => value.trim()).filter(Boolean),
      expectedHandoff: test.data?.data.handoff ?? null, active: true
    }),
    onSuccess: () => { setCaseName(''); queryClient.invalidateQueries({ queryKey: ['ai-test-cases'] }); }
  });
  const runCase = useMutation({
    mutationFn: runAiTestCase,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-test-cases'] })
  });
  const batch = useMutation({
    mutationFn: () => runAiTestBatch(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-test-cases'] })
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (message.trim()) test.mutate();
  };
  const result = test.data?.data;

  return (
    <div className="alpha-rag-layout">
      <section className="panel alpha-rag-console">
        <div className="panel__heading">
          <div><p className="eyebrow">Sprint 6 · Internal only</p><h2>Testing Playground & Evaluation</h2></div>
          <StatusBadge tone="warning">Tidak dikirim ke WhatsApp</StatusBadge>
        </div>
        <p>Uji retrieval dan jawaban structured dengan knowledge published. Pertanyaan ini disimpan sebagai trace playground tanpa mengaktifkan traffic customer.</p>
        <form onSubmit={submit}>
          <label>Pertanyaan customer<textarea rows={5} minLength={1} maxLength={4096} required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Contoh: Apa perbedaan RAHO Club dan Premier?" /></label>
          <label>Recent context opsional<textarea rows={3} maxLength={10_000} value={recentContext} onChange={(event) => setRecentContext(event.target.value)} placeholder="Satu pesan per baris, maksimal 10." /></label>
          <label>Prompt version<select value={promptVersionId} onChange={(event) => setPromptVersionId(event.target.value)}><option value="">Published aktif</option>{prompts.data?.data.map((prompt) => <option value={prompt.id} key={prompt.id}>v{prompt.version} · {prompt.name} · {prompt.status}</option>)}</select></label>
          <button type="submit" disabled={test.isPending || !message.trim()}>{test.isPending ? 'Menjalankan retrieval…' : 'Uji jawaban AI'}</button>
        </form>
        {test.isError && <p className="form-error" role="alert">{test.error.message}</p>}
      </section>

      {result && <>
        <section className="panel alpha-rag-result" aria-live="polite">
          <div className="panel__heading"><div><p className="eyebrow">Structured result</p><h2>Jawaban</h2></div><StatusBadge tone={result.answerStatus === 'supported' ? 'success' : result.answerStatus === 'partially_supported' ? 'warning' : 'danger'}>{result.answerStatus}</StatusBadge></div>
          <blockquote>{result.reply}</blockquote>
          <dl className="alpha-rag-metrics">
            <div><dt>Validation</dt><dd>{result.validationStatus}</dd></div>
            <div><dt>Safety</dt><dd>{result.safetyCategory}</dd></div>
            <div><dt>Fallback</dt><dd>{result.fallbackReason ?? '—'}</dd></div>
            <div><dt>Memory</dt><dd>{result.historyMessagesUsed} pesan</dd></div>
            <div><dt>Interest</dt><dd>{Math.round(result.interestConfidence * 100)}%</dd></div>
            <div><dt>Handoff</dt><dd>{result.handoff ? result.handoffReason ?? 'required' : 'tidak'}</dd></div>
            <div><dt>Disclaimer</dt><dd>{result.requiresDisclaimer ? 'diterapkan' : 'tidak'}</dd></div>
            <div><dt>Model</dt><dd>{result.model ?? 'Tidak dipanggil'}</dd></div>
            <div><dt>Input token</dt><dd>{result.inputTokens}</dd></div>
            <div><dt>Output token</dt><dd>{result.outputTokens}</dd></div>
            <div><dt>Retrieval</dt><dd>{result.retrievalLatencyMs} ms</dd></div>
            <div><dt>Provider</dt><dd>{result.providerLatencyMs} ms</dd></div>
            <div><dt>Total</dt><dd>{result.latencyMs} ms</dd></div>
            <div><dt>Trace ID</dt><dd><code>{result.traceId}</code></dd></div>
          </dl>
          {result.safetyFlags.length > 0 && <p><strong>Safety flags:</strong> {result.safetyFlags.join(', ')}</p>}
          {result.outputValidationReasons.length > 0 && <p className="form-error"><strong>Output diblok:</strong> {result.outputValidationReasons.join(', ')}</p>}
          <div className="ai-handoff-actions"><button type="button" className="button" onClick={() => navigator.clipboard?.writeText(result.reply)}>Copy response</button></div>
        </section>
        <section className="panel alpha-rag-sources">
          <div className="panel__heading"><div><p className="eyebrow">Grounding evidence</p><h2>Knowledge source</h2></div><StatusBadge tone="info">{result.retrievedKnowledge.length} kandidat</StatusBadge></div>
          {result.retrievedKnowledge.length === 0 ? <p>Tidak ada chunk yang memenuhi retrieval.</p> : <ol>{result.retrievedKnowledge.map((source) => <li key={source.chunkId} data-used={source.usedInAnswer}><div><strong>{source.title ?? source.sourceType}</strong><span>Rank {source.rank} · score {source.score.toFixed(4)}</span></div><p>{source.section ?? 'Tanpa section'} · {source.usedInPrompt ? 'masuk prompt' : 'tidak masuk prompt'} · {source.usedInAnswer ? 'dipakai jawaban' : 'tidak dikutip'}</p></li>)}</ol>}
        </section>
        <section className="panel ai-test-case-editor">
          <div className="panel__heading"><div><p className="eyebrow">Regression repository</p><h2>Simpan sebagai test case</h2></div></div>
          <label>Nama test case<input maxLength={160} value={caseName} onChange={(event) => setCaseName(event.target.value)} placeholder="FAQ paket — jawaban grounded" /></label>
          <label>Must contain (pisahkan koma)<input value={mustContain} onChange={(event) => setMustContain(event.target.value)} /></label>
          <label>Must not contain (pisahkan koma)<input value={mustNotContain} onChange={(event) => setMustNotContain(event.target.value)} /></label>
          <button type="button" disabled={!caseName.trim() || saveCase.isPending} onClick={() => saveCase.mutate()}>Simpan test case</button>
          {saveCase.isError && <p className="form-error">Test case gagal disimpan.</p>}
        </section>
      </>}
      <section className="panel ai-test-case-list">
        <div className="panel__heading"><div><p className="eyebrow">Batch evaluation</p><h2>Test case repository</h2></div><button type="button" disabled={batch.isPending || !testCases.data?.data.length} onClick={() => batch.mutate()}>{batch.isPending ? 'Menjalankan batch…' : 'Run batch'}</button></div>
        {batch.data && <p><strong>Batch result:</strong> {batch.data.data.passed}/{batch.data.data.total} pass ({Math.round(batch.data.data.passRate * 100)}%).</p>}
        {testCases.isPending ? <p>Memuat test case…</p> : testCases.isError ? <p className="form-error">Test case gagal dimuat.</p> : testCases.data.data.length === 0 ? <p>Belum ada test case tersimpan.</p> : <div>{testCases.data.data.map((entry) => <article key={entry.id}><div><strong>{entry.name}</strong><p>{entry.question}</p></div><button type="button" disabled={runCase.isPending} onClick={() => runCase.mutate(entry.id)}>Run</button><dl className="alpha-rag-metrics"><div><dt>Expected category</dt><dd>{entry.expectedCategory ?? 'bebas'}</dd></div><div><dt>Expected handoff</dt><dd>{entry.expectedHandoff === null ? 'bebas' : entry.expectedHandoff ? 'ya' : 'tidak'}</dd></div><div><dt>Last result</dt><dd>{entry.runs[0] ? `${entry.runs[0].passed ? 'PASS' : 'FAIL'} · ${Math.round(entry.runs[0].score * 100)}%` : 'belum dijalankan'}</dd></div><div><dt>Before/after</dt><dd>{entry.runs.length > 1 ? `${Math.round(entry.runs[1].score * 100)}% → ${Math.round(entry.runs[0].score * 100)}%` : 'butuh 2 run'}</dd></div></dl></article>)}</div>}
      </section>
    </div>
  );
};
