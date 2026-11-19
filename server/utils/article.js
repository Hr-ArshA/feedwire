import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { safeFetch } from './safe-fetch.js';
import { normalizeText } from './text.js';

const MAX_HTML_BYTES = 6 * 1024 * 1024;
const MAX_CONTENT_CHARS = 20_000;
const MAX_EMBED_CHARS = 3_000;

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col',
  'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins',
  'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'section', 'small', 'span',
  'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'u', 'ul',
];

function absoluteUrl(value, base) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function proxied(value, base) {
  const absolute = absoluteUrl(value, base);
  if (!absolute) return null;
  return `/api/proxy/image?u=${encodeURIComponent(absolute)}`;
}

function cleanHtml(html, baseUrl) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: {
      a: (tagName, attribs) => {
        const href = absoluteUrl(attribs.href, baseUrl);
        if (!href) return { tagName, attribs: {} };
        return {
          tagName,
          attribs: { href, target: '_blank', rel: 'noopener noreferrer' },
        };
      },
      img: (tagName, attribs) => {
        const src = proxied(attribs.src, baseUrl);
        if (!src) return { tagName: 'span', attribs: {} };
        return {
          tagName,
          attribs: {
            src,
            alt: attribs.alt ?? '',
            loading: 'lazy',
            ...(attribs.width ? { width: attribs.width } : {}),
            ...(attribs.height ? { height: attribs.height } : {}),
          },
        };
      },
    },
  });
}

function firstImage(html) {
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * Downloads a story and turns it into readable, safe HTML with images routed
 * through our own proxy. Throws with a human message when it cannot.
 */
export async function extractArticle(url) {
  const { status, buffer, contentType, finalUrl } = await safeFetch(url, {
    maxBytes: MAX_HTML_BYTES,
    timeoutMs: 15_000,
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  });

  if (status >= 400) throw new Error(`The page responded with HTTP ${status}`);
  if (contentType && !/html|xml/i.test(contentType)) {
    throw new Error('That link is not an HTML page');
  }

  const html = buffer.toString('utf8');
  const { document } = parseHTML(html);
  try {
    document.documentURI = finalUrl;
  } catch {
    /* linkedom may expose this as read-only */
  }

  let parsed = null;
  try {
    parsed = new Readability(document, { charThreshold: 120 }).parse();
  } catch {
    parsed = null;
  }

  const rawHtml = parsed?.content ?? '';
  if (!rawHtml || rawHtml.length < 120) {
    throw new Error('Could not find readable content on that page');
  }

  const contentHtml = cleanHtml(rawHtml, finalUrl);
  const text = String(parsed.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT_CHARS);

  return {
    title: (parsed.title ?? '').trim() || null,
    byline: (parsed.byline ?? '').trim() || null,
    siteName: (parsed.siteName ?? '').trim() || null,
    excerpt: (parsed.excerpt ?? '').trim() || null,
    html: contentHtml,
    text,
    leadImage: firstImage(contentHtml),
    finalUrl,
  };
}

export function embeddableContent(title, text) {
  return `${title ?? ''}\n${String(text ?? '').slice(0, MAX_EMBED_CHARS)}`;
}

export function normalizedContent(text) {
  return normalizeText(String(text ?? '').slice(0, MAX_CONTENT_CHARS));
}
