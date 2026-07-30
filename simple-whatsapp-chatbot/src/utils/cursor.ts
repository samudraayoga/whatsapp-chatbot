export type TimelineCursor = {
  occurredAt: string;
  id: string;
};

export const encodeCursor = (cursor: TimelineCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

export const decodeCursor = (value: string | undefined): TimelineCursor | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8')
    ) as Record<string, unknown>;
    if (
      typeof parsed.occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.occurredAt)) ||
      typeof parsed.id !== 'string' ||
      !/^\d+$/.test(parsed.id)
    ) {
      return null;
    }
    return { occurredAt: parsed.occurredAt, id: parsed.id };
  } catch {
    return null;
  }
};

export const escapeLikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, '\\$&');
