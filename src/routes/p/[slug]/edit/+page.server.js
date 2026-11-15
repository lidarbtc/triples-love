import { error, fail, isHttpError } from '@sveltejs/kit';
import { getDb, consumeRateLimit } from '$lib/server/db.js';
import { requireUser } from '$lib/server/auth.js';
import { getProject, pageLanguage, validateProjectForm, saveProject } from '$lib/server/projects.js';

async function ownerContext(event) {
  const user = await requireUser(event);
  const db = getDb(event);
  const project = await getProject(db, event.params.slug);
  if (!project) error(404, 'Project not found.');
  if (project.owner?.id !== user.id) error(403, 'Only the verified owner can edit this page.');
  if (project.status === 'archived') error(403, 'Archived projects cannot be edited.');
  return { db, project, user };
}

export async function load(event) {
  const { project, user } = await ownerContext(event);
  return { project, user, lang: pageLanguage(event) };
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
      return fail(400, { message: cause.message, values: Object.fromEntries([...form].filter(([, value]) => typeof value === 'string')) });
    }
    try {
      await saveProject(db, project.id, user.id, values);
    } catch (cause) {
      if (!isHttpError(cause)) throw cause;
      return fail(cause.status, { message: cause.body.message, values: Object.fromEntries(form) });
    }
    return { saved: true };
  }
};
