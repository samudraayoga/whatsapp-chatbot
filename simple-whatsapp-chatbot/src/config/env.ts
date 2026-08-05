import dotenv from 'dotenv';
import type { BootstrapAdminConfig } from '../auth/types.js';

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
  ADMIN_BOOTSTRAP_ACCOUNTS: readonly BootstrapAdminConfig[];
  ADMIN_SESSION_TTL_HOURS: number;
  SAFETY_RESET_ENABLED: boolean;
  TRUST_PROXY_HOPS: number;
  ADMIN_ALLOWED_ORIGINS: string[];
  AI_CHATBOT_ENABLED: boolean;
  AI_CHATBOT_STRICT_GROUNDING: boolean;
  AI_CHATBOT_DEFAULT_TENANT_ID: string | null;
  AI_CHATBOT_DEFAULT_TENANT_SLUG: string;
  AI_CHATBOT_DEFAULT_TENANT_NAME: string;
  AI_CHATBOT_PROVIDER: string | null;
  AI_CHATBOT_CHAT_MODEL: string | null;
  AI_CHATBOT_EMBEDDING_MODEL: string | null;
  AI_CHATBOT_PROVIDER_SECRET_REF: string | null;
  AI_CHATBOT_PROVIDER_BASE_URL: string;
  AI_CHATBOT_ALPHA_RUNTIME_ENABLED: boolean;
  REDIS_URL: string | null;
  OBJECT_STORAGE_ENDPOINT: string | null;
  OBJECT_STORAGE_BUCKET: string | null;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_ACCESS_KEY: string | null;
  OBJECT_STORAGE_SECRET_KEY: string | null;
  AI_DOCUMENT_MAX_BYTES: number;
  AI_DOCUMENT_WORKER_CONCURRENCY: number;
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
const optionalEnv = (value: string | undefined): string | null =>
  value?.trim() || null;
