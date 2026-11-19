# Feedwire — multi-user RSS reader

A self-hosted RSS reader built on **Nuxt 4**, **PostgreSQL** and **Redis**.
There is a public landing page showing the Hacker News front page, and a
personal reader behind a login where each account can subscribe to any
RSS/Atom feed.

Items are embedded locally with `Xenova/bge-m3`, so search works semantically
in both English and Persian — no API calls, no cloud.

## The shared-pool model (why nobody re-vectorises)

Feeds and items are **global**, not per user:

| Table | Scope | Holds |
| ----- | ----- | ----- |
| `feeds` | global | one row per canonical feed URL |
| `items` | global | one row per `(feed, guid)`, with its embedding |
| `subscriptions` | per user | which global feeds a user follows |
| `user_items` | per user | `is_read` / `is_favorite` for one user |

If two people add the same feed, the second one only inserts a row in
`subscriptions`. The items and their 1024-dimension vectors are already there
and are reused as-is; the background indexer only ever touches rows where
`embedding IS NULL`. Feed URLs are canonicalised first (tracking parameters
removed, trailing slashes and host casing normalised), so
`https://news.ycombinator.com/rss/?utm_source=x` and
`https://news.ycombinator.com/rss` resolve to the same feed.

Removing a feed only deletes the caller's subscription. The shared feed is
kept for everyone else, and is garbage-collected only when it has no
subscribers left and is not the public feed.

## Features

- Public homepage with the Hacker News feed — no account required.
- Email/password registration and login (scrypt hashes, httpOnly session
  cookies, sessions cached in Redis).
- Per-user feeds, read/unread state, favourites and "mark all read".
- **Reader view**: click a story to read its full text and images inside
  Feedwire (`/item/:id`). The extracted article is stored once on the shared
  `items` row, so two users opening the same link never download or embed it
  twice. A per-user toggle switches between "Read here" and "Original".
- **Google News feeds**: entries whose link is
  `news.google.com/rss/articles/…` are resolved to the real publisher URL
  before extraction (`server/utils/google-news.js`). The redirect is decoded
  through Google's `batchexecute` endpoint, cached in Redis for a week and
  stored on `items.resolved_link`, so a story is only resolved once.
- **Export**: from the reader, download the article as HTML, Markdown or plain
  text (`/api/items/:id/export?format=…`), or print it to PDF from the
  chrome-free `/print/:id` page.
- **Persian translation**: one click splits the article into sub-4000-character
  chunks, translates them with Google Translate and opens the `فارسی` tab. The
  result is stored once per `(item, language)` and shared.
- **Offline**: installable PWA (manifest + service worker) plus an IndexedDB
  copy of every story you open, readable at `/saved` without a connection.
- **OPML**: import and export subscriptions from the settings page.
- **Settings** (`/settings`): device-local appearance (light/dark/system theme,
  accent colour, font family, text size) plus OPML import/export and per-feed
  management. Feeds are picked from a dropdown in the reader, and the
  All/Unread/Favorites + read-here/original filters live in a dialog.
- Hybrid search: PostgreSQL full-text (`tsvector`, Persian-normalised) fused
  with vector similarity via Reciprocal Rank Fusion. Once a story has been
  opened, its body text is indexed and embedded too, so searches match phrases
  that never appear in the headline.
- Automatic topic categories (Technology, Security, Science, Business, World,
  Culture, Health, Design, Gaming) assigned at index time.
- Keyboard shortcuts: `j`/`k` navigate, `o` open, `m` read, `f` favourite,
  `r` refresh, `/` search.
- Dark/light UI following the system colour scheme.

## Requirements

- Node.js **24+**
- Docker (for PostgreSQL and Redis)
- ~600 MB disk for the embedding model

## Run it

```bash
npm install
npm run fetch-model      # downloads Xenova/bge-m3 into ./models (~590 MB)
npm run db:up            # starts PostgreSQL 17 + Redis via docker compose
npm run build
npm start                # http://localhost:3000
```

For development use `npm run dev` (Nuxt dev server with HMR on port 3000).

### Configuration

Copy `.env.example` to `.env` and adjust if needed.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DATABASE_URL` | `postgres://feedwire:feedwire@localhost:5433/feedwire` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6380` | Redis connection |
| `SESSION_SECRET` | dev placeholder | reserved for signing secrets |
| `PUBLIC_FEED_URL` | `https://news.ycombinator.com/rss` | the anonymous homepage feed |
| `FEEDWIRE_ROOT` | `process.cwd()` | where `models/` lives |

Docker maps PostgreSQL to **5433** and Redis to **6380** to avoid clashing
with anything already running on the default ports.

## How it works

- `server/plugins/boot.js` — waits for PostgreSQL, creates the schema, ensures
  the public feed exists, then starts the embedding worker.
- `server/utils/db.js` — connection pool, schema, and a `dot_product()` SQL
  function used for vector ranking.
- `server/utils/feeds.js` — URL canonicalisation, feed upsert, item upsert
  (`ON CONFLICT DO NOTHING`), read model and hybrid search.
- `server/utils/indexer.js` — background loop that embeds items and assigns
  categories, batching 6 at a time; a second pass embeds article bodies after
  they are extracted.
- `server/utils/article.js` — Readability + linkedom extraction, sanitised
  with an allow-list, images rewritten to `/api/proxy/image`.
