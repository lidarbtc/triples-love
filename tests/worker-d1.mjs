// Standalone integration test: actual workerd D1, isolated from Wrangler state
// and remote databases. No GitHub credentials or live ownership proofs needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isHttpError } from '@sveltejs/kit';
import { Miniflare } from 'miniflare';
import { startClaim, verifyClaim } from '../src/lib/server/claims.js';
import { getProject, listProjects, saveProject } from '../src/lib/server/projects.js';
import { sites } from '../src/lib/data.js';
import { siteCopy, siteSearchAliases } from '../src/lib/i18n.js';

const worker = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("isolated D1 integration test"); } };',
  compatibilityDate: '2026-05-10',
  compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1',
  port: 0,
  d1Databases: { DB: 'test-claim-db' },
  d1Persist: false,
  outboundService: () => { throw new Error('External requests are disabled in this test.'); }
});

let passed = 0;
async function check(name, body) {
  await body();
  passed++;
  console.log(`PASS ${name}`);
}

function claimRequest(project, challenge, userId) {
  return { project, userId, challengeId: challenge.id, token: challenge.token };
}

async function seed(db, id) {
  const now = Date.now();
  const ownerA = `${id}-a`;
  const ownerB = `${id}-b`;
  const url = `https://fans.example.com/${id}`;
  await db.batch([
    ...[ownerA, ownerB].map(user => db.prepare(`
      INSERT INTO users (id,github_id,handle,display_name,avatar_url,created_at)
      VALUES (?,?,?,?,?,?)
    `).bind(user, user, user, user, '', now)),
    db.prepare(`INSERT INTO projects (id,name,url,domain,category,added_at,updated_at)
      VALUES (?,? ,?,'fans.example.com','tools','2026-10-10',?)
    `).bind(id, `Project ${id}`, url, now),
    ...['en', 'ko'].map(lang => db.prepare(`
      INSERT INTO project_translations (project_id,lang,tagline,description,badges_json)
      VALUES (?,?,?,?,'[]')
    `).bind(id, lang, `Original ${lang}`, `Description ${lang}`))
  ]);
  return { project: await getProject(db, id), ownerA, ownerB, now };
}

async function start(db, fixture, userId = fixture.ownerA, extra = {}) {
  return startClaim(db, { project: fixture.project, userId, method: 'meta', ...extra });
}

async function prove(db, fixture, challenge, userId = fixture.ownerA, options = {}) {
  return verifyClaim(db, claimRequest(fixture.project, challenge, userId), {
    verifyProof: async () => true,
    ...options
  });
}