const booleanEnv = (name: string, fallback: boolean): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be either true or false`);
};
const bootstrapAccounts = [
  {
    envPrefix: 'ADMIN_BOOTSTRAP',
    username: process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() || 'admin',
    password:
      process.env.ADMIN_BOOTSTRAP_PASSWORD ??
      (nodeEnv === 'production' ? '' : 'admin123'),
    displayName:
      process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME?.trim() || 'Local Admin'
  },
  {
    envPrefix: 'SUPERADMIN_BOOTSTRAP',
    username: process.env.SUPERADMIN_BOOTSTRAP_USERNAME?.trim() || 'superadmin',
    password:
      process.env.SUPERADMIN_BOOTSTRAP_PASSWORD ??
      (nodeEnv === 'production' ? '' : 'superadmin123'),
    displayName:
      process.env.SUPERADMIN_BOOTSTRAP_DISPLAY_NAME?.trim() || 'SUPERADMIN'
  }
] as const;
const adminSessionTtlHours = Number(
  process.env.ADMIN_SESSION_TTL_HOURS ?? 8
);
const trustProxyHops = Number(
  process.env.TRUST_PROXY_HOPS ?? (nodeEnv === 'production' ? 1 : 0)
);
const port = Number(process.env.PORT ?? 3000);
const postgresPort = Number(process.env.POSTGRES_PORT);
const aiChatbotEnabled = booleanEnv('AI_CHATBOT_ENABLED', false);
const aiChatbotStrictGrounding = booleanEnv(
  'AI_CHATBOT_STRICT_GROUNDING',
  true
);
const aiChatbotDefaultTenantId = optionalEnv(
  process.env.AI_CHATBOT_DEFAULT_TENANT_ID
);
const aiChatbotDefaultTenantSlug =
  optionalEnv(process.env.AI_CHATBOT_DEFAULT_TENANT_SLUG) ?? 'raho';
const aiChatbotDefaultTenantName =
  optionalEnv(process.env.AI_CHATBOT_DEFAULT_TENANT_NAME) ?? 'RAHO';
const aiChatbotProvider = optionalEnv(process.env.AI_CHATBOT_PROVIDER);
const aiChatbotChatModel = optionalEnv(process.env.AI_CHATBOT_CHAT_MODEL);
const aiChatbotEmbeddingModel = optionalEnv(
  process.env.AI_CHATBOT_EMBEDDING_MODEL
);
const aiChatbotProviderSecretRef = optionalEnv(
  process.env.AI_CHATBOT_PROVIDER_SECRET_REF
);
const aiChatbotProviderBaseUrl = optionalEnv(
  process.env.AI_CHATBOT_PROVIDER_BASE_URL
) ?? 'https://api.openai.com/v1';
const aiChatbotAlphaRuntimeEnabled = booleanEnv(
  'AI_CHATBOT_ALPHA_RUNTIME_ENABLED',
  false
);
const aiDocumentMaxBytes = Number(process.env.AI_DOCUMENT_MAX_BYTES ?? 10 * 1024 * 1024);
const aiDocumentWorkerConcurrency = Number(
  process.env.AI_DOCUMENT_WORKER_CONCURRENCY ?? 2
);

for (const account of bootstrapAccounts) {
  if (!account.password || account.password.length > 256) {
    throw new Error(
      `${account.envPrefix}_PASSWORD is required and must be at most 256 characters`
    );
  }

  if (
    nodeEnv === 'production' &&
    (account.password.length < 16 || account.password.startsWith('CHANGE_ME_'))
  ) {
    throw new Error(
      `${account.envPrefix}_PASSWORD must be at least 16 characters and must not use the deployment placeholder`
    );
  }

  if (account.username.length > 100) {
    throw new Error(
      `${account.envPrefix}_USERNAME must be at most 100 characters`
    );
  }

  if (account.displayName.length > 150) {
    throw new Error(
      `${account.envPrefix}_DISPLAY_NAME must be at most 150 characters`
    );
  }
}

if (
  new Set(bootstrapAccounts.map(({ username }) => username)).size !==
  bootstrapAccounts.length
) {
  throw new Error('Bootstrap admin usernames must be unique');
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

if (
  aiChatbotDefaultTenantId &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    aiChatbotDefaultTenantId
  )
) {
  throw new Error('AI_CHATBOT_DEFAULT_TENANT_ID must be a valid UUID');
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(aiChatbotDefaultTenantSlug)) {
  throw new Error(
    'AI_CHATBOT_DEFAULT_TENANT_SLUG must use lowercase letters, numbers, and hyphens'
  );
}

if (aiChatbotDefaultTenantName.length > 150) {
  throw new Error('AI_CHATBOT_DEFAULT_TENANT_NAME must be at most 150 characters');
}

if (
  aiChatbotProviderSecretRef &&
  !/^(env|vault|aws-secretsmanager|gcp-secretmanager|azure-keyvault):\/\/[A-Za-z0-9._/:-]+$/.test(
    aiChatbotProviderSecretRef
  )
) {
  throw new Error(
    'AI_CHATBOT_PROVIDER_SECRET_REF must be an approved secret-manager URI'
  );
}

try {
  const providerUrl = new URL(aiChatbotProviderBaseUrl);
  if (!['http:', 'https:'].includes(providerUrl.protocol)) throw new Error();
  if (nodeEnv === 'production' && providerUrl.protocol !== 'https:') throw new Error();
} catch {
  throw new Error(
    'AI_CHATBOT_PROVIDER_BASE_URL must be a valid HTTP URL (HTTPS in production)'
  );
}

if (nodeEnv === 'production' && aiChatbotAlphaRuntimeEnabled) {
  throw new Error('AI_CHATBOT_ALPHA_RUNTIME_ENABLED must remain false in production');
}

if (aiChatbotEnabled) {
  throw new Error(
    'AI_CHATBOT_ENABLED must remain false until safety, evaluation, and customer release gates are approved'
  );
}

if (!Number.isInteger(aiDocumentMaxBytes) || aiDocumentMaxBytes < 1 || aiDocumentMaxBytes > 50 * 1024 * 1024) {
  throw new Error('AI_DOCUMENT_MAX_BYTES must be an integer between 1 and 52428800');
}

if (!Number.isInteger(aiDocumentWorkerConcurrency) || aiDocumentWorkerConcurrency < 1 || aiDocumentWorkerConcurrency > 10) {
  throw new Error('AI_DOCUMENT_WORKER_CONCURRENCY must be an integer between 1 and 10');
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
  ADMIN_BOOTSTRAP_ACCOUNTS: bootstrapAccounts.map(
    ({ username, password, displayName }) => ({ username, password, displayName })
  ),
  ADMIN_SESSION_TTL_HOURS: adminSessionTtlHours,
  SAFETY_RESET_ENABLED:
    process.env.SAFETY_RESET_ENABLED?.trim().toLowerCase() === 'true',
  TRUST_PROXY_HOPS: trustProxyHops,
  ADMIN_ALLOWED_ORIGINS: (process.env.ADMIN_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  AI_CHATBOT_ENABLED: aiChatbotEnabled,
  AI_CHATBOT_STRICT_GROUNDING: aiChatbotStrictGrounding,
  AI_CHATBOT_DEFAULT_TENANT_ID: aiChatbotDefaultTenantId,
  AI_CHATBOT_DEFAULT_TENANT_SLUG: aiChatbotDefaultTenantSlug,
  AI_CHATBOT_DEFAULT_TENANT_NAME: aiChatbotDefaultTenantName,
  AI_CHATBOT_PROVIDER: aiChatbotProvider,
  AI_CHATBOT_CHAT_MODEL: aiChatbotChatModel,
  AI_CHATBOT_EMBEDDING_MODEL: aiChatbotEmbeddingModel,
  AI_CHATBOT_PROVIDER_SECRET_REF: aiChatbotProviderSecretRef,
  AI_CHATBOT_PROVIDER_BASE_URL: aiChatbotProviderBaseUrl.replace(/\/$/, ''),
  AI_CHATBOT_ALPHA_RUNTIME_ENABLED: aiChatbotAlphaRuntimeEnabled,
  REDIS_URL: optionalEnv(process.env.REDIS_URL),
  OBJECT_STORAGE_ENDPOINT: optionalEnv(process.env.OBJECT_STORAGE_ENDPOINT),
  OBJECT_STORAGE_BUCKET: optionalEnv(process.env.OBJECT_STORAGE_BUCKET),
  OBJECT_STORAGE_REGION: optionalEnv(process.env.OBJECT_STORAGE_REGION) ?? 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY: optionalEnv(
    process.env.OBJECT_STORAGE_ACCESS_KEY ?? process.env.MINIO_ROOT_USER
  ),
  OBJECT_STORAGE_SECRET_KEY: optionalEnv(
    process.env.OBJECT_STORAGE_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD
  ),
  AI_DOCUMENT_MAX_BYTES: aiDocumentMaxBytes,
  AI_DOCUMENT_WORKER_CONCURRENCY: aiDocumentWorkerConcurrency
};
