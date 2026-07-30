import { useSyncExternalStore } from 'react';

const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};

const snapshot = () =>
  `${window.location.pathname}${window.location.search}`;

export const useLocationPath = () =>
  useSyncExternalStore(subscribe, snapshot, () => '/');

export const navigate = (path: string, replace = false) => {
  if (replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const safeReturnPath = (search: string): string => {
  const value = new URLSearchParams(search).get('returnTo');
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/overview';
};
