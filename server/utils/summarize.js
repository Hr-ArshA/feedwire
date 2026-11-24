import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getArticle } from './article-store.js';

/**
 * A small summarisation model can be dropped into `models/` and is picked up
 * automatically through the same Transformers.js runtime the embeddings use.
 * When it is not installed the extractive summariser below runs instead, so the
 * feature never depends on a download.
 */
const MODEL_ID = process.env.SUMMARY_MODEL ?? 'Xenova/distilbart-cnn-6-6';

const root = process.env.FEEDWIRE_ROOT
  ? resolve(process.env.FEEDWIRE_ROOT)
  : process.cwd();

let pipelinePromise = null;

function modelInstalled() {
  return existsSync(join(root, 'models', MODEL_ID));
}

async function loadSummarizer() {
  if (!modelInstalled()) return null;
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      return pipeline('summarization', MODEL_ID, { dtype: 'q8' });
    })().catch((error) => {
      console.warn('[summary] model unavailable:', error.message);
      pipelinePromise = null;
      return null;
    });
  }
  return pipelinePromise;
}

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those of in on at to for from by with without into over under
   is are was were be been being it its as not no so such can could would should will may might must have has had do
   does did we you they he she i our your their there here what which who whom when where why how about after before
   more most other some any all both each few many much very also just only own same too s t don now`
    .split(/\s+/)
    .filter(Boolean)
);

function sentencesOf(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?؟])\s+(?=[A-Z"“«\u0600-\u06FF])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40);
}

function wordsOf(sentence) {
  return sentence
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Classic frequency-based extractive summary: score every sentence by the
 * weight of the words it contains, keep the best ones in reading order. No
 * model, no network, and it works for Persian as well as English.
 */
export function extractiveSummary(text, { maxSentences = 5, maxChars = 900 } = {}) {
  const sentences = sentencesOf(text);
  if (!sentences.length) return String(text ?? '').trim().slice(0, maxChars);
  if (sentences.length <= maxSentences) return sentences.join(' ');

  const frequency = new Map();
  for (const sentence of sentences) {
    for (const word of wordsOf(sentence)) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }

  const scored = sentences.map((sentence, index) => {
    const words = wordsOf(sentence);
    const score = words.reduce(
      (total, word) => total + (frequency.get(word) ?? 0),
      0
    );
    // Longer sentences carry more signal, but a very long one should not win
    // on length alone.
    const lengthFactor = Math.min(words.length, 40) / 40;
    return { index, sentence, score: (score / Math.max(words.length, 1)) * (0.6 + lengthFactor) };
  });

  const picked = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);

  let summary = '';
  for (const sentence of picked) {
    if (summary && summary.length + sentence.length > maxChars) break;
    summary = summary ? `${summary} ${sentence}` : sentence;
  }
  return summary || picked[0] || '';
}

async function modelSummary(text) {
  const summarizer = await loadSummarizer();
  if (!summarizer) return null;
  const input = String(text ?? '').slice(0, 6000);
  if (input.length < 200) return null;
  const output = await summarizer(input, {
    max_new_tokens: 220,
    min_new_tokens: 40,
    do_sample: false,
  });
  const summary = Array.isArray(output)
    ? output.map((entry) => entry.summary_text ?? '').join(' ').trim()
    : String(output?.summary_text ?? '').trim();
  return summary || null;
}

/**
 * Returns the stored summary for a story, generating it on first request and
 * caching it on the row so every reader shares one pass.
 */
export async function summarizeItem(itemId, userId = null, { force = false } = {}) {
  const { rows } = await query(
    `SELECT summary_ai, summary_ai_at, summary_ai_engine
       FROM items WHERE id = $1`,
    [itemId]
  );
  const row = rows[0];
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Story not found',
      data: { error: 'Story not found' },
    });
  }

  if (!force && row.summary_ai) {
    return {
      summary: row.summary_ai,
      engine: row.summary_ai_engine ?? 'extractive',
      cached: true,
      createdAt: row.summary_ai_at,
    };
  }

  const article = await getArticle(itemId, userId, { wait: false });
  const body = String(article.text ?? '').trim();
  if (body.length < 80) {
    throw createError({
      statusCode: 422,
      statusMessage: 'This story has no text to summarise yet',
      data: { error: 'This story has no text to summarise yet' },
    });
  }

  let summary = await modelSummary(body).catch(() => null);
  let engine = 'model';
  if (!summary) {
    summary = extractiveSummary(body);
    engine = 'extractive';
  }

  await query(
    `UPDATE items
        SET summary_ai = $2, summary_ai_at = now(), summary_ai_engine = $3
      WHERE id = $1`,
    [itemId, summary, engine]
  );

  return { summary, engine, cached: false, createdAt: new Date().toISOString() };
}
