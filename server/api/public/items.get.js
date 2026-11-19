import { getCategoryCounts, getStats, listItems } from '../../utils/feeds.js';

/**
 * Anonymous landing page: only feeds flagged `is_public` (the Hacker News feed)
 * are readable without an account.
 */
export default defineEventHandler(async (event) => {
  const params = getQuery(event);
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const category = params.category || null;

  const [result, stats, categories] = await Promise.all([
    listItems({
      userId: null,
      feedId: null,
      filter: 'all',
      q: params.q ?? '',
      mode: 'hybrid',
      category,
      limit,
      offset,
    }),
    getStats(null),
    getCategoryCounts(null),
  ]);

  return { ...result, stats, categories };
});
