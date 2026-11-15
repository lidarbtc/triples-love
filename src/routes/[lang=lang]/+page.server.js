import { getDb } from '$lib/server/db.js';
import { listProjects } from '$lib/server/projects.js';
import { listFeaturedIds } from '$lib/server/backlinks.js';

export async function load(event) {
  const db = getDb(event);
  const [sites, featuredIds] = await Promise.all([listProjects(db), listFeaturedIds(db)]);
  return { sites, featuredIds, user: event.locals.user };
}
