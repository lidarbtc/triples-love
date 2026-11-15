// Website-banner backlink checks and featured eligibility. Keep imports relative:
// the scheduled Worker bundles this module outside SvelteKit's $lib alias.
import { parse } from 'parse5';
import { ProofError, fetchSiteHtml, validateTargetUrl } from './proof.js';

export const FEATURED_SLOTS = 4;
export const FEATURED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const MISS_LIMIT = 2;
export const RENDER_BUDGET_KEY = 'backlink:render:daily';
export const RENDER_DAILY_LIMIT = 40;
export const DAY_MS = 24 * 60 * 60 * 1000;
const BACKLINK_HOSTS = new Set(['triples.love', 'www.triples.love']);
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const MAX_RENDERED_LINKS = 2000;

/** A banner link points to the directory homepage or to this project's own page. */
export function isBacklinkHref(href, baseUrl, projectId) {
  if (typeof href !== 'string' || href.length > 2048) return false;
  let url;
  try { url = new URL(href.trim(), baseUrl); } catch { return false; }
  if (!['https:', 'http:'].includes(url.protocol) || url.port || !BACKLINK_HOSTS.has(url.hostname)) return false;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return path === '/' || path === '/en' || path === '/ko' || path === `/p/${projectId}`;
}

/**
 * Find a real anchor in parsed HTML. Text inside comments, scripts, noscript and
 * template content is not an anchor, so it never counts as a banner.
 */
export function findBacklinkInHtml(html, pageUrl, projectId) {
  const stack = [parse(html)];
  while (stack.length) {
    const node = stack.pop();
    if (node.tagName === 'a' && node.namespaceURI === HTML_NS) {
      const href = node.attrs.find(attr => attr.name === 'href')?.value;
      if (isBacklinkHref(href, pageUrl, projectId)) return new URL(href.trim(), pageUrl).href;
    }
    if (node.childNodes) stack.push(...node.childNodes);
  }
  return null;
}

export function findBacklinkInLinks(hrefs, pageUrl, projectId) {
  if (!Array.isArray(hrefs)) return null;
  for (const href of hrefs.slice(0, MAX_RENDERED_LINKS)) {
    if (isBacklinkHref(href, pageUrl, projectId)) return new URL(href.trim(), pageUrl).href;
  }
  return null;
}

/**
 * Check the registered URL only. Raw HTML is tried first; when it has no banner
 * link and a renderer is available, a browser renders the page so client-side
 * apps can be checked too. Results never include page content.
 */
export async function checkBacklink(project, { fetcher, resolve, render = null, timeoutMs } = {}) {
  let target;
  try { target = validateTargetUrl(project.url); }
  catch { return { state: 'unreachable', code: 'invalid_url', rendered: false }; }
  let rawError = null;
  try {
    const { url, html } = await fetchSiteHtml(target.href, { fetcher, resolve, timeoutMs, userAgent: 'triples.love banner check' });
    const href = findBacklinkInHtml(html, url.href, project.id);
    if (href) return { state: 'found', detectedBy: 'html', href, rendered: false };
  } catch (error) {
    if (!(error instanceof ProofError)) throw error;
    if (error.code === 'invalid_url' || error.code === 'private_target') {
      return { state: 'unreachable', code: error.code, rendered: false };
    }
    rawError = error.code;
  }
  if (!render) {
    return rawError ? { state: 'unreachable', code: rawError, rendered: false } : { state: 'missing', code: 'not_found', rendered: false };
  }
  let page;
  try {
    page = await render(target.href);
  } catch (error) {
    // A render failure is not evidence that the banner was removed.
    return { state: 'unreachable', code: error?.code === 'render_unavailable' ? 'render_unavailable' : 'render_failed', rendered: false };
  }
  let finalUrl;
  try { finalUrl = new URL(page?.url); } catch { return { state: 'unreachable', code: 'render_failed', rendered: true }; }
  if (finalUrl.origin !== target.origin) return { state: 'unreachable', code: 'redirect', rendered: true };
  const href = findBacklinkInLinks(page.hrefs, finalUrl.href, project.id);
  if (href) return { state: 'found', detectedBy: 'rendered', href, rendered: true };
  return { state: 'missing', code: 'not_found', rendered: true };
}

