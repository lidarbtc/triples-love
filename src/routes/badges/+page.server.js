import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';
import { pageLanguage } from '$lib/server/projects.js';

export async function load(event) {
  const { results: projects } = await getDb(event).prepare('SELECT id, name FROM projects ORDER BY name COLLATE NOCASE').all();
  const projectId = event.url.searchParams.get('project') || '';
  if (projectId && !projects.some(project => project.id === projectId)) error(404, 'Project not found.');
  const requestedType = event.url.searchParams.get('type');
  return {
    projects, projectId, user: event.locals.user, lang: pageLanguage(event),
    type: ['listed', 'discover'].includes(requestedType) ? requestedType : projectId ? 'listed' : 'discover',
    theme: event.url.searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  };
}
