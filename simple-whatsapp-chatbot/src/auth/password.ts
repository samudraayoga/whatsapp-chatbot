import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const HASH_PREFIX = 'scrypt';

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return [
    HASH_PREFIX,
    salt.toString('base64url'),
    derivedKey.toString('base64url')
  ].join('$');
};

export const verifyPassword = async (
  password: string,
  storedHash: string
): Promise<boolean> => {
  const [prefix, saltValue, keyValue] = storedHash.split('$');

  if (prefix !== HASH_PREFIX || !saltValue || !keyValue) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const storedKey = Buffer.from(keyValue, 'base64url');
    const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;

    return (
      storedKey.length === derivedKey.length &&
      timingSafeEqual(storedKey, derivedKey)
    );
  } catch {
    return false;
  }
};
