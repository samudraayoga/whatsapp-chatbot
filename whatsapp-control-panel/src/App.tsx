import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from './layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { useCurrentAdminQuery, useOverviewQuery } from './api/queries';
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
import { replaceAuthenticatedCache } from './api/authenticated-cache';
import { AiChatbotPage } from './pages/AiChatbotPage';
import { AiChatbotErrorBoundary } from './pages/AiChatbotErrorBoundary';

const isAiChatbotPath = (pathname: string) =>
  pathname === '/ai-chatbot' || pathname.startsWith('/ai-chatbot/');

const pageTitle = (pathname: string) => {
  if (pathname === '/login') return 'Masuk';
  if (pathname === '/overview' || pathname === '/') return 'Beranda';
  if (pathname.startsWith('/inbox')) return 'Inbox';
  if (pathname.startsWith('/contacts')) return 'Kontak';
  if (pathname === '/messages/compose') return 'Tulis pesan';
  if (pathname.startsWith('/messages')) return 'Riwayat pengiriman';
  if (pathname === '/operations/session') return 'Sesi WhatsApp';
  if (pathname === '/operations/safety') return 'Keamanan';
  if (isAiChatbotPath(pathname)) return 'Integrasi Chatbot AI';
  if (pathname.startsWith('/chatbot')) return 'Chatbot';
  return 'Halaman tidak ditemukan';
};

export const App = () => {
  const locationPath = useLocationPath();
  const pathname = locationPath.split('?')[0];
  const queryClient = useQueryClient();
  const authTransitionPending = useRef(false);
  const transitionToLogin = useCallback(
    async (target: string) => {
      if (authTransitionPending.current) return;
      authTransitionPending.current = true;
      await replaceAuthenticatedCache(queryClient, null);
      navigate(target, true);
    },
    [queryClient]
  );
  const adminQuery = useCurrentAdminQuery();
  const overviewQuery = useOverviewQuery({
    enabled: Boolean(adminQuery.data)
  });
  const streamState = useOperationalEvents(Boolean(adminQuery.data));
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => transitionToLogin('/login')
  });

  useEffect(() => {
    const handleSessionExpired = () => {
      void transitionToLogin(
        `/login?returnTo=${encodeURIComponent(pathname)}&reason=session_expired`
      );
    };
    window.addEventListener(sessionExpiredEvent, handleSessionExpired);
    return () => {
      window.removeEventListener(sessionExpiredEvent, handleSessionExpired);
    };
  }, [pathname, transitionToLogin]);

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
      void transitionToLogin(
        `/login?returnTo=${encodeURIComponent(pathname)}${reason}`
      );
    }
  }, [
    adminQuery.data,
    adminQuery.error,
    adminQuery.isPending,
    pathname,
    transitionToLogin
  ]);

  useEffect(() => {
    if (adminQuery.data) {
      authTransitionPending.current = false;
    }
  }, [adminQuery.data]);

  useEffect(() => {
    if (adminQuery.data && (pathname === '/' || pathname === '/login')) {
      navigate('/overview', true);
    }
  }, [adminQuery.data, pathname]);

  useEffect(() => {
    document.title = `${pageTitle(pathname)} · WhatsApp Control Room`;
    if (adminQuery.data) {
      const heading = document.querySelector<HTMLElement>('#main-content h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
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
      ) : isAiChatbotPath(pathname) &&
        adminQuery.data.data.permissions.includes('chatbot.manage') ? (
        <AiChatbotErrorBoundary resetKey={pathname}>
          <AiChatbotPage pathname={pathname} />
        </AiChatbotErrorBoundary>
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
