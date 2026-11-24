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

  -- Operators get the admin dashboard. Everyone else is a normal reader.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
  CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

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

  -- How often the background scheduler re-fetches a feed for this subscriber.
  -- 0 pauses polling for that user without affecting anyone else.
  ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS fetch_interval_minutes integer NOT NULL DEFAULT 30;

  -- Last time we tried to fetch, successful or not. The scheduler measures the
  -- interval from here so a permanently failing feed is not retried every tick.
  ALTER TABLE feeds ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

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

  -- Google News RSS links are opaque redirects; the publisher URL they point
  -- to is resolved once and cached here so every reader reuses it.
  ALTER TABLE items ADD COLUMN IF NOT EXISTS resolved_link text;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS resolved_link_at timestamptz;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS resolved_link_error text;

  -- When a publisher blocks automated reading, the feed summary is stored as a
  -- partial preview so the story is still readable in-app.
  ALTER TABLE items ADD COLUMN IF NOT EXISTS content_partial boolean NOT NULL DEFAULT false;

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

  -- Single-use password reset tokens. Only the SHA-256 of the token is stored,
  -- so a database leak cannot be replayed against the login form.
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);
  CREATE INDEX IF NOT EXISTS password_resets_expires_idx ON password_resets(expires_at);

  -- Operator actions are recorded so the dashboard can show who changed what.
  -- The actor id is nulled when that account is removed, the email is kept.
  CREATE TABLE IF NOT EXISTS admin_audit (
    id          bigserial PRIMARY KEY,
    actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_email text,
    action      text NOT NULL,
    target      text,
    detail      jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS admin_audit_created_idx
    ON admin_audit(created_at DESC, id DESC);

  -- Who opened a story in the reader. One row per (reader, story), so the
  -- "N readers" figure counts people rather than page loads.
  CREATE TABLE IF NOT EXISTS item_views (
    item_id         bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_opened_at timestamptz NOT NULL DEFAULT now(),
    last_opened_at  timestamptz NOT NULL DEFAULT now(),
    open_count      integer NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS item_views_item_idx ON item_views(item_id);
  CREATE INDEX IF NOT EXISTS item_views_user_idx ON item_views(user_id);

  -- Denormalised engagement counters, kept in sync by the triggers below so
  -- every list row can show them without an aggregate per story.
  ALTER TABLE items ADD COLUMN IF NOT EXISTS reader_count integer NOT NULL DEFAULT 0;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

  CREATE OR REPLACE FUNCTION sync_reader_count() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      UPDATE items SET reader_count = reader_count + 1 WHERE id = NEW.item_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE items SET reader_count = GREATEST(reader_count - 1, 0)
       WHERE id = OLD.item_id;
    END IF;
    RETURN NULL;
  END $$;

  CREATE OR REPLACE FUNCTION sync_like_count() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_favorite THEN
        UPDATE items SET like_count = like_count + 1 WHERE id = NEW.item_id;
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      IF OLD.is_favorite THEN
        UPDATE items SET like_count = GREATEST(like_count - 1, 0)
         WHERE id = OLD.item_id;
      END IF;
    ELSIF NEW.is_favorite IS DISTINCT FROM OLD.is_favorite THEN
      UPDATE items
         SET like_count = GREATEST(
               like_count + CASE WHEN NEW.is_favorite THEN 1 ELSE -1 END, 0)
       WHERE id = NEW.item_id;
    END IF;
    RETURN NULL;
  END $$;

  DROP TRIGGER IF EXISTS item_views_counters ON item_views;
  CREATE TRIGGER item_views_counters
    AFTER INSERT OR DELETE ON item_views
    FOR EACH ROW EXECUTE FUNCTION sync_reader_count();

  DROP TRIGGER IF EXISTS user_items_like_counters ON user_items;
  CREATE TRIGGER user_items_like_counters
    AFTER INSERT OR UPDATE OR DELETE ON user_items
    FOR EACH ROW EXECUTE FUNCTION sync_like_count();

  -- Heal counters written before the triggers existed.
  UPDATE items i
     SET like_count = c.total
    FROM (
      SELECT item_id, count(*)::int AS total
        FROM user_items WHERE is_favorite GROUP BY item_id
    ) c
   WHERE c.item_id = i.id AND i.like_count <> c.total;

  -- Last time a device used its session, so the account page can list them.
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

  -- Machine summary of a story, produced once and shared like the body.
  ALTER TABLE items ADD COLUMN IF NOT EXISTS summary_ai text;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS summary_ai_at timestamptz;
  ALTER TABLE items ADD COLUMN IF NOT EXISTS summary_ai_engine text;

  -- "Read later" is deliberately separate from favourite: a favourite is a
  -- like you share with other readers, read-later is a private queue.
  ALTER TABLE user_items
    ADD COLUMN IF NOT EXISTS is_read_later boolean NOT NULL DEFAULT false;
  CREATE INDEX IF NOT EXISTS user_items_read_later_idx
    ON user_items(user_id) WHERE is_read_later;

  -- Personal labels on a story. One row per (reader, story, tag).
  CREATE TABLE IF NOT EXISTS item_tags (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag        text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id, tag)
  );
  CREATE INDEX IF NOT EXISTS item_tags_user_tag_idx ON item_tags(user_id, tag);

  -- One free-form note per (reader, story).
  CREATE TABLE IF NOT EXISTS item_notes (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    note       text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
  );

  -- Highlights quote a passage of the story; the optional note is the reader's
  -- own comment on that passage.
  CREATE TABLE IF NOT EXISTS item_highlights (
    id         bigserial PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quote      text NOT NULL,
    note       text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS item_highlights_item_idx
    ON item_highlights(user_id, item_id);

  -- Web Push subscriptions. A device is identified by its endpoint.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id             bigserial PRIMARY KEY,
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint       text NOT NULL UNIQUE,
    p256dh         text NOT NULL,
    auth           text NOT NULL,
    user_agent     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_success_at timestamptz,
    last_error     text
  );
  CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
    ON push_subscriptions(user_id);

  -- Per-subscription push opt-in. A feed only notifies the readers who asked.
  ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS notify boolean NOT NULL DEFAULT false;

  -- Small key/value store for server-owned settings that must survive a
  -- restart, such as the generated VAPID key pair for Web Push.
  CREATE TABLE IF NOT EXISTS app_settings (
    key        text PRIMARY KEY,
    value      text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`;

/**
 * pgvector is optional: when the extension is present (pgvector/pgvector
 * image) semantic search uses an HNSW index instead of a linear scan over
 * real[]. When it is missing the app keeps working on the real[] columns.
 */
let vectorReady = null;

export async function ensureVectorSchema() {
  if (vectorReady !== null) return vectorReady;
  try {
    await query('CREATE EXTENSION IF NOT EXISTS vector');
    await query(
      'ALTER TABLE items ADD COLUMN IF NOT EXISTS embedding_vec vector(1024)'
    );
    await query(
      'ALTER TABLE items ADD COLUMN IF NOT EXISTS content_embedding_vec vector(1024)'
    );
    await query(
      `CREATE INDEX IF NOT EXISTS items_embedding_hnsw
         ON items USING hnsw (embedding_vec vector_cosine_ops)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS items_content_embedding_hnsw
         ON items USING hnsw (content_embedding_vec vector_cosine_ops)`
    );
    vectorReady = true;
  } catch {
    vectorReady = false;
  }
  return vectorReady;
}

export function vectorEnabled() {
  return vectorReady === true;
}

export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = query(SCHEMA)
      .then(() => ensureVectorSchema())
      .catch((error) => {
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
