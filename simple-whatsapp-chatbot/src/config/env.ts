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

export const env: EnvConfig = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
  POSTGRES_HOST: process.env.POSTGRES_HOST!,
  POSTGRES_PORT: Number(process.env.POSTGRES_PORT!),
  POSTGRES_DB: process.env.POSTGRES_DB!,
  POSTGRES_USER: process.env.POSTGRES_USER!,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD!,
  API_KEY: process.env.API_KEY!,
  WA_AUTH_PATH: process.env.WA_AUTH_PATH!
};
