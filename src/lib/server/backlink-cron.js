// Scheduled rechecks. Each run checks the few projects checked longest ago, so
// the whole directory is revisited regularly without large subrequest bursts.
import { budgetedRenderer, checkBacklink, recordBacklinkCheck } from './backlinks.js';
import { renderPageLinks } from './render.js';

export const CRON_BATCH = 3;

export async function runScheduledBacklinkChecks(env, { renderer = renderPageLinks, fetcher, resolve, now = () => Date.now() } = {}) {
  const db = env.DB;
  const { results } = await db.prepare(`SELECT p.id, p.url, b.detected_by FROM projects p
    LEFT JOIN project_backlinks b ON b.project_id = p.id
    WHERE p.status = 'active' AND b.override IS NULL
    ORDER BY COALESCE(b.last_checked_at, 0), p.id LIMIT ?`).bind(CRON_BATCH).all();
  const summary = { checked: 0, found: 0, missing: 0, unreachable: 0, rendered: 0 };
  for (const project of results) {
    // Browser time is limited; only client-rendered banners found before are re-rendered.
    const render = env.BROWSER && project.detected_by === 'rendered'
      ? budgetedRenderer(db, url => renderer(env.BROWSER, url)) : null;
    const result = await checkBacklink(project, { fetcher, resolve, render });
    await recordBacklinkCheck(db, project.id, result, now());
    summary.checked += 1;
    summary[result.state] += 1;
    if (result.rendered) summary.rendered += 1;
  }
  try { console.info({ event: 'cron.backlinks', ...summary }); } catch { /* best effort */ }
  return summary;
}
