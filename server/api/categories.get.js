import { getSessionUser } from '../utils/auth.js';
import { getCategoryCounts } from '../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const categories = await getCategoryCounts(user?.id ?? null);
  return { categories };
});
