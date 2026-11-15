import { error, fail, isHttpError } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth.js';
import { budgetedRenderer, checkBacklink, getBacklinkStatus, recordBacklinkCheck } from '$lib/server/backlinks.js';
import { consumeRateLimit, getDb } from '$lib/server/db.js';
import { recordResult } from '$lib/server/observability.js';
import { getProject, pageLanguage } from '$lib/server/projects.js';
import { renderPageLinks } from '$lib/server/render.js';

export async function load(event) {
  const db = getDb(event);
  const { results: projects } = await db.prepare('SELECT id, name, url, status FROM projects ORDER BY name COLLATE NOCASE').all();
  const projectId = event.url.searchParams.get('project') || '';
  if (projectId && !projects.some(project => project.id === projectId)) error(404, 'Project not found.');
  const requestedType = event.url.searchParams.get('type');
  return {
    projects, projectId, user: event.locals.user, lang: pageLanguage(event),
    backlink: projectId ? await getBacklinkStatus(db, projectId) : null,
    type: ['listed', 'discover'].includes(requestedType) ? requestedType : projectId ? 'listed' : 'discover',
    theme: event.url.searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  };
}

export const actions = {
  check: async event => {
    const user = await requireUser(event);
    const db = getDb(event, 'backlink.check');
    const form = await event.request.formData();
    const projectId = String(form.get('project') || '');
    const project = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectId) ? await getProject(db, projectId) : null;
    if (!project) {
      recordResult(event, 'backlink.check', 404, 'not_found');
      error(404, 'Project not found.');
    }
    if (project.status !== 'active') {
      recordResult(event, 'backlink.check', 409, 'archived');
      return fail(409, { check: { projectId, state: 'unreachable', code: 'archived' } });
    }
    try {
      await consumeRateLimit(db, `backlink:user:${user.id}`, 10, 60 * 60 * 1000);
      await consumeRateLimit(db, `backlink:project:${project.id}`, 4, 10 * 60 * 1000);
    } catch (cause) {
      if (!isHttpError(cause, 429)) throw cause;
      recordResult(event, 'backlink.check', 429, 'rate_limited');
      return fail(429, { check: { projectId, state: 'unreachable', code: 'rate_limited' } });
    }
    const browser = event.platform?.env?.BROWSER;
    const result = await checkBacklink(project, {
      render: browser ? budgetedRenderer(db, url => renderPageLinks(browser, url)) : null
    });
    await recordBacklinkCheck(db, project.id, result);
    const status = await getBacklinkStatus(db, project.id);
    // Site outages are user-site states, not triples.love dependency failures.
    recordResult(event, 'backlink.check', 200, result.state === 'found' ? undefined : `banner_${result.code}`);
    return { check: { projectId, state: result.state, code: result.code ?? null, featured: Boolean(status?.featured) } };
  }
};
