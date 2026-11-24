# Design rules — Feedwire frontend

These rules are binding for every UI change in this repository. Read them before
touching anything under `app/`.

## Rule 0 — Where things live

The app is Nuxt 4: pages in `app/pages/`, layouts in `app/layouts/`,
composables in `app/composables/`, shared components in `app/components/`, and
the single stylesheet in `app/assets/css/main.css`. `@` and `~` resolve to
`app/`. Server code lives under `server/` and never contains styling.

## Rule 1 — Tailwind CSS + shadcn-vue only

The frontend is built **exclusively** with:

- **Tailwind CSS v4** (`tailwindcss`, `@tailwindcss/vite`) for all styling.
- **shadcn-vue** components living in `app/components/ui/` for every control
  (buttons, inputs, badges, scroll areas, tooltips, toggle groups, …).

Do not introduce any other UI or styling approach. Concretely, never add:

- a second component library (Element Plus, Vuetify, PrimeVue, Naive, …),
- a CSS framework or preprocessor (Bootstrap, Bulma, UnoCSS, Sass, Less, …),
- hand-written stylesheets or `<style>` blocks inside `.vue` files,
- inline `style="…"` attributes or programmatic style edits,
- CSS-in-JS, CSS modules, or `!important` overrides fighting Tailwind.

### Where styles are allowed

1. Tailwind utility classes in `class="…"` / `:class="…"`.
2. `app/assets/css/main.css` — the single global entry point. It may only contain the
   Tailwind imports (`@import 'tailwindcss'`), the `@custom-variant` /
   `@theme inline` mappings, the `:root` and `.dark` design tokens, and the
   minimal `@layer base` resets that Tailwind itself expects.
3. `app/lib/categories.js` — maps category ids to token-based utility strings,
   so components stay free of colour literals.
4. `app/lib/appearance.js` — maps accent ids to token-based swatch classes and
   lists the theme / font / size options.

### Tokens

Every colour, radius and shadow comes from the CSS variables in `:root` /
`.dark` (shadcn naming: `--background`, `--foreground`, `--primary`, `--card`,
`--border`, `--ring`, `--muted`, `--destructive`, plus the project extras
`--star` and `--cat-*`). Use them through their Tailwind names (`bg-primary`,
`text-muted-foreground`, `border-border`, `text-[var(--star)]`, …) — never a
raw hex/rgb value in a component.

## Rule 2 — Never leave this template

Layout, spacing scale, radii, typography and the orange (`--primary`) accent are
fixed. New UI is expressed by composing existing primitives and tokens:

- Adding a control → add the shadcn-vue primitive under `app/components/ui/`
  first, style it with tokens, then use it.
- Needing a new shade → add a token to `:root` **and** `.dark` in
  `app/assets/css/main.css`, then consume it. Do not patch colours ad hoc.
- Reaching for a one-off hack (`style="…"`, a new `.css` file, a `<style>`
  block, a second library) is a design regression, not a shortcut.

`design.md` is the contract. If a change would violate it, change the plan —
not this file. Any intentional amendment has to be written here first.

## Rule 3 — Article reader view

`app/pages/item/[id].vue` renders sanitised article HTML with `v-html` inside a
single container. That markup comes from the outside world, so it is styled
**only** through Tailwind child variants on the container (`[&_p]:my-3`,
`[&_img]:rounded-lg`, `[&_a]:text-primary`, …). Never add a `<style>` block, a
`.prose` stylesheet or per-tag CSS to style article bodies — extend the
child-variant list on the container instead.

Article HTML is sanitised server-side and every image is rewritten to
`/api/proxy/image?u=…`. The frontend never fetches an article or image URL
directly, and the "Read here" / "Original" choice is a shadcn toggle group, not
a bespoke control.

The link a story shows and the link it is fetched from are always the
publisher's own URL: `items.resolved_link` must never hold a Google redirect
wrapper (`google.com/url?q=`) or a `*.translate.goog` proxy address, and the
"Redirect Notice" interstitial is followed rather than stored. The repair runs
in `server/utils/article-store.js` whenever a row is read, so old data heals on
its own.

Exports are served by `server/api/items/[id]/export.get.js` and are **document
artifacts**, not app UI: the standalone HTML file may carry its own minimal
stylesheet. PDF is produced by the browser from the `/print/:id` page, which
uses the same Tailwind child variants plus `print:` utilities and must never
include the app chrome (`print:hidden`).

## Rule 4 — Mobile first

