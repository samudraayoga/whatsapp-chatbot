import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminUser, OverviewData } from '../api/contracts';
import { getContacts } from '../api/inbox';
import { MessageComposer } from '../components/MessageComposer';
import { navigate } from '../routing/navigation';

type ComposePageProps = {
  user: AdminUser;
  overview?: OverviewData;
};

export const ComposePage = ({ user, overview }: ComposePageProps) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferred = useDeferredValue(search.trim());
  const contacts = useQuery({
    queryKey: ['compose-contacts', deferred],
    queryFn: () => getContacts({ query: deferred || undefined, limit: 20 })
  });
  const selected = contacts.data?.data.find((contact) => contact.id === selectedId);

  return (
    <section>
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Sprint 4 · Safe compose</p>
          <h1>Compose message</h1>
          <p>Pilih contact, periksa readiness, lalu buat command durable.</p>
        </div>
        <button className="button" type="button" onClick={() => navigate('/messages/outbox')}>Buka outbox</button>
      </header>

      <div className="compose-layout">
        <aside className="panel compose-recipient">
          <h2>Recipient</h2>
          <input
            aria-label="Cari recipient"
            placeholder="Cari nama atau nomor…"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="recipient-results">
            {contacts.data?.data.map((contact) => (
              <button
                data-active={selectedId === contact.id}
                key={contact.id}
                onClick={() => setSelectedId(contact.id)}
                type="button"
              >
                <strong>{contact.displayName ?? 'Contact tanpa nama'}</strong>
                <span>{contact.maskedPhone ?? 'Nomor tidak tersedia'} · {contact.identity.status}</span>
              </button>
            ))}
          </div>
        </aside>
        <div className="panel compose-stage">
          <div className="preflight-grid">
            <div><span>Session</span><strong>{overview?.session.state ?? 'loading'}</strong></div>
            <div><span>Risk</span><strong>{overview?.safety.risk ?? 'unknown'}</strong></div>
            <div><span>Daily budget</span><strong>{overview?.rates.day ? `${overview.rates.day.used}/${overview.rates.day.limit}` : 'Unavailable'}</strong></div>
          </div>
          <MessageComposer
            overview={overview}
            recipient={selected ? { contactId: selected.id } : {}}
            recipientLabel={selected?.displayName ?? 'Belum dipilih'}
            user={user}
            variant="page"
          />
        </div>
      </div>
    </section>
  );
};
