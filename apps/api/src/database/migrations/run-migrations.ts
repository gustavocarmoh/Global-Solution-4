import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
dotenv.config();

/**
 * Aplica, em ordem alfabética, todos os arquivos .sql desta pasta que ainda não
 * foram registrados em schema_migrations. Cada arquivo roda em sua própria transação.
 */
export async function runMigrations(existingPool?: Pool): Promise<void> {
  const pool =
    existingPool ??
    new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'cidade_em_foco',
    });

  const files = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );

    for (const file of files) {
      const already = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file],
      );
      if (already.rows.length > 0) continue;

      const sql = fs.readFileSync(path.join(__dirname, file), 'utf-8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`[Migrations] ${file} aplicado com sucesso.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrations] Erro ao executar ${file}:`, err);
        throw err;
      }
    }
  } finally {
    client.release();
    if (!existingPool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runMigrations().catch(() => process.exit(1));
}
