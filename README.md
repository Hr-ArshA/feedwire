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
- **Mark above as read**: one click on any story marks every newer story in
  your subscriptions as read (`POST /api/items/read-above`).
- **Explore** (`/explore`): an Instagram-style grid of hand-picked feeds across
  technology, security, world news, science, business, design, culture, gaming
  and Persian tech. Each tile shows how many readers on this server already
  follow it, with a tag filter and search; adding one reuses the shared feed,
  so a feed nobody has to download twice is never vectorised twice.
- **Password reset**: `/forgot` and `/reset` with single-use, hashed tokens
  that expire after an hour. Every existing session is signed out when the
  password changes.
- **Background refresh**: a scheduler polls every feed on the interval its
  subscribers chose (15 min … once a day, or paused), so the reader is fresh
  without pressing Refresh. A shared feed is fetched as often as its most
  eager subscriber asked; pausing only affects that one account.
- Searchable feed and topic lists: the feed picker has an in-dropdown search,
  and topics live in the filters dialog (plus the desktop sidebar) with an
  English/Persian label search.
- **Reader view**: click a story to read its full text and images inside
  Feedwire (`/item/:id`). The extracted article is stored once on the shared
  `items` row, so two users opening the same link never download or embed it
  twice. A per-user toggle switches between "Read here" and "Original".
- **Google News feeds**: entries whose link is
  `news.google.com/rss/articles/…` are resolved to the real publisher URL
  before extraction (`server/utils/google-news.js`). The redirect is decoded
  through Google's `batchexecute` endpoint, cached in Redis for a week and
  stored on `items.resolved_link`, so a story is only resolved once. Google's
  `google.com/url?q=…` wrappers are unwrapped and its "Redirect Notice"
  interstitial is followed, so the notice text is never stored as the article.
- **Blocked publishers (BBC)**: when a feed host is unreachable from the
  current network (BBC resets connections from Iranian IPs), the feed is loaded
  through a Google News search mirror and labelled "(via Google News)". Article
  pages fall back to Google's translate proxy, so BBC stories still open in the
  reader instead of failing.
- **Export**: from the reader, download the article as HTML, Markdown or plain
  text (`/api/items/:id/export?format=…`), or print it to PDF from the
  chrome-free `/print/:id` page.
- **Translation export**: once a story is translated, export the Persian text
  as HTML, Markdown, plain text or PDF (`/api/items/:id/export?format=…&lang=fa`,
  or the print page with `?lang=fa`). Filenames are RFC 5987-encoded so Persian
  titles download correctly.
- **Retry and partial previews**: a story that a publisher blocked can be
  re-fetched with "Try again" (`POST /api/items/:id/refresh-content`). If it is
  still blocked, the feed summary is stored as a clearly-labelled preview
  instead of an empty error screen.
- **Popular feeds**: the add-feed dialog suggests a curated list (Hacker News,
  Lobsters, Ars Technica, BBC, Al Jazeera, NASA, Google News, …) with a check
  mark for feeds you already follow.
- **Feed discovery**: paste a website (or just `example.com`) and Feedwire
  finds its `<link rel="alternate">` feed, or probes `/feed`, `/rss.xml`,
  `/atom.xml` and friends, before subscribing.
- **Sharing**: every story has a share menu for Telegram, X, WhatsApp,
  LinkedIn, Facebook, Reddit and email, plus copy-link and Instagram
  (copy + open).
- **SEO**: server-rendered titles, descriptions, Open Graph/Twitter cards,
  canonical URLs and `NewsArticle` JSON-LD on every public story, plus
  `/robots.txt` and a `/sitemap.xml` limited to public items. Private pages are
  `noindex`.
- **Persian translation**: one click splits the article into sub-4000-character
  chunks, translates them with Google Translate and opens the `فارسی` tab. The
  result is stored once per `(item, language)` and shared.
- **Offline**: installable PWA (manifest + service worker) plus an IndexedDB
  copy of every story you open, readable at `/saved` without a connection.
- **OPML**: import and export subscriptions from the settings page.
- **Admin dashboard** (`/admin`): operators get account and feed management
  plus the indexing pipeline at a glance. `ADMIN_EMAILS` decides who is an
  operator; if nobody is, the oldest account is promoted once.
- **Settings** (`/settings`): device-local appearance (light/dark/system theme,
  accent colour, font family, text size) plus OPML import/export and per-feed
  management. On desktop the sidebar lists every feed with its unread counter
  and a search box; on mobile the same list is the feed dropdown. The
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

### With Docker (everything in one command)

`Dockerfile` builds the Nuxt bundle and downloads the embedding model at build
time, so the container is self-contained:

```bash
docker compose up --build      # app on http://localhost:3000, db + redis included
```

