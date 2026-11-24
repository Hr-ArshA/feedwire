import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { safeFetch } from './safe-fetch.js';
import { normalizeText } from './text.js';
import { unwrapGoogleRedirect } from './google-news.js';

const MAX_HTML_BYTES = 6 * 1024 * 1024;
const MAX_CONTENT_CHARS = 20_000;
const MAX_EMBED_CHARS = 3_000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Many publishers (Forbes, Fortune, Reuters, WSJ, …) answer bare requests with
 * 403 or a consent/JS wall. Sending the header set a real browser sends, plus
 * the Google News referer when the story came from there, gets past most of it.
 */
const BROWSER_HEADERS = {
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9,fa;q=0.8',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

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
 * Downloads a page with browser-like headers. `referer` matters for Google
 * News stories: several publishers only serve the article when the request
 * looks like a click-through from Google.
 */
function fetchPage(url, referer, timeoutMs = 10_000) {
  return safeFetch(url, {
    maxBytes: MAX_HTML_BYTES,
    timeoutMs,
    accept: BROWSER_HEADERS.accept,
    userAgent: BROWSER_UA,
    headers: {
      ...BROWSER_HEADERS,
      ...(referer ? { referer } : {}),
    },
  });
}

/**
 * Google's translate proxy is a slow hop. It is only worth half the patience of
 * the publisher itself, otherwise a blocked story keeps the reader waiting.
 */
const PROXY_TIMEOUT_MS = 4_000;

function looksLikeWall(html) {
  const head = String(html ?? '').slice(0, 6000).toLowerCase();
  if (!head) return true;
  if (head.includes('consent.google.com')) return true;
  if (head.includes('before you continue to google')) return true;
  if (head.includes('enable javascript and cookies to continue')) return true;
  if (head.includes('checking your browser before accessing')) return true;
  if (head.includes('verify you are human')) return true;
  if (head.includes('captcha') && head.includes('robot')) return true;
  if (head.includes('trying to send you to')) return true;
  if (head.includes('<title>redirect notice')) return true;
  return false;
}

/**
 * Google's "Redirect Notice" interstitial is served for `google.com/url?q=`
 * links and for the `/amp/s/` fallback. It is readable HTML, so Readability
 * happily extracted the notice itself as the article. Recognise it and follow
 * the URL it names instead.
 */
function isRedirectNotice(html) {
  const head = String(html ?? '').slice(0, 6000);
  return /trying to send you to/i.test(head) || /<title>\s*Redirect Notice/i.test(head);
}

function redirectNoticeTarget(html, baseUrl) {
  const text = String(html ?? '').replace(/&amp;/g, '&');

  const notice = /is trying to send you to\s*<?(https?:\/\/[^\s"'<>]+)/i.exec(text);
  if (notice) {
    try {
      return new URL(notice[1].replace(/[.,)]+$/, ''), baseUrl).toString();
    } catch {
      /* fall through to the meta refresh */
    }
  }

  const meta = /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*?url=([^"'>;\s]+)/i.exec(text);
  if (meta) {
    try {
      return new URL(meta[1], baseUrl).toString();
    } catch {
      /* ignore malformed refresh target */
    }
  }
  return null;
}

function ampHref(html, baseUrl) {
  const patterns = [
    /<link[^>]+rel=["']amphtml["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']amphtml["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return new URL(match[1], baseUrl).toString();
      } catch {
        /* ignore malformed amp link */
      }
    }
  }
  return null;
}

function parseArticle(html, finalUrl) {
  if (!html || looksLikeWall(html)) return null;

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
    return null;
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
    partial: false,
  };
}

/**
 * Downloads a story and turns it into readable, safe HTML with images routed
 * through our own proxy. Tries the page itself first, then its AMP twin (which
 * is usually served without the paywall/consent layer). Throws with a human
 * message when nothing readable can be found.
 */
/**
 * Google's translate proxy fetches the page from Google's own network and
 * serves it from `*.translate.goog`. That makes it a reliable last resort for
 * publishers that reset connections from this network (BBC is the common one).
 */
function translateProxyUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('.translate.goog')) return null;
    const host = parsed.hostname.replace(/\./g, '-');
    const target = new URL(
      `https://${host}.translate.goog${parsed.pathname}`
    );
    for (const [key, value] of parsed.searchParams) {
      target.searchParams.set(key, value);
    }
    target.searchParams.set('_x_tr_sl', 'auto');
    target.searchParams.set('_x_tr_tl', 'en');
    target.searchParams.set('_x_tr_hl', 'en');
    return target.toString();
  } catch {
    return null;
  }
}

