import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../mocks/server';
import { setOverviewScenario } from '../mocks/scenario';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  setOverviewScenario('healthy');
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterAll(() => server.close());