Every screen must work on a 360 px viewport before it is considered done:

- Controls keep their label from `sm:` upward; below that they fall back to an
  icon plus a short word (`hidden sm:inline` / `sm:hidden`), never to a
  horizontal scrollbar on the page.
- The reader sidebar collapses its feed list behind a `Feeds` toggle on small
  screens (`lg:pointer-events-none` keeps it always open on desktop).
- Article prose, translation text and the offline library use the same card
  radius, spacing scale and tokens as the rest of the app.
- The translation tab renders with `dir="rtl"` and the app font; it is a tab
  next to `Article`, not a separate page.

## Rule 5 — Adding feeds, topics and mobile chrome

Adding a feed is an **action**, not a form that lives on the page:

- The dialog primitive lives in `app/components/ui/dialog/`; `AddFeedDialog.vue`
  composes it with the feed input. Never put a permanent feed input in a
  toolbar again.
- On `sm:` and up the trigger is an outline button in the reader toolbar. Below
  `sm:` it is a floating `+` button (`mode="fab"`), fixed bottom-right, sitting
  above the mobile bottom navigation.
- The mobile bottom navigation (`Reader` / `Explore` / `Search` / `Offline` /
  `Settings`, plus `Admin` for operators) is the only fixed chrome on small
  screens. It lives in `MobileNav.vue` and is shared by the reader, explore,
  offline library and settings pages so navigation never disappears. It uses
  `pb-[env(safe-area-inset-bottom)]`, and page content reserves space for it
  (`pb-24 lg:pb-6`). Labels stay short enough for six items at 360 px.
- Topics are a **filter**, never a strip pinned to the page. `FiltersDialog.vue`
  holds the searchable topic chips (wrapping, inside a `ScrollArea`) on every
  viewport, and the public landing page reuses the same dialog with
  `reader-key="public"`. From `lg` upward the same topics also render as a
  vertical list inside `Sidebar.vue`. Both read from `state.categories` /
  `state.category` and call `setCategory`.
- Both lists are searchable: `FeedPicker.vue` puts a search input inside its
  dropdown (filtering by title and host), and `FiltersDialog.vue` /
  `Sidebar.vue` put one above the topic list (filtering by English and Persian
  labels). Selection stays on the existing item/chip controls.

## Rule 6 — Reader chrome and settings

- The desktop sidebar is its **own** scroll container
  (`lg:sticky … lg:max-h-[calc(100dvh-104px)] lg:overflow-y-auto`); the main
  column scrolls independently. Never let the whole page scroll as one column
  on desktop.
- Header navigation is `Home` / `Offline` / `Settings`, plus `Admin` for
  operators. There is no "My reader" entry: the logo and `Home` already land
  signed-in readers in `/reader`.
- The desktop sidebar carries a compact **Feeds** list: a search input plus one
  row per subscription with its unread counter (`state.feeds[].unread_count`,
  `bg-primary` pill). Selecting a row calls `setView('feed', id)`; the first row
  is `All feeds` with `state.stats.unread`. `FeedPicker.vue` remains the
  left-aligned dropdown for switching feeds on small screens. Per-feed polling
  interval (15m … daily, or paused), manual refresh and unsubscribe live on
  `/settings`.
- `FeedPicker.vue` is the small-screen feed switcher only. It lives in the
  reader toolbar behind `lg:hidden` and must never be rendered inside the
  desktop sidebar, where the Feeds list already does the job.
- Both sidebar lists — Feeds and Topics — have a fixed height and scroll
  internally (`ScrollArea class="h-[15rem]"` and `ScrollArea class="h-[13rem]"`): a long feed
  list never grows the sidebar or pushes the Topics list off screen. Topics are
  a fixed set of ten ids (`server/utils/embeddings.js` plus `other`); capping
  the height keeps the sidebar the same shape however many feeds a reader adds.
- Filters (All / Unread / Favorites, Read here / Original site) live in
  `FiltersDialog.vue`, a shadcn dialog shaped like the add-feed dialog. The
  Filters button sits **above** the Add feed button.
- OPML import/export lives on `/settings` under the Feeds tab.
- Appearance (theme, accent, font, text size) is a device preference stored in
  `localStorage`. `useAppearance()` toggles `dark`, `app-accent-*`,
  `app-font-*` and `app-size-*` on `<html>`; those classes are defined in
  `main.css` and are the only sanctioned runtime token switch. Components must
  never set inline styles or CSS variables themselves.

## Rule 7 — Story actions, suggestions and previews

