import { classify, embedPassages, loadModel, toArray } from './embeddings.js';
import { MODEL_ID } from './model.js';
import { embeddableContent } from './article.js';

const BATCH_SIZE = 6;
const IDLE_DELAY = 4000;

const status = {
  ready: false,
  model: MODEL_ID,
  error: null,
  processed: 0,
};

let timer = null;
let busy = false;
let started = false;

export async function getIndexStatus() {
  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded,
            count(*) FILTER (WHERE content_text IS NOT NULL)::int AS content_total,
            count(*) FILTER (WHERE content_embedding IS NOT NULL)::int AS content_embedded
       FROM items`
  );
  const { total, embedded, content_total, content_embedded } = rows[0];
  return {
    ...status,
    total,
    embedded,
    pending: Math.max(0, total - embedded),
    contentTotal: content_total,
    contentEmbedded: content_embedded,
    contentPending: Math.max(0, content_total - content_embedded),
  };
}

function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(tick, delay);
}

/** Headline pass: embed the title + summary and assign a category. */
async function embedHeadlines() {
  const { rows } = await query(
    `SELECT id, title, summary
       FROM items
      WHERE embedding IS NULL
      ORDER BY id
      LIMIT $1`,
    [BATCH_SIZE]
  );
  if (!rows.length) return false;

  const vectors = await embedPassages(
    rows.map((row) => `${row.title}\n${row.summary ?? ''}`)
  );

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const vector = vectors[index];
    const { category, score, source } = await classify(
      vector,
      row.title,
      row.summary
    );
    await query(
      `UPDATE items
          SET embedding = $2::real[],
              embedding_model = $3,
              category = $4,
              category_score = $5,
              category_source = $6
        WHERE id = $1 AND embedding IS NULL`,
      [row.id, toArray(vector), MODEL_ID, category, score, source]
    );
    status.processed += 1;
  }
  return true;
}

/**
 * Body pass: once a story has been opened and its text extracted, embed the
 * article body so full-text search can match things that never appear in the
 * headline or the feed summary.
 */
async function embedBodies() {
  const { rows } = await query(
    `SELECT id, title, content_text
       FROM items
      WHERE content_embedding IS NULL
        AND content_text IS NOT NULL
      ORDER BY id
      LIMIT $1`,
    [BATCH_SIZE]
  );
  if (!rows.length) return false;

  const vectors = await embedPassages(
    rows.map((row) => embeddableContent(row.title, row.content_text))
  );

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    await query(
      `UPDATE items
          SET content_embedding = $2::real[],
              content_embedding_model = $3
        WHERE id = $1 AND content_embedding IS NULL`,
      [row.id, toArray(vectors[index]), MODEL_ID]
    );
  }
  return true;
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const didHeadlines = await embedHeadlines();
    const didBodies = await embedBodies();

    status.ready = true;
    status.error = null;
    busy = false;
    schedule(didHeadlines || didBodies ? 20 : IDLE_DELAY);
  } catch (error) {
    status.error = error.message;
    busy = false;
    schedule(5000);
  }
}

export function startIndexer() {
  if (started) return;
  started = true;
  loadModel()
    .then(() => {
      status.ready = true;
      status.error = null;
    })
    .catch((error) => {
      status.error = error.message;
    });
  schedule(300);
}

export async function reindexAll() {
  await query(
    `UPDATE items
        SET embedding = NULL,
            category = NULL,
            category_score = NULL,
            content_embedding = NULL`
  );
  status.processed = 0;
  schedule(50);
  return getIndexStatus();
}

export async function reclassifyAll() {
  const { rows } = await query(
    `SELECT id, title, summary, embedding
       FROM items WHERE embedding IS NOT NULL`
  );
  let changed = 0;
  for (const row of rows) {
    const { category, score, source } = await classify(
      row.embedding,
      row.title,
      row.summary
    );
    await query(
      `UPDATE items SET category = $2, category_score = $3, category_source = $4
        WHERE id = $1`,
      [row.id, category, score, source]
    );
    changed += 1;
  }
  await cacheDelPattern('categories:*');
  await cacheDelPattern('user:*:categories');
  return { changed };
}
