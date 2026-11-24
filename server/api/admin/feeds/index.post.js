import { requireAdmin } from '../../../utils/auth.js';
import { recordAudit } from '../../../utils/admin-audit.js';
import { findOrCreateFeed, refreshFeed } from '../../../utils/feeds.js';
import { discoverFeedUrl } from '../../../utils/feed-discovery.js';

/**
 * Operators can seed a shared feed without subscribing to it, which is how the
 * public catalog gets new sources. The feed is fetched once right away so the
 * dashboard shows a title and a story count instead of an empty row.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = (await readBody(event).catch(() => ({}))) ?? {};
  const input = String(body.url ?? '').trim();

  if (!input) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A feed URL is required',
      data: { error: 'A feed URL is required' },
    });
  }

  const discovered = await discoverFeedUrl(input).catch(() => null);
  const url = discovered ?? input;
  const { feed, created } = await findOrCreateFeed(url, {
    isPublic: Boolean(body.is_public),
  });

  if (body.is_public && !feed.is_public) {
    await query('UPDATE feeds SET is_public = true WHERE id = $1', [feed.id]);
    feed.is_public = true;
  }

  const result = created
    ? await refreshFeed(feed.id, { force: true })
    : { inserted: 0, error: null };

  // A URL that neither parses nor responds would leave an empty row in the
  // shared list, so a failed first fetch rolls the insert back.
  if (created && result.error) {
    await query('DELETE FROM feeds WHERE id = $1', [feed.id]);
    throw createError({
      statusCode: 400,
      statusMessage: result.error,
      data: { error: `Could not read that feed: ${result.error}` },
    });
  }

  await recordAudit(admin, created ? 'feed:add' : 'feed:add-existing', {
    target: `feed:${feed.id}`,
    detail: { url, isPublic: feed.is_public, inserted: result.inserted ?? 0 },
  });

  // The first fetch fills in the title and site URL, so answer with the row as
  // it stands now rather than the blank one the insert returned.
  const { rows } = await query(
    `SELECT id, url, title, site_url, is_public, last_fetched_at, last_error
       FROM feeds WHERE id = $1`,
    [feed.id]
  );

  return {
    feed: rows[0] ?? feed,
    created,
    discoveredFrom: discovered && discovered !== input ? input : null,
    result,
  };
});
