import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFaqFromUnanswered,
  ignoreUnanswered,
  listUnanswered,
  resolveUnanswered,
  updateUnanswered
} from '../api/ai-operations';
import { listKnowledgeCategories } from '../api/knowledge';
import { StatusBadge } from '../components/StatusBadge';
import { navigate } from '../routing/navigation';

export const AiUnansweredQuestions = () => {
  const [status, setStatus] = useState('new');
  const [query, setQuery] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const unanswered = useQuery({ queryKey: ['ai-unanswered', status, query], queryFn: () => listUnanswered({ status, query: query || undefined }) });
  const categories = useQuery({ queryKey: ['ai-knowledge-categories'], queryFn: listKnowledgeCategories });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ai-unanswered'] });
  const markReview = useMutation({ mutationFn: (id: string) => updateUnanswered(id, { status: 'reviewing' }), onSuccess: refresh });
  const ignore = useMutation({ mutationFn: (id: string) => ignoreUnanswered(id, 'Tidak relevan untuk cakupan FAQ RAHO.'), onSuccess: refresh });
  const resolve = useMutation({ mutationFn: (id: string) => resolveUnanswered(id, 'Ditutup oleh reviewer.'), onSuccess: refresh });
  const createFaq = useMutation({
    mutationFn: (id: string) => createFaqFromUnanswered(id, {
      answer: answers[id]!.trim(), categoryId: category[id] || null, requiresDisclaimer: false
    }),
    onSuccess: () => { refresh(); navigate('/ai-chatbot/knowledge'); }
  });

  return <div className="ai-operations-layout">
    <section className="panel ai-operations-toolbar"><div><p className="eyebrow">Sprint 6 · Coverage loop</p><h2>Unanswered Questions</h2><p>Pertanyaan sama digabung berdasarkan normalisasi exact, lalu dapat dijadikan draft FAQ tanpa auto-publish.</p></div><div className="ai-filter-grid"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="new">New</option><option value="reviewing">Reviewing</option><option value="knowledge_created">Knowledge created</option><option value="resolved">Resolved</option><option value="ignored">Ignored</option><option value="all">Semua</option></select></label><label>Cari<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari pertanyaan" /></label></div></section>
    {unanswered.isPending ? <p>Memuat unanswered questions…</p> : unanswered.isError ? <p className="form-error">Unanswered Questions gagal dimuat.</p> : unanswered.data.data.length === 0 ? <div className="empty-stage"><p>Belum ada pertanyaan pada status ini.</p></div> :
      <div className="ai-unanswered-list">{unanswered.data.data.map((item) => <article className="panel ai-unanswered-card" key={item.id}>
        <header><div><p className="eyebrow">{item.occurrenceCount} kemunculan · terakhir {new Date(item.lastSeenAt).toLocaleDateString('id-ID')}</p><h3>{item.sampleQuestion}</h3></div><StatusBadge tone={item.status === 'new' ? 'warning' : item.status === 'resolved' ? 'success' : 'info'}>{item.status}</StatusBadge></header>
        <dl className="alpha-rag-metrics"><div><dt>Best similarity</dt><dd>{item.bestSimilarity?.toFixed(4) ?? 'Tidak ada'}</dd></div><div><dt>Prediksi kategori</dt><dd>{item.predictedCategoryName ?? 'Belum ditentukan'}</dd></div><div><dt>Nearest source</dt><dd>{item.nearestKnowledgeIds.length}</dd></div><div><dt>Conversation</dt><dd>{item.conversationIds.length}</dd></div></dl>
        {item.conversationIds[0] && <button className="button" type="button" onClick={() => navigate(`/ai-chatbot/conversations/${item.conversationIds[0]}`)}>Buka conversation terkait</button>}
        {(item.status === 'new' || item.status === 'reviewing') && <div className="ai-unanswered-editor"><label>Kategori FAQ<select value={category[item.id] ?? item.predictedCategoryId ?? ''} onChange={(event) => setCategory((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Tanpa kategori</option>{categories.data?.data.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Jawaban draft<textarea rows={4} maxLength={20_000} value={answers[item.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Isi jawaban resmi; draft tetap harus melalui review." /></label><div className="ai-handoff-actions">{item.status === 'new' && <button type="button" onClick={() => markReview.mutate(item.id)}>Mulai review</button>}<button type="button" disabled={!(answers[item.id] ?? '').trim()} onClick={() => createFaq.mutate(item.id)}>Buat draft FAQ</button><button type="button" className="button" onClick={() => ignore.mutate(item.id)}>Ignore</button><button type="button" className="button" onClick={() => resolve.mutate(item.id)}>Resolve</button></div></div>}
      </article>)}</div>}
  </div>;
};
