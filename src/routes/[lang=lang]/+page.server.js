import { getDb } from '$lib/server/db.js';
import { listProjects } from '$lib/server/projects.js';

export async function load(event) {
  return { sites: await listProjects(getDb(event)), user: event.locals.user };
}
