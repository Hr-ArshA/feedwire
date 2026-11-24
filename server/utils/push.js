import webpush from 'web-push';

/**
 * Web Push delivery.
 *
 * VAPID keys come from the environment when provided; otherwise one pair is
 * generated once and stored in app_settings so subscriptions stay valid across
 * restarts. When push is not configured the API simply reports it as disabled.
 */

let cached = null;

async function readSetting(key) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function writeSetting(key, value) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
}

export async function getVapid() {
  if (cached) return cached;
  const config = useRuntimeConfig();
  let publicKey = config.vapidPublicKey || (await readSetting('vapid_public_key'));
  let privateKey = config.vapidPrivateKey || (await readSetting('vapid_private_key'));

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await writeSetting('vapid_public_key', publicKey);
    await writeSetting('vapid_private_key', privateKey);
  }

  const subject = config.vapidSubject || 'mailto:admin@feedwire.local';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  cached = { publicKey, privateKey, subject };
  return cached;
}

export async function savePushSubscription(userId, subscription, userAgent) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid push subscription',
      data: { error: 'Invalid push subscription' },
    });
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            user_agent = EXCLUDED.user_agent,
            last_error = NULL`,
    [userId, endpoint, p256dh, auth, userAgent ?? null]
  );
}

export async function removePushSubscription(userId, endpoint) {
  const { rowCount } = await query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, endpoint]
  );
  return rowCount > 0;
}

export async function listPushSubscriptions(userId) {
  const { rows } = await query(
    `SELECT id, endpoint, user_agent, created_at, last_success_at, last_error
       FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function deliver(row, payload) {
  await getVapid();
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(payload),
      { TTL: 3600 }
    );
    await query(
      'UPDATE push_subscriptions SET last_success_at = now(), last_error = NULL WHERE id = $1',
      [row.id]
    );
    return true;
  } catch (error) {
    const status = error?.statusCode;
    if (status === 404 || status === 410) {
      await query('DELETE FROM push_subscriptions WHERE id = $1', [row.id]);
    } else {
      await query(
        'UPDATE push_subscriptions SET last_error = $2 WHERE id = $1',
        [row.id, String(error?.message ?? error).slice(0, 300)]
      );
    }
    return false;
  }
}

export async function sendToUser(userId, payload) {
  const { rows } = await query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  let sent = 0;
  for (const row of rows) {
    if (await deliver(row, payload)) sent += 1;
  }
  return sent;
}

/**
 * Notify every subscriber of a feed who opted into push about new stories.
 * Called from the queue so a slow push service never blocks a feed refresh.
 */
export async function notifyFeedSubscribers(feedId, items) {
  if (!items?.length) return { sent: 0 };
  const { rows } = await query(
    `SELECT s.user_id, f.title AS feed_title
       FROM subscriptions s JOIN feeds f ON f.id = s.feed_id
      WHERE s.feed_id = $1 AND s.notify = true`,
    [feedId]
  );
  if (!rows.length) return { sent: 0 };

  const feedTitle = rows[0].feed_title || 'Feedwire';
  const first = items[0];
  const body =
    items.length === 1
      ? first.title
      : `${first.title} and ${items.length - 1} more`;
  const payload = {
    title: feedTitle,
    body,
    url: first.id ? `/item/${first.id}` : '/reader',
    tag: `feed-${feedId}`,
  };

  let sent = 0;
  for (const row of rows) {
    sent += await sendToUser(row.user_id, payload);
  }
  return { sent };
}
