const ORIGIN = 'https://triples.love';

export const badgeTypes = {
  listed: { label: 'Listed on triples.love', width: 216, height: 32 },
  discover: { label: 'Discover more fan projects', width: 240, height: 44 }
};

function validateProjectId(projectId) {
  if (typeof projectId !== 'string' || projectId.length > 128 ||
      (projectId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectId))) {
    throw new Error('Choose a valid project.');
  }
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
}

export function createBadgeEmbed({ type = 'discover', theme = 'light', projectId = '', lang = 'en' } = {}) {
  if (type !== 'listed' && type !== 'discover') throw new Error('Choose a valid banner type.');
  if (theme !== 'light' && theme !== 'dark') throw new Error('Choose a valid banner theme.');
  validateProjectId(projectId);
  if (type === 'listed' && !projectId) throw new Error('Choose a project for the listed banner.');

  const target = new URL(type === 'listed' ? `/p/${encodeURIComponent(projectId)}/` : '/', ORIGIN);
  if (type === 'listed') target.searchParams.set('lang', lang === 'ko' ? 'ko' : 'en');
  target.searchParams.set('utm_source', 'badge');
  const href = target.href;
  const src = `${ORIGIN}/badges/${type}-${theme}.svg`;
  const alt = type === 'listed' ? badgeTypes.listed.label : 'Discover more fan projects on triples.love';
  const { width, height } = badgeTypes[type];
  const html = `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener">\n` +
    `  <img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async" style="display:block;max-width:100%;height:auto;border:0">\n` +
    '</a>';
  const markdown = `[![${alt}](${src})](${href})`;
  return { href, src, alt, width, height, html, markdown };
}

export function badgePageHref(projectId = '', lang = 'en') {
  validateProjectId(projectId);
  const query = new URLSearchParams();
  if (projectId) query.set('project', projectId);
  query.set('lang', lang === 'ko' ? 'ko' : 'en');
  return `/badges/?${query}`;
}