- Opening a story must never block the route change on a publisher download:
  `app/pages/item/[id].vue` always requests `?wait=0`, so the page mounts with
  the headline in milliseconds and the body arrives afterwards. While it is on
  its way the reader shows an explicit loading panel — spinner, "Loading the
  article…", skeletons — that after four seconds adds a Try again / Open
  original pair, so a hostile publisher always ends in content or a way out.
  `RouteProgress.vue` shows the same 2px `bg-primary` bar for every route
  change, and it is the only global loading chrome.
- The reader header holds the story actions as shadcn buttons: Translate,
  Export (dropdown), Share (dropdown) and Open original. Every icon-only state
  must carry an `aria-label`; labels collapse to icons below `sm:`.
- Each story row also exposes **Mark above as read** (`ArrowUpToLine`) once it
  is not the first row. It calls `POST /api/items/read-above` with `{ itemId }`,
  which marks every newer story in the caller's subscriptions as read; the
  local list is patched in place unless the view is `Unread`, which reloads.
- `ShareMenu.vue` is the only share surface. It composes `DropdownMenu` +
  `DropdownMenuItem` + `DropdownMenuSeparator`; network targets are plain
  `https://` intents, Instagram copies the link and opens the site, and
  "Copy link" shows inline `Check` / `Link2` feedback.
- The add-feed dialog is also where feeds are discovered: `POPULAR_FEEDS` from
  `app/lib/popular-feeds.js` renders as a two-column grid of buttons showing a
  spinner, a check (already subscribed) or a plus. Never add a second
  "discover feeds" screen.
- The feed input accepts a feed URL or a plain website (`example.com`); the
  server discovers `<link rel="alternate">` and probes the usual feed paths
  before subscribing, and reports "Found the feed at …" in the toast.
- When extraction fails, the reader shows a partial-preview banner with
  "Try again" and "Read on <host>". The summary preview still renders through
  the same `v-html` child-variant container as a full article — never add a
  separate prose stylesheet for it.
- SEO metadata (`useSeoMeta`, canonical link, JSON-LD) is page-level and reads
  `runtimeConfig.public.siteUrl`. This Nuxt/Unhead version's `useSeoMeta` does
  **not** accept a getter function: pass an object whose values are `computed`
  refs (a getter silently produces no tags).

## Rule 8 — Admin dashboard

- Operators get `/admin`, guarded by the `auth` + `admin` route middleware and
  by `requireAdmin()` on every `/api/admin/*` handler. A non-admin never sees
  the page, and the API answers `403` even if the page is reached directly.
- The dashboard is the same template as the rest of the app: `Tabs`
  (Overview / Users / Feeds / Content / System), `Input` search boxes, `Badge`
  counters, `Button` actions and the shared `rounded-xl border bg-card` panels.
  No tables, charts or new libraries: activity is a list of counts, never a
  plot.
- **Overview** carries the totals grid, the embedding pipeline controls
  (`Re-classify topics`, `Reset & re-index`), the feed scheduler
  (`Run a pass now`, `Pause`/`Resume`, `Prune sessions`), the article-library
  health counters with `Retry failures` and `Repair links`, the last seven days
  of activity, the newest accounts, the feeds with errors and the newest
  operator actions.
- **Users**: search, role toggle, `Sign out everywhere` and delete. The last
  admin can never be demoted, and an operator can never demote or delete
  themselves.
- **Feeds**: search, a `public` toggle, per-feed refresh and delete, plus
  `Failing only` / `Refresh all` bulk refreshes. A feed flagged `is_public` can
  never be deleted; deleting a feed removes its stories for every subscriber.
  A small "Add a shared feed" panel seeds the shared list from a URL (feed
  discovery runs server-side), which is how the public catalog grows.
- **Content**: the failed-download queue (per-story `Retry`, `Retry next 6`,
  open original) and the translation cache, where dropping a row lets it
  regenerate on the next request.
- **System**: a runtime snapshot (node, uptime, cache keys, database size,
  model), the maintenance actions, the CSV/JSON data exports and the scrollable
  operator activity log.
- Every state change an operator makes records a row through `recordAudit()`
  (`server/utils/admin-audit.js`) into `admin_audit`, so the activity log
  answers "who did that".
- Long work never blocks a request: feed refreshes, content retries and link
  repairs run in the background and report progress through the job counters in
  `GET /api/admin/overview`, which the page polls while a job is running.
