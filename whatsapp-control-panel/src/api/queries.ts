import { useQuery } from '@tanstack/react-query';
import { getOverview } from './client';
import { getCurrentAdmin } from './auth';
import { getSession } from './session';

export const overviewQueryKey = ['overview'] as const;
export const currentAdminQueryKey = ['admin-session'] as const;
export const sessionQueryKey = ['whatsapp-session'] as const;

export const useOverviewQuery = (options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: overviewQueryKey,
    queryFn: getOverview,
    enabled: options.enabled ?? true,
    refetchInterval: 10_000
  });

export const useSessionQuery = () =>
  useQuery({
    queryKey: sessionQueryKey,
    queryFn: getSession,
    refetchInterval: 10_000
  });

export const useCurrentAdminQuery = () =>
  useQuery({
    queryKey: currentAdminQueryKey,
    queryFn: getCurrentAdmin,
    retry: false,
    staleTime: 30_000
  });
