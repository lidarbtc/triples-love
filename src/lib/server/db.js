import { error } from '@sveltejs/kit';

export function getDb(event) {
  const db = event.platform?.env?.DB;
  if (!db) error(503, 'The project database is unavailable. Please try again later.');
  return db;
}

export async function consumeRateLimit(db, key, limit, windowMs) {
  const now = Date.now();
  const row = await db.prepare(`
    INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
    RETURNING count
  `).bind(key, now + windowMs, now, now).first();
  if (row.count > limit) error(429, 'Too many attempts. Please wait and try again.');
  // Keep expired keys from growing indefinitely; no background service is needed.
  await db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now).run();
}
