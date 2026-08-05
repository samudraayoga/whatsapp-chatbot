import type { QueryClient } from '@tanstack/react-query';
import type { AdminSessionResponse } from './contracts';
import { currentAdminQueryKey } from './queries';

/**
 * Remove every piece of server state that may belong to the previous admin.
 * Cancelling first prevents a late response from repopulating the cache after
 * the authenticated boundary has changed.
 */
export const replaceAuthenticatedCache = async (
  queryClient: QueryClient,
  adminSession: AdminSessionResponse | null
): Promise<void> => {
  await queryClient.cancelQueries();
  queryClient.clear();
  queryClient.setQueryData<AdminSessionResponse | null>(
    currentAdminQueryKey,
    adminSession
  );
};
