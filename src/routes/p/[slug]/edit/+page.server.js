import { recordResult } from '#lib/server/observability.js';
import { error, fail, isHttpError } from '@sveltejs/kit';
import { getDb, consumeRateLimit } from '#lib/server/db.js';
import { requireUser } from '#lib/server/auth.js';
import { getProject, pageLanguage, validateProjectForm, saveProject } from '#lib/server/projects.js';
import { getBacklinkStatus } from '#lib/server/backlinks.js';

async function ownerContext(event) {
  const user = await requireUser(event);
  const db = getDb(event, 'project.edit');
  const project = await getProject(db, event.params.slug);
  if (!project) error(404, 'Project not found.');
  if (project.owner?.id !== user.id) {
    recordResult(event, 'project.edit', 403, 'not_owner');
    error(403, 'Only the verified owner can edit this page.');
  }
  if (project.status === 'archived') {
    recordResult(event, 'project.edit', 403, 'archived');
    error(403, 'Archived projects cannot be edited.');
  }
  return { db, project, user };
}

export async function load(event) {
  const { db, project, user } = await ownerContext(event);
  return { project, user, lang: pageLanguage(event), featured: Boolean((await getBacklinkStatus(db, project.id))?.featured) };
}

export const actions = {
  default: async event => {
    const { db, project, user } = await ownerContext(event);
    await consumeRateLimit(db, `edit:${user.id}`, 30, 60_000);
    const form = await event.request.formData();
    let values;
    try {
      values = validateProjectForm(form);
    } catch (cause) {
      recordResult(event, 'project.edit', 400, 'invalid_input');
      return fail(400, { message: cause.message, values: Object.fromEntries([...form].filter(([, value]) => typeof value === 'string')) });
    }
    try {
      await saveProject(db, project.id, user.id, values);
    } catch (cause) {
      if (!isHttpError(cause)) throw cause;
      recordResult(event, 'project.edit', cause.status, cause.status === 409 ? 'version_conflict' : 'http_error');
      return fail(cause.status, { message: cause.body.message, values: Object.fromEntries(form) });
    }
    recordResult(event, 'project.edit', 200);
    return { saved: true };
  }
};
