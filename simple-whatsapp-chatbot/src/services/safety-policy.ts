export type SafetyReasonCode =
  | 'MANUAL_PAUSE'
  | 'HEALTH_AUTO_PAUSE'
  | 'RECOVERY_PAUSED'
  | 'RECOVERY_DEAD'
  | 'TIMELOCK_ACTIVE'
  | 'WARMUP_LIMIT'
  | 'RATE_LIMIT'
  | 'CONTACT_POLICY'
  | 'TOPOLOGY_POLICY'
  | 'REPLY_RATIO_POLICY'
  | 'RECONNECT_THROTTLE'
  | 'CIRCUIT_BREAKER'
  | 'INSTANCE_POOL_LIMIT'
  | 'GROUP_RATE_LIMIT'
  | 'SAFETY_POLICY_BLOCK';

const policyCopy: Record<
  SafetyReasonCode,
  { message: string; recommendation: string }
> = {
  MANUAL_PAUSE: {
    message: 'Sending dihentikan manual oleh Operator atau Admin.',
    recommendation: 'Tunggu Admin meninjau kondisi lalu menjalankan guarded resume.'
  },
  HEALTH_AUTO_PAUSE: {
    message: 'Health risk mencapai ambang auto-pause.',
    recommendation: 'Periksa alasan health dan tunggu risk turun sebelum resume.'
  },
  RECOVERY_PAUSED: {
    message: 'Account masih berada dalam mandatory recovery pause.',
    recommendation: 'Jangan bypass timer. Tunggu recovery period selesai.'
  },
  RECOVERY_DEAD: {
    message: 'Recovery menandai account tidak aman untuk digunakan.',
    recommendation: 'Jangan mengirim. Ikuti proses penggantian nomor/session.'
  },
  TIMELOCK_ACTIVE: {
    message: 'WhatsApp reachout timelock masih aktif.',
    recommendation: 'Tunggu expiry; jangan reset untuk melewati timelock.'
  },
  WARMUP_LIMIT: {
    message: 'Budget warm-up hari ini sudah habis.',
    recommendation: 'Tunggu budget hari berikutnya dan pertahankan ramp bertahap.'
  },
  RATE_LIMIT: {
    message: 'Rate atau identical-message policy memblokir pengiriman.',
    recommendation: 'Kurangi frekuensi/duplikasi dan tunggu window rate pulih.'
  },
  CONTACT_POLICY: {
    message: 'Contact graph policy memblokir target ini.',
    recommendation: 'Gunakan engagement organik; jangan bypass contact policy.'
  },
  TOPOLOGY_POLICY: {
    message: 'Topology risk untuk contact baru terlalu tinggi.',
    recommendation: 'Kurangi ekspansi contact baru dan tunggu topology pulih.'
  },
  REPLY_RATIO_POLICY: {
    message: 'Reply-ratio cooldown sedang aktif.',
    recommendation: 'Tunggu balasan atau cooldown selesai.'
  },
  RECONNECT_THROTTLE: {
    message: 'Pengiriman dibatasi setelah reconnect.',
    recommendation: 'Tunggu reconnect ramp selesai.'
  },
  CIRCUIT_BREAKER: {
    message: 'Circuit breaker target sedang terbuka.',
    recommendation: 'Tunggu cooldown target dan periksa kegagalan sebelumnya.'
  },
  INSTANCE_POOL_LIMIT: {
    message: 'Shared instance rate pool sedang penuh.',
    recommendation: 'Tunggu slot pool tersedia.'
  },
  GROUP_RATE_LIMIT: {
    message: 'Group rate limit tercapai.',
    recommendation: 'Tunggu rate window group pulih.'
  },
  SAFETY_POLICY_BLOCK: {
    message: 'Anti-ban policy memblokir pengiriman.',
    recommendation: 'Periksa Safety Center sebelum mencoba kembali.'
  }
};

export const safetyReasonCopy = (code: SafetyReasonCode) => ({
  code,
  ...policyCopy[code]
});

export const classifySafetySendError = (
  error: unknown
): ReturnType<typeof safetyReasonCopy> | null => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (!normalized.includes('[baileys-antiban]')) return null;

  let code: SafetyReasonCode = 'SAFETY_POLICY_BLOCK';
  if (normalized.includes('circuit-breaker')) code = 'CIRCUIT_BREAKER';
  else if (normalized.includes('health risk')) code = 'HEALTH_AUTO_PAUSE';
  else if (normalized.includes('ban recovery')) code = 'RECOVERY_PAUSED';
  else if (normalized.includes('reachout timelocked')) code = 'TIMELOCK_ACTIVE';
  else if (normalized.includes('warm-up limit')) code = 'WARMUP_LIMIT';
  else if (normalized.includes('contact graph')) code = 'CONTACT_POLICY';
  else if (normalized.includes('topology')) code = 'TOPOLOGY_POLICY';
  else if (normalized.includes('reply ratio')) code = 'REPLY_RATIO_POLICY';
  else if (normalized.includes('reconnect throttle')) code = 'RECONNECT_THROTTLE';
  else if (normalized.includes('instance rate pool')) code = 'INSTANCE_POOL_LIMIT';
  else if (normalized.includes('group rate limit')) code = 'GROUP_RATE_LIMIT';
  else if (
    normalized.includes('rate limit') ||
    normalized.includes('identical message')
  ) {
    code = 'RATE_LIMIT';
  }
  return safetyReasonCopy(code);
};
