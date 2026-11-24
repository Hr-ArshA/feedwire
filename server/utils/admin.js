import { getIndexStatus } from './indexer.js';
import { getSchedulerStatus } from './scheduler.js';
import { listAudit } from './admin-audit.js';
import { countBrokenLinks, getJobStatus, getSystemInfo } from './admin-tools.js';

/**
 * Promote configured operators, and make sure a fresh install always has one
 * admin: if no account is an admin yet, the oldest account takes the role.
 */
export async function ensureAdmins() {
  const config = useRuntimeConfig();
  const emails = String(config.adminEmails ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length) {
    const { rowCount } = await query(
      `UPDATE users SET role = 'admin'
        WHERE lower(email) = ANY($1::text[]) AND role <> 'admin'`,
      [emails]
    );
    if (rowCount) console.log(`[admin] promoted ${rowCount} operator(s) from ADMIN_EMAILS`);
  }

  const { rows } = await query(
    `SELECT count(*)::int AS admins FROM users WHERE role = 'admin'`
  );
  if (rows[0].admins > 0) return;

  const promoted = await query(
    `UPDATE users SET role = 'admin'
      WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1)
      RETURNING email`
  );
  if (promoted.rows[0]) {
    console.log(
      `[admin] no operator configured - ${promoted.rows[0].email} is now the admin`
    );
  }
}

