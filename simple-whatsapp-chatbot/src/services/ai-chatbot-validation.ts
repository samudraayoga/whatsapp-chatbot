import { AppError } from '../middleware/error.middleware.js';
import type {
  AiFeatureFlags,
  CreateAiPromptInput,
  RetrievalSettings,
  UpdateAiIntegrationInput
} from './ai-chatbot.service.js';

const asRecord = (value: unknown, field = 'body'): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(`${field} must be an object`, 400, 'AI_REQUEST_INVALID');
  }
  return value as Record<string, unknown>;
};

const stringField = (
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): string => {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    throw new AppError(
      `${field} must be between ${min} and ${max} characters`,
      400,
      'AI_REQUEST_INVALID',
      { field }
    );
  }
  return value.trim();
};

const integerField = (
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): number => {
  const value = record[field];
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new AppError(
      `${field} must be an integer between ${min} and ${max}`,
      400,
      'AI_REQUEST_INVALID',
      { field }
    );
  }
  return value as number;
};

const numberField = (
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): number => {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new AppError(
      `${field} must be a number between ${min} and ${max}`,
      400,
      'AI_REQUEST_INVALID',
      { field }
    );
  }
  return value;
};

const booleanField = (record: Record<string, unknown>, field: string): boolean => {
  if (typeof record[field] !== 'boolean') {
    throw new AppError(
      `${field} must be a boolean`,
      400,
      'AI_REQUEST_INVALID',
      { field }
    );
  }
  return record[field] as boolean;
};

const nullableNumber = (
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
  integer = false
): number | null => {
  const value = record[field];
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    value < min ||
    value > max
  ) {
    throw new AppError(
      `${field} must be null or a number between ${min} and ${max}`,
      400,
      'AI_REQUEST_INVALID',
      { field }
    );
  }
  return value;
};

const parseRetrieval = (value: unknown): RetrievalSettings => {
  const record = asRecord(value, 'retrieval');
  const finalContextCount = integerField(record, 'finalContextCount', 1, 10);
  const topK = integerField(record, 'topK', 1, 20);
  if (finalContextCount > topK) {
    throw new AppError(
      'retrieval.finalContextCount cannot exceed retrieval.topK',
      400,
      'AI_REQUEST_INVALID',
      { field: 'retrieval.finalContextCount' }
    );
  }
  return {
    topK,
    finalContextCount,
    minimumSimilarity: nullableNumber(record, 'minimumSimilarity', 0, 1),
    maximumContextTokens: nullableNumber(
      record,
      'maximumContextTokens',
      1,
      100_000,
      true
    ),
    keywordSearchEnabled: booleanField(record, 'keywordSearchEnabled'),
    rerankerEnabled: booleanField(record, 'rerankerEnabled')
  };
};

const parseFeatureFlags = (value: unknown): AiFeatureFlags => {
  const record = asRecord(value, 'featureFlags');
  return {
    documentUpload: booleanField(record, 'documentUpload'),
    autoHandoff: booleanField(record, 'autoHandoff'),
    analytics: booleanField(record, 'analytics')
  };
};

const providerIdentifier = (value: string, field: string): string => {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
    throw new AppError(
      `${field} contains unsupported characters`,
      400,
      'AI_REQUEST_INVALID',
      { field }
    );
  }
  return value;
};

const secretReference = (record: Record<string, unknown>): string | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(record, 'secretReference')) {
    return undefined;
  }
  const value = record.secretReference;
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > 500 ||
    !/^(env|vault|aws-secretsmanager|gcp-secretmanager|azure-keyvault):\/\/[A-Za-z0-9._/:-]+$/.test(
      value
    )
  ) {
    throw new AppError(
      'secretReference must be null or an approved secret-manager URI',
      400,
      'AI_SECRET_REFERENCE_INVALID',
      { field: 'secretReference' }
    );
  }
  return value;
};

const providerApiKey = (
  record: Record<string, unknown>
): string | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(record, 'apiKey')) return undefined;
  const value = record.apiKey;
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.trim().length < 8 ||
    value.length > 500 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new AppError(
      'apiKey must be null or between 8 and 500 printable characters',
      400,
      'AI_API_KEY_INVALID',
      { field: 'apiKey' }
    );
  }
  return value.trim();
};

