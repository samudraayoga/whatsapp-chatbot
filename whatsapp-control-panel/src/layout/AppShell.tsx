import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import type { AdminUser, ConnectionState, Risk } from '../api/contracts';
import { navigate } from '../routing/navigation';

type AppShellProps = {
  children: ReactNode;
  sessionState: ConnectionState | 'loading';
  risk: Risk | 'unknown';
  user: AdminUser;
  loggingOut: boolean;
  onLogout: () => void;
  currentPath: string;
};

const sessionTone: Record<AppShellProps['sessionState'], StatusTone> = {
  loading: 'neutral',
  starting: 'info',
  connecting: 'info',
  qr_required: 'warning',
  connected: 'success',
  reconnecting: 'warning',
  paused: 'danger',
  logged_out: 'danger',
  bad_session: 'danger',
  disconnected: 'danger',
  shutting_down: 'neutral'
};

const compactSessionLabel: Record<AppShellProps['sessionState'], string> = {
  loading: 'Memuat',
  starting: 'Memulai',
  connecting: 'Menghubungkan',
  qr_required: 'Perlu QR',
  connected: 'Terhubung',
  reconnecting: 'Menghubungkan',
  paused: 'Dijeda',
  logged_out: 'Keluar',
  bad_session: 'Sesi rusak',
  disconnected: 'Terputus',
  shutting_down: 'Berhenti'
};

const riskTone: Record<AppShellProps['risk'], StatusTone> = {
  unknown: 'neutral',
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger'
};

const riskLabel: Record<AppShellProps['risk'], string> = {
  unknown: 'Belum diketahui',
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis'
};

type NavigationItem = {
  label: string;
  path: string;
  activeWhen?: (currentPath: string) => boolean;
  permission?: AdminUser['permissions'][number];
};

type NavigationGroup = {
  id: string;
  label: string;
  items: NavigationItem[];
  collapsible?: boolean;
};

const navigationGroups: NavigationGroup[] = [
  {
    id: 'main',
    label: 'Utama',
    items: [
      { label: 'Beranda', path: '/overview' },
      { label: 'Inbox', path: '/inbox' },
      { label: 'Kontak', path: '/contacts' },
      {
        label: 'Chatbot',
        path: '/chatbot/rules',
        permission: 'chatbot.manage'
      },
      {
        label: 'Integrasi Chatbot AI',
        path: '/ai-chatbot/overview',
        activeWhen: (currentPath) =>
          currentPath === '/ai-chatbot' ||
          currentPath === '/ai-chatbot/overview',
        permission: 'chatbot.manage'
      }
    ]
  },
  {
    id: 'delivery',
    label: 'Pengiriman',
    items: [
      { label: 'Tulis pesan', path: '/messages/compose' },
      {
        label: 'Riwayat pengiriman',
        path: '/messages/outbox',
        activeWhen: (currentPath) =>
          currentPath === '/messages/outbox' ||
          /^\/messages\/[0-9a-f-]{36}$/i.test(currentPath)
      }
    ]
  },
  {
    id: 'connection',
    label: 'Koneksi',
    items: [
      { label: 'Sesi WhatsApp', path: '/operations/session' },
      { label: 'Keamanan', path: '/operations/safety' }
    ]
  }
];

const aiNavigationGroups: NavigationGroup[] = [
  {
    id: 'ai-main',
    label: 'Chatbot AI',
    items: [
      { label: 'Ringkasan', path: '/ai-chatbot/overview', permission: 'chatbot.manage' },
      { label: 'Informasi Chatbot', path: '/ai-chatbot/knowledge', permission: 'chatbot.manage' },
      { label: 'Tes Chatbot', path: '/ai-chatbot/playground', permission: 'chatbot.manage' },
      { label: 'Pengaturan AI', path: '/ai-chatbot/settings', permission: 'chatbot.manage' }
    ]
  },
  {
    id: 'ai-advanced',
    label: 'Menu lanjutan',
    collapsible: true,
    items: [
      { label: 'Gaya Jawaban', path: '/ai-chatbot/instructions', permission: 'chatbot.manage' },
      { label: 'Aktivitas Chatbot', path: '/ai-chatbot/conversations', permission: 'chatbot.manage' },
      { label: 'Belum Bisa Dijawab', path: '/ai-chatbot/unanswered', permission: 'chatbot.manage' },
      { label: 'Bantuan Admin', path: '/ai-chatbot/handoffs', permission: 'chatbot.manage' },
      { label: 'Statistik', path: '/ai-chatbot/analytics', permission: 'chatbot.manage' }
    ]
  }
];

const initials = (displayName: string) =>
  displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const isNavigationItemActive = (item: NavigationItem, currentPath: string) =>
  item.activeWhen?.(currentPath) ??
  (item.path === currentPath ||
  (item.path !== '/overview' && currentPath.startsWith(`${item.path}/`)));

const shouldHandleNavigation = (event: ReactMouseEvent<HTMLAnchorElement>) =>
  event.button === 0 &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey;

const MenuIcon = ({ open }: { open: boolean }) => (
  <svg
    aria-hidden="true"
    className="mobile-nav-toggle__icon"
    focusable="false"
    viewBox="0 0 24 24"
  >
    {open ? (
      <path d="M5 5 19 19M19 5 5 19" />
    ) : (
      <path d="M4 6h16M4 12h16M4 18h16" />
    )}
  </svg>
);

