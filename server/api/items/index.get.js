import { getSessionUser } from '../../utils/auth.js';
import { getStats, listItems } from '../../utils/feeds.js';

const FILTERS = new Set(['all', 'unread', 'favorite']);
const MODES = new Set(['hybrid', 'keyword', 'semantic']);

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const params = getQuery(event);

  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const filter = FILTERS.has(params.filter) ? params.filter : 'all';
  const mode = MODES.has(params.mode) ? params.mode : 'hybrid';

  const result = await listItems({
    userId: user?.id ?? null,
    feedId: params.feed || null,
    filter,
    q: params.q ?? '',
    mode,
    category: params.category || null,
    limit,
    offset,
  });

  const stats = await getStats(user?.id ?? null);
  return { ...result, stats };
});