try {
  console.log('Starting isolated workerd D1 binding...');
  const db = await worker.getD1Database('DB');
  console.log('D1 binding ready; applying initial migrations before the ownership upgrade...');
  for (const name of ['0001_claim.sql', '0002_unclaimed_light_theme.sql', '0007_resumable_verification_tokens.sql']) {
    const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
    // These migrations have no quoted semicolons or triggers. Remove full-line
    // comments first: migration 0002's comment itself contains a semicolon.
    const statements = migration.replace(/^\s*--[^\n]*$/gm, '').split(';').map(sql => sql.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  await check('manual approval migration preserves owners and keeps self-service proof requirements', async () => {
    const existing = await seed(db, 'migration-existing');
    await prove(db, existing, await start(db, existing));
    const before = await db.prepare('SELECT * FROM project_owners ORDER BY project_id').all();
    const projectBefore = await getProject(db, existing.project.id);
    const migration = await readFile(new URL('../migrations/0003_manual_ownership_verification.sql', import.meta.url), 'utf8');
    const statements = migration.replace(/^\s*--[^\n]*$/gm, '').split(';').map(sql => sql.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
    assert.deepEqual((await db.prepare('SELECT * FROM project_owners ORDER BY project_id').all()).results, before.results);
    assert.deepEqual(await getProject(db, existing.project.id), projectBefore);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name='owners_user'").first()).count, 1);

    const manual = await seed(db, 'migration-manual');
    await assert.rejects(start(db, manual, manual.ownerA, { method: 'manual' }), { code: 'invalid_method' });
    await db.prepare(`INSERT INTO project_owners
      (project_id,user_id,verified_at,verification_method,verified_url,challenge_id)
      VALUES (?,?,?,'manual',?,'manual:test-approval')
    `).bind(manual.project.id, manual.ownerA, manual.now, manual.project.url).run();
    const owned = await getProject(db, manual.project.id);
    assert.equal(owned.owner.id, manual.ownerA);
    await assert.rejects(startClaim(db, { project: owned, userId: manual.ownerB, method: 'meta' }), { code: 'already_claimed' });
    await saveProject(db, owned.id, manual.ownerA, { ...owned, name: 'Manually verified owner edit' });
    assert.equal((await getProject(db, owned.id)).name, 'Manually verified owner edit');
    await assert.rejects(db.prepare("UPDATE project_owners SET verification_method='unsupported' WHERE project_id=?")
      .bind(owned.id).run(), /CHECK constraint failed/i);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);

    for (const fixture of [existing, manual]) {
      await db.prepare('DELETE FROM projects WHERE id=?').bind(fixture.project.id).run();
      assert.equal(await db.prepare('SELECT project_id FROM project_owners WHERE project_id=?').bind(fixture.project.id).first(), null);
      await db.prepare('DELETE FROM users WHERE id IN (?,?)').bind(fixture.ownerA, fixture.ownerB).run();
    }
  });
  const generatedSeed = await readFile(new URL('../.wrangler/seed-projects.sql', import.meta.url), 'utf8');
  // The generator emits one INSERT per line; splitting on semicolons would
  // incorrectly split semicolons inside quoted project descriptions.
  const seedStatements = generatedSeed.split(/\r?\n/).map(sql => sql.trim()).filter(sql => sql && !sql.startsWith('--'));
  assert.ok(seedStatements.every(sql => /^INSERT OR IGNORE INTO /.test(sql) && sql.endsWith(';')),
    'Generated seed must contain one complete INSERT per line');
  const importSeed = () => db.batch(seedStatements.map(sql => db.prepare(sql)));
  console.log('Migrations applied; testing D1 seed and transaction behavior...');

  await check('actual generated seed imports every project, both locales, aliases and archive fields', async () => {
    await importSeed();
    const projects = await listProjects(db);
    assert.equal(projects.length, sites.length);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM project_translations').first()).count, sites.length * 2);
    for (const site of sites) {
      const project = projects.find(project => project.id === site.id);
      assert.ok(project, `Missing project ${site.id}`);
      assert.equal(project.name, site.name);
      assert.equal(project.url, site.url);
      assert.equal(project.domain, site.domain);
      assert.equal(project.status, site.status || 'active');
      assert.equal(project.archivedAt, site.archivedAt ?? null);
      assert.equal(project.archiveReason, site.archiveReason ?? null);
      assert.equal(project.archiveUrl, site.archiveUrl ?? null);
      assert.deepEqual(project.aliases, siteSearchAliases[site.id] || []);
      for (const lang of ['en', 'ko']) {
        assert.deepEqual(project.locales[lang], {
          tagline: site.tagline, description: site.description, badges: site.badges,
          ...siteCopy[lang]?.[site.id]
        });
      }
    }
    console.log(`Imported ${projects.length} projects and ${sites.length * 2} translations into isolated D1.`);
  });

  await check('reimporting the seed preserves owned content, both edited locales and verification', async () => {
    const userId = 'seed-owner';
    await db.prepare('INSERT INTO users (id,github_id,handle,display_name,avatar_url,created_at) VALUES (?,?,?,?,?,?)')
      .bind(userId, userId, userId, 'Seed owner', '', Date.now()).run();
    const project = await getProject(db, 'apollo');
    const challenge = await startClaim(db, { project, userId, method: 'meta' });
    await verifyClaim(db, claimRequest(project, challenge, userId), { verifyProof: async () => true });
    const owned = await getProject(db, project.id);
    await saveProject(db, project.id, userId, {
      ...owned, name: 'Owner-edited Apollo', theme: 'dark', aliases: ['owner alias'],
      links: [{ label: 'Guide', url: 'https://apollo.cafe/guide' }],
      locales: {
        en: { tagline: 'Owner tagline', description: 'Owner description', badges: ['owner'] },
        ko: { tagline: '소유자 소개', description: '소유자 설명', badges: ['소유자'] }
      }
    });
    const before = await getProject(db, project.id);
    await importSeed();
    assert.deepEqual(await getProject(db, project.id), before);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM projects').first()).count, sites.length);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM project_translations').first()).count, sites.length * 2);
  });

  await check('D1.batch rolls back preceding writes when a later CHECK constraint fails', async () => {
    const before = await getProject(db, 'apollo');
    await assert.rejects(db.batch([
      db.prepare('UPDATE projects SET name=?, version=version+1 WHERE id=?').bind('Must roll back', before.id),
      db.prepare(`INSERT INTO projects (id,name,url,domain,category,added_at,updated_at)
        VALUES ('invalid-batch-project','Invalid','https://fans.example.com/','fans.example.com','invalid','2026-10-10',0)`)
    ]), /CHECK constraint failed/i);
    assert.deepEqual(await getProject(db, before.id), before);
    assert.equal(await getProject(db, 'invalid-batch-project'), null);
  });

  await check('D1.batch preserves changes() across successful and zero-row writes', async () => {
    const fixture = await seed(db, 'batch');
    const result = await db.batch([
      db.prepare('UPDATE projects SET version=version+1 WHERE id=?').bind(fixture.project.id),
      db.prepare('SELECT changes() AS changed'),
      db.prepare('UPDATE projects SET version=version+1 WHERE id=? AND changes()=1').bind(fixture.project.id),
      db.prepare('SELECT changes() AS changed'),
      db.prepare('UPDATE projects SET version=version+1 WHERE id=?').bind('missing-project'),
      db.prepare('UPDATE projects SET version=version+1 WHERE id=? AND changes()=1').bind(fixture.project.id)
    ]);
    assert.equal(result[0].meta.changes, 1);
    assert.equal(result[1].results[0].changed, 1);
    assert.equal(result[2].meta.changes, 1);
    assert.equal(result[3].results[0].changed, 1);
    assert.equal(result[4].meta.changes, 0);
    assert.equal(result[5].meta.changes, 0);
    assert.equal((await getProject(db, fixture.project.id)).version, 2);
  });

  await check('verified claim atomically grants ownership, consumes proof and rejects replay', async () => {
    const fixture = await seed(db, 'claim');
    const challenge = await start(db, fixture);
    const verifiedAt = Date.now();
    await prove(db, fixture, challenge, fixture.ownerA, { now: verifiedAt });
    const owned = await getProject(db, fixture.project.id);
    const proof = await db.prepare('SELECT * FROM verification_challenges WHERE id=?').bind(challenge.id).first();
    assert.equal(owned.owner.id, fixture.ownerA);
    assert.equal(owned.version, 1);
    assert.equal(proof.consumed_at, verifiedAt);
    // The token is kept so an unfinished proof can be resumed; lookups still use its hash.
    assert.equal(proof.token, challenge.token);
    assert.notEqual(proof.token_hash, challenge.token);
    await assert.rejects(
      verifyClaim(db, claimRequest(owned, challenge, fixture.ownerA), {
        now: verifiedAt,
        verifyProof: async () => assert.fail('A consumed proof must not be fetched again')
      }),
      { code: 'invalid_challenge' }
    );
    assert.equal((await getProject(db, fixture.project.id)).version, 1);
  });

  await check('concurrent valid claimants yield exactly one owner and one consumed challenge', async () => {
    const fixture = await seed(db, 'race');
    const a = await start(db, fixture, fixture.ownerA);
    const b = await start(db, fixture, fixture.ownerB);
    let arrivals = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const timeout = setTimeout(release, 5000);
    const verifyProof = async () => {
      arrivals++;
      if (arrivals === 2) release();
      await gate;
      return true;
    };
    let results;
    try {
      results = await Promise.allSettled([
        prove(db, fixture, a, fixture.ownerA, { verifyProof }),
        prove(db, fixture, b, fixture.ownerB, { verifyProof })
      ]);
    } finally {
      clearTimeout(timeout);
      release();
    }
    assert.equal(arrivals, 2, 'Both claimants reached external verification before either committed');
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'changed');
    const winner = results[0].status === 'fulfilled' ? fixture.ownerA : fixture.ownerB;
    const owned = await getProject(db, fixture.project.id);
    assert.equal(owned.owner.id, winner);
    assert.equal(owned.version, 1);
    const proofs = await db.prepare('SELECT user_id, consumed_at FROM verification_challenges WHERE project_id=?').bind(fixture.project.id).all();
    assert.equal(proofs.results.filter(proof => proof.consumed_at !== null).length, 1);
    assert.equal(proofs.results.find(proof => proof.user_id !== winner).consumed_at, null);
  });

  await check('owner URL changes require fresh proof and update verification and URL together', async () => {
    const fixture = await seed(db, 'url-change');
    const initial = await start(db, fixture);
    await prove(db, fixture, initial);
    fixture.project = await getProject(db, fixture.project.id);
    const previousUrl = fixture.project.url;
    const replacement = 'https://new-fans.example.com/archive';
    const challenge = await start(db, fixture, fixture.ownerA, { method: 'dns', targetUrl: replacement });
    const now = Date.now();
    assert.equal((await getProject(db, fixture.project.id)).url, previousUrl);
    await assert.rejects(prove(db, fixture, challenge, fixture.ownerA, { now, verifyProof: async () => false }), { code: 'not_verified' });
    assert.equal((await getProject(db, fixture.project.id)).url, previousUrl);
    await prove(db, fixture, challenge, fixture.ownerA, { now: now + 3000 });
    const after = await getProject(db, fixture.project.id);
    const ownership = await db.prepare('SELECT * FROM project_owners WHERE project_id=?').bind(fixture.project.id).first();
    assert.equal(after.owner.id, fixture.ownerA);
    assert.equal(after.url, replacement);
    assert.equal(after.domain, 'new-fans.example.com');
    assert.equal(after.version, 2);
    assert.equal(ownership.verified_url, replacement);
    assert.equal(ownership.verification_method, 'dns');
    assert.equal(ownership.challenge_id, challenge.id);
    await assert.rejects(startClaim(db, { project: after, userId: fixture.ownerB, method: 'meta' }), { code: 'already_claimed' });
  });

  await check('URL changed during verification prevents all ownership transaction writes', async () => {
    const fixture = await seed(db, 'stale-proof');
    const challenge = await start(db, fixture);
    const replacement = 'https://changed.example.com/';
    await assert.rejects(prove(db, fixture, challenge, fixture.ownerA, {
      verifyProof: async () => {
        await db.prepare('UPDATE projects SET url=? WHERE id=?').bind(replacement, fixture.project.id).run();
        return true;
      }
    }), { code: 'changed' });
    const after = await getProject(db, fixture.project.id);
    assert.equal(after.owner, null);
    assert.equal(after.url, replacement);
    assert.equal(after.version, 0);
    assert.equal((await db.prepare('SELECT consumed_at FROM verification_challenges WHERE id=?').bind(challenge.id).first()).consumed_at, null);
  });

  await check('optimistic saves reject stale versions and unauthorized users without partial translations', async () => {
    const fixture = await seed(db, 'edit');
    const challenge = await start(db, fixture);
    await prove(db, fixture, challenge);
    const owned = await getProject(db, fixture.project.id);
    const values = {
      name: 'Edited fan project', category: 'tools', accent: 'violet', theme: 'dark',
      aliases: ['새 검색어'], links: [{ label: 'Guide', url: 'https://fans.example.com/guide' }],
      version: owned.version,
      locales: {
        en: { tagline: 'Updated title', description: 'Updated details', badges: ['tool'] },
        ko: { tagline: '수정된 소개', description: '수정된 상세 설명', badges: ['도구'] }
      }
    };
    await saveProject(db, fixture.project.id, fixture.ownerA, values);
    const saved = await getProject(db, fixture.project.id);
    assert.equal(saved.version, owned.version + 1);
    assert.equal(saved.name, values.name);
    assert.equal(saved.url, owned.url);
    assert.equal(saved.locales.en.tagline, values.locales.en.tagline);
    assert.equal(saved.locales.ko.description, values.locales.ko.description);
    const stale = { ...values, name: 'Rejected overwrite', locales: {
      en: { tagline: 'Stale EN', description: 'Wrong', badges: [] },
      ko: { tagline: '오래된 값', description: '잘못된 값', badges: [] }
    } };
    await assert.rejects(saveProject(db, fixture.project.id, fixture.ownerA, stale), error => isHttpError(error, 409));
    assert.deepEqual(await getProject(db, fixture.project.id), saved);
    await assert.rejects(saveProject(db, fixture.project.id, fixture.ownerB, { ...stale, version: saved.version }), error => isHttpError(error, 409));
    assert.deepEqual(await getProject(db, fixture.project.id), saved);
  });

  console.log(`workerd D1 integration: ${passed} checks passed; no remote database or network used.`);
} finally {
  await worker.dispose();
}
