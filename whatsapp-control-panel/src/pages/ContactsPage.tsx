import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getContact, getContacts } from '../api/inbox';
import { StatusBadge } from '../components/StatusBadge';
import { navigate } from '../routing/navigation';

type ContactsPageProps = {
  pathname: string;
};

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value))
    : 'Belum ada';

export const ContactsPage = ({ pathname }: ContactsPageProps) => {
  const routeId = pathname.match(/^\/contacts\/(\d+)$/)?.[1] ?? null;
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const contacts = useInfiniteQuery({
    queryKey: ['contacts', deferredSearch],
    queryFn: ({ pageParam }) =>
      getContacts({
        query: deferredSearch || undefined,
        cursor: pageParam,
        limit: 30
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined
  });
  const items = useMemo(
    () => contacts.data?.pages.flatMap((page) => page.data) ?? [],
    [contacts.data]
  );

  useEffect(() => {
    if (pathname === '/contacts' && items[0]) {
      navigate(`/contacts/${items[0].id}`, true);
    }
  }, [items, pathname]);

  const detail = useQuery({
    queryKey: ['contact', routeId],
    queryFn: () => getContact(routeId!),
    enabled: Boolean(routeId)
  });
  const contact = detail.data?.data;

  return (
    <section>
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Sprint 3 · Identity facade</p>
          <h1>Contacts</h1>
          <p>Cari contact dan tinjau pemetaan identitas WhatsApp yang aman.</p>
        </div>
      </header>

      <div className="contacts-layout">
        <aside className="contact-list-pane">
          <div className="inbox-toolbar">
            <label>
              <span className="sr-only">Cari contact</span>
              <input
                aria-label="Cari contact"
                maxLength={100}
                placeholder="Cari nama atau nomor…"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
          {contacts.isPending ? (
            <p className="pane-state">Memuat contact…</p>
          ) : contacts.isError ? (
            <p className="pane-state pane-state--error">Contact gagal dimuat.</p>
          ) : items.length === 0 ? (
            <p className="pane-state">Contact tidak ditemukan.</p>
          ) : (
            <div className="conversation-list">
              {items.map((item) => (
                <button
                  className="conversation-item"
                  data-active={item.id === routeId}
                  key={item.id}
                  onClick={() => navigate(`/contacts/${item.id}`)}
                  type="button"
                >
                  <span className="conversation-item__top">
                    <strong>{item.displayName ?? 'Contact tanpa nama'}</strong>
                    <span className={`identity-dot identity-dot--${item.identity.status}`} />
                  </span>
                  <span className="conversation-item__phone">
                    {item.maskedPhone ?? 'Nomor tidak tersedia'}
                  </span>
                  <span className="conversation-item__preview">
                    {item.counts.incoming + item.counts.outgoing} pesan · {item.identity.status}
                  </span>
                </button>
              ))}
            </div>
          )}
          {contacts.hasNextPage && (
            <button className="button load-more" type="button" onClick={() => contacts.fetchNextPage()}>
              Muat contact berikutnya
            </button>
          )}
        </aside>

        <section className="contact-detail-pane">
          {!routeId ? (
            <div className="pane-empty"><h2>Pilih contact</h2></div>
          ) : detail.isPending ? (
            <p className="pane-state">Memuat profil contact…</p>
          ) : detail.isError || !contact ? (
            <p className="form-alert form-alert--error">Profil contact gagal dimuat.</p>
          ) : (
            <>
              <div className="contact-profile-heading">
                <span className="contact-avatar contact-avatar--large" aria-hidden="true">
                  {(contact.displayName ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="eyebrow">Contact #{contact.id}</p>
                  <h2>{contact.displayName ?? 'Contact tanpa nama'}</h2>
                  <p>{contact.maskedPhone ?? 'Nomor tidak tersedia'}</p>
                </div>
                <StatusBadge
                  tone={
                    contact.identity.status === 'resolved'
                      ? 'success'
                      : contact.identity.status === 'unresolved'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {contact.identity.status}
                </StatusBadge>
              </div>

              {contact.identity.status !== 'resolved' && (
                <div className="identity-warning">
                  <strong>Jangan merge contact ini secara manual.</strong>
                  <p>
                    {contact.identity.status === 'unresolved'
                      ? 'LID belum memiliki pemetaan PN yang tepercaya.'
                      : 'PN dan LID menunjukkan identitas yang bertentangan.'}
                  </p>
                </div>
              )}

              <dl className="contact-facts">
                <div><dt>WhatsApp JID</dt><dd>{contact.identity.whatsappJid ?? 'Tidak tersedia'}</dd></div>
                <div><dt>PN JID</dt><dd>{contact.identity.pnJid ?? 'Belum tersedia'}</dd></div>
                <div><dt>LID JID</dt><dd>{contact.identity.lidJid ?? 'Belum tersedia'}</dd></div>
                <div><dt>Canonical JID</dt><dd>{contact.identity.canonicalJid ?? 'Belum dipetakan'}</dd></div>
                <div><dt>Pesan masuk</dt><dd>{contact.counts.incoming}</dd></div>
                <div><dt>Pesan keluar</dt><dd>{contact.counts.outgoing}</dd></div>
                <div><dt>Outgoing terakhir</dt><dd>{contact.lastOutgoingStatus ?? 'Belum ada'}</dd></div>
                <div><dt>Interaksi terakhir</dt><dd>{formatDateTime(contact.lastInteractionAt)}</dd></div>
              </dl>
              <button className="button button--primary" type="button" onClick={() => navigate(`/inbox/${contact.id}`)}>
                Buka histori pesan
              </button>
            </>
          )}
        </section>
      </div>
    </section>
  );
};
