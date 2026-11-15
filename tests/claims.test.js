import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/d1.js';
import { getProject } from '../src/lib/server/projects.js';
import { CHALLENGE_LIFETIME_MS, MAX_PROOF_ATTEMPTS, hashClaimToken, startClaim, verifyClaim } from '../src/lib/server/claims.js';
import { ProofError } from '../src/lib/server/proof.js';

const registeredUrl = 'https://fans.example.com/wav-archive';

async function fixture(t) {
  const db = createTestDb();
  t.after(() => db.close());
  for (const [id, github] of [['owner-a', '1'], ['owner-b', '2']]) {
    db.sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run(id, github, id, id, 'https://avatars.githubusercontent.com/u/1', Date.now());
  }
  db.sqlite.prepare(`INSERT INTO projects (id,name,url,domain,category,added_at,updated_at)
    VALUES ('example','Fan project',?,'fans.example.com','tools','2026-10-10',?)`).run(registeredUrl, Date.now());
  return { db, project: await getProject(db, 'example'), now: Date.now() };
}

function request(project, challenge, userId = 'owner-a') {
  return { project, userId, challengeId: challenge.id, token: challenge.token };
}

async function begin(db, project, now, extras = {}) {
  return startClaim(db, { project, userId: 'owner-a', method: 'meta', ...extras }, { now });
}

test('initial claim ignores attacker-supplied URL, stores only a hash and binds user/project/path', async (t) => {
  const { db, project, now } = await fixture(t);
  const challenge = await begin(db, project, now, { targetUrl: 'https://attacker.example.com/' });
  assert.equal(challenge.targetUrl, registeredUrl);
  assert.equal(challenge.expiresAt, now + CHALLENGE_LIFETIME_MS);
  assert.match(challenge.token, /^[A-Za-z0-9_-]{43}$/);
  const stored = db.sqlite.prepare('SELECT * FROM verification_challenges').get();
  assert.equal(stored.project_id, project.id);
  assert.equal(stored.user_id, 'owner-a');
  assert.equal(stored.expected_url, registeredUrl);
  assert.equal(stored.token_hash, await hashClaimToken(challenge.token));
  assert.equal(JSON.stringify(stored).includes(challenge.token), false);
});

test('starting a replacement challenge invalidates previous unconsumed token', async (t) => {
  const { db, project, now } = await fixture(t);
  const old = await begin(db, project, now);
  const fresh = await begin(db, project, now + 1, { method: 'dns' });
  assert.notEqual(old.token, fresh.token);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM verification_challenges').get().count, 1);
  await assert.rejects(verifyClaim(db, request(project, old), { now: now + 2, verifyProof: async () => true }), { code: 'invalid_challenge' });
});

test('successful proof grants immediate ownership, consumes challenge, and cannot replay', async (t) => {
  const { db, project, now } = await fixture(t);
  const challenge = await begin(db, project, now);
  const output = await verifyClaim(db, request(project, challenge), {
    now,
    verifyProof: async (proof) => {
      assert.deepEqual(proof, { targetUrl: registeredUrl, token: challenge.token, method: 'meta' });
      return true;
    }
  });
  assert.equal(output.projectId, project.id);
  const after = await getProject(db, project.id);
  assert.equal(after.owner.id, 'owner-a');
  assert.equal(after.version, 1);
  assert.equal(db.sqlite.prepare('SELECT consumed_at FROM verification_challenges').get().consumed_at, now);
  // Replaying at exactly the same millisecond must not pass timestamp equality.
  await assert.rejects(verifyClaim(db, request(after, challenge), { now, verifyProof: async () => true }), { code: 'invalid_challenge' });
  assert.equal((await getProject(db, project.id)).version, 1);
});

test('other users and incorrect tokens cannot use a challenge', async (t) => {
  const { db, project, now } = await fixture(t);
  const challenge = await begin(db, project, now);
  const verifyProof = async () => { assert.fail('Proof must not be fetched for invalid credentials'); };
  await assert.rejects(verifyClaim(db, request(project, challenge, 'owner-b'), { now, verifyProof }), { code: 'invalid_challenge' });
  await assert.rejects(verifyClaim(db, request(project, { ...challenge, token: 'B'.repeat(43) }), { now, verifyProof }), { code: 'invalid_challenge' });
  assert.equal(db.sqlite.prepare('SELECT attempts FROM verification_challenges').get().attempts, 0);
});

test('expiration and archive checks prevent ownership', async (t) => {
  const { db, project, now } = await fixture(t);
  const challenge = await begin(db, project, now);
  await assert.rejects(verifyClaim(db, request(project, challenge), { now: challenge.expiresAt, verifyProof: async () => true }), { code: 'invalid_challenge' });
  db.sqlite.prepare("UPDATE projects SET status = 'archived'").run();
  const archived = await getProject(db, project.id);
  await assert.rejects(begin(db, archived, now), { code: 'archived' });
  await assert.rejects(verifyClaim(db, request(archived, challenge), { now, verifyProof: async () => true }), { code: 'archived' });
  assert.equal((await getProject(db, project.id)).owner, null);
});

