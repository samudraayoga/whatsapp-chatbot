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
          <p className="eyebrow">Pengiriman pesan</p>
          <h1>Tulis pesan</h1>
          <p>Pilih penerima, periksa kesiapan, lalu tulis pesan WhatsApp.</p>
        </div>
        <button className="button" type="button" onClick={() => navigate('/messages/outbox')}>Buka antrean</button>
      </header>

      <div className="compose-layout">
        <aside className="panel compose-recipient">
          <h2>Penerima</h2>
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
                <strong>{contact.displayName ?? 'Kontak tanpa nama'}</strong>
                <span>{contact.maskedPhone ?? 'Nomor tidak tersedia'} · {contact.identity.status}</span>
              </button>
            ))}
          </div>
        </aside>
        <div className="panel compose-stage">
          <div className="preflight-grid">
            <div><span>Sesi</span><strong>{overview?.session.state ?? 'Memuat'}</strong></div>
            <div><span>Risiko</span><strong>{overview?.safety.risk ?? 'Belum diketahui'}</strong></div>
            <div><span>Batas harian</span><strong>{overview?.rates.day ? `${overview.rates.day.used}/${overview.rates.day.limit}` : 'Belum tersedia'}</strong></div>
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
