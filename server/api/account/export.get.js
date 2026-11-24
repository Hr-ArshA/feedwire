import { requireUser } from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/limits.js';

/**
 * Everything this account owns, as one JSON file: profile, subscriptions,
 * read/favourite state and the stories behind them. Self-service so a reader
 * never has to ask an operator for their data.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await enforceRateLimit(event, 'account-export', 10, 3600);

  const [profile, subscriptions, items, sessions] = await Promise.all([
    query(
      `SELECT id, email, display_name, role, created_at FROM users WHERE id = $1`,
      [user.id]
    ),
    query(
      `SELECT f.url, f.title, f.site_url, s.created_at,
              s.fetch_interval_minutes
         FROM subscriptions s
         JOIN feeds f ON f.id = s.feed_id
        WHERE s.user_id = $1
        ORDER BY f.title`,
      [user.id]
    ),
    query(
      `SELECT i.id, i.title, i.link, i.resolved_link, i.author, i.category,
              i.published_at, f.title AS feed_title,
              ui.is_read, ui.is_favorite, ui.updated_at
         FROM user_items ui
         JOIN items i ON i.id = ui.item_id
         JOIN feeds f ON f.id = i.feed_id
        WHERE ui.user_id = $1
        ORDER BY ui.updated_at DESC
        LIMIT 20000`,
      [user.id]
    ),
    query(
      `SELECT count(*)::int AS total FROM sessions
        WHERE user_id = $1 AND expires_at > now()`,
      [user.id]
    ),
  ]);

  const row = profile.rows[0];
  const payload = {
    exportedAt: new Date().toISOString(),
    site: useRuntimeConfig().public.siteUrl,
    account: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      createdAt: row.created_at,
    },
    activeSessions: sessions.rows[0].total,
    subscriptions: subscriptions.rows.map((entry) => ({
      url: entry.url,
      title: entry.title,
      siteUrl: entry.site_url,
      subscribedAt: entry.created_at,
      fetchIntervalMinutes: entry.fetch_interval_minutes,
    })),
    readingState: items.rows.map((entry) => ({
      id: Number(entry.id),
      title: entry.title,
      link: entry.resolved_link || entry.link,
      author: entry.author,
      category: entry.category,
      feed: entry.feed_title,
      publishedAt: entry.published_at,
      isRead: entry.is_read,
      isFavorite: entry.is_favorite,
      updatedAt: entry.updated_at,
    })),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  setHeader(event, 'content-type', 'application/json; charset=utf-8');
  setHeader(
    event,
    'content-disposition',
    `attachment; filename="feedwire-account-${stamp}.json"`
  );
  return JSON.stringify(payload, null, 2);
});