test('failed and unreachable proof retain a retryable challenge without ownership', async (t) => {
  const { db, project, now } = await fixture(t);
  const challenge = await begin(db, project, now);
  await assert.rejects(verifyClaim(db, request(project, challenge), { now, verifyProof: async () => false }), (error) => {
    assert.equal(error.code, 'not_verified');
    assert.equal(error.challenge.token, challenge.token);
    return true;
  });
  await assert.rejects(verifyClaim(db, request(project, challenge), {
    now: now + 3000, verifyProof: async () => { throw new ProofError('timeout', 'Try again'); }
  }), (error) => error.code === 'timeout' && error.challenge.id === challenge.id);
  assert.equal((await getProject(db, project.id)).owner, null);
  assert.equal(db.sqlite.prepare('SELECT attempts FROM verification_challenges').get().attempts, 2);
});

test('cooldown and per-challenge attempt limit bound external verification requests', async (t) => {
  const { db, project, now } = await fixture(t);
  const challenge = await begin(db, project, now);
  await assert.rejects(verifyClaim(db, request(project, challenge), { now, verifyProof: async () => false }), { code: 'not_verified' });
  await assert.rejects(verifyClaim(db, request(project, challenge), { now: now + 1, verifyProof: async () => assert.fail() }), { code: 'retry_later' });
  db.sqlite.prepare('UPDATE verification_challenges SET attempts = ?').run(MAX_PROOF_ATTEMPTS);
  await assert.rejects(verifyClaim(db, request(project, challenge), { now: now + 3000, verifyProof: async () => assert.fail() }), { code: 'attempts_exhausted' });
});

test('competing successful proof cannot replace the winner', async (t) => {
  const { db, project, now } = await fixture(t);
  const first = await begin(db, project, now);
  const second = await begin(db, project, now, { userId: 'owner-b' });
  await assert.rejects(verifyClaim(db, request(project, second, 'owner-b'), {
    now,
    verifyProof: async () => {
      await verifyClaim(db, request(project, first), { now, verifyProof: async () => true });
      return true;
    }
  }), { code: 'changed' });
  assert.equal((await getProject(db, project.id)).owner.id, 'owner-a');
  assert.equal(db.sqlite.prepare('SELECT consumed_at FROM verification_challenges WHERE id = ?').get(second.id).consumed_at, null);
  assert.equal((await getProject(db, project.id)).version, 1);
});

test('current owner changes URL only after a fresh proof and outsiders cannot reclaim', async (t) => {
  const { db, project, now } = await fixture(t);
  const initial = await begin(db, project, now);
  await verifyClaim(db, request(project, initial), { now, verifyProof: async () => true });
  const owned = await getProject(db, project.id);
  await assert.rejects(begin(db, owned, now + 1, { userId: 'owner-b' }), { code: 'already_claimed' });
  const replacement = 'https://www.new-fans.example.com/projects/archive';
  const change = await begin(db, owned, now + 1, { targetUrl: replacement, method: 'dns' });
  assert.equal((await getProject(db, project.id)).url, registeredUrl);
  await assert.rejects(verifyClaim(db, request(owned, change), { now: now + 1, verifyProof: async () => false }), { code: 'not_verified' });
  assert.equal((await getProject(db, project.id)).url, registeredUrl);
  await verifyClaim(db, request(owned, change), { now: now + 3001, verifyProof: async () => true });
  const changed = await getProject(db, project.id);
  assert.equal(changed.url, replacement);
  assert.equal(changed.domain, 'new-fans.example.com');
  assert.equal(changed.owner.id, 'owner-a');
  assert.equal(changed.version, 2);
  const proof = db.sqlite.prepare('SELECT verified_url, verification_method, challenge_id FROM project_owners').get();
  assert.equal(proof.verified_url, replacement);
  assert.equal(proof.verification_method, 'dns');
  assert.equal(proof.challenge_id, change.id);
});

test('a URL changed during proof cannot be overwritten by a stale challenge', async (t) => {
  const { db, project, now } = await fixture(t);
  const challenge = await begin(db, project, now);
  await assert.rejects(verifyClaim(db, request(project, challenge), {
    now,
    verifyProof: async () => {
      db.sqlite.prepare('UPDATE projects SET url = ?').run('https://different.example.com/');
      return true;
    }
  }), { code: 'changed' });
  const after = await getProject(db, project.id);
  assert.equal(after.url, 'https://different.example.com/');
  assert.equal(after.owner, null);
  assert.equal(db.sqlite.prepare('SELECT consumed_at FROM verification_challenges').get().consumed_at, null);
});

test('archive or expiry during an external check prevents final ownership write', async (t) => {
  const { db, project, now } = await fixture(t);
  const challenge = await begin(db, project, now);
  await assert.rejects(verifyClaim(db, request(project, challenge), {
    now,
    verifyProof: async () => {
      db.sqlite.prepare('UPDATE verification_challenges SET expires_at = ?').run(now);
      return true;
    }
  }), { code: 'changed' });
  assert.equal((await getProject(db, project.id)).owner, null);
});

test('starting a challenge cleans expired unused challenges', async (t) => {
  const { db, project, now } = await fixture(t);
  const old = await begin(db, project, now - CHALLENGE_LIFETIME_MS - 1, { userId: 'owner-b' });
  await begin(db, project, now);
  assert.equal(db.sqlite.prepare('SELECT id FROM verification_challenges WHERE id = ?').get(old.id), undefined);
});
