import { getSessionUser } from '../utils/auth.js';
import { FEED_CATALOG, feedKey } from '../../shared/feed-catalog.js';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);

  const [counts, subscriptions, popular] = await Promise.all([
    query(
      `SELECT f.url, count(s.user_id)::int AS subscribers
         FROM feeds f
         LEFT JOIN subscriptions s ON s.feed_id = f.id
        GROUP BY f.url`
    ),
    user
      ? query(
          `SELECT f.url
             FROM subscriptions s
             JOIN feeds f ON f.id = s.feed_id
            WHERE s.user_id = $1`,
          [user.id]
        )
      : Promise.resolve({ rows: [] }),
    query(
      `SELECT f.url, f.title, f.site_url, count(s.user_id)::int AS subscribers
         FROM feeds f
         JOIN subscriptions s ON s.feed_id = f.id
        GROUP BY f.id
        ORDER BY subscribers DESC, f.created_at DESC
        LIMIT 8`
    ),
  ]);

  const subscriberCounts = new Map(
    counts.rows.map((row) => [feedKey(row.url), row.subscribers])
  );
  const subscribed = new Set(subscriptions.rows.map((row) => feedKey(row.url)));

  return {
    signedIn: Boolean(user),
    catalog: FEED_CATALOG.map((entry) => ({
      ...entry,
      subscribers: subscriberCounts.get(feedKey(entry.url)) ?? 0,
      subscribed: subscribed.has(feedKey(entry.url)),
    })),
    popular: popular.rows.map((row) => ({
      url: row.url,
      title: row.title,
      siteUrl: row.site_url,
      subscribers: row.subscribers,
      subscribed: subscribed.has(feedKey(row.url)),
    })),
  };
});
