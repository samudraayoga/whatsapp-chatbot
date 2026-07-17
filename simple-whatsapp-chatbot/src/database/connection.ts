import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD
});

pool.on('error', (error: Error) => {
  logger.error('Database pool error', { error: error.message });
});

export const connectDatabase = async (): Promise<void> => {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connected');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    logger.error('Failed to connect to database', { error: message });
    throw error;
  }
};

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

export const closeDatabase = async (): Promise<void> => {
  await pool.end();
};
