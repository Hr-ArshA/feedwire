/**
 * Crawlers may index the public landing page and every readable story, but
 * never the authenticated app surfaces or the JSON API.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event);
  const siteUrl = String(config.public.siteUrl ?? '').replace(/\/+$/, '');

  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=3600');

  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /reader',
    'Disallow: /settings',
    'Disallow: /saved',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /print/',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
});
