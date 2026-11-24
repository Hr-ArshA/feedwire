import { requireAdmin } from '../../utils/auth.js';
import { recordAudit } from '../../utils/admin-audit.js';
import { listFeeds, listUsers } from '../../utils/admin.js';

const TYPES = new Set(['users', 'feeds', 'items']);

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  return lines.join('\r\n');
}

/** Timestamps leave PostgreSQL as Date objects; keep the export machine-readable. */
function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function loadRows(type) {
  if (type === 'users') {
    const users = await listUsers('');
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      created_at: iso(user.createdAt),
      last_session_at: iso(user.lastSessionAt),
      feeds: user.feedCount,
      reads: user.readCount,
      favorites: user.favoriteCount,
    }));
  }

  if (type === 'feeds') {
    const feeds = await listFeeds('');
    return feeds.map((feed) => ({
      id: feed.id,
      title: feed.title,
      url: feed.url,
      site_url: feed.site_url,
      is_public: feed.is_public,
      subscribers: feed.subscriber_count,
      stories: feed.item_count,
      last_fetched_at: iso(feed.last_fetched_at),
      last_error: feed.last_error,
    }));
  }

  const { rows } = await query(
    `SELECT i.id, i.title, i.link, i.resolved_link, i.author, i.category,
            i.published_at, f.title AS feed_title,
            (i.content_html IS NOT NULL) AS has_content,
            (i.content_embedding IS NOT NULL) AS embedded
       FROM items i
       JOIN feeds f ON f.id = i.feed_id
      ORDER BY i.published_at DESC NULLS LAST, i.id DESC
      LIMIT 5000`
  );
  return rows.map((row) => ({ ...row, published_at: iso(row.published_at) }));
}

/**
 * Operator data dump. `format=csv` is what a spreadsheet wants, `json` keeps
 * the types. Read-only, so no audit entry for JSON but a download of the whole
 * item table is worth recording.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { type = 'users', format = 'csv' } = getQuery(event);
  const kind = String(type);

  if (!TYPES.has(kind)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unknown export type',
      data: { error: 'Unknown export type' },
    });
  }

  const rows = await loadRows(kind);
  await recordAudit(admin, 'export', { target: kind, detail: { rows: rows.length } });

  const stamp = new Date().toISOString().slice(0, 10);

  if (String(format) === 'json') {
    setHeader(event, 'content-type', 'application/json; charset=utf-8');
    setHeader(
      event,
      'content-disposition',
      `attachment; filename="feedwire-${kind}-${stamp}.json"`
    );
    return JSON.stringify(rows, null, 2);
  }

  setHeader(event, 'content-type', 'text/csv; charset=utf-8');
  setHeader(
    event,
    'content-disposition',
    `attachment; filename="feedwire-${kind}-${stamp}.csv"`
  );
  return toCsv(rows);
});
