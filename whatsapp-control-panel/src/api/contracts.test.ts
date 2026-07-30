import { describe, expect, it } from 'vitest';
import { overviewResponseSchema } from './contracts';
import {
  databaseDownOverview,
  healthyOverview,
  highRiskOverview,
  qrRequiredOverview
} from '../mocks/fixtures';

describe('overviewResponseSchema', () => {
  it.each([
    ['healthy', healthyOverview],
    ['qr required', qrRequiredOverview],
    ['high risk', highRiskOverview],
    ['database down', databaseDownOverview]
  ])('accepts the %s contract fixture', (_name, fixture) => {
    expect(overviewResponseSchema.parse(fixture)).toEqual(fixture);
  });

  it('rejects warm-up progress outside normalized 0-1 range', () => {
    expect(() =>
      overviewResponseSchema.parse({
        ...healthyOverview,
        data: {
          ...healthyOverview.data,
          warmup: {
            ...healthyOverview.data.warmup!,
            progressRatio: 50
          }
        }
      })
    ).toThrow();
  });
});