The `app` service waits for PostgreSQL and Redis health checks, then starts
Nitro. Set `SESSION_SECRET` and `PUBLIC_SITE_URL` in `.env` for a real
deployment; `HF_TOKEN` is optional and only used while downloading the model.
PostgreSQL and Redis stay published on **5433** and **6380** for local tools.

> The image is based on `node:24-bookworm-slim`. If your Docker daemon cannot
> reach Docker Hub (a `403 Forbidden` on `registry-1.docker.io`), point Docker
> at a working mirror or pre-pull the base image before running the build.

### Configuration

Copy `.env.example` to `.env` and adjust if needed.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DATABASE_URL` | `postgres://feedwire:feedwire@localhost:5433/feedwire` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6380` | Redis connection |
| `SESSION_SECRET` | dev placeholder | reserved for signing secrets |
| `PUBLIC_FEED_URL` | `https://news.ycombinator.com/rss` | the anonymous homepage feed |
| `PUBLIC_SITE_URL` | `http://localhost:3000` | absolute origin for canonical URLs, Open Graph and the sitemap |
| `ADMIN_EMAILS` | empty | comma-separated accounts that get `/admin`; empty promotes the oldest account once |
| `SCHEDULER_ENABLED` | `true` | set to `false` to disable background feed polling |
| `RESET_WEBHOOK_URL` | empty | POST `{ to, subject, resetUrl }` here to deliver password-reset mail |
| `RESET_LINK_IN_RESPONSE` | local only | return the reset link in the API response; on by default for localhost deployments with no webhook |
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
- `server/api/**` — Nitro endpoints (auth, feeds, items, categories, index,
  admin). `/api/admin/*` is guarded by `requireAdmin()`.
- `server/utils/admin.js` — operator bootstrap (`ADMIN_EMAILS`), dashboard
  aggregates and the account/feed queries behind the admin API.
- `shared/feed-catalog.js` — the curated feed catalog shared by the add-feed
  dialog, `/explore` and the API, plus the canonical `feedKey()` comparison.
- `app/` — Nuxt app: `pages/index.vue` (public), `pages/explore.vue`,
  `pages/login.vue`, `pages/register.vue`, `pages/forgot.vue`,
  `pages/reset.vue`, `pages/reader.vue`, plus shadcn-vue primitives in
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
password_resets(token_hash PRIMARY KEY, user_id, expires_at, created_at)
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
| `POST` | `/api/auth/forgot` | — | `{ "email": "…" }` — issue a single-use reset link (always answers `ok`) |
| `POST` | `/api/auth/reset` | — | `{ "token": "…", "password": "…" }` — set a new password, sign out old sessions |
| `POST` | `/api/auth/logout` | yes | destroy the session |
| `GET` | `/api/auth/session` | — | current user or `null` |
| `GET` | `/api/explore` | optional | curated catalog with subscriber counts + `subscribed` flags |
| `GET` | `/api/public/items` | — | public feed items + categories |
| `GET` | `/api/feeds` | yes | subscriptions with unread counts |
| `POST` | `/api/feeds` | yes | `{ "url": "…" }` — subscribe (reuses shared feed) |
| `DELETE` | `/api/feeds/:id` | yes | unsubscribe |
| `POST` | `/api/feeds/:id/refresh` | yes | refresh one feed |
| `POST` | `/api/feeds/refresh` | yes | refresh all subscriptions |
| `GET` | `/api/items` | optional | `feed`, `filter`, `q`, `mode`, `category`, `limit`, `offset` |
| `PATCH` | `/api/items/:id` | yes | `{ "isRead": bool, "isFavorite": bool }` |
| `GET` | `/api/items/:id/content` | optional | reader view: extracts + caches the article, returns sanitised HTML |
| `POST` | `/api/items/:id/refresh-content` | optional | force a re-download after a block or partial preview |
| `GET` | `/api/items/:id/export?format=html\|md\|txt[&lang=fa]` | optional | download the article, or its translation, as a file |
| `GET` | `/api/items/:id/translation?lang=fa` | optional | cached translation or `null` |
| `POST` | `/api/items/:id/translate` | optional | `{ "lang": "fa" }` — chunked Google translation, stored once |
| `GET` | `/api/proxy/image?u=` | — | same-origin image proxy for reader images (SSRF-guarded) |
| `GET` | `/api/health` | — | liveness probe used by Docker Compose |
| `GET` | `/robots.txt` | — | crawler rules (private app surfaces disallowed) |
| `GET` | `/sitemap.xml` | — | public landing page + public stories |
| `GET` | `/api/feeds/opml` | yes | export subscriptions as OPML 2.0 |
| `POST` | `/api/feeds/opml` | yes | import OPML (`text/xml` body or `{ "xml": "…" }`) |
| `POST` | `/api/items/read-all` | yes | `{ "feedId": n?, "filter": "favorite"? }` |
| `POST` | `/api/items/read-above` | yes | `{ "itemId": n }` — mark every newer story as read |
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
