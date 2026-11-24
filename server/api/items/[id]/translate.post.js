import { getSessionUser } from '../../../utils/auth.js';
import { getArticle } from '../../../utils/article-store.js';
import { translateItem } from '../../../utils/translate.js';
import { enforceRateLimit } from '../../../utils/limits.js';

const LANG = /^[a-z]{2}(-[a-z]{2})?$/i;

/**
 * Produces (or returns) the machine translation of a story. The body is split
 * into sub-4000-character chunks and sent to Google Translate; the result is
 * stored once per (item, language) and shared by every reader.
 */
export default defineEventHandler(async (event) => {
  const itemId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid item id',
      data: { error: 'Invalid item id' },
    });
  }

  const body = (await readBody(event).catch(() => ({}))) ?? {};
  const raw = String(body.lang ?? 'fa');
  const lang = LANG.test(raw) ? raw.toLowerCase() : 'fa';

  const user = await getSessionUser(event);
  // Translation hits an external service in up to 24 chunks, so it is the
  // most expensive endpoint a reader can trigger.
  await enforceRateLimit(event, 'translate', 15, 600);
  const article = await getArticle(itemId, user?.id ?? null);

  if (!article.html) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Article content is not available',
      data: { error: article.error || 'Article content is not available' },
    });
  }

  return { translation: await translateItem(article, lang) };
});