export const parseIntegrationUpdate = (value: unknown): UpdateAiIntegrationInput => {
  const record = asRecord(value);
  if (record.strictGrounding !== true) {
    throw new AppError(
      'strictGrounding must remain true',
      400,
      'AI_STRICT_GROUNDING_REQUIRED'
    );
  }
  const parsedSecretReference = secretReference(record);
  const parsedApiKey = providerApiKey(record);
  if (parsedSecretReference !== undefined && parsedApiKey !== undefined) {
    throw new AppError(
      'apiKey and secretReference cannot be changed together',
      400,
      'AI_CREDENTIAL_INPUT_CONFLICT'
    );
  }
  return {
    expectedRevision: integerField(record, 'expectedRevision', 1, 2_147_483_647),
    name: stringField(record, 'name', 3, 150),
    provider: providerIdentifier(stringField(record, 'provider', 1, 50), 'provider'),
    chatModel: providerIdentifier(stringField(record, 'chatModel', 1, 100), 'chatModel'),
    embeddingProvider: providerIdentifier(
      stringField(record, 'embeddingProvider', 1, 50),
      'embeddingProvider'
    ),
    embeddingModel: providerIdentifier(
      stringField(record, 'embeddingModel', 1, 100),
      'embeddingModel'
    ),
    embeddingDimensions: nullableNumber(
      record,
      'embeddingDimensions',
      1,
      10_000,
      true
    ),
    ...(parsedSecretReference !== undefined
      ? { secretReference: parsedSecretReference }
      : {}),
    ...(parsedApiKey !== undefined ? { apiKey: parsedApiKey } : {}),
    strictGrounding: true,
    maxResponseTokens: integerField(record, 'maxResponseTokens', 50, 2000),
    temperature: numberField(record, 'temperature', 0, 1),
    timeoutMs: integerField(record, 'timeoutMs', 500, 60_000),
    retryCount: integerField(record, 'retryCount', 0, 3),
    retrieval: parseRetrieval(record.retrieval),
    featureFlags: parseFeatureFlags(record.featureFlags)
  };
};

export const parsePromptCreate = (value: unknown): CreateAiPromptInput => {
  const record = asRecord(value);
  const disclaimer = record.disclaimerText;
  if (
    disclaimer !== null &&
    disclaimer !== undefined &&
    (typeof disclaimer !== 'string' || disclaimer.length > 2000)
  ) {
    throw new AppError(
      'disclaimerText must be null or at most 2000 characters',
      400,
      'AI_REQUEST_INVALID',
      { field: 'disclaimerText' }
    );
  }
  return {
    name: stringField(record, 'name', 3, 150),
    primaryLanguage: stringField(record, 'primaryLanguage', 2, 20),
    tone: stringField(record, 'tone', 2, 50),
    systemInstruction: stringField(record, 'systemInstruction', 50, 30_000),
    fallbackMessage: stringField(record, 'fallbackMessage', 10, 2000),
    handoffMessage: stringField(record, 'handoffMessage', 10, 2000),
    disclaimerText:
      typeof disclaimer === 'string' ? disclaimer.trim() || null : null,
    maxAnswerLength: integerField(record, 'maxAnswerLength', 50, 4000)
  };
};

export const parseLifecycleRequest = (value: unknown): {
  expectedVersion: number;
  changeReason: string;
} => {
  const record = asRecord(value);
  return {
    expectedVersion: integerField(record, 'expectedVersion', 1, 2_147_483_647),
    changeReason: stringField(record, 'changeReason', 5, 500)
  };
};

export const parseDeactivateRequest = (value: unknown): {
  expectedRevision: number;
  reason: string;
} => {
  const record = asRecord(value);
  return {
    expectedRevision: integerField(record, 'expectedRevision', 1, 2_147_483_647),
    reason: stringField(record, 'reason', 5, 500)
  };
};

export const parseActivationRequest = (value: unknown): {
  expectedRevision: number;
} => {
  const record = asRecord(value);
  if (record.acknowledgement !== 'ACTIVATE_STRICT_GROUNDED_AI') {
    throw new AppError(
      'Activation acknowledgement is invalid',
      400,
      'AI_ACTIVATION_ACKNOWLEDGEMENT_INVALID'
    );
  }
  return {
    expectedRevision: integerField(record, 'expectedRevision', 1, 2_147_483_647)
  };
};

export const requireUuid = (value: unknown, field: string): string => {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new AppError(`${field} must be a valid UUID`, 400, 'AI_REQUEST_INVALID', {
      field
    });
  }
  return value;
};
