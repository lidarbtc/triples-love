import { error } from '@sveltejs/kit';

const projectSelect = `SELECT p.*, u.id AS owner_id, u.handle AS owner_handle,
  u.display_name AS owner_name, u.avatar_url AS owner_avatar, o.verified_at
  FROM projects p LEFT JOIN project_owners o ON o.project_id = p.id
  LEFT JOIN users u ON u.id = o.user_id`;

function shapeProject(row, translations) {
  const locales = Object.fromEntries(translations.map(copy => [copy.lang, {
    tagline: copy.tagline, description: copy.description, badges: JSON.parse(copy.badges_json)
  }]));
  return {
    id: row.id, name: row.name, url: row.url, domain: row.domain,
    category: row.category, addedAt: row.added_at, accent: row.accent, theme: row.theme,
    status: row.status, archivedAt: row.archived_at, archiveReason: row.archive_reason,
    archiveUrl: row.archive_url, updatedAt: row.updated_at, version: row.version,
    aliases: JSON.parse(row.aliases_json), links: JSON.parse(row.links_json), locales,
    ...(locales.en || { tagline: '', description: '', badges: [] }),
    owner: row.owner_id ? {
      id: row.owner_id, handle: row.owner_handle, displayName: row.owner_name,
      avatarUrl: row.owner_avatar, verifiedAt: row.verified_at
    } : null
  };
}

export async function listProjects(db) {
  const [projects, translations] = await db.batch([
    db.prepare(`${projectSelect} ORDER BY p.added_at, p.id`),
    db.prepare('SELECT * FROM project_translations')
  ]);
  const copies = new Map();
  for (const copy of translations.results) {
    if (!copies.has(copy.project_id)) copies.set(copy.project_id, []);
    copies.get(copy.project_id).push(copy);
  }
  return projects.results.map(row => shapeProject(row, copies.get(row.id) || []));
}

export async function getProject(db, id) {
  const row = await db.prepare(`${projectSelect} WHERE p.id = ?`).bind(id).first();
  if (!row) return null;
  const copies = await db.prepare('SELECT * FROM project_translations WHERE project_id = ?').bind(id).all();
  return shapeProject(row, copies.results);
}

export function pageLanguage(event) {
  return event.url.searchParams.get('lang') === 'ko' ? 'ko' : 'en';
}

function textField(form, key, max, required = false) {
  const raw = form.get(key);
  if (typeof raw !== 'string') throw new Error(`Missing field: ${key}.`);
  const value = raw.trim();
  if ((required && !value) || value.length > max) {
    throw new Error(`${key}: ${required ? 'enter 1' : 'use up to 0'}–${max} characters.`);
  }
  return value;
}

function commaList(value, maxCount, maxLength, label) {
  const list = [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
  if (list.length > maxCount || list.some(item => item.length > maxLength)) {
    throw new Error(`${label}: at most ${maxCount} entries, ${maxLength} characters each.`);
  }
  return list;
}

export function validateProjectForm(form) {
  const name = textField(form, 'name', 80, true);
  const category = textField(form, 'category', 20, true);
  const accent = textField(form, 'accent', 20, true);
  const theme = textField(form, 'theme', 20, true);
  if (!['objekts', 'stats', 'schedule', 'market', 'tools', 'wiki', 'hub'].includes(category)) throw new Error('Choose a category.');
  if (!['blue', 'amber', 'violet'].includes(accent)) throw new Error('Choose an accent color.');
  if (!['auto', 'light', 'dark'].includes(theme)) throw new Error('Choose a theme.');
  const locales = {};
  for (const lang of ['en', 'ko']) {
    locales[lang] = {
      tagline: textField(form, `tagline_${lang}`, 160, lang === 'en'),
      description: textField(form, `description_${lang}`, 3000, lang === 'en'),
      badges: commaList(textField(form, `badges_${lang}`, 500), 10, 40, 'Tags')
    };
  }
  const aliases = commaList(textField(form, 'aliases', 1200), 20, 60, 'Search aliases');
  const linkLines = textField(form, 'links', 6000).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (linkLines.length > 8) throw new Error('Add at most 8 links.');
  const links = linkLines.map(line => {
    const separator = line.indexOf('|');
    const label = line.slice(0, separator).trim();
    const href = line.slice(separator + 1).trim();
    let url;
    try { url = new URL(href); } catch { throw new Error('Each link needs a label and an HTTPS URL, separated by |.'); }
    if (separator < 1 || !label || label.length > 60 || href.length > 600 || url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Links need a short label and an HTTPS URL without credentials.');
    }
    return { label, url: url.href };
  });
  const versionText = textField(form, 'version', 16, true);
  if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(Number(versionText))) throw new Error('Invalid page version. Please reload.');
  return { name, category, accent, theme, locales, aliases, links, version: Number(versionText) };
}

export async function saveProject(db, id, userId, values) {
  const editToken = crypto.randomUUID();
  const statements = [db.prepare(`UPDATE projects SET name=?, category=?, accent=?, theme=?,
    aliases_json=?, links_json=?, updated_at=?, version=version+1, edit_token=?
    WHERE id=? AND version=? AND status='active'
    AND EXISTS (SELECT 1 FROM project_owners WHERE project_id=projects.id AND user_id=?)
  `).bind(values.name, values.category, values.accent, values.theme,
    JSON.stringify(values.aliases), JSON.stringify(values.links), Date.now(), editToken, id, values.version, userId)];
  for (const [lang, copy] of Object.entries(values.locales)) {
    statements.push(db.prepare(`INSERT INTO project_translations (project_id, lang, tagline, description, badges_json)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND edit_token=?)
      ON CONFLICT(project_id, lang) DO UPDATE SET tagline=excluded.tagline,
      description=excluded.description, badges_json=excluded.badges_json
    `).bind(id, lang, copy.tagline, copy.description, JSON.stringify(copy.badges), id, editToken));
  }
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1) error(409, 'This page changed or you no longer have permission. Reload before saving again.');
}