/** Store one check. Missing increments the miss count; unreachable keeps the previous evidence. */
export async function recordBacklinkCheck(db, projectId, result, now = Date.now()) {
  const found = result.state === 'found';
  return db.prepare(`INSERT INTO project_backlinks
      (project_id, state, detected_by, link_href, first_found_at, last_found_at, last_checked_at, miss_count, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      state = excluded.state,
      detected_by = CASE WHEN excluded.state = 'found' THEN excluded.detected_by ELSE project_backlinks.detected_by END,
      link_href = CASE WHEN excluded.state = 'found' THEN excluded.link_href ELSE project_backlinks.link_href END,
      first_found_at = CASE WHEN excluded.state = 'found'
        THEN COALESCE(project_backlinks.first_found_at, excluded.first_found_at) ELSE project_backlinks.first_found_at END,
      last_found_at = CASE WHEN excluded.state = 'found' THEN excluded.last_found_at ELSE project_backlinks.last_found_at END,
      last_checked_at = excluded.last_checked_at,
      miss_count = CASE excluded.state WHEN 'found' THEN 0
        WHEN 'missing' THEN project_backlinks.miss_count + 1 ELSE project_backlinks.miss_count END,
      last_error = excluded.last_error
    RETURNING *`).bind(
    projectId, result.state, found ? result.detectedBy : null, found ? result.href : null,
    found ? now : null, found ? now : null, now, result.state === 'missing' ? 1 : 0,
    found ? null : (result.code || null)
  ).first();
}

/** row combines project status with its project_backlinks record. */
export function isFeatured(row, now = Date.now()) {
  if (!row || row.status !== 'active' || row.override === 'force_off') return false;
  if (row.override === 'force_on') return true;
  return Boolean(row.last_found_at) && row.miss_count < MISS_LIMIT && now - row.last_found_at <= FEATURED_GRACE_MS;
}

export function seoulDateKey(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Same order for everyone on a Korean calendar day; a different order the next day. */
export function pickFeatured(ids, dateKey, slots = FEATURED_SLOTS) {
  return ids.map(id => [fnv1a(`${dateKey}:${id}`), id])
    .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1))
    .slice(0, slots).map(([, id]) => id);
}

export async function listFeaturedIds(db, now = Date.now()) {
  const { results } = await db.prepare(`SELECT p.id, p.status, b.override, b.last_found_at, b.miss_count
    FROM project_backlinks b JOIN projects p ON p.id = b.project_id`).all();
  return pickFeatured(results.filter(row => isFeatured(row, now)).map(row => row.id), seoulDateKey(now));
}

export async function getBacklinkStatus(db, projectId, now = Date.now()) {
  const row = await db.prepare(`SELECT p.status, b.* FROM project_backlinks b
    JOIN projects p ON p.id = b.project_id WHERE b.project_id = ?`).bind(projectId).first();
  if (!row) return null;
  return {
    state: row.state, detectedBy: row.detected_by, lastCheckedAt: row.last_checked_at,
    lastFoundAt: row.last_found_at, featured: isFeatured(row, now)
  };
}

/** Like the request rate limiter, but returns false instead of throwing an HTTP error. */
export async function tryConsumeBudget(db, key, limit, windowMs, now = Date.now()) {
  const row = await db.prepare(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
    RETURNING count`).bind(key, now + windowMs, now, now).first();
  return row.count <= limit;
}

/** Wrap a browser renderer with the shared daily rendering budget. */
export function budgetedRenderer(db, renderPage) {
  return async url => {
    if (!await tryConsumeBudget(db, RENDER_BUDGET_KEY, RENDER_DAILY_LIMIT, DAY_MS)) {
      throw Object.assign(new Error('Rendering budget exhausted.'), { code: 'render_unavailable' });
    }
    return renderPage(url);
  };
}
