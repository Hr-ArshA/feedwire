import { requireAdmin } from '../../../utils/auth.js';
import { recordAudit } from '../../../utils/admin-audit.js';
import { setFeedVisibility } from '../../../utils/admin.js';

/** Toggles whether a shared feed is part of the public landing page. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = getRouterParam(event, 'id');
  const body = (await readBody(event).catch(() => ({}))) ?? {};

  if (typeof body.is_public !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'is_public must be a boolean',
      data: { error: 'is_public must be a boolean' },
    });
  }

  const feed = await setFeedVisibility(id, body.is_public);
  await recordAudit(admin, body.is_public ? 'feed:make-public' : 'feed:make-private', {
    target: `feed:${id}`,
    detail: { url: feed.url },
  });
  return { feed };
});
