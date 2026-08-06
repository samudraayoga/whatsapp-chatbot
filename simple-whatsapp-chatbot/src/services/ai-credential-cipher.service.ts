import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';
import { env } from '../config/env.js';

const referencePrefix = 'encrypted://v1.';
const additionalData = Buffer.from('raho-ai-provider-credential:v1', 'utf8');

const encryptionKey = (keyMaterial: string): Buffer =>
  createHash('sha256')
    .update('raho-ai-credential-key:v1\0', 'utf8')
    .update(keyMaterial, 'utf8')
    .digest();

export const isEncryptedCredentialReference = (value: string): boolean =>
  value.startsWith(referencePrefix);

export class AiCredentialCipher {
  private readonly key: Buffer;

  constructor(keyMaterial = env.API_KEY) {
    this.key = encryptionKey(keyMaterial);
  }

  seal(apiKey: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(additionalData);
    const encrypted = Buffer.concat([
      cipher.update(apiKey, 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return `${referencePrefix}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  open(reference: string): string {
    if (!isEncryptedCredentialReference(reference)) {
      throw new Error('Provider credential reference is not encrypted');
    }
    const parts = reference.slice(referencePrefix.length).split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new Error('Encrypted provider credential is malformed');
    }
    try {
      const [iv, tag, encrypted] = parts.map((part) =>
        Buffer.from(part!, 'base64url')
      );
      if (iv!.length !== 12 || tag!.length !== 16 || !encrypted!.length) {
        throw new Error('Invalid encrypted credential length');
      }
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv!);
      decipher.setAAD(additionalData);
      decipher.setAuthTag(tag!);
      return Buffer.concat([
        decipher.update(encrypted!),
        decipher.final()
      ]).toString('utf8');
    } catch {
      throw new Error('Encrypted provider credential cannot be opened');
    }
  }
}