async function extractViaTranslateProxy(url, referer) {
  const proxy = translateProxyUrl(url);
  if (!proxy) return null;
  try {
    const page = await fetchPage(proxy, referer, PROXY_TIMEOUT_MS);
    if (page.status >= 400) return null;
    const parsed = parseArticle(page.buffer.toString('utf8'), page.finalUrl);
    if (!parsed) return null;
    // Report the publisher URL, not the Google proxy we read it through:
    // `finalUrl` ends up in `items.resolved_link` and in the "Open original"
    // link, where a translate.goog address would be wrong (and unproxyable).
    return { ...parsed, viaProxy: true, finalUrl: url };
  } catch {
    return null;
  }
}

/** Resolve with the first attempt that produced a readable article. */
function firstParsed(promises) {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (!pending) return resolve(null);
    for (const promise of promises) {
      promise.then(
        (value) => {
          if (value) resolve(value);
          else if (--pending === 0) resolve(null);
        },
        () => {
          if (--pending === 0) resolve(null);
        }
      );
    }
  });
}

async function fetchAndParse(url, referer) {
  try {
    const page = await fetchPage(url, referer);
    if (page.status >= 400) return null;
    return parseArticle(page.buffer.toString('utf8'), page.finalUrl);
  } catch {
    return null;
  }
}

export async function extractArticle(url, { referer } = {}) {
  // A Google redirect wrapper is never the story itself.
  const startUrl = unwrapGoogleRedirect(url) ?? url;
  let firstError = null;
  let directOk = false;

  // Start the publisher and the translate proxy together: whichever yields a
  // readable body first wins, so one slow/blocked route no longer doubles the
  // wait. The direct page is still kept for the AMP fallbacks below.
  const directTask = (async () => {
    try {
      let page = await fetchPage(startUrl, referer);
      let html = page.buffer.toString('utf8');
      // Follow a redirect notice (Google's /url page) to the real publisher.
      for (let hop = 0; hop < 2 && isRedirectNotice(html); hop += 1) {
        const target = redirectNoticeTarget(html, page.finalUrl);
        if (!target || target === page.finalUrl) break;
        const next = await fetchPage(target, referer);
        if (next.status >= 400) break;
        page = next;
        html = next.buffer.toString('utf8');
      }
      if (page.status < 400 && /html|xml/i.test(page.contentType || 'html')) {
        const parsed = parseArticle(html, page.finalUrl);
        if (parsed) {
          directOk = true;
          return { parsed, page, html };
        }
      }
      return { parsed: null, page, html };
    } catch (error) {
      firstError = error;
      return { parsed: null, page: null, html: '' };
    }
  })();

  // The translate proxy is a second download, so it waits for the publisher —
  // but only for two seconds. Publishers that answer instantly with an error
  // (a DNS block, for one) release the proxy immediately instead of sitting on
  // the timer, which is what made Google News stories feel stuck.
  const gracePeriod = new Promise((resolve) => setTimeout(resolve, 2000));
  const proxyTask = Promise.race([directTask, gracePeriod]).then(() =>
    directOk ? null : extractViaTranslateProxy(startUrl, referer)
  );

  const direct = await directTask;
  if (direct.parsed) return direct.parsed;

  const proxied = await proxyTask;
  if (proxied) return proxied;

  const first = direct.page;
  if (first) {
    const candidates = [];
    const amp = ampHref(direct.html, first.finalUrl);
    if (amp) candidates.push(amp);

    try {
      const parsed = new URL(first.finalUrl);
      if (!/\/amp\/?$/i.test(parsed.pathname)) {
        candidates.push(`${first.finalUrl.replace(/\/+$/, '')}/amp`);
        candidates.push(`${first.finalUrl}${parsed.search ? '&' : '?'}amp=1`);
        candidates.push(
          `https://www.google.com/amp/s/${parsed.host}${parsed.pathname}${parsed.search}`
        );
      }
    } catch {
      /* ignore malformed URL */
    }

    const parsed = await firstParsed(
      [...new Set(candidates)].map((candidate) => fetchAndParse(candidate, referer))
    );
    if (parsed) return parsed;
  }

  if (!first) {
    throw new Error(
      `Could not reach the publisher: ${firstError?.message ?? 'network error'}`
    );
  }
  if (first.status === 401 || first.status === 403) {
    throw new Error(
      `The publisher blocked this request (HTTP ${first.status}). Open the original page instead.`
    );
  }
  if (first.status === 429) {
    throw new Error('The publisher is rate-limiting requests right now. Try again later.');
  }
  if (first.status >= 400) {
    throw new Error(`The page responded with HTTP ${first.status}`);
  }
  if (first.contentType && !/html|xml/i.test(first.contentType)) {
    throw new Error('That link is not an HTML page');
  }
  throw new Error('Could not find readable content on that page');
}

export function embeddableContent(title, text) {
  return `${title ?? ''}\n${String(text ?? '').slice(0, MAX_EMBED_CHARS)}`;
}

export function normalizedContent(text) {
  return normalizeText(String(text ?? '').slice(0, MAX_CONTENT_CHARS));
}
