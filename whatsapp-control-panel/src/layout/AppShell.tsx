import { useState, type ReactNode } from 'react';
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

const riskTone: Record<AppShellProps['risk'], StatusTone> = {
  unknown: 'neutral',
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger'
};

const navigation = [
  { label: 'Overview', path: '/overview', enabled: true },
  { label: 'Inbox', path: '/inbox', enabled: true },
  { label: 'Contacts', path: '/contacts', enabled: true },
  { label: 'Messages', enabled: false },
  { label: 'Operations', path: '/operations/session', enabled: true },
  { label: 'Chatbot', enabled: false },
  { label: 'Settings', enabled: false }
];

const initials = (displayName: string) =>
  displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export const AppShell = ({
  children,
  sessionState,
  risk,
  user,
  loggingOut,
  onLogout,
  currentPath
}: AppShellProps) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/overview" aria-label="WhatsApp Control Panel">
          <span className="brand__mark" aria-hidden="true">
            W
          </span>
          <span>
            <strong>Control Room</strong>
            <small>WhatsApp Operations</small>
          </span>
        </a>
        <div className="topbar__status" aria-label="Status operasional">
          <StatusBadge tone="info">Development</StatusBadge>
          <StatusBadge tone={sessionTone[sessionState]}>
            Session: {sessionState.replaceAll('_', ' ')}
          </StatusBadge>
          <StatusBadge tone={riskTone[risk]}>Risk: {risk}</StatusBadge>
        </div>
        <div className="user-menu">
          <button
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            className="avatar-button"
            onClick={() => setUserMenuOpen((open) => !open)}
            type="button"
          >
            <span className="sr-only">Buka menu pengguna</span>
            {initials(user.displayName)}
          </button>
          {userMenuOpen && (
            <div className="user-menu__panel" role="menu">
              <strong>{user.displayName}</strong>
              <span>@{user.username} · {user.role}</span>
              <button
                disabled={loggingOut}
                onClick={onLogout}
                role="menuitem"
                type="button"
              >
                {loggingOut ? 'Keluar…' : 'Keluar'}
              </button>
            </div>
          )}
        </div>
      </header>

      <aside className="sidebar" aria-label="Navigasi utama">
        <nav>
          <ul>
            {navigation.map((item) => (
              <li key={item.label}>
                <button
                  className="nav-item"
                  data-active={
                    item.path === currentPath ||
                    (item.path !== '/overview' &&
                      Boolean(item.path && currentPath.startsWith(`${item.path}/`)))
                  }
                  disabled={!item.enabled}
                  onClick={() => item.path && navigate(item.path)}
                  type="button"
                >
                  {item.label}
                  {!item.enabled && <span>soon</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar__footer">
          <span className="pulse" aria-hidden="true" />
          Authenticated · Sprint 3
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
};
