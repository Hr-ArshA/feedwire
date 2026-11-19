import { getSessionUser } from '../../../utils/auth.js';
import { getArticle } from '../../../utils/article-store.js';
import { getTranslation } from '../../../utils/translate.js';

const LANG = /^[a-z]{2}(-[a-z]{2})?$/i;

export default defineEventHandler(async (event) => {
  const itemId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid item id',
      data: { error: 'Invalid item id' },
    });
  }

  const raw = String(getQuery(event).lang ?? 'fa');
  const lang = LANG.test(raw) ? raw.toLowerCase() : 'fa';

  const user = await getSessionUser(event);
  await getArticle(itemId, user?.id ?? null);

  return { translation: await getTranslation(itemId, lang) };
});
