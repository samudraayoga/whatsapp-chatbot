import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  claimHandoff,
  getContact,
  getConversations,
  getHandoffs,
  getMessages,
  resolveHandoff
} from '../api/inbox';
import type {
  AdminUser,
  Contact,
  Message,
  OverviewData
} from '../api/contracts';
import { ApiClientError } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { navigate } from '../routing/navigation';
import { MessageComposer } from '../components/MessageComposer';

type InboxPageProps = {
  pathname: string;
  user: AdminUser;
  overview?: OverviewData;
};

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value))
    : 'Belum ada';

const identityTone = (status: Contact['identity']['status']) =>
  status === 'resolved' ? 'success' : status === 'unresolved' ? 'warning' : 'danger';

const identityCopy = (status: Contact['identity']['status']) => {
  if (status === 'unresolved') {
    return 'LID belum dapat dipetakan ke nomor telepon. Jangan gabungkan contact secara manual.';
  }
  if (status === 'conflict') {
    return 'Ada identitas yang bertentangan. Riwayat sengaja tetap dipisahkan sampai konflik ditinjau.';
  }
  return 'Identitas contact telah dipetakan secara konsisten.';
};

const MessageBubble = ({ message }: { message: Message }) => (
  <article
    className="message-row"
    data-direction={message.direction}
    data-testid={`message-${message.id}`}
  >
    <div className="message-bubble">
      {message.messageType === 'text' ? (
        <p>{message.content || <em>Pesan teks kosong</em>}</p>
      ) : (
        <p className="unsupported-message">
          Konten {message.messageType} belum didukung di control panel.
        </p>
      )}
      <div className="message-bubble__meta">
        <time dateTime={message.createdAt}>
          {formatDateTime(message.createdAt)}
        </time>
        <span>{message.state}</span>
      </div>
      <details>
        <summary>Detail teknis</summary>
        <dl>
          <div>
            <dt>Message ID</dt>
            <dd>{message.id}</dd>
          </div>
          <div>
            <dt>Provider ID</dt>
            <dd>{message.providerMessageId ?? 'Tidak tersedia'}</dd>
          </div>
          <div>
            <dt>Tipe</dt>
            <dd>{message.messageType}</dd>
          </div>
        </dl>
      </details>
    </div>
  </article>
);