export const AppShell = ({
  children,
  sessionState,
  risk,
  user,
  loggingOut,
  onLogout,
  currentPath
}: AppShellProps) => {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const inAiChatbot =
    currentPath === '/ai-chatbot' || currentPath.startsWith('/ai-chatbot/');
  const visibleNavigationGroups = [
    ...navigationGroups,
    ...(inAiChatbot ? aiNavigationGroups : [])
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permission || user.permissions.includes(item.permission)
      )
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!userMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !userMenuRef.current?.contains(event.target)
      ) {
        setUserMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setUserMenuOpen(false);
      userMenuTriggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    mobileNavigationRef.current
      ?.querySelector<HTMLAnchorElement>('.nav-item')
      ?.focus();

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavigationOpen(false);
        mobileNavigationTriggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;

      const links = Array.from(
        mobileNavigationRef.current?.querySelectorAll<HTMLAnchorElement>(
          '.nav-item'
        ) ?? []
      );
      const first = links[0];
      const last = links.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [mobileNavigationOpen]);

  const handleNavigation = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    path: string
  ) => {
    if (!shouldHandleNavigation(event)) return;
    event.preventDefault();
    setMobileNavigationOpen(false);
    navigate(path);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>

      <header className="topbar">
        <a
          aria-label="Control Room — Overview"
          className="brand"
          href="/overview"
          onClick={(event) => handleNavigation(event, '/overview')}
        >
          <span className="brand__mark" aria-hidden="true">
            <img
              alt=""
              className="brand__logo"
              height="32"
              src="/whatsapp.svg"
              width="32"
            />
          </span>
          <span>
            <strong>Control Room</strong>
            <small>Operasional WhatsApp</small>
          </span>
        </a>

        <div className="topbar__status" aria-label="Status operasional">
          <StatusBadge tone="info">
            {import.meta.env.PROD ? 'Produksi' : 'Development'}
          </StatusBadge>
          <StatusBadge tone={sessionTone[sessionState]}>
            Sesi: {compactSessionLabel[sessionState]}
          </StatusBadge>
          <StatusBadge tone={riskTone[risk]}>Risiko: {riskLabel[risk]}</StatusBadge>
        </div>

        <div
          aria-label={`Status sesi WhatsApp: ${compactSessionLabel[sessionState]}`}
          aria-live="polite"
          className="topbar__session-compact"
          role="status"
        >
          <StatusBadge tone={sessionTone[sessionState]}>
            {compactSessionLabel[sessionState]}
          </StatusBadge>
        </div>

        <button
          aria-controls="primary-navigation"
          aria-expanded={mobileNavigationOpen}
          className="mobile-nav-toggle"
          onClick={() => {
            setUserMenuOpen(false);
            setMobileNavigationOpen((open) => !open);
          }}
          ref={mobileNavigationTriggerRef}
          type="button"
        >
          <span className="sr-only">
            {mobileNavigationOpen
              ? 'Tutup navigasi utama'
              : 'Buka navigasi utama'}
          </span>
          <MenuIcon open={mobileNavigationOpen} />
        </button>

        <div className="user-menu" ref={userMenuRef}>
          <button
            aria-controls="user-disclosure"
            aria-expanded={userMenuOpen}
            className="avatar-button"
            onClick={() => {
              setMobileNavigationOpen(false);
              setUserMenuOpen((open) => !open);
            }}
            ref={userMenuTriggerRef}
            type="button"
          >
            <span className="sr-only">
              {userMenuOpen ? 'Tutup menu pengguna' : 'Buka menu pengguna'}
            </span>
            <span aria-hidden="true">{initials(user.displayName)}</span>
          </button>
          {userMenuOpen && (
            <div className="user-menu__panel" id="user-disclosure">
              <strong>{user.displayName}</strong>
              <span>
                @{user.username} · {user.role}
              </span>
              <button
                disabled={loggingOut}
                onClick={() => {
                  setUserMenuOpen(false);
                  onLogout();
                }}
                type="button"
              >
                {loggingOut ? 'Keluar…' : 'Keluar'}
              </button>
            </div>
          )}
        </div>
      </header>

      {mobileNavigationOpen && (
        <button
          aria-label="Tutup navigasi utama"
          className="mobile-nav-backdrop"
          onClick={() => {
            setMobileNavigationOpen(false);
            mobileNavigationTriggerRef.current?.focus();
          }}
          type="button"
        />
      )}

      <aside
        aria-label="Navigasi utama"
        aria-modal={mobileNavigationOpen ? true : undefined}
        className="sidebar"
        data-mobile-open={mobileNavigationOpen}
        id="primary-navigation"
        ref={mobileNavigationRef}
        role={mobileNavigationOpen ? 'dialog' : undefined}
      >
        <nav aria-label="Navigasi utama">
          {visibleNavigationGroups.map((group) => {
            const itemList = (
              <ul aria-label={group.label}>
                {group.items.map((item) => {
                  const active = isNavigationItemActive(item, currentPath);
                  return (
                    <li key={item.path}>
                      <a
                        aria-current={active ? 'page' : undefined}
                        className="nav-item"
                        data-active={active}
                        href={item.path}
                        onClick={(event) => handleNavigation(event, item.path)}
                      >
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            );
            const hasActiveItem = group.items.some((item) =>
              isNavigationItemActive(item, currentPath)
            );

            return group.collapsible ? (
              <details
                className="sidebar__group sidebar__group--collapsible"
                key={group.id}
                open={hasActiveItem || undefined}
              >
                <summary className="sidebar__group-label">{group.label}</summary>
                {itemList}
              </details>
            ) : (
              <div className="sidebar__group" key={group.id}>
                <p className="sidebar__group-label">{group.label}</p>
                {itemList}
              </div>
            );
          })}
        </nav>
        <div className="sidebar__footer">
          <span className="pulse" aria-hidden="true" />
          Authenticated
        </div>
      </aside>

      <main
        aria-hidden={mobileNavigationOpen || undefined}
        className="main-content"
        id="main-content"
        inert={mobileNavigationOpen}
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
};