- `role` lives on `users` (`user` | `admin`). `ADMIN_EMAILS` promotes accounts
  on boot; if no admin exists at all, the oldest account is promoted once so a
  fresh install always has an operator. The last admin can never be demoted.
- Destructive actions (delete account, delete feed) confirm first, and the
  public feed can never be deleted. Deleting a feed removes its stories for
  every subscriber, so the button is disabled for `is_public` feeds.
- Whole-table sweeps (`Reset & re-index everything`, `Flush Redis cache`)
  confirm first, because both degrade search until they finish.
- `MobileNav.vue` renders an extra `Admin` item only for operators, and
  `AppHeader.vue` / `/settings` link to the dashboard only for them.

## Rule 9 — Explore, discovery and account recovery

- `/explore` is the discovery surface: an Instagram-style grid of curated feeds
  (`FEED_CATALOG` in `shared/feed-catalog.js`) at 2 / 3 / 4 columns, each tile a
  16:9 initials block tinted through `categoryActive(tag)`, with a tag chip row
  inside a horizontal `ScrollArea`, a search input, and an Add/Added button.
  Every tile also shows how many readers on this server follow it, because the
  shared-feed model means one download and one embedding pass per feed.
- The catalog is served by `GET /api/explore` (`signedIn`, `catalog`,
  `popular`). Pages must fetch it with `useRequestFetch()` so the session cookie
  reaches the handler during SSR.
- Explore is reachable from `AppHeader.vue` (desktop), `MobileNav.vue` (mobile)
  and the bottom of `Sidebar.vue`. It is a page, never a dialog.
- Password recovery is two pages, `/forgot` and `/reset`, both `noindex` and
  styled like `/login`. Tokens are single-use, hashed in `password_resets` and
  expire after an hour. Delivery goes through `RESET_WEBHOOK_URL`; when no mail
  provider is configured the link is logged server-side and, outside
  production, returned to the browser as a direct link. Never reveal whether an
  email is registered.

## Reference

- Component library: <https://www.shadcn-vue.com/>
- Tailwind CSS v4: <https://tailwindcss.com/docs>
- Icons: `@lucide/vue` (`<Rss />`, `<Star />`, …), sized with Tailwind classes.


## Rule 10 - Engagement, account security and reading aids

- **Engagement counters.** Every story carries `reader_count` and `like_count`
  (`items.reader_count`, `items.like_count`), kept in sync by database triggers
  on `item_views` and `user_items`, never by hand in request handlers.
  - A reader is a distinct person, not a page view: `item_views` is keyed on
    `(item_id, user_id)` and `POST /api/items/:id/view` upserts that one row
    (bumping `open_count`/`last_opened_at`) on mount of `/item/:id`.
  - A like *is* a favourite (`user_items.is_favorite`). There is one like
    concept, expressed by the star on the card and the Like button on the story
    page; the count is derived, never a separate table.
  - `ItemCard.vue` shows `Eye`/`Star` with their counts only when non-zero, so
    quiet feeds stay clean. The story meta row always shows both.
- **Story page aids.** `/item/:id` adds four features on top of the reader:
  - `Summary` - `POST /api/items/:id/summary` stores one machine summary in
    `items.summary_ai*` and shares it with every reader (`server/utils/summarize.js`).
    It is extractive by default; a local `Xenova/distilbart-cnn-6-6` model, if
    present under `models/`, is used instead. The panel shows the engine label
    and its own `Listen` button.
  - `Listen` - `app/composables/useSpeech.js` wraps the Web Speech API
    (`speak`/`pause`/`resume`/`stop`/`toggle`). Render the control only when
    `speech.supported` is true after mount; surface `speech.error` in a banner.
  - `Related stories` - `GET /api/items/:id/related` returns nearest neighbours
    by `dot_product` over the existing `embedding`/`content_embedding`, scoped to
    public feeds or the caller's subscriptions. No new vectors are computed.
  - `Like` toggles the favourite through the existing `PATCH /api/items/:id`.
- **Account tab** (`/settings`, third tab `Account`) is the self-service surface:
  - `Signed-in devices` lists `GET /api/auth/sessions` with a device label,
    last-seen and `this device`; each row revokes via `DELETE /api/auth/sessions/:id`,
    plus `Sign out other devices` and `Sign out everywhere`
    (`DELETE /api/auth/sessions?all=1`).
  - `Export my data` downloads `GET /api/account/export` (profile, subscriptions,
    reading state) as JSON.
  - `Delete account` requires the password and typing `DELETE`
    (`DELETE /api/account`); the last admin can never delete themselves.
