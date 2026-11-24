/**
 * Reader engagement for a story: how many people opened it here, how many
 * liked it, and what else in the library sits close to it in vector space.
 */

export async function getItemStats(itemId, userId = null) {
  const { rows } = await query(
    `SELECT i.reader_count, i.like_count,
            EXISTS (
              SELECT 1 FROM item_views v
               WHERE v.item_id = i.id AND v.user_id = $2::uuid
            ) AS opened,
            COALESCE((
              SELECT ui.is_favorite FROM user_items ui
               WHERE ui.item_id = i.id AND ui.user_id = $2::uuid
            ), false) AS liked
       FROM items i
      WHERE i.id = $1`,
    [itemId, userId ?? null]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    readers: Number(row.reader_count ?? 0),
    likes: Number(row.like_count ?? 0),
    opened: Boolean(row.opened),
    liked: Boolean(row.liked),
  };
}

/**
 * Records that this reader opened the story. The primary key makes it one row
 * per person, so a reader who comes back tomorrow does not inflate the count.
 */
export async function recordView(itemId, userId) {
  if (!userId) return getItemStats(itemId, null);
  await query(
    `INSERT INTO item_views (item_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (item_id, user_id) DO UPDATE
        SET last_opened_at = now(),
            open_count = item_views.open_count + 1`,
    [itemId, userId]
  );
  return getItemStats(itemId, userId);
}

/**
 * Nearest neighbours of a story in the same vector space used for search.
 * Headline and body vectors are both considered, and the result is scoped to
 * what the caller is allowed to read.
 */
export async function relatedItems(itemId, userId = null, limit = 5) {
  const { rows } = await query(
    `WITH target AS (
       SELECT embedding FROM items WHERE id = $1
     )
     SELECT i.id, i.title, i.link, i.resolved_link, i.published_at,
            i.category, i.reader_count,
            f.title AS feed_title,
            GREATEST(
              COALESCE(dot_product(i.embedding, t.embedding), -1),
              COALESCE(dot_product(i.content_embedding, t.embedding), -1)
            ) AS score
       FROM items i
       JOIN feeds f ON f.id = i.feed_id
       CROSS JOIN target t
      WHERE i.id <> $1
        AND t.embedding IS NOT NULL
        AND (i.embedding IS NOT NULL OR i.content_embedding IS NOT NULL)
        AND (
          f.is_public = true
          OR ($2::uuid IS NOT NULL AND EXISTS (
                SELECT 1 FROM subscriptions s
                 WHERE s.feed_id = i.feed_id AND s.user_id = $2::uuid))
        )
      ORDER BY score DESC
      LIMIT $3`,
    [itemId, userId ?? null, Math.min(Math.max(Number(limit) || 5, 1), 12)]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    link: row.resolved_link || row.link,
    published_at: row.published_at,
    category: row.category,
    feed_title: row.feed_title,
    readers: Number(row.reader_count ?? 0),
    score: Number(row.score),
  }));
}
