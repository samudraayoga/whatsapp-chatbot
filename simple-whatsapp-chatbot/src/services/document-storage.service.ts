import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { AppError } from '../middleware/error.middleware.js';

export interface DocumentObjectStorage {
  readonly available: boolean;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class S3DocumentObjectStorage implements DocumentObjectStorage {
  readonly available = true;
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      endpoint: string;
      region: string;
      accessKey: string;
      secretKey: string;
    }
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKey,
        secretAccessKey: options.secretKey
      }
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    }));
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    }));
    if (!result.Body) {
      throw new AppError('Stored document has no content', 500, 'DOCUMENT_STORAGE_EMPTY');
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export class DisabledDocumentObjectStorage implements DocumentObjectStorage {
  readonly available = false;

  async put(): Promise<void> {
    throw new AppError('Document object storage is not configured', 503, 'DOCUMENT_STORAGE_UNAVAILABLE');
  }

  async get(): Promise<Buffer> {
    throw new AppError('Document object storage is not configured', 503, 'DOCUMENT_STORAGE_UNAVAILABLE');
  }

  async delete(): Promise<void> {
    throw new AppError('Document object storage is not configured', 503, 'DOCUMENT_STORAGE_UNAVAILABLE');
  }
}

export const createDocumentObjectStorage = (config: {
  endpoint: string | null;
  bucket: string | null;
  region: string;
  accessKey: string | null;
  secretKey: string | null;
}): DocumentObjectStorage =>
  config.endpoint && config.bucket && config.accessKey && config.secretKey
    ? new S3DocumentObjectStorage(config.bucket, {
        endpoint: config.endpoint,
        region: config.region,
        accessKey: config.accessKey,
        secretKey: config.secretKey
      })
    : new DisabledDocumentObjectStorage();
