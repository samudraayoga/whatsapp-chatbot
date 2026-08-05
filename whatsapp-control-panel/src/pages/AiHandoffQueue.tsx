import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  claimHandoff,
  closeHandoff,
  getHandoffs,
  resolveHandoff,
  startHandoff
} from '../api/inbox';
import { StatusBadge } from '../components/StatusBadge';
import { navigate } from '../routing/navigation';

type QueueState = 'all' | 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'canceled';

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Belum ditentukan';

export const AiHandoffQueue = () => {
  const [state, setState] = useState<QueueState>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const queue = useInfiniteQuery({
    queryKey: ['handoffs', 'ai', state],
    queryFn: ({ pageParam }) => getHandoffs({ state, cursor: pageParam, limit: 30, ai: true }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['handoffs'] });
  const claim = useMutation({ mutationFn: (id: string) => claimHandoff(id, true), onSuccess: refresh });
  const start = useMutation({ mutationFn: (id: string) => startHandoff(id, true), onSuccess: refresh });
  const resolve = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => resolveHandoff(id, note, true),
    onSuccess: refresh
  });
  const close = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => closeHandoff(id, note, true),
    onSuccess: refresh
  });
  const items = queue.data?.pages.flatMap((page) => page.data)
    .filter((handoff) => handoff.aiConversationId !== null) ?? [];
  const actionError = claim.isError || start.isError || resolve.isError || close.isError;

  return (
    <section className="ai-handoff-queue">
      <div className="panel ai-handoff-toolbar">
        <div><p className="eyebrow">Sprint 5 · Human handoff</p><h2>Safe Chatbot Beta Queue</h2><p>Queue existing diperkaya dengan reason, priority, summary, safety, knowledge, dan trace AI.</p></div>
        <label>State<select value={state} onChange={(event) => setState(event.target.value as QueueState)}>
          <option value="open">Open</option><option value="assigned">Assigned</option>
          <option value="in_progress">In progress</option><option value="resolved">Resolved</option>
          <option value="closed">Closed</option><option value="all">Semua</option>
        </select></label>
      </div>
      {actionError && <p className="form-error" role="alert">Handoff gagal diperbarui. Muat ulang dan coba lagi.</p>}
      {queue.isPending ? <p>Memuat AI handoff…</p> : queue.isError ? <p className="form-error">AI handoff gagal dimuat.</p> : items.length === 0 ? <div className="empty-stage"><p>Tidak ada AI handoff pada state ini.</p></div> :
        <div className="ai-handoff-list">{items.map((handoff) => <article className="panel ai-handoff-card" key={handoff.id} data-priority={handoff.priority}>
          <header><div><p className="eyebrow">{handoff.reason ?? 'manual_follow_up'}</p><h3>{handoff.contact.displayName ?? handoff.contact.maskedPhone ?? 'Customer'}</h3></div><div><StatusBadge tone={handoff.priority === 'high' ? 'danger' : 'info'}>{handoff.priority}</StatusBadge><StatusBadge tone="warning">{handoff.state}</StatusBadge></div></header>
          <p>{handoff.summary ?? handoff.sourcePreview}</p>
          <dl className="alpha-rag-metrics">
            <div><dt>Safety</dt><dd>{handoff.safetyCategory ?? '—'}</dd></div>
            <div><dt>Due</dt><dd>{formatDate(handoff.dueAt)}</dd></div>
            <div><dt>Assigned</dt><dd>{handoff.assigneeUserId ?? 'Belum'}</dd></div>
            <div><dt>Knowledge</dt><dd>{handoff.knowledgeIds.length}</dd></div>
            <div><dt>Trace</dt><dd><code>{handoff.traceId ?? '—'}</code></dd></div>
          </dl>
          <details><summary>Conversation trigger</summary><p>“{handoff.sourcePreview}”</p></details>
          <div className="ai-handoff-actions">
            <button type="button" className="button" onClick={() => navigate(`/inbox/${handoff.contactId}`)}>Lihat conversation</button>
            {handoff.state === 'open' && <button type="button" onClick={() => claim.mutate(handoff.id)}>Assign to me</button>}
            {(handoff.state === 'open' || handoff.state === 'assigned') && <button type="button" onClick={() => start.mutate(handoff.id)}>Mark in progress</button>}
            {['open', 'assigned', 'in_progress'].includes(handoff.state) && <><input aria-label={`Catatan ${handoff.id}`} maxLength={1000} placeholder="Catatan resolusi" value={notes[handoff.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [handoff.id]: event.target.value }))} /><button type="button" disabled={!(notes[handoff.id] ?? '').trim()} onClick={() => resolve.mutate({ id: handoff.id, note: notes[handoff.id]!.trim() })}>Resolve</button></>}
            {handoff.state === 'resolved' && <button type="button" disabled={!(notes[handoff.id] ?? '').trim()} onClick={() => close.mutate({ id: handoff.id, note: notes[handoff.id]!.trim() })}>Close</button>}
          </div>
        </article>)}</div>}
      {queue.hasNextPage && <button type="button" className="button" onClick={() => queue.fetchNextPage()}>Muat berikutnya</button>}
    </section>
  );
};
