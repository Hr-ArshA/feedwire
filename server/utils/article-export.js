import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const PROXY_PREFIX = '/api/proxy/image?u=';

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre',
  'table', 'thead', 'tbody', 'tr', 'figure', 'figcaption', 'hr', 'dl', 'dt',
  'dd',
]);

/**
 * Article HTML stores images as `/api/proxy/image?u=<encoded>`. Exports leave
 * the app, so point them back at the original absolute URLs.
 */
export function externalizeImages(html) {
  return String(html ?? '').replace(
    /\/api\/proxy\/image\?u=([^"'\s>]+)/g,
    (match, encoded) => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return match;
      }
    }
  );
}

function walk(node, out) {
  if (node.nodeType === 3) {
    out.push(String(node.nodeValue ?? '').replace(/\s+/g, ' '));
    return;
  }
  if (node.nodeType !== 1) return;

  const tag = node.tagName.toLowerCase();
  if (tag === 'br') {
    out.push('\n');
    return;
  }
  if (tag === 'img') {
    const alt = node.getAttribute('alt');
    if (alt) out.push(`[${alt}]`);
    return;
  }

  if (tag === 'li') out.push('\n- ');
  else if (BLOCK_TAGS.has(tag)) out.push('\n\n');

  for (const child of node.childNodes) walk(child, out);

  if (tag !== 'li' && BLOCK_TAGS.has(tag)) out.push('\n\n');
}

/** Readable plain text with real paragraph breaks. */
export function htmlToText(html) {
  const { document } = parseHTML('<html><body></body></html>');
  const root = document.createElement('div');
  root.innerHTML = externalizeImages(html);
  const out = [];
  for (const child of root.childNodes) walk(child, out);
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function turndown() {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  service.use(gfm);
  service.remove(['script', 'style', 'noscript']);
  return service;
}

export function htmlToMarkdown(html) {
  return turndown().turndown(externalizeImages(html)).trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function metaLine(article) {
  return [
    article.feed_title,
    article.author,
    article.published_at ? new Date(article.published_at).toISOString().slice(0, 10) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A standalone, self-contained document. The small stylesheet here belongs to
 * the exported file (a document the user saves), not to the app UI.
 */
export function toStandaloneHtml(article) {
  const title = escapeHtml(article.title || 'Article');
  const meta = escapeHtml(metaLine(article));
  const source = article.link
    ? `<p class="source">Source: <a href="${escapeHtml(article.link)}">${escapeHtml(article.link)}</a></p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fff; color: #1a1a1a;
    font: 16px/1.7 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  article { max-width: 720px; margin: 0 auto; padding: 48px 24px 64px; }
  h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 12px; }
  .meta { margin: 0 0 32px; color: #666; font-size: 13px; }
  img { max-width: 100%; height: auto; border-radius: 8px; }
  a { color: #b4501a; }
  pre { overflow-x: auto; background: #f5f5f5; padding: 12px; border-radius: 8px; }
  code { background: #f5f5f5; padding: 1px 4px; border-radius: 4px; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 20px 0; padding-left: 16px; border-left: 3px solid #e5e5e5; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e5e5e5; padding: 6px 10px; text-align: left; }
  .source { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5;
    color: #666; font-size: 13px; word-break: break-all; }
</style>
</head>
<body>
<article>
  <h1>${title}</h1>
  <p class="meta">${meta}</p>
  <div class="content">
${externalizeImages(article.html)}
  </div>
  ${source}
</article>
</body>
</html>
`;
}

export function slugify(value) {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'article';
}

const FORMATS = {
  html: { extension: 'html', contentType: 'text/html; charset=utf-8' },
  md: { extension: 'md', contentType: 'text/markdown; charset=utf-8' },
  txt: { extension: 'txt', contentType: 'text/plain; charset=utf-8' },
};

/**
 * HTTP headers are Latin-1: a Persian title in `filename="…"` makes Node throw
 * ERR_INVALID_CHAR. Send an ASCII fallback plus an RFC 5987 UTF-8 filename.
 */
export function contentDisposition(filename) {
  const fallback =
    String(filename ?? '')
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'article';
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function isExportFormat(format) {
  return Object.hasOwn(FORMATS, format);
}

export function buildExport(article, format) {
  const spec = FORMATS[format];
  if (!spec) throw new Error(`Unsupported export format: ${format}`);

  let body;
  if (format === 'html') body = toStandaloneHtml(article);
  else if (format === 'md') body = htmlToMarkdown(article.html);
  else body = htmlToText(article.html);

  return {
    body,
    contentType: spec.contentType,
    filename: `${slugify(article.title)}.${spec.extension}`,
  };
}

function translationParagraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function translationDocument(article, translation) {
  const title = escapeHtml(translation.title || article.title || 'ترجمه');
  const source = article.link
    ? `<p class="source">منبع: <a href="${escapeHtml(article.link)}">${escapeHtml(article.link)}</a></p>`
    : '';
  const body = translationParagraphs(translation.text)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join('\n');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fff; color: #1a1a1a;
    font: 17px/1.9 Vazirmatn, Tahoma, ui-sans-serif, system-ui, sans-serif; }
  article { max-width: 720px; margin: 0 auto; padding: 48px 24px 64px; }
  h1 { font-size: 1.7rem; line-height: 1.5; margin: 0 0 12px; }
  .meta { margin: 0 0 28px; color: #666; font-size: 13px; }
  p { margin: 0 0 14px; }
  a { color: #b4501a; }
  .source { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5;
    color: #666; font-size: 13px; word-break: break-all; }
</style>
</head>
<body>
<article>
  <h1>${title}</h1>
  <p class="meta">ترجمه ماشینی توسط گوگل ترنسلیت · ${escapeHtml(article.feed_title ?? '')}</p>
  ${body}
  ${source}
</article>
</body>
</html>
`;
}

/**
 * Exports the Persian translation instead of the original body. The reader and
 * the print page both use this so a translated story can leave the app too.
 */
export function buildTranslationExport(article, translation, format) {
  const spec = FORMATS[format];
  if (!spec) throw new Error(`Unsupported export format: ${format}`);

  const paragraphs = translationParagraphs(translation.text);
  let body;
  if (format === 'html') body = translationDocument(article, translation);
  else if (format === 'md') {
    body = [`# ${translation.title || article.title || ''}`, '', ...paragraphs.map((part) => `${part}\n`)]
      .join('\n')
      .trim();
  } else {
    body = [translation.title || article.title || '', '', ...paragraphs].join('\n\n').trim();
  }

  return {
    body,
    contentType: spec.contentType,
    filename: `${slugify(translation.title || article.title)}-fa.${spec.extension}`,
  };
}
