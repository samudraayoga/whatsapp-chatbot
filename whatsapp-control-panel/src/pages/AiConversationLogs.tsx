import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listAiConversationMessages,
  listAiConversations,
  saveAiFeedback,
  type ConversationFilters
} from '../api/ai-operations';
import { StatusBadge } from '../components/StatusBadge';

const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeStyle: 'short'
}).format(new Date(value));

export const AiConversationLogs = ({ conversationId = null }: { conversationId?: string | null }) => {
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(conversationId);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'incorrect' | 'incomplete' | 'unsafe' | 'wrong_source' | 'too_long' | 'too_promotional'>('correct');
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();
  const conversations = useQuery({ queryKey: ['ai-conversations', filters], queryFn: () => listAiConversations(filters) });
  const messages = useQuery({
    queryKey: ['ai-conversation-messages', selectedId],
    queryFn: () => listAiConversationMessages(selectedId!), enabled: Boolean(selectedId)
  });
  const feedback = useMutation({
    mutationFn: (traceId: string) => saveAiFeedback(traceId, {
      type: feedbackType, comment: comment.trim() || null,
      correctKnowledgeIds: [], suggestedAnswer: null
    }),
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['ai-conversation-messages', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    }
  });

  return <div className="ai-operations-layout">
    <section className="panel ai-operations-toolbar">
      <div><p className="eyebrow">Sprint 6 · Audit trail</p><h2>Conversation Logs</h2><p>Telusuri pertanyaan, jawaban, source, prompt, model, validator, token, latency, dan feedback reviewer.</p></div>
      <a className="button" href="/api/admin/v1/ai-chatbot/conversations/export.csv">Export CSV terbatas</a>
      <div className="ai-filter-grid">
        <label>Cari<input value={filters.query ?? ''} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value || undefined }))} placeholder="Customer atau summary" /></label>
        <label>Channel<select value={filters.channel ?? ''} onChange={(event) => setFilters((current) => ({ ...current, channel: event.target.value as ConversationFilters['channel'] || undefined }))}><option value="">Semua</option><option value="whatsapp">WhatsApp</option><option value="playground">Playground</option></select></label>
        <label>Status jawaban<select value={filters.answerStatus ?? ''} onChange={(event) => setFilters((current) => ({ ...current, answerStatus: event.target.value || undefined }))}><option value="">Semua</option><option value="supported">Supported</option><option value="partially_supported">Partially supported</option><option value="unsupported">Unanswered</option><option value="safety_fallback">Safety fallback</option><option value="admin_required">Admin required</option></select></label>
        <label className="checkbox-field"><input type="checkbox" checked={filters.handoff === true} onChange={(event) => setFilters((current) => ({ ...current, handoff: event.target.checked || undefined }))} /> Handoff</label>
        <label className="checkbox-field"><input type="checkbox" checked={filters.unanswered === true} onChange={(event) => setFilters((current) => ({ ...current, unanswered: event.target.checked || undefined }))} /> Unanswered</label>
        <label className="checkbox-field"><input type="checkbox" checked={filters.lowConfidence === true} onChange={(event) => setFilters((current) => ({ ...current, lowConfidence: event.target.checked || undefined }))} /> Low confidence</label>
      </div>
    </section>

    {conversations.isPending ? <p>Memuat conversation logs…</p> : conversations.isError ? <p className="form-error">Conversation Logs gagal dimuat.</p> :
      <div className="ai-conversation-grid">
        <section className="panel ai-conversation-list" aria-label="Daftar conversation AI">
          {conversations.data.data.length === 0 ? <p>Tidak ada conversation sesuai filter.</p> : conversations.data.data.map((item) =>
            <button type="button" key={item.id} data-active={selectedId === item.id} onClick={() => setSelectedId(item.id)}>
              <span><strong>{item.customer.displayName ?? item.customer.maskedIdentifier}</strong><small>{formatDate(item.lastMessageAt)} · {item.channel}</small></span>
              <span><StatusBadge tone={item.fallbackCount ? 'warning' : 'success'}>{item.lastAnswerStatus ?? item.status}</StatusBadge><small>{item.traceCount} trace · {item.fallbackCount} fallback</small></span>
            </button>)}
        </section>
        <section className="ai-conversation-detail">
          {!selectedId ? <div className="empty-stage"><p>Pilih conversation untuk melihat timeline dan evidence.</p></div> : messages.isPending ? <p>Memuat timeline…</p> : messages.isError ? <p className="form-error">Timeline gagal dimuat.</p> : messages.data.data.map((message) =>
            <article className="panel ai-trace-card" key={message.id}>
              <header><div><p className="eyebrow">{message.safetyCategory} · {formatDate(message.createdAt)}</p><h3>{message.answerStatus}</h3></div><StatusBadge tone={message.validationStatus === 'validated' ? 'success' : 'danger'}>{message.validationStatus}</StatusBadge></header>
              <div className="ai-message-pair"><div><strong>Customer</strong><p>{message.customerMessage}</p></div><div><strong>Chatbot</strong><p>{message.assistantMessage ?? 'Tidak ada response tersimpan.'}</p></div></div>
              <dl className="alpha-rag-metrics"><div><dt>Model</dt><dd>{message.model ?? 'Tidak dipanggil'}</dd></div><div><dt>Prompt</dt><dd><code>{message.promptVersionId ?? '—'}</code></dd></div><div><dt>Token</dt><dd>{message.inputTokens + message.outputTokens}</dd></div><div><dt>Latency</dt><dd>{message.latencyMs} ms</dd></div><div><dt>Fallback</dt><dd>{message.fallbackReason ?? '—'}</dd></div><div><dt>Trace</dt><dd><code>{message.traceId}</code></dd></div></dl>
              <details><summary>Knowledge sources ({message.sources.length})</summary>{message.sources.length === 0 ? <p>Tidak ada source.</p> : <ol>{message.sources.map((source) => <li key={source.chunkId}><strong>{source.title ?? source.sourceType}</strong> · score {source.score.toFixed(4)} · {source.usedInAnswer ? 'dipakai' : 'retrieved'}</li>)}</ol>}</details>
              {message.feedback ? <p className="ai-feedback-saved"><strong>Feedback:</strong> {message.feedback.type}{message.feedback.comment ? ` — ${message.feedback.comment}` : ''}</p> :
                <div className="ai-feedback-form"><select aria-label="Tipe feedback" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as typeof feedbackType)}><option value="correct">Correct</option><option value="incorrect">Incorrect</option><option value="incomplete">Incomplete</option><option value="unsafe">Unsafe</option><option value="wrong_source">Wrong source</option><option value="too_long">Too long</option><option value="too_promotional">Too promotional</option></select><input aria-label="Komentar feedback" maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Komentar reviewer (opsional)" /><button type="button" disabled={feedback.isPending} onClick={() => feedback.mutate(message.id)}>Simpan feedback</button></div>}
            </article>)}
        </section>
      </div>}
  </div>;
};
