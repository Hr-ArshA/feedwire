const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
};

/**
 * Content-Security-Policy for the app shell. Nuxt hydrates through an inline
 * payload script and reka-ui sets inline styles, so both need 'unsafe-inline';
 * everything else is locked to this origin. Article bodies are sanitised
 * server-side and every image goes through `/api/proxy/image`, so no publisher
 * host has to be allowed here.
 */
function contentSecurityPolicy(dev) {
  const connect = dev ? "'self' ws: wss:" : "'self'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ');
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Security headers for every response, plus a CSRF guard on state-changing
 * requests. The guard compares the browser-supplied Origin (or Referer) with
 * the site's own origin, which is the standard defence for cookie-authenticated
 * forms alongside the session cookie's `SameSite=Lax`. Requests from non-browser
 * clients (no Origin and no Referer) are allowed, since they cannot be forged by
 * a third-party page.
 */
export default defineEventHandler((event) => {
  const response = event.node.res;
  for (const [name, value] of Object.entries(BASE_HEADERS)) {
    response.setHeader(name, value);
  }

  const config = useRuntimeConfig();
  const dev = process.env.NODE_ENV !== 'production';
  response.setHeader('content-security-policy', contentSecurityPolicy(dev));

  const forwardedProto = String(
    event.node.req.headers['x-forwarded-proto'] ?? ''
  ).split(',')[0];
  const secure =
    forwardedProto === 'https' || Boolean(event.node.req.socket?.encrypted);
  if (secure) {
    response.setHeader(
      'strict-transport-security',
      'max-age=15552000; includeSubDomains'
    );
  }

  const method = String(event.node.req.method ?? 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return;

  // Server-to-server calls (SSR, curl, tests) carry no Origin and no Referer.
  const origin = event.node.req.headers.origin;
  const referer = event.node.req.headers.referer;
  if (!origin && !referer) return;

  const allowed = new Set();
  const siteUrl = originOf(String(config.public.siteUrl ?? ''));
  if (siteUrl) allowed.add(siteUrl);
  const host = String(event.node.req.headers.host ?? '');
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }

  const actual = originOf(String(origin ?? referer));
  if (actual && allowed.has(actual)) return;

  throw createError({
    statusCode: 403,
    statusMessage: 'Cross-site request blocked',
    data: { error: 'Cross-site request blocked' },
  });
});
