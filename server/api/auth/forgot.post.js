import {
  createPasswordReset,
  prunePasswordResets,
} from '../../utils/auth.js';
import { rateLimit } from '../../utils/redis.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends a reset link if the address exists. The response is always the same
 * `{ ok: true }` so the endpoint cannot be used to enumerate accounts.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const config = useRuntimeConfig();

  const ip =
    getRequestIP(event, { xForwardedFor: true }) ??
    event.node.req.socket.remoteAddress ??
    'unknown';
  const ipLimit = await rateLimit(`forgot:ip:${ip}`, 10, 900);
  if (!ipLimit.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many reset requests. Try again later.',
      data: { error: 'Too many reset requests. Try again later.' },
    });
  }

  if (!EMAIL_RE.test(email)) return { ok: true };

  const emailLimit = await rateLimit(`forgot:email:${email}`, 3, 900);
  if (!emailLimit.allowed) return { ok: true };

  const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
  const user = rows[0];
  let resetUrl;

  if (user) {
    const token = await createPasswordReset(user.id);
    resetUrl = `${config.public.siteUrl}/reset?token=${encodeURIComponent(token)}`;
    console.log(`[auth] password reset link for ${email}: ${resetUrl}`);

    if (config.resetWebhookUrl) {
      await $fetch(config.resetWebhookUrl, {
        method: 'POST',
        timeout: 8000,
        body: {
          to: email,
          subject: 'Reset your Feedwire password',
          resetUrl,
        },
      }).catch((error) => {
        console.warn('[auth] reset webhook failed:', error.message);
      });
    }
  }

  prunePasswordResets();

  return {
    ok: true,
    resetUrl: config.resetLinkInResponse ? resetUrl : undefined,
  };
});
