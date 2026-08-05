import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveAiPrompt,
  createAiPrompt,
  listAiPrompts,
  publishAiPrompt,
  type CreateAiPromptInput
} from '../api/ai-chatbot';
import type { AiPrompt } from '../api/contracts';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';

const promptKey = ['ai-chatbot', 'prompts'] as const;
const integrationKey = ['ai-chatbot', 'integration'] as const;

const emptyDraft: CreateAiPromptInput = {
  name: '',
  primaryLanguage: 'id',
  tone: 'hangat dan profesional',
  systemInstruction: '',
  fallbackMessage: 'Informasi tersebut belum tersedia di Knowledge Base RAHO.',
  handoffMessage: 'Saya akan meneruskan pertanyaan ini kepada Admin RAHO.',
  disclaimerText: null,
  maxAnswerLength: 800
};

const statusTone: Record<AiPrompt['status'], StatusTone> = {
  draft: 'neutral',
  review: 'info',
  approved: 'warning',
  published: 'success',
  archived: 'neutral'
};

export const AiChatbotInstructions = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: promptKey, queryFn: listAiPrompts });
  const [draft, setDraft] = useState<CreateAiPromptInput>(emptyDraft);
  const [changeReason, setChangeReason] = useState('Reviewed for Sprint 1');

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: promptKey }),
      queryClient.invalidateQueries({ queryKey: integrationKey })
    ]);
  };
  const create = useMutation({
    mutationFn: createAiPrompt,
    onSuccess: async () => {
      setDraft(emptyDraft);
      await refresh();
    }
  });
  const approve = useMutation({
    mutationFn: (prompt: AiPrompt) =>
      approveAiPrompt(prompt.id, prompt.version, changeReason),
    onSuccess: refresh
  });
  const publish = useMutation({
    mutationFn: (prompt: AiPrompt) =>
      publishAiPrompt(prompt.id, prompt.version, changeReason),
    onSuccess: refresh
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(draft);
  };

  return (
    <div className="ai-instructions-layout">
      <section className="panel">
        <div className="panel__heading">
          <div><p className="eyebrow">Immutable version history</p><h2>AI Instructions</h2></div>
          <StatusBadge tone="info">Sprint 1</StatusBadge>
        </div>
        <p>Setiap perubahan dibuat sebagai versi draft baru. Hanya versi approved yang dapat dipublish, dan versi published sebelumnya otomatis diarsipkan.</p>

        <label className="ai-change-reason">Alasan approval/publish<input value={changeReason} minLength={5} maxLength={500} onChange={(event) => setChangeReason(event.target.value)} /></label>

        {query.isPending ? (
          <div className="page-state" aria-live="polite"><span className="loader" aria-hidden="true" /><h3>Memuat instruction…</h3></div>
        ) : query.isError ? (
          <div className="page-state page-state--error" role="alert"><h3>Instruction belum dapat dimuat</h3><p>{query.error.message}</p><button type="button" onClick={() => query.refetch()}>Coba lagi</button></div>
        ) : query.data.data.length === 0 ? (
          <div className="empty-stage"><h3>Belum ada instruction</h3><p>Buat draft pertama dengan form di bawah.</p></div>
        ) : (
          <div className="ai-prompt-list">
            {query.data.data.map((prompt) => (
              <article key={prompt.id} className="ai-prompt-card">
                <div className="ai-prompt-card__header">
                  <div><strong>{prompt.name}</strong><span>Versi {prompt.version} · {prompt.primaryLanguage} · {prompt.tone}</span></div>
                  <StatusBadge tone={statusTone[prompt.status]}>{prompt.status}</StatusBadge>
                </div>
                <details><summary>Lihat instruction dan fallback</summary><dl><dt>System instruction</dt><dd>{prompt.systemInstruction}</dd><dt>Fallback</dt><dd>{prompt.fallbackMessage}</dd><dt>Handoff</dt><dd>{prompt.handoffMessage}</dd></dl></details>
                <div className="ai-form-actions">
                  {(prompt.status === 'draft' || prompt.status === 'review') && <button type="button" className="button button--secondary" disabled={approve.isPending || changeReason.trim().length < 5} onClick={() => approve.mutate(prompt)}>Approve</button>}
                  {prompt.status === 'approved' && <button type="button" disabled={publish.isPending || changeReason.trim().length < 5} onClick={() => publish.mutate(prompt)}>Publish</button>}
                </div>
              </article>
            ))}
          </div>
        )}
        {(approve.isError || publish.isError) && <p className="form-error" role="alert">{approve.error?.message ?? publish.error?.message}</p>}
      </section>

      <section className="panel">
        <div className="panel__heading"><div><p className="eyebrow">New immutable version</p><h2>Buat draft</h2></div></div>
        <form className="ai-prompt-form" onSubmit={submit}>
          <label>Nama versi<input value={draft.name} minLength={3} maxLength={150} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Bahasa utama<input value={draft.primaryLanguage} minLength={2} maxLength={20} required onChange={(event) => setDraft({ ...draft, primaryLanguage: event.target.value })} /></label>
          <label>Tone<input value={draft.tone} minLength={2} maxLength={50} required onChange={(event) => setDraft({ ...draft, tone: event.target.value })} /></label>
          <label>System instruction<textarea value={draft.systemInstruction} minLength={50} maxLength={30000} rows={8} required onChange={(event) => setDraft({ ...draft, systemInstruction: event.target.value })} /></label>
          <label>Fallback message<textarea value={draft.fallbackMessage} minLength={10} maxLength={2000} rows={3} required onChange={(event) => setDraft({ ...draft, fallbackMessage: event.target.value })} /></label>
          <label>Handoff message<textarea value={draft.handoffMessage} minLength={10} maxLength={2000} rows={3} required onChange={(event) => setDraft({ ...draft, handoffMessage: event.target.value })} /></label>
          <label>Disclaimer<textarea value={draft.disclaimerText ?? ''} maxLength={2000} rows={3} onChange={(event) => setDraft({ ...draft, disclaimerText: event.target.value || null })} /></label>
          <label>Maximum answer length<input type="number" min="50" max="4000" value={draft.maxAnswerLength} onChange={(event) => setDraft({ ...draft, maxAnswerLength: Number(event.target.value) })} /></label>
          <button type="submit" disabled={create.isPending}>{create.isPending ? 'Membuat…' : 'Buat draft version'}</button>
          {create.isError && <p className="form-error" role="alert">{create.error.message}</p>}
        </form>
      </section>
    </div>
  );
};
