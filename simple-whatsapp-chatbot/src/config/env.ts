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

if (!adminBootstrapPassword || adminBootstrapPassword.length > 256) {
  throw new Error(
    'ADMIN_BOOTSTRAP_PASSWORD is required and must be at most 256 characters'
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

export const env: EnvConfig = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT ?? 3000),
  POSTGRES_HOST: process.env.POSTGRES_HOST!,
  POSTGRES_PORT: Number(process.env.POSTGRES_PORT!),
  POSTGRES_DB: process.env.POSTGRES_DB!,
  POSTGRES_USER: process.env.POSTGRES_USER!,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD!,
  API_KEY: process.env.API_KEY!,
  WA_AUTH_PATH: process.env.WA_AUTH_PATH!,
  ADMIN_BOOTSTRAP_USERNAME: adminBootstrapUsername,
  ADMIN_BOOTSTRAP_PASSWORD: adminBootstrapPassword,
  ADMIN_BOOTSTRAP_DISPLAY_NAME: adminBootstrapDisplayName,
  ADMIN_SESSION_TTL_HOURS: adminSessionTtlHours
};