const ContactInspector = ({ contactId }: { contactId: string }) => {
  const contactQuery = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => getContact(contactId)
  });

  if (contactQuery.isPending) {
    return <p className="empty-copy">Memuat detail contact…</p>;
  }
  if (contactQuery.isError) {
    return <p className="form-alert form-alert--error">Detail contact gagal dimuat.</p>;
  }

  const contact = contactQuery.data.data;
  return (
    <div className="contact-inspector">
      <div className="contact-inspector__header">
        <span className="contact-avatar" aria-hidden="true">
          {(contact.displayName ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h2>{contact.displayName ?? 'Contact tanpa nama'}</h2>
          <p>{contact.maskedPhone ?? 'Nomor tidak tersedia'}</p>
        </div>
      </div>

      <div className="identity-card" data-status={contact.identity.status}>
        <StatusBadge tone={identityTone(contact.identity.status)}>
          Identity: {contact.identity.status}
        </StatusBadge>
        <p>{identityCopy(contact.identity.status)}</p>
      </div>

      <dl className="detail-list detail-list--single">
        <div>
          <dt>WhatsApp JID</dt>
          <dd>{contact.identity.whatsappJid ?? 'Tidak tersedia'}</dd>
        </div>
        <div>
          <dt>Canonical JID</dt>
          <dd>{contact.identity.canonicalJid ?? 'Belum dipetakan'}</dd>
        </div>
        <div>
          <dt>Pesan masuk / keluar</dt>
          <dd>{contact.counts.incoming} / {contact.counts.outgoing}</dd>
        </div>
        <div>
          <dt>Status outgoing terakhir</dt>
          <dd>{contact.lastOutgoingStatus ?? 'Belum ada'}</dd>
        </div>
        <div>
          <dt>Interaksi terakhir</dt>
          <dd>{formatDateTime(contact.lastInteractionAt)}</dd>
        </div>
      </dl>
      <button
        className="button inspector-link"
        type="button"
        onClick={() => navigate(`/contacts/${contact.id}`)}
      >
        Buka profil contact
      </button>
    </div>
  );
};

const FollowUpQueue = ({ user }: { user: AdminUser }) => {
  const [state, setState] = useState<
    'all' | 'open' | 'assigned' | 'resolved' | 'canceled'
  >('open');
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const handoffs = useInfiniteQuery({
    queryKey: ['handoffs', state],
    queryFn: ({ pageParam }) =>
      getHandoffs({ state, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['handoffs'] });
  const claim = useMutation({ mutationFn: claimHandoff, onSuccess: refresh });
  const resolve = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      resolveHandoff(id, note),
    onSuccess: refresh
  });
  const canManage = user.permissions.includes('handoffs.manage');
  const items = handoffs.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section>
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Sprint 3 · Human handoff</p>
          <h1>Follow-up queue</h1>
          <p>Permintaan menu 5 dibuat tepat satu kali dan dapat diklaim atau diselesaikan dengan audit.</p>
        </div>
        <div className="page-heading__actions">
          <button className="button" type="button" onClick={() => navigate('/inbox')}>
            Kembali ke inbox
          </button>
          <label className="compact-field">
            State
            <select value={state} onChange={(event) => setState(event.target.value as typeof state)}>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="resolved">Resolved</option>
              <option value="canceled">Canceled</option>
              <option value="all">Semua</option>
            </select>
          </label>
        </div>
      </header>

      {(claim.isError || resolve.isError) && (
        <p className="form-alert form-alert--error" role="alert">
          Follow-up gagal diperbarui. Muat ulang queue dan coba lagi.
        </p>
      )}
      {handoffs.isPending ? (
        <p className="empty-copy">Memuat follow-up…</p>
      ) : handoffs.isError ? (
        <p className="form-alert form-alert--error">Follow-up gagal dimuat.</p>
      ) : items.length === 0 ? (
        <div className="empty-stage"><p>Tidak ada follow-up pada state ini.</p></div>
      ) : (
        <div className="handoff-list">
          {items.map((handoff) => (
            <article className="panel handoff-card" key={handoff.id}>
              <div>
                <p className="eyebrow">{handoff.state}</p>
                <h2>{handoff.contact.displayName ?? 'Contact tanpa nama'}</h2>
                <p>{handoff.contact.maskedPhone ?? 'Nomor tidak tersedia'} · Pesan pemicu: “{handoff.sourcePreview}”</p>
                <small>Due {formatDateTime(handoff.dueAt)}</small>
              </div>
              <div className="handoff-card__actions">
                <button className="button" type="button" onClick={() => navigate(`/inbox/${handoff.contactId}`)}>
                  Lihat histori
                </button>
                {handoff.state === 'open' && (
                  <button
                    className="button button--primary"
                    disabled={!canManage || claim.isPending}
                    type="button"
                    onClick={() => claim.mutate(handoff.id)}
                  >
                    Claim
                  </button>
                )}
                {(handoff.state === 'open' || handoff.state === 'assigned') && (
                  <div className="resolve-control">
                    <input
                      aria-label={`Catatan resolusi ${handoff.contact.displayName ?? handoff.id}`}
                      placeholder="Catatan resolusi"
                      value={resolution[handoff.id] ?? ''}
                      onChange={(event) =>
                        setResolution((current) => ({
                          ...current,
                          [handoff.id]: event.target.value
                        }))
                      }
                    />
                    <button
                      className="button"
                      disabled={
                        !canManage ||
                        resolve.isPending ||
                        !(resolution[handoff.id] ?? '').trim()
                      }
                      type="button"
                      onClick={() =>
                        resolve.mutate({
                          id: handoff.id,
                          note: resolution[handoff.id].trim()
                        })
                      }
                    >
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {handoffs.hasNextPage && (
        <button className="button load-more" type="button" onClick={() => handoffs.fetchNextPage()}>
          Muat berikutnya
        </button>
      )}
    </section>
  );
};

const ConversationInbox = ({
  pathname,
  user,
  overview
}: InboxPageProps) => {
  const routeId = pathname.match(/^\/inbox\/(\d+)$/)?.[1] ?? null;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<
    'all' | 'has_failure' | 'identity_warning'
  >('all');
  const deferredQuery = useDeferredValue(query.trim());
  const conversations = useInfiniteQuery({
    queryKey: ['conversations', deferredQuery, status],
    queryFn: ({ pageParam }) =>
      getConversations({
        query: deferredQuery || undefined,
        status,
        cursor: pageParam,
        limit: 30
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined
  });
  const conversationItems = useMemo(
    () => conversations.data?.pages.flatMap((page) => page.data) ?? [],
    [conversations.data]
  );

  useEffect(() => {
    if (pathname === '/inbox' && conversationItems[0]) {
      navigate(`/inbox/${conversationItems[0].id}`, true);
    }
  }, [conversationItems, pathname]);

  const messages = useInfiniteQuery({
    queryKey: ['messages', routeId],
    queryFn: ({ pageParam }) =>
      getMessages({
        conversationId: routeId!,
        cursor: pageParam,
        limit: 40
      }),
    enabled: Boolean(routeId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined
  });
  const chronologicalMessages = useMemo(
    () =>
      (messages.data?.pages.flatMap((page) => page.data) ?? [])
        .slice()
        .reverse(),
    [messages.data]
  );
  const selected = conversationItems.find((item) => item.id === routeId);

  return (
    <section>
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Sprint 3 · Search & history</p>
          <h1>Inbox</h1>
          <p>Cari percakapan, telusuri histori, dan periksa identitas tanpa membuka terminal.</p>
        </div>
        <button className="button" type="button" onClick={() => navigate('/inbox/follow-ups')}>
          Follow-up queue
        </button>
      </header>

      <div className="inbox-layout">
        <aside className="conversation-pane" aria-label="Daftar percakapan">
          <div className="inbox-toolbar">
            <label>
              <span className="sr-only">Cari contact atau nomor</span>
              <input
                aria-label="Cari contact atau nomor"
                maxLength={100}
                placeholder="Cari nama atau nomor…"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter percakapan"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="all">Semua percakapan</option>
              <option value="has_failure">Ada pesan gagal</option>
              <option value="identity_warning">Identity warning</option>
            </select>
          </div>

          {conversations.isPending ? (
            <p className="pane-state">Memuat percakapan…</p>
          ) : conversations.isError ? (
            <p className="pane-state pane-state--error">Percakapan gagal dimuat.</p>
          ) : conversationItems.length === 0 ? (
            <p className="pane-state">Tidak ada hasil untuk pencarian ini.</p>
          ) : (
            <div className="conversation-list">
              {conversationItems.map((conversation) => (
                <button
                  className="conversation-item"
                  data-active={conversation.id === routeId}
                  key={conversation.id}
                  onClick={() => navigate(`/inbox/${conversation.id}`)}
                  type="button"
                >
                  <span className="conversation-item__top">
                    <strong>{conversation.displayName ?? 'Contact tanpa nama'}</strong>
                    <time dateTime={conversation.lastMessage.occurredAt}>
                      {new Intl.DateTimeFormat('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit'
                      }).format(new Date(conversation.lastMessage.occurredAt))}
                    </time>
                  </span>
                  <span className="conversation-item__phone">
                    {conversation.maskedPhone ?? 'Nomor tidak tersedia'}
                  </span>
                  <span className="conversation-item__preview">
                    {conversation.lastMessage.direction === 'outgoing' ? 'Anda: ' : ''}
                    {conversation.lastMessage.preview}
                  </span>
                  {conversation.identityStatus !== 'resolved' && (
                    <span className="identity-flag">{conversation.identityStatus}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {conversations.hasNextPage && (
            <button
              className="button load-more"
              disabled={conversations.isFetchingNextPage}
              onClick={() => conversations.fetchNextPage()}
              type="button"
            >
              {conversations.isFetchingNextPage ? 'Memuat…' : 'Muat percakapan lama'}
            </button>
          )}
        </aside>

        <section className="history-pane" aria-label="Histori pesan">
          {!routeId ? (
            <div className="pane-empty">
              <h2>Pilih percakapan</h2>
              <p>Histori pesan akan tampil di sini.</p>
            </div>
          ) : messages.isPending ? (
            <p className="pane-state">Memuat histori…</p>
          ) : messages.isError ? (
            <div className="pane-empty">
              <h2>Histori gagal dimuat</h2>
              <p>
                {messages.error instanceof ApiClientError
                  ? messages.error.message
                  : 'Coba muat ulang halaman.'}
              </p>
            </div>
          ) : (
            <>
              <header className="history-pane__header">
                <div>
                  <strong>{selected?.displayName ?? 'Histori percakapan'}</strong>
                  <span>{selected?.maskedPhone ?? `Contact #${routeId}`}</span>
                </div>
                <span>{chronologicalMessages.length} pesan dimuat</span>
              </header>
              <div className="message-history">
                {messages.hasNextPage && (
                  <button
                    className="button load-more"
                    disabled={messages.isFetchingNextPage}
                    onClick={() => messages.fetchNextPage()}
                    type="button"
                  >
                    {messages.isFetchingNextPage ? 'Memuat…' : 'Muat pesan lebih lama'}
                  </button>
                )}
                {chronologicalMessages.length === 0 ? (
                  <p className="pane-state">Belum ada pesan.</p>
                ) : (
                  chronologicalMessages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))
                )}
              </div>
              <MessageComposer
                overview={overview}
                recipient={{ contactId: routeId }}
                recipientLabel={
                  selected?.displayName ??
                  selected?.maskedPhone ??
                  `Contact #${routeId}`
                }
                user={user}
              />
            </>
          )}
        </section>

        <aside className="inspector-pane" aria-label="Detail contact">
          {routeId ? (
            <ContactInspector contactId={routeId} />
          ) : (
            <p className="pane-state">Pilih percakapan untuk melihat contact.</p>
          )}
        </aside>
      </div>
    </section>
  );
};

export const InboxPage = ({ pathname, user, overview }: InboxPageProps) =>
  pathname === '/inbox/follow-ups' ? (
    <FollowUpQueue user={user} />
  ) : (
    <ConversationInbox pathname={pathname} user={user} overview={overview} />
  );
