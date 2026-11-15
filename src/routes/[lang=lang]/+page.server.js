import { getDb } from '$lib/server/db.js';
import { listProjects } from '$lib/server/projects.js';
import { FEATURED_SLOTS, listFeaturedIds } from '$lib/server/backlinks.js';

export async function load(event) {
  const db = getDb(event);
  const [sites, featuredIds] = await Promise.all([listProjects(db), listFeaturedIds(db)]);
  return { sites, featuredIds, featuredSlots: FEATURED_SLOTS, user: event.locals.user };
}
