import { overviewResponseSchema, type OverviewResponse } from './contracts';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
export const sessionExpiredEvent = 'admin-session-expired';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly requestId?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export const requestJson = async (
  path: string,
  init: RequestInit = {}
): Promise<unknown> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...init.headers
    }
  });

  const payload: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload.error as Record<string, unknown>)
        : undefined;

    const apiError = new ApiClientError(
      typeof errorPayload?.message === 'string'
        ? errorPayload.message
        : 'Control panel API tidak tersedia.',
      response.status,
      typeof errorPayload?.requestId === 'string' ? errorPayload.requestId : undefined
    );

    if (
      response.status === 401 &&
      !path.endsWith('/auth/login') &&
      !path.endsWith('/me')
    ) {
      window.dispatchEvent(new CustomEvent(sessionExpiredEvent));
    }

    throw apiError;
  }

  return payload;
};

export const getOverview = async (): Promise<OverviewResponse> => {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true') {
    const { getOverviewScenario } = await import('../mocks/scenario');
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    return getOverviewScenario();
  }

  return overviewResponseSchema.parse(
    await requestJson('/api/admin/v1/overview')
  );
};
