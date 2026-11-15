// Standalone integration test: actual workerd D1, isolated from Wrangler state
// and remote databases. No GitHub credentials or live ownership proofs needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { startClaim, verifyClaim } from '../src/lib/server/claims.js';
import { getProject, saveProject } from '../src/lib/server/projects.js';

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
  console.log('D1 binding ready; applying checked-in migration...');
  const migration = await readFile(new URL('../migrations/0001_claim.sql', import.meta.url), 'utf8');
  // The checked-in migration has plain SQL statements and no semicolons inside
  // strings/triggers. Splitting keeps multiline CREATE statements intact for D1.
  await db.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  console.log('Migration applied; testing D1 transaction behavior...');

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
    assert.ok(!JSON.stringify(proof).includes(challenge.token));
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
    await assert.rejects(saveProject(db, fixture.project.id, fixture.ownerA, stale), error => error.status === 409);
    assert.deepEqual(await getProject(db, fixture.project.id), saved);
    await assert.rejects(saveProject(db, fixture.project.id, fixture.ownerB, { ...stale, version: saved.version }), error => error.status === 409);
    assert.deepEqual(await getProject(db, fixture.project.id), saved);
  });

  console.log(`workerd D1 integration: ${passed} checks passed; no remote database or network used.`);
} finally {
  await worker.dispose();
}
