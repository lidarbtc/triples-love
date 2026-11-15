import { isHttpError } from '@sveltejs/kit';
import { consumeRateLimit } from './db.js';
import { PROOF_META_NAME, ProofError, validateTargetUrl, verifySiteProof } from './proof.js';

export const CHALLENGE_LIFETIME_MS = 48 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_PROOF_ATTEMPTS = 10;
const RETRY_INTERVAL_MS = 3000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// Failures caused by the network, an outage or bot protection say nothing
// about the proof, so they do not use up the challenge's checks.
const TRANSIENT_PROOF_ERRORS = new Set(['timeout', 'fetch_failed', 'dns_failed', 'http_failed', 'blocked']);

export class ClaimError extends Error {
  constructor(code, message, status = 400, challenge = null) {
    super(message);
    this.name = 'ClaimError';
    this.code = code;
    this.status = status;
    this.challenge = challenge;
  }
}

function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function hashClaimToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checkClaimable(project, userId) {
  if (!project) throw new ClaimError('not_found', 'This project could not be found.', 404);
  if (project.status !== 'active') throw new ClaimError('archived', 'Archived projects cannot be claimed.', 409);
  if (project.owner && project.owner.id !== userId) {
    throw new ClaimError('already_claimed', 'This project already belongs to another account.', 409);
  }
}

export function displayChallenge(row, token) {
  const target = validateTargetUrl(row.target_url);
  return {
    id: row.id,
    token,
    method: row.method,
    targetUrl: row.target_url,
    dnsName: `_triples-love.${target.hostname}`,
    dnsValue: `${PROOF_META_NAME}=${token}`,
    metaTag: `<meta name="${PROOF_META_NAME}" content="${token}">`,
    expiresAt: row.expires_at
  };
}

/** The signed-in user's unfinished proof for the project's current address, if any. */
export async function findActiveChallenge(db, { project, userId }, options = {}) {
  if (!project || !userId) return null;
  const now = options.now ?? Date.now();
  const row = await db.prepare(`
    SELECT * FROM verification_challenges
    WHERE project_id = ? AND user_id = ? AND expected_url = ?
      AND consumed_at IS NULL AND expires_at > ? AND token IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `).bind(project.id, userId, project.url, now).first();
  if (!row || !TOKEN_PATTERN.test(row.token)) return null;
  return displayChallenge(row, row.token);
}

async function rateLimit(db, key, limit, windowMs, challenge = null) {
  try {
    await consumeRateLimit(db, key, limit, windowMs);
  } catch (error) {
    if (isHttpError(error, 429)) {
      throw new ClaimError('rate_limited', 'Too many attempts. Please wait and try again.', 429, challenge);
    }
    throw error;
  }
}

export async function startClaim(db, { project, userId, method, targetUrl }, options = {}) {
  checkClaimable(project, userId);
  if (method !== 'dns' && method !== 'meta') {
    throw new ClaimError('invalid_method', 'Choose DNS or HTML verification.');
  }
  // A claimant must prove the registered project, never a URL they submit.
  // Only its existing owner may verify a replacement URL.
  let target;
  try {
    target = validateTargetUrl(project.owner ? (targetUrl || project.url) : project.url).href;
  } catch (error) {
    if (error instanceof ProofError) throw new ClaimError(error.code, error.message);
    throw error;
  }
  await rateLimit(db, `claim:start:user:${userId}`, 12, RATE_LIMIT_WINDOW_MS);
  await rateLimit(db, `claim:start:project:${project.id}:${userId}`, 6, 10 * 60 * 1000);
  const now = options.now ?? Date.now();
  // Restarting for the same address (for example to switch method or after
  // using every check) keeps the token, so details already published on the
  // site or in DNS stay valid. A different address always gets a new token.
  const previous = await db.prepare(`
    SELECT token FROM verification_challenges
    WHERE project_id = ? AND user_id = ? AND target_url = ? AND expected_url = ?
      AND consumed_at IS NULL AND expires_at > ? AND token IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `).bind(project.id, userId, target, project.url, now).first();
  const token = TOKEN_PATTERN.test(previous?.token || '') ? previous.token : randomToken();
  const row = {
    id: crypto.randomUUID(), project_id: project.id, user_id: userId,
    token_hash: await hashClaimToken(token), method, target_url: target,
    expected_url: project.url, expires_at: now + CHALLENGE_LIFETIME_MS, created_at: now
  };
  const result = await db.batch([
    db.prepare('DELETE FROM verification_challenges WHERE expires_at <= ? AND consumed_at IS NULL').bind(now),
    db.prepare('DELETE FROM verification_challenges WHERE project_id = ? AND user_id = ? AND consumed_at IS NULL')
      .bind(project.id, userId),
    db.prepare(`
      INSERT INTO verification_challenges
        (id, project_id, user_id, token_hash, token, method, target_url, expected_url, expires_at, created_at)
      SELECT ?, p.id, ?, ?, ?, ?, ?, p.url, ?, ? FROM projects p
      WHERE p.id = ? AND p.url = ? AND p.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM project_owners o WHERE o.project_id = p.id AND o.user_id <> ?)
    `).bind(row.id, userId, row.token_hash, token, method, target, row.expires_at, now, project.id, project.url, userId)
  ]);
  if (result[2].meta.changes !== 1) {
    throw new ClaimError('changed', 'This project changed while you were starting verification. Reload and try again.', 409);
  }
  return displayChallenge(row, token);
}

