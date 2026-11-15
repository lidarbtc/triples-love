import { mkdir, writeFile } from 'node:fs/promises';
import { sites } from '../src/lib/data.js';
import { siteCopy, siteSearchAliases } from '../src/lib/i18n.js';

const sql = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const statements = ['-- Insert missing listings and translations; never overwrite owner edits.'];
for (const site of sites) {
  const values = [site.id, site.name, site.url, site.domain, site.category, site.addedAt,
    site.accent, 'light', site.status || 'active', site.archivedAt, site.archiveReason,
    site.archiveUrl, JSON.stringify(siteSearchAliases[site.id] || []), '[]', Date.parse(site.addedAt)];
  statements.push(`INSERT OR IGNORE INTO projects (id,name,url,domain,category,added_at,accent,theme,status,archived_at,archive_reason,archive_url,aliases_json,links_json,updated_at) VALUES (${values.map(sql).join(',')});`);
  for (const lang of ['en', 'ko']) {
    const copy = { tagline: site.tagline, description: site.description, badges: site.badges, ...siteCopy[lang]?.[site.id] };
    statements.push(`INSERT OR IGNORE INTO project_translations (project_id,lang,tagline,description,badges_json) VALUES (${[site.id,lang,copy.tagline,copy.description,JSON.stringify(copy.badges)].map(sql).join(',')});`);
  }
}
await mkdir('.wrangler', { recursive: true });
await writeFile('.wrangler/seed-projects.sql', `${statements.join('\n')}\n`);
console.log(`Prepared ${sites.length} projects and ${sites.length * 2} translations in .wrangler/seed-projects.sql`);
