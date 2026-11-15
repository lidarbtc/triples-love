import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';
import { getProject, pageLanguage } from '$lib/server/projects.js';
import { getBacklinkStatus } from '$lib/server/backlinks.js';

export async function load(event) {
  const db = getDb(event);
  const project = await getProject(db, event.params.slug);
  if (!project) error(404, 'Project not found.');
  const featured = Boolean((await getBacklinkStatus(db, project.id))?.featured);
  return { project, user: event.locals.user, lang: pageLanguage(event), featured };
}
