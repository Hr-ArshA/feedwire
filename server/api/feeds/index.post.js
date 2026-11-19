import { requireUser } from '../../utils/auth.js';
import {
  findOrCreateFeed,
  getStats,
  isSubscribed,
  listUserFeeds,
  refreshFeed,
  subscribe,
  unsubscribe,
} from '../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readBody(event);

  const { feed, created } = await findOrCreateFeed(body?.url);
  const alreadySubscribed = await isSubscribed(user.id, feed.id);
  await subscribe(user.id, feed.id);

  // A feed that already exists is shared: its items and vectors are reused
  // as-is, so a second subscriber never triggers a re-embedding pass.
  const result = await refreshFeed(feed.id, { force: created });

  // A brand-new feed that could not be fetched is not worth subscribing to:
  // roll it back so the sidebar never shows a dead feed.
  if (result.error && created && !result.inserted) {
    await unsubscribe(user.id, feed.id);
    throw createError({
      statusCode: 400,
      statusMessage: result.error,
      data: { error: result.error },
    });
  }

  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);

  return {
    feed: {
      id: feed.id,
      url: feed.url,
      title: result.title || feed.title,
      site_url: feed.site_url,
    },
    created,
    reused: !created,
    alreadySubscribed,
    inserted: result.inserted,
    error: result.error,
    feeds,
    stats,
  };
});
