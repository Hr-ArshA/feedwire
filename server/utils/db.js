import pg from 'pg';

const { Pool } = pg;

let pool = null;
let schemaPromise = null;

export function getPool() {
  if (!pool) {
    const config = useRuntimeConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (error) => {
      console.error('[db] idle client error:', error.message);
    });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email          text NOT NULL UNIQUE,
    password_hash  text NOT NULL,
    display_name   text NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  text NOT NULL UNIQUE,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS feeds (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    url              text NOT NULL UNIQUE,
    title            text NOT NULL DEFAULT '',
    site_url         text,
    is_public        boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_fetched_at  timestamptz,
    last_error       text,
    fetch_started_at timestamptz
  );

  CREATE TABLE IF NOT EXISTS items (
    id               bigserial PRIMARY KEY,
    feed_id          uuid NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    guid             text NOT NULL,
    title            text NOT NULL DEFAULT '',
    link             text,
    author           text,
    summary          text,
    comments_url     text,
    published_at     timestamptz,
    fetched_at       timestamptz NOT NULL DEFAULT now(),
    search_text      text NOT NULL DEFAULT '',
    embedding        real[],
    embedding_model  text,
    category         text,
    category_score   real,
    category_source  text NOT NULL DEFAULT 'auto',
    UNIQUE (feed_id, guid)
  );
  CREATE INDEX IF NOT EXISTS items_feed_idx ON items(feed_id);
  CREATE INDEX IF NOT EXISTS items_published_idx
    ON items(published_at DESC NULLS LAST, id DESC);
  CREATE INDEX IF NOT EXISTS items_pending_idx ON items(id) WHERE embedding IS NULL;
  CREATE INDEX IF NOT EXISTS items_search_idx
    ON items USING gin (to_tsvector('simple', search_text));

  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feed_id    uuid NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, feed_id)
  );
  CREATE INDEX IF NOT EXISTS subscriptions_feed_idx ON subscriptions(feed_id);

  CREATE TABLE IF NOT EXISTS user_items (
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id     bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    is_read     boolean NOT NULL DEFAULT false,
    is_favorite boolean NOT NULL DEFAULT false,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
  );
  CREATE INDEX IF NOT EXISTS user_items_item_idx ON user_items(item_id);

  CREATE OR REPLACE FUNCTION dot_product(a real[], b real[])
  RETURNS double precision
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT COALESCE(SUM(x * y), 0)::double precision
    FROM unnest(a, b) AS t(x, y)
  $$;

  -- Full-article reading mode: the extracted body of a story, cached once and
  -- shared by every user who opens it.
  ALTER TABLE items ADD COLUMN IF NOT EXISTS content_html text;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS content_text text;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS content_fetched_at timestamptz;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS content_error text;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS content_embedding real[];
  ALTER TABLE items ADD COLUMN IF NOT EXISTS content_embedding_model text;

  CREATE INDEX IF NOT EXISTS items_content_pending_idx
    ON items(id) WHERE content_embedding IS NULL AND content_text IS NOT NULL;

  CREATE INDEX IF NOT EXISTS items_content_search_idx
    ON items USING gin (to_tsvector('simple', coalesce(content_text, '')));

  -- Machine translations are shared like the article body: one row per
  -- (story, language), produced once and reused by every reader.
  CREATE TABLE IF NOT EXISTS translations (
    item_id      bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    lang         text NOT NULL,
    title        text,
    content_text text,
    source       text NOT NULL DEFAULT 'google',
    error        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, lang)
  );
`;

export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = query(SCHEMA).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
