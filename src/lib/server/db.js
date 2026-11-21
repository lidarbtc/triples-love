import { error } from '@sveltejs/kit';
import { recordResult } from './observability.js';

export function getDb(event, operation = 'project.read') {
  const db = event.locals?.env?.DB;
  if (!db) {
    recordResult(event, operation, 503, 'db_unavailable');
    error(503, 'The project database is unavailable. Please try again later.');
  }
  const originals = new WeakMap();
  async function execute(work) {
    const start = performance.now();
    try { return await work(); } catch (cause) {
      recordResult(event, operation, 500, 'db_failed', { operation_ms: performance.now() - start });
      throw cause;
    }
  }
  function statement(raw) {
    const wrapped = {
      bind: (...values) => statement(raw.bind(...values)),
      first: (...args) => execute(() => raw.first(...args)),
      all: (...args) => execute(() => raw.all(...args)),
      run: (...args) => execute(() => raw.run(...args))
    };
    originals.set(wrapped, raw);
    return wrapped;
  }
  return {
    prepare: sql => {
      try { return statement(db.prepare(sql)); } catch (cause) {
        recordResult(event, operation, 500, 'db_failed');
        throw cause;
      }
    },
    batch: statements => execute(() => db.batch(statements.map(item => originals.get(item) ?? item)))
  };
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