- `server/utils/article-store.js` — single-flight download per story, cached
  in `items.content_*` and shared across users.
- `server/utils/google-news.js` — turns opaque Google News RSS links into the
  publisher URL (batchexecute + markup fallback, Redis cache).
- `server/utils/safe-fetch.js` — SSRF guard (DNS + private/link-local/CGNAT
  checks on every redirect hop) used by feeds, articles and the image proxy.
- `server/utils/translate.js` — chunking (< 4000 chars), Google Translate calls,
  single-flight and persistence in `translations`.
- `public/sw.js` + `public/manifest.webmanifest` — PWA shell, runtime caching
  and offline navigation fallback.
- `app/lib/local-db.js` — IndexedDB store of opened articles (and their
  translations) for offline reading.
- `server/utils/embeddings.js` — Transformers.js + `Xenova/bge-m3` (ONNX, q8,
  CPU) plus the bilingual category exemplars.
- `server/utils/redis.js` — cache helpers and the login rate limiter.
- `server/api/**` — Nitro endpoints (auth, feeds, items, categories, index).
- `app/` — Nuxt app: `pages/index.vue` (public), `pages/login.vue`,
  `pages/register.vue`, `pages/reader.vue`, plus shadcn-vue primitives in
  `app/components/ui/`.

### Schema

```sql
users(id, email UNIQUE, password_hash, display_name, created_at)
sessions(id, user_id, token_hash UNIQUE, user_agent, created_at, expires_at)
feeds(id, url UNIQUE, title, site_url, is_public, last_fetched_at, last_error, fetch_started_at)
items(id, feed_id, guid, title, link, author, summary, comments_url,
      published_at, fetched_at, search_text, embedding real[], embedding_model,
      category, category_score, category_source,
      content_html, content_text, content_fetched_at, content_error,
      content_embedding real[], content_embedding_model,
      resolved_link, resolved_link_at, resolved_link_error,
      UNIQUE(feed_id, guid))
subscriptions(user_id, feed_id, PRIMARY KEY(user_id, feed_id))
user_items(user_id, item_id, is_read, is_favorite, PRIMARY KEY(user_id, item_id))
translations(item_id, lang, title, content_text, source, error, created_at,
             PRIMARY KEY(item_id, lang))
```

`items.search_text` is indexed with a GIN index over
`to_tsvector('simple', search_text)`; `items.embedding` is a `real[]` ranked
with `dot_product()` (vectors are L2-normalised, so dot product = cosine).
`items.content_text` has its own GIN index, and `items.content_embedding` is
ranked alongside `embedding` (the better of the two scores wins).

> The official `pgvector` image is not reachable in this environment, so the
> project ships with the portable `real[]` + SQL function approach. If you can
> pull `pgvector/pgvector`, switching the column to `vector(1024)` and adding
> an HNSW index is a drop-in upgrade.

### API

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `POST` | `/api/auth/register` | — | create account, auto-subscribe to the public feed |
| `POST` | `/api/auth/login` | — | start a session |
| `POST` | `/api/auth/logout` | yes | destroy the session |
| `GET` | `/api/auth/session` | — | current user or `null` |
| `GET` | `/api/public/items` | — | public feed items + categories |
| `GET` | `/api/feeds` | yes | subscriptions with unread counts |
| `POST` | `/api/feeds` | yes | `{ "url": "…" }` — subscribe (reuses shared feed) |
| `DELETE` | `/api/feeds/:id` | yes | unsubscribe |
| `POST` | `/api/feeds/:id/refresh` | yes | refresh one feed |
| `POST` | `/api/feeds/refresh` | yes | refresh all subscriptions |
| `GET` | `/api/items` | optional | `feed`, `filter`, `q`, `mode`, `category`, `limit`, `offset` |
| `PATCH` | `/api/items/:id` | yes | `{ "isRead": bool, "isFavorite": bool }` |
| `GET` | `/api/items/:id/content` | optional | reader view: extracts + caches the article, returns sanitised HTML |
| `GET` | `/api/items/:id/export?format=html\|md\|txt` | optional | download the cached article as a file |
| `GET` | `/api/items/:id/translation?lang=fa` | optional | cached translation or `null` |
| `POST` | `/api/items/:id/translate` | optional | `{ "lang": "fa" }` — chunked Google translation, stored once |
| `GET` | `/api/proxy/image?u=` | — | same-origin image proxy for reader images (SSRF-guarded) |
| `GET` | `/api/feeds/opml` | yes | export subscriptions as OPML 2.0 |
| `POST` | `/api/feeds/opml` | yes | import OPML (`text/xml` body or `{ "xml": "…" }`) |
| `POST` | `/api/items/read-all` | yes | `{ "feedId": n?, "filter": "favorite"? }` |
| `GET` | `/api/categories` | optional | category counts |
| `GET` | `/api/index-status` | — | embedding progress |
| `POST` | `/api/reindex` | yes | re-embed everything (or `{"mode":"categories"}`) |

## Notes

- The frontend follows `design.md`: Tailwind CSS v4 utilities and shadcn-vue
  primitives only.
- `models/` is git-ignored; `npm run fetch-model` re-downloads it. Set
  `HF_TOKEN` (or put the token in `.hf-token`) if you hit rate limits.
- Feed fetching happens server-side, so the browser never hits feed URLs
  directly and CORS is a non-issue.
