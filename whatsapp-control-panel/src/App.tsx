import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from './layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import {
  currentAdminQueryKey,
  overviewQueryKey,
  useCurrentAdminQuery,
  useOverviewQuery
} from './api/queries';
import { LoginPage } from './pages/LoginPage';
import { ApiClientError, sessionExpiredEvent } from './api/client';
import { logout } from './api/auth';
import { navigate, useLocationPath } from './routing/navigation';
import { SessionPage } from './pages/SessionPage';
import { useOperationalEvents } from './api/events';
import { InboxPage } from './pages/InboxPage';
import { ContactsPage } from './pages/ContactsPage';
import { OutboxPage } from './pages/OutboxPage';
import { MessageDetailPage } from './pages/MessageDetailPage';
import { ComposePage } from './pages/ComposePage';
import { ChatbotRulesPage } from './pages/ChatbotRulesPage';
import { SafetyCenterPage } from './pages/SafetyCenterPage';

export const App = () => {
  const locationPath = useLocationPath();
  const pathname = locationPath.split('?')[0];
  const queryClient = useQueryClient();
  const adminQuery = useCurrentAdminQuery();
  const overviewQuery = useOverviewQuery({
    enabled: Boolean(adminQuery.data)
  });
  const streamState = useOperationalEvents(Boolean(adminQuery.data));
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.removeQueries({ queryKey: currentAdminQueryKey });
      queryClient.removeQueries({ queryKey: overviewQueryKey });
      navigate('/login', true);
    }
  });

  useEffect(() => {
    const handleSessionExpired = () => {
      queryClient.removeQueries({ queryKey: currentAdminQueryKey });
      queryClient.removeQueries({ queryKey: overviewQueryKey });
      navigate(
        `/login?returnTo=${encodeURIComponent(pathname)}&reason=session_expired`,
        true
      );
    };
    window.addEventListener(sessionExpiredEvent, handleSessionExpired);
    return () =>
      window.removeEventListener(sessionExpiredEvent, handleSessionExpired);
  }, [pathname, queryClient]);

  useEffect(() => {
    if (
      !adminQuery.isPending &&
      !adminQuery.data &&
      pathname !== '/login'
    ) {
      const reason =
        adminQuery.error instanceof ApiClientError &&
        adminQuery.error.status === 401
          ? '&reason=session_expired'
          : '';
      navigate(
        `/login?returnTo=${encodeURIComponent(pathname)}${reason}`,
        true
      );
    }
  }, [adminQuery.data, adminQuery.error, adminQuery.isPending, pathname]);

  useEffect(() => {
    if (adminQuery.data && (pathname === '/' || pathname === '/login')) {
      navigate('/overview', true);
    }
  }, [adminQuery.data, pathname]);

  if (adminQuery.isPending) {
    return (
      <main className="login-page" aria-live="polite">
        <section className="page-state">
          <span className="loader" aria-hidden="true" />
          <h1>Memeriksa session…</h1>
        </section>
      </main>
    );
  }

  if (!adminQuery.data) {
    return (
      <LoginPage
        sessionExpired={
          new URLSearchParams(locationPath.split('?')[1] ?? '').get('reason') ===
          'session_expired'
        }
      />
    );
  }

  return (
    <AppShell
      sessionState={overviewQuery.data?.data.session.state ?? 'loading'}
      risk={overviewQuery.data?.data.safety.risk ?? 'unknown'}
      user={adminQuery.data.data}
      loggingOut={logoutMutation.isPending}
      onLogout={() => logoutMutation.mutate()}
      currentPath={pathname}
    >
      {pathname === '/overview' || pathname === '/' ? (
        <OverviewPage user={adminQuery.data.data} />
      ) : pathname === '/inbox' ||
        pathname === '/inbox/follow-ups' ||
        /^\/inbox\/\d+$/.test(pathname) ? (
        <InboxPage
          pathname={pathname}
          user={adminQuery.data.data}
          overview={overviewQuery.data?.data}
        />
      ) : pathname === '/contacts' || /^\/contacts\/\d+$/.test(pathname) ? (
        <ContactsPage pathname={pathname} />
      ) : pathname === '/messages/outbox' ? (
        <OutboxPage user={adminQuery.data.data} />
      ) : pathname === '/messages/compose' ? (
        <ComposePage
          user={adminQuery.data.data}
          overview={overviewQuery.data?.data}
        />
      ) : /^\/messages\/[0-9a-f-]{36}$/i.test(pathname) ? (
        <MessageDetailPage
          messageId={pathname.slice('/messages/'.length)}
          user={adminQuery.data.data}
        />
      ) : pathname === '/operations/session' ? (
        <SessionPage user={adminQuery.data.data} streamState={streamState} />
      ) : pathname === '/operations/safety' ? (
        <SafetyCenterPage user={adminQuery.data.data} />
      ) : pathname === '/chatbot/rules' &&
        adminQuery.data.data.permissions.includes('chatbot.manage') ? (
        <ChatbotRulesPage />
      ) : (
        <section className="page-state page-state--error">
          <p className="eyebrow">404</p>
          <h1>Halaman tidak ditemukan</h1>
          <button type="button" onClick={() => navigate('/overview')}>
            Kembali ke overview
          </button>
        </section>
      )}
    </AppShell>
  );
};
