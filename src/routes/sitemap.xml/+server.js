import { getDb } from '$lib/server/db.js';
import { listProjects } from '$lib/server/projects.js';
import { buildSitemap } from '$lib/seo.js';

export async function GET(event) {
  const projects = await listProjects(getDb(event));
  return new Response(buildSitemap(projects), {
    headers: { 'content-type': 'application/xml; charset=utf-8' }
  });
}
