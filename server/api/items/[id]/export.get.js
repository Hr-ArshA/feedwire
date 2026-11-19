import { getSessionUser } from '../../../utils/auth.js';
import { getArticle } from '../../../utils/article-store.js';
import { buildExport, isExportFormat } from '../../../utils/article-export.js';

/**
 * Downloads the cached article as HTML, Markdown or plain text. PDF is produced
 * by the browser from `/print/:id` so it keeps real fonts, images and RTL text.
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

  const format = String(getQuery(event).format ?? 'html').toLowerCase();
  if (!isExportFormat(format)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unsupported format',
      data: { error: 'Supported formats: html, md, txt' },
    });
  }

  const user = await getSessionUser(event);
  const article = await getArticle(itemId, user?.id ?? null);

  if (!article.html) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Article content is not available',
      data: { error: article.error || 'Article content is not available' },
    });
  }

  const { body, contentType, filename } = buildExport(article, format);

  setHeader(event, 'content-type', contentType);
  setHeader(event, 'content-disposition', `attachment; filename="${filename}"`);
  setHeader(event, 'cache-control', 'private, max-age=0, must-revalidate');
  return body;
});
