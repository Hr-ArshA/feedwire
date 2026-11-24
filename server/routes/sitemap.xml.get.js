import { query } from '../utils/db.js';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The public landing page plus every story that belongs to the public feed.
 * Private subscriptions never appear here.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const siteUrl = String(config.public.siteUrl ?? '').replace(/\/+$/, '');

  let rows = [];
  try {
    const result = await query(
      `SELECT i.id, COALESCE(i.published_at, i.fetched_at) AS lastmod
         FROM items i
         JOIN feeds f ON f.id = i.feed_id
        WHERE f.is_public = true
          AND i.link IS NOT NULL
        ORDER BY COALESCE(i.published_at, i.fetched_at) DESC
        LIMIT 5000`
    );
    rows = result.rows;
  } catch {
    rows = [];
  }

  const urls = [
    `<url><loc>${escapeXml(`${siteUrl}/`)}</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    ...rows.map((row) => {
      const lastmod = row.lastmod
        ? new Date(row.lastmod).toISOString()
        : undefined;
      return (
        `<url><loc>${escapeXml(`${siteUrl}/item/${row.id}`)}</loc>` +
        (lastmod ? `<lastmod>${lastmod}</lastmod>` : '') +
        '<changefreq>daily</changefreq><priority>0.7</priority></url>'
      );
    }),
  ];

  setHeader(event, 'content-type', 'application/xml; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=600');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
});
