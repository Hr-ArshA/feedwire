/**
 * Operator audit trail. Every state change an admin makes through the
 * dashboard lands here so "who deleted that feed" has an answer.
 */
export async function recordAudit(actor, action, { target = null, detail = null } = {}) {
  try {
    await query(
      `INSERT INTO admin_audit (actor_id, actor_email, action, target, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actor?.id ?? null,
        actor?.email ?? null,
        String(action).slice(0, 120),
        target ? String(target).slice(0, 300) : null,
        detail ? JSON.stringify(detail) : null,
      ]
    );
  } catch (error) {
    console.warn('[audit] could not record', action, error.message);
  }
}

export async function listAudit(limit = 20) {
  const { rows } = await query(
    `SELECT a.id, a.actor_email, a.action, a.target, a.detail, a.created_at,
            u.display_name AS actor_name
       FROM admin_audit a
       LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 20, 1), 200)]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    actor: row.actor_name || row.actor_email || 'system',
    actorEmail: row.actor_email,
    action: row.action,
    target: row.target,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}
