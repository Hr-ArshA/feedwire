#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const dir = join(process.cwd(), 'db', 'migrations');
const url =
  process.env.DATABASE_URL ?? 'postgres://feedwire:feedwire@localhost:5433/feedwire';

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
  );
  const files = (await readdir(dir))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    console.log('applying', file);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      count += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(file + ': ' + error.message);
    }
  }
  console.log(count ? 'applied ' + count + ' migration(s)' : 'already up to date');
} finally {
  await client.end();
}
