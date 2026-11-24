-- Web Push subscriptions and per-feed opt-in.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error      text
);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS notify boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