export async function verifyClaim(db, { project, userId, challengeId, token }, options = {}) {
  checkClaimable(project, userId);
  if (typeof challengeId !== 'string' || challengeId.length > 100 || !TOKEN_PATTERN.test(token || '')) {
    throw new ClaimError('invalid_challenge', 'This verification request is invalid. Start a new verification.');
  }
  const tokenHash = await hashClaimToken(token);
  const row = await db.prepare(`
    SELECT * FROM verification_challenges
    WHERE id = ? AND project_id = ? AND user_id = ? AND token_hash = ?
  `).bind(challengeId, project.id, userId, tokenHash).first();
  const now = options.now ?? Date.now();
  if (!row || row.consumed_at !== null || row.expires_at <= now) {
    throw new ClaimError('invalid_challenge', 'This verification request has expired or was already used. Start a new verification.');
  }
  if (row.expected_url !== project.url) {
    throw new ClaimError('changed', 'The project address changed. Start a new verification.', 409);
  }
  const challenge = displayChallenge(row, token);
  if (row.attempts >= MAX_PROOF_ATTEMPTS) {
    throw new ClaimError('attempts_exhausted', 'This verification has used all of its checks. Choose “Start again”; the details you already published stay valid.', 429);
  }
  await rateLimit(db, `claim:verify:user:${userId}`, 30, RATE_LIMIT_WINDOW_MS, challenge);
  const attempt = await db.prepare(`
    UPDATE verification_challenges SET attempts = attempts + 1, last_checked_at = ?
    WHERE id = ? AND user_id = ? AND project_id = ? AND token_hash = ?
      AND consumed_at IS NULL AND expires_at > ? AND attempts < ?
      AND (last_checked_at IS NULL OR last_checked_at <= ?)
    RETURNING id
  `).bind(now, row.id, userId, project.id, tokenHash, now, MAX_PROOF_ATTEMPTS, now - RETRY_INTERVAL_MS).first();
  if (!attempt) {
    throw new ClaimError('retry_later', 'Wait a few seconds before checking again.', 429, challenge);
  }
  let verified;
  try {
    verified = await (options.verifyProof || verifySiteProof)({
      method: row.method, targetUrl: row.target_url, token
    });
  } catch (error) {
    if (error instanceof ProofError) {
      if (TRANSIENT_PROOF_ERRORS.has(error.code)) {
        // Keep last_checked_at so the retry cooldown and hourly limit still apply.
        await db.prepare('UPDATE verification_challenges SET attempts = attempts - 1 WHERE id = ? AND attempts > 0')
          .bind(row.id).run();
      }
      throw new ClaimError(error.code, error.message, 400, challenge);
    }
    throw error;
  }
  if (!verified) {
    throw new ClaimError('not_verified', 'The verification token was not found yet. Check your changes and try again.', 400, challenge);
  }
  const verifiedAt = options.now ?? Date.now();
  const domain = validateTargetUrl(row.target_url).hostname.replace(/^www\./, '');
  // D1 batch is a transaction. Each following write is gated by the preceding
  // statement's changes(), so replay, stale URLs and competing claimants cannot
  // consume a token or change a project without winning the ownership write.
  const result = await db.batch([
    db.prepare(`
      INSERT INTO project_owners
        (project_id, user_id, verified_at, verification_method, verified_url, challenge_id)
      SELECT c.project_id, c.user_id, ?, c.method, c.target_url, c.id
      FROM verification_challenges c JOIN projects p ON p.id = c.project_id
      WHERE c.id = ? AND c.project_id = ? AND c.user_id = ? AND c.token_hash = ?
        AND c.consumed_at IS NULL AND c.expires_at > ?
        AND p.url = c.expected_url AND p.status = 'active'
      ON CONFLICT(project_id) DO UPDATE SET
        verified_at = excluded.verified_at,
        verification_method = excluded.verification_method,
        verified_url = excluded.verified_url,
        challenge_id = excluded.challenge_id
      WHERE project_owners.user_id = excluded.user_id
    `).bind(verifiedAt, row.id, project.id, userId, tokenHash, verifiedAt),
    db.prepare(`
      UPDATE verification_challenges SET consumed_at = ?
      WHERE id = ? AND user_id = ? AND token_hash = ? AND consumed_at IS NULL
        AND expires_at > ? AND changes() = 1
        AND EXISTS (SELECT 1 FROM project_owners o WHERE o.project_id = ? AND o.user_id = ? AND o.challenge_id = ?)
    `).bind(verifiedAt, row.id, userId, tokenHash, verifiedAt, project.id, userId, row.id),
    db.prepare(`
      UPDATE projects SET url = ?, domain = ?, updated_at = ?, version = version + 1
      WHERE id = ? AND url = ? AND status = 'active' AND changes() = 1
        AND EXISTS (SELECT 1 FROM project_owners o WHERE o.project_id = projects.id AND o.user_id = ? AND o.challenge_id = ?)
        AND EXISTS (SELECT 1 FROM verification_challenges c WHERE c.id = ? AND c.consumed_at = ?)
    `).bind(row.target_url, domain, verifiedAt, project.id, row.expected_url, userId, row.id, row.id, verifiedAt)
  ]);
  if (result[0].meta.changes !== 1 || result[1].meta.changes !== 1 || result[2].meta.changes !== 1) {
    throw new ClaimError('changed', 'The project was claimed or changed while verification was running. Reload to see its current owner and address.', 409);
  }
  return { projectId: project.id, verifiedAt, method: row.method };
}
