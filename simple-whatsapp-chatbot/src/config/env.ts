import dotenv from 'dotenv';

dotenv.config();

type EnvConfig = {
  NODE_ENV: string;
  PORT: number;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_DB: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  API_KEY: string;
  WA_AUTH_PATH: string;
  ADMIN_BOOTSTRAP_USERNAME: string;
  ADMIN_BOOTSTRAP_PASSWORD: string;
  ADMIN_BOOTSTRAP_DISPLAY_NAME: string;
  ADMIN_SESSION_TTL_HOURS: number;
  SAFETY_RESET_ENABLED: boolean;
  TRUST_PROXY_HOPS: number;
  ADMIN_ALLOWED_ORIGINS: string[];
};

const requiredEnvVars = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'API_KEY',
  'WA_AUTH_PATH'
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const adminBootstrapPassword =
  process.env.ADMIN_BOOTSTRAP_PASSWORD ??
  (nodeEnv === 'production' ? '' : 'admin123');
const adminBootstrapUsername =
  process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() || 'admin';
const adminBootstrapDisplayName =
  process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME?.trim() || 'Local Admin';
const adminSessionTtlHours = Number(
  process.env.ADMIN_SESSION_TTL_HOURS ?? 8
);
const trustProxyHops = Number(
  process.env.TRUST_PROXY_HOPS ?? (nodeEnv === 'production' ? 1 : 0)
);
const port = Number(process.env.PORT ?? 3000);
const postgresPort = Number(process.env.POSTGRES_PORT);

if (!adminBootstrapPassword || adminBootstrapPassword.length > 256) {
  throw new Error(
    'ADMIN_BOOTSTRAP_PASSWORD is required and must be at most 256 characters'
  );
}

if (
  nodeEnv === 'production' &&
  (adminBootstrapPassword.length < 16 ||
    adminBootstrapPassword.startsWith('CHANGE_ME_'))
) {
  throw new Error(
    'ADMIN_BOOTSTRAP_PASSWORD must be at least 16 characters and must not use the deployment placeholder'
  );
}

if (
  nodeEnv === 'production' &&
  ((process.env.API_KEY?.length ?? 0) < 32 ||
    process.env.API_KEY?.startsWith('CHANGE_ME_'))
) {
  throw new Error(
    'API_KEY must be at least 32 characters and must not use the deployment placeholder'
  );
}

if (
  nodeEnv === 'production' &&
  ((process.env.POSTGRES_PASSWORD?.length ?? 0) < 16 ||
    process.env.POSTGRES_PASSWORD?.startsWith('CHANGE_ME_'))
) {
  throw new Error(
    'POSTGRES_PASSWORD must be at least 16 characters and must not use the deployment placeholder'
  );
}

if (adminBootstrapUsername.length > 100) {
  throw new Error('ADMIN_BOOTSTRAP_USERNAME must be at most 100 characters');
}

if (adminBootstrapDisplayName.length > 150) {
  throw new Error('ADMIN_BOOTSTRAP_DISPLAY_NAME must be at most 150 characters');
}

if (!Number.isFinite(adminSessionTtlHours) || adminSessionTtlHours <= 0) {
  throw new Error('ADMIN_SESSION_TTL_HOURS must be a positive number');
}

if (
  !Number.isInteger(trustProxyHops) ||
  trustProxyHops < 0 ||
  trustProxyHops > 10
) {
  throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
}

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

if (
  !Number.isInteger(postgresPort) ||
  postgresPort < 1 ||
  postgresPort > 65_535
) {
  throw new Error('POSTGRES_PORT must be an integer between 1 and 65535');
}

export const env: EnvConfig = {
  NODE_ENV: nodeEnv,
  PORT: port,
  POSTGRES_HOST: process.env.POSTGRES_HOST!,
  POSTGRES_PORT: postgresPort,
  POSTGRES_DB: process.env.POSTGRES_DB!,
  POSTGRES_USER: process.env.POSTGRES_USER!,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD!,
  API_KEY: process.env.API_KEY!,
  WA_AUTH_PATH: process.env.WA_AUTH_PATH!,
  ADMIN_BOOTSTRAP_USERNAME: adminBootstrapUsername,
  ADMIN_BOOTSTRAP_PASSWORD: adminBootstrapPassword,
  ADMIN_BOOTSTRAP_DISPLAY_NAME: adminBootstrapDisplayName,
  ADMIN_SESSION_TTL_HOURS: adminSessionTtlHours,
  SAFETY_RESET_ENABLED:
    process.env.SAFETY_RESET_ENABLED?.trim().toLowerCase() === 'true',
  TRUST_PROXY_HOPS: trustProxyHops,
  ADMIN_ALLOWED_ORIGINS: (process.env.ADMIN_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
};
