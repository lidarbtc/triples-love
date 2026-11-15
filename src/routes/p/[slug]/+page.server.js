import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';
import { getProject, pageLanguage } from '$lib/server/projects.js';

export async function load(event) {
  const project = await getProject(getDb(event), event.params.slug);
  if (!project) error(404, 'Project not found.');
  return { project, user: event.locals.user, lang: pageLanguage(event) };
}
