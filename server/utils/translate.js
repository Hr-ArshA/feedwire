import { safeFetch } from './safe-fetch.js';
import { htmlToText } from './article-export.js';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MAX_CHUNK = 3900;
const MAX_CHUNKS = 24;
const REQUEST_TIMEOUT = 20_000;
const DELAY_MS = 180;

const inflight = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Google Translate accepts roughly 5k characters per call; we stay well under
 * that and cut on paragraph, then sentence, then hard boundaries.
 */
export function splitIntoChunks(text, max = MAX_CHUNK) {
  const source = String(text ?? '').trim();
  if (!source) return [];
  if (source.length <= max) return [source];

  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of source.split(/\n{2,}/)) {
    if (paragraph.length > max) {
      flush();
      const sentences = paragraph.match(/[^.!?؟。]+[.!?؟。]*\s*/g) ?? [paragraph];
      for (const sentence of sentences) {
        if (sentence.length > max) {
          flush();
          for (let index = 0; index < sentence.length; index += max) {
            const piece = sentence.slice(index, index + max).trim();
            if (piece) chunks.push(piece);
          }
        } else if ((current + sentence).length > max) {
          flush();
          current = sentence;
        } else {
          current += sentence;
        }
      }
    } else if ((current ? current.length + 2 : 0) + paragraph.length > max) {
      flush();
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  flush();
  return chunks.filter(Boolean);
}

async function requestTranslation(chunk, target) {
  const url = `${ENDPOINT}?client=gtx&sl=auto&tl=${encodeURIComponent(
    target
  )}&dt=t&q=${encodeURIComponent(chunk)}`;
  const { status, buffer } = await safeFetch(url, {
    maxBytes: 4 * 1024 * 1024,
    timeoutMs: REQUEST_TIMEOUT,
    accept: 'application/json,text/plain,*/*',
  });
  if (status >= 400) throw new Error(`Google Translate responded with HTTP ${status}`);

  const data = JSON.parse(buffer.toString('utf8'));
  const segments = Array.isArray(data?.[0]) ? data[0] : [];
  const text = segments
    .map((segment) => (Array.isArray(segment) ? segment[0] : ''))
    .join('');
  if (!text.trim()) throw new Error('Google Translate returned an empty result');
  return text;
}

async function translateChunk(chunk, target) {
  try {
    return await requestTranslation(chunk, target);
  } catch {
    await delay(700);
    return requestTranslation(chunk, target);
  }
}

export async function translateText(text, target = 'fa') {
  const chunks = splitIntoChunks(text).slice(0, MAX_CHUNKS);
  if (!chunks.length) throw new Error('Nothing to translate');

  const parts = [];
  for (const chunk of chunks) {
    parts.push(await translateChunk(chunk, target));
    await delay(DELAY_MS);
  }
  return parts.join('\n\n').trim();
}

export async function getTranslation(itemId, lang = 'fa') {
  const { rows } = await query(
    `SELECT item_id, lang, title, content_text, source, error, created_at
       FROM translations WHERE item_id = $1 AND lang = $2`,
    [itemId, lang]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    item_id: Number(row.item_id),
    lang: row.lang,
    title: row.title,
    text: row.content_text,
    source: row.source,
    error: row.error,
    created_at: row.created_at,
  };
}

/**
 * Translates a story once. Concurrent callers share the same promise, and the
 * result is persisted so later readers get it instantly.
 */
export async function translateItem(article, lang = 'fa') {
  const itemId = Number(article.id);
  const cached = await getTranslation(itemId, lang);
  if (cached?.text && !cached.error) return cached;

  const key = `${itemId}:${lang}`;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    try {
      const body = htmlToText(article.html);
      if (!body) throw new Error('This story has no text to translate');

      const [title, text] = await Promise.all([
        article.title ? translateText(article.title, lang).catch(() => null) : null,
        translateText(body, lang),
      ]);

      const { rows } = await query(
        `INSERT INTO translations (item_id, lang, title, content_text, source, error, created_at)
         VALUES ($1, $2, $3, $4, 'google', NULL, now())
         ON CONFLICT (item_id, lang) DO UPDATE
            SET title = EXCLUDED.title,
                content_text = EXCLUDED.content_text,
                source = EXCLUDED.source,
                error = NULL,
                created_at = now()
         RETURNING item_id, lang, title, content_text, source, error, created_at`,
        [itemId, lang, title, text]
      );
      const row = rows[0];
      return {
        item_id: Number(row.item_id),
        lang: row.lang,
        title: row.title,
        text: row.content_text,
        source: row.source,
        error: row.error,
        created_at: row.created_at,
      };
    } catch (error) {
      const message = String(error?.message ?? 'Translation failed').slice(0, 400);
      await query(
        `INSERT INTO translations (item_id, lang, source, error, created_at)
         VALUES ($1, $2, 'google', $3, now())
         ON CONFLICT (item_id, lang) DO UPDATE
            SET error = EXCLUDED.error, created_at = now()`,
        [itemId, lang, message]
      ).catch(() => {});
      throw createError({
        statusCode: 502,
        statusMessage: message,
        data: { error: message },
      });
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}
