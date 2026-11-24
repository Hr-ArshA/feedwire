import { requireUser } from '../../utils/auth.js';
import {
  getStats,
  listUserFeeds,
  setSubscriptionInterval,
  setSubscriptionNotify,
} from '../../utils/feeds.js';

const INTERVALS = new Set([0, 15, 30, 60, 180, 720, 1440]);

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const id = getRouterParam(event, 'id');
  const body = await readBody(event).catch(() => ({}));
  const minutes = Number(body?.fetchIntervalMinutes);

  const hasNotify = typeof body?.notify === 'boolean';
  if (hasNotify) {
    await setSubscriptionNotify(user.id, id, body.notify);
  }

  if (body?.fetchIntervalMinutes !== undefined && !INTERVALS.has(minutes)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unsupported refresh interval',
      data: { error: 'Unsupported refresh interval' },
    });
  }

  if (body?.fetchIntervalMinutes !== undefined) {
    await setSubscriptionInterval(user.id, id, minutes);
  }

  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);
  return { feeds, stats };
});
