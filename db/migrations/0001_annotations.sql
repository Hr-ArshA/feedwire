-- Read later, tags, notes and highlights.
-- Idempotent, so it is safe to run against a database created by the inline
-- baseline schema in server/utils/db.js.
ALTER TABLE user_items
  ADD COLUMN IF NOT EXISTS is_read_later boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS item_tags (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id, tag)
);

CREATE TABLE IF NOT EXISTS item_notes (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  note       text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS item_highlights (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quote      text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