export async function getOverview() {
  const { rows } = await query(`
    SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM users WHERE role = 'admin') AS admins,
      (SELECT count(*)::int FROM feeds) AS feeds,
      (SELECT count(*)::int FROM feeds WHERE is_public) AS public_feeds,
      (SELECT count(*)::int FROM feeds WHERE last_error IS NOT NULL) AS failing_feeds,
      (SELECT count(*)::int FROM feeds WHERE last_fetched_at IS NULL) AS never_fetched,
      (SELECT count(*)::int FROM subscriptions) AS subscriptions,
      (SELECT count(*)::int FROM items) AS items,
      (SELECT count(*)::int FROM items WHERE content_html IS NOT NULL) AS items_with_content,
      (SELECT count(*)::int FROM items WHERE resolved_link IS NOT NULL) AS items_resolved,
      (SELECT count(*)::int FROM translations) AS translations,
      (SELECT count(*)::int FROM user_items WHERE is_read) AS reads,
      (SELECT count(*)::int FROM user_items WHERE is_favorite) AS favorites,
      (SELECT count(*)::int FROM sessions WHERE expires_at > now()) AS sessions,
      (SELECT count(DISTINCT user_id)::int FROM sessions WHERE expires_at > now()) AS session_users,
      (SELECT count(*)::int FROM sessions WHERE expires_at <= now()) AS expired_sessions,
      (SELECT count(*)::int FROM items WHERE embedding IS NULL) AS pending_embeddings,
      (SELECT count(*)::int FROM items
        WHERE content_text IS NOT NULL AND content_embedding IS NULL) AS pending_content_embeddings
  `);

  const [
    recentUsers,
    failingFeeds,
    index,
    activity,
    content,
    sessions,
    langs,
    categories,
    brokenLinks,
    audit,
    system,
  ] = await Promise.all([
    query(
      `SELECT id, email, display_name, role, created_at
         FROM users ORDER BY created_at DESC LIMIT 6`
    ),
    query(
      `SELECT f.id, f.title, f.url, f.last_error, f.last_fetched_at,
              f.last_attempt_at,
              (SELECT count(*)::int FROM subscriptions s WHERE s.feed_id = f.id)
                AS subscriber_count
         FROM feeds f
        WHERE f.last_error IS NOT NULL
        ORDER BY f.last_fetched_at DESC NULLS LAST
        LIMIT 6`
    ),
    getIndexStatus().catch(() => null),
    query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day,
              (SELECT count(*)::int FROM items i
                WHERE i.fetched_at >= d AND i.fetched_at < d + interval '1 day') AS items,
              (SELECT count(*)::int FROM users u
                WHERE u.created_at >= d AND u.created_at < d + interval '1 day') AS accounts,
              (SELECT count(*)::int FROM translations t
                WHERE t.created_at >= d AND t.created_at < d + interval '1 day') AS translations
         FROM generate_series(
                date_trunc('day', now()) - interval '6 days',
                date_trunc('day', now()),
                interval '1 day'
              ) AS d
        ORDER BY d DESC`
    ),
    query(
      `SELECT
         count(*) FILTER (WHERE content_html IS NOT NULL AND NOT content_partial)::int
           AS full,
         count(*) FILTER (WHERE content_partial)::int AS partial,
         count(*) FILTER (WHERE content_error IS NOT NULL)::int AS failed,
         count(*) FILTER (WHERE content_error ~* 'HTTP (401|403|429)')::int AS blocked,
         count(*) FILTER (WHERE content_fetched_at IS NULL)::int AS pending
       FROM items`
    ),
    query(
      `SELECT count(*)::int AS total,
              count(DISTINCT user_id)::int AS users
         FROM sessions`
    ),
    query(
      `SELECT lang, count(*)::int AS count
         FROM translations GROUP BY lang ORDER BY count DESC LIMIT 6`
    ),
    query(
      `SELECT category, count(*)::int AS count
         FROM items WHERE category IS NOT NULL
        GROUP BY category ORDER BY count DESC LIMIT 8`
    ),
    countBrokenLinks().catch(() => ({ wrapped: 0, notices: 0 })),
    listAudit(12).catch(() => []),
    getSystemInfo().catch(() => null),
  ]);

  return {
    counts: rows[0],
    recentUsers: recentUsers.rows.map(mapUser),
    failingFeeds: failingFeeds.rows,
    index,
    scheduler: getSchedulerStatus(),
    sessionTotals: sessions.rows[0],
    activity: activity.rows.map((row) => ({
      day: row.day,
      items: row.items,
      accounts: row.accounts,
      translations: row.translations,
    })),
    content: content.rows[0],
    translationsByLang: langs.rows,
    categories: categories.rows,
    brokenLinks,
    audit,
    system,
    jobs: getJobStatus(),
  };
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    feedCount: row.feed_count ?? 0,
    readCount: row.read_count ?? 0,
    favoriteCount: row.favorite_count ?? 0,
    lastSessionAt: row.last_session_at ?? null,
  };
}

export async function listUsers(search = '') {
  const q = String(search ?? '').trim();
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.role, u.created_at,
            (SELECT count(*)::int FROM subscriptions s WHERE s.user_id = u.id) AS feed_count,
            (SELECT count(*)::int FROM user_items ui
              WHERE ui.user_id = u.id AND ui.is_read) AS read_count,
            (SELECT count(*)::int FROM user_items ui
              WHERE ui.user_id = u.id AND ui.is_favorite) AS favorite_count,
            (SELECT max(s.created_at) FROM sessions s WHERE s.user_id = u.id)
              AS last_session_at
       FROM users u
      WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%'
             OR u.display_name ILIKE '%' || $1 || '%')
      ORDER BY u.created_at DESC
      LIMIT 200`,
    [q]
  );
  return rows.map(mapUser);
}

export async function listFeeds(search = '') {
  const q = String(search ?? '').trim();
  const { rows } = await query(
    `SELECT f.id, f.url, f.title, f.site_url, f.is_public, f.created_at,
            f.last_fetched_at, f.last_error, f.last_attempt_at,
            (SELECT count(*)::int FROM subscriptions s WHERE s.feed_id = f.id)
              AS subscriber_count,
            (SELECT min(s.fetch_interval_minutes)
               FROM subscriptions s
              WHERE s.feed_id = f.id AND s.fetch_interval_minutes > 0)
              AS min_interval_minutes,
            (SELECT count(*)::int FROM items i WHERE i.feed_id = f.id)
              AS item_count
       FROM feeds f
      WHERE ($1 = '' OR f.title ILIKE '%' || $1 || '%'
             OR f.url ILIKE '%' || $1 || '%')
      ORDER BY subscriber_count DESC, f.created_at DESC
      LIMIT 200`,
    [q]
  );
  return rows;
}

export async function setFeedVisibility(feedId, isPublic) {
  const { rows } = await query(
    `UPDATE feeds SET is_public = $2 WHERE id = $1
     RETURNING id, url, title, site_url, is_public, created_at,
               last_fetched_at, last_error, last_attempt_at`,
    [feedId, Boolean(isPublic)]
  );
  if (!rows[0]) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed not found',
      data: { error: 'Feed not found' },
    });
  }
  await cacheDel('categories:global', 'categories:public');
  return rows[0];
}

/** Signs every session of one account out, used from the Users tab. */
export async function revokeUserSessions(userId) {
  const { rows } = await query(
    'SELECT token_hash FROM sessions WHERE user_id = $1',
    [userId]
  );
  const { rowCount } = await query('DELETE FROM sessions WHERE user_id = $1', [
    userId,
  ]);
  await cacheDel(...rows.map((row) => `sess:${row.token_hash}`));
  return { revoked: rowCount };
}

export async function setUserRole(userId, role) {
  if (role !== 'user' && role !== 'admin') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unknown role',
      data: { error: 'Unknown role' },
    });
  }

  const { rows: current } = await query(
    'SELECT id, role FROM users WHERE id = $1',
    [userId]
  );
  const existing = current[0];
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
      data: { error: 'User not found' },
    });
  }

  if (existing.role === 'admin' && role === 'user') {
    const { rows } = await query(
      `SELECT count(*)::int AS admins FROM users WHERE role = 'admin'`
    );
    if (rows[0].admins <= 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'At least one admin must remain',
        data: { error: 'At least one admin must remain' },
      });
    }
  }

  const { rows } = await query(
    `UPDATE users SET role = $2 WHERE id = $1
     RETURNING id, email, display_name, role, created_at`,
    [userId, role]
  );
  return mapUser(rows[0]);
}
