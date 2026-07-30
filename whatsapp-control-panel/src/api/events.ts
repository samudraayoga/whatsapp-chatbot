import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  overviewResponseSchema,
  type SessionResponse
} from './contracts';
import { overviewQueryKey, sessionQueryKey } from './queries';

export type StreamState = 'connecting' | 'live' | 'polling';
const isMockMode =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true';

export const useOperationalEvents = (enabled: boolean): StreamState => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>(
    typeof EventSource === 'undefined' || isMockMode ? 'polling' : 'connecting'
  );

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined' || isMockMode) {
      return;
    }

    const source = new EventSource('/api/admin/v1/events/stream', {
      withCredentials: true
    });
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