- **Security middleware** (`server/middleware/security.js`) sets
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`, a CSP and HSTS on https,
  and rejects cross-origin state-changing requests (Origin/Referer must match
  the site or request host). Never weaken these headers to make a third-party
  script work; proxy or vendor instead.
- **Rate limits** (`server/utils/limits.js`, `enforceRateLimit`) guard every
  expensive path: content extraction, translation, content refresh, search,
  summaries, exports, re-indexing and registration. A limit returns `429`.
  Adding a new heavy endpoint means adding a limit in the same commit.
- **SEO** stays per-page: `useSeoMeta` takes an object of `computed` refs in this
  Unhead version, not a getter.


## Rule 11 - Personal library, bilingual UI, PWA and operations

- **Read later is not a favourite.** `user_items.is_read_later` is a private
  queue; `is_favorite` stays the public "like". The sidebar has a `Read later`
  view (`filter=readlater`), the card and story page have a `Bookmark` toggle,
  and `stats.read_later` drives its badge.
- **Annotations** live on the story page under `Your annotations`:
  - `item_tags` (one row per reader/story/tag) edited through
    `PUT /api/items/:id/tags`; the sidebar lists them from `GET /api/tags`
    and filtering uses `GET /api/items?tag=...`.
  - `item_notes` (one free-form note per reader/story) through
    `PUT /api/items/:id/note`.
  - `item_highlights` through `POST /api/items/:id/highlights` and
    `DELETE /api/items/:id/highlights/:highlightId`. A highlight quotes the
    text the reader selected in the article.
  - `GET /api/items/:id/extras` returns all of it in one call. Load it when the
    session resolves, not only on mount, or a first paint can race the cookie.
- **Bilingual UI.** `app/composables/useI18n.js` holds the `en`/`fa`
  dictionaries; the locale is a `fw-locale` cookie and `app.vue` sets
  `<html lang dir>` from it. Persian flips the document to RTL and switches the
  body font. Article translation is separate and untouched by this.
  - Every new user-facing string goes through `t('key')`; add the key to both
    dictionaries. Never hard-code English in a component.
- **Accessibility.** Toasts are `role="status" aria-live="polite"`; dialogs use
  the reka-ui focus trap; `main.css` honours `prefers-reduced-motion`.
- **PWA.** `manifest.webmanifest` declares a `share_target` to `/share`, which
  accepts a shared link and offers to add it as a feed. `MobileNav.vue` sets the
  app badge from the unread count (Badging API).
- **Offline read state.** A read toggle made offline is stored in the
  `pending-read` IndexedDB store and replayed by the service worker's
  `sync-read-state` handler (and on the `online` event). Never lose the user's
  intent just because the network dropped.
- **Web Push.** `server/utils/push.js` signs with VAPID keys from the
  environment or a generated pair persisted in `app_settings`. Subscriptions
  live in `push_subscriptions`; a feed only notifies subscribers with
  `subscriptions.notify = true`. New stories enqueue a `push` job instead of
  sending inline.
- **Job queue.** `server/utils/jobs.js` is a Redis-backed queue (`ready`,
  `processing`, `delayed`, `dead` lists) with retries and stale-job reclaim.
  Slow work (push delivery, forced content retries, background translation)
  goes through `enqueueJob`; a worker starts in `server/plugins/boot.js`.
- **pgvector is optional.** `ensureVectorSchema()` adds `vector(1024)` columns
  and HNSW indexes when the extension exists; semantic search then uses `<=>`.
  Without it the app keeps the `real[]` + `dot_product` path. Never assume the
  extension is present.
- **Tests and CI.** `npm run test` runs the Vitest unit suite
  (`tests/unit`); `npm run test:e2e` runs Playwright (`tests/e2e`).
  `.github/workflows/ci.yml` runs both. Add a unit test for any pure helper and
  keep the e2e login/read/translate path green.
- **Migrations and backups.** The inline schema stays the idempotent baseline;
  new non-trivial changes go in `db/migrations/NNNN_*.sql` and are applied by
  `npm run db:migrate`. `scripts/backup.ps1` / `backup.sh` take a timestamped
  `pg_dump`; `scripts/restore.ps1` restores one.
- **Observability.** `GET /api/metrics` exposes Prometheus counters (items,
  failing feeds, embedding backlog, queue depth, search latency). Set
  `METRICS_TOKEN` to require a bearer token. `server/utils/logger.js` writes
  structured JSON logs.
