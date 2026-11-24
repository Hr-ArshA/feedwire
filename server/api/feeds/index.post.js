import { requireUser } from '../../utils/auth.js';
import {
  findOrCreateFeed,
  getStats,
  isSubscribed,
  listUserFeeds,
  normalizeFeedUrl,
  refreshFeed,
  subscribe,
  unsubscribe,
} from '../../utils/feeds.js';
import { discoverFeedUrl } from '../../utils/feed-discovery.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readBody(event);

  // Normalising up front (scheme default, tracking params) also gives the
  // discovery helper a URL it can parse when the input was "example.com".
  const requestedUrl = normalizeFeedUrl(body?.url);
  let { feed, created } = await findOrCreateFeed(requestedUrl);
  let alreadySubscribed = await isSubscribed(user.id, feed.id);
  await subscribe(user.id, feed.id);

  // A feed that already exists is shared: its items and vectors are reused
  // as-is, so a second subscriber never triggers a re-embedding pass.
  let result = await refreshFeed(feed.id, { force: created });

  // Pasting a website instead of its feed URL is the most common mistake:
  // look for `<link rel="alternate">` or the usual /feed, /rss.xml paths.
  let discovered = false;
  if (result.error && created) {
    const found = await discoverFeedUrl(requestedUrl).catch(() => null);
    if (found && found !== feed.url) {
      await unsubscribe(user.id, feed.id);
      const next = await findOrCreateFeed(found);
      feed = next.feed;
      created = next.created;
      alreadySubscribed = await isSubscribed(user.id, feed.id);
      await subscribe(user.id, feed.id);
      result = await refreshFeed(feed.id, { force: true });
      discovered = !result.error;
    }
  }

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
    discovered,
    inserted: result.inserted,
    error: result.error,
    feeds,
    stats,
  };
});
