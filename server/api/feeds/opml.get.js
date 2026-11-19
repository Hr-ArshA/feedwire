import { requireUser } from '../../utils/auth.js';
import { listUserFeeds } from '../../utils/feeds.js';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Exports the caller's subscriptions as an OPML 2.0 document. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const feeds = await listUserFeeds(user.id);

  const outlines = feeds
    .map((feed) => {
      const title = escapeXml(feed.title || feed.url);
      const html = feed.site_url ? ` htmlUrl="${escapeXml(feed.site_url)}"` : '';
      return `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeXml(feed.url)}"${html} />`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Feedwire subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>
`;

  setHeader(event, 'content-type', 'text/x-opml; charset=utf-8');
  setHeader(
    event,
    'content-disposition',
    'attachment; filename="feedwire-subscriptions.opml"'
  );
  return xml;
});
