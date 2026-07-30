import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  overviewResponseSchema,
  type SessionResponse
} from './contracts';
import { overviewQueryKey, sessionQueryKey } from './queries';
import { resolveApiUrl } from './client';

export type StreamState = 'connecting' | 'live' | 'polling';

export const useOperationalEvents = (enabled: boolean): StreamState => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>(
    typeof EventSource === 'undefined' ? 'polling' : 'connecting'
  );

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource(
      resolveApiUrl('/api/admin/v1/events/stream'),
      {
        withCredentials: true
      }
    );
    source.onopen = () => setState('live');
    source.onerror = () => {
      setState('polling');
      void queryClient.invalidateQueries({ queryKey: overviewQueryKey });
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    };
    source.addEventListener('overview', (event) => {
      try {
        const overview = overviewResponseSchema.parse(
          JSON.parse((event as MessageEvent<string>).data)
        );
        queryClient.setQueryData(overviewQueryKey, overview);
        const session: SessionResponse = {
          data: {
            session: overview.data.session,
            readiness: overview.data.readiness
          },
          meta: overview.meta
        };
        queryClient.setQueryData(sessionQueryKey, session);
        setState('live');
      } catch {
        setState('polling');
      }
    });

    return () => source.close();
  }, [enabled, queryClient]);

  return state;
};
