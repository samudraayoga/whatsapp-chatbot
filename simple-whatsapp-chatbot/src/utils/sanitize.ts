const jidPattern =
  /(?:[a-z0-9._:+-]+)@(?:s\.whatsapp\.net|lid|g\.us|newsletter|broadcast)/gi;
const phonePattern = /(?<![a-z0-9])\+?\d[\d\s().-]{6,}\d(?![a-z0-9])/gi;
const secretPattern =
  /\b(authorization|api[-_ ]?key|token|secret|password)\b\s*[:=]\s*[^\s,;]+/gi;

export const sanitizeOperationalError = (
  error: unknown,
  fallback = 'Unknown operational error'
): string => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback;

  return (
    raw
      .replace(jidPattern, '[redacted-jid]')
      .replace(phonePattern, '[redacted-phone]')
      .replace(secretPattern, '$1=[redacted]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500) || fallback
  );
};
