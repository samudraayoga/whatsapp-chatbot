import { pool } from '../src/database/connection.js';
import { AiCredentialCipher } from '../src/services/ai-credential-cipher.service.js';

type IntegrationCredentialRow = {
  id: string;
  secret_ref: string;
};

const cipher = new AiCredentialCipher();

try {
  const result = await pool.query<IntegrationCredentialRow>(
    `
      SELECT id, secret_ref
      FROM ai_integrations
      WHERE secret_ref LIKE 'env://%';
    `
  );
  let migrated = 0;
  for (const integration of result.rows) {
    const variableName = integration.secret_ref.slice('env://'.length);
    if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(variableName)) continue;
    const apiKey = process.env[variableName]?.trim();
    if (!apiKey) continue;
    const update = await pool.query(
      `
        UPDATE ai_integrations
        SET secret_ref = $2, revision = revision + 1, updated_at = NOW()
        WHERE id = $1::uuid AND secret_ref = $3;
      `,
      [integration.id, cipher.seal(apiKey), integration.secret_ref]
    );
    migrated += update.rowCount ?? 0;
  }
  process.stdout.write(`Encrypted ${migrated} AI provider credential(s).\n`);
} finally {
  await pool.end();
}
