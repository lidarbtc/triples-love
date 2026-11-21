import test from 'node:test';
import assert from 'node:assert/strict';
import { isHttpError } from '@sveltejs/kit';
import { requestContext, recordResult, recordUnexpected, finishRequest, handleError } from '../src/lib/server/observability.js';
import { getDb } from '../src/lib/server/db.js';
import { createTestDb } from './helpers/d1.js';

function requestEvent(env = {}) {
  return { locals: { env } };
}

function capture(t) {
  const logs = [];
  for (const level of ['info', 'warn', 'error']) t.mock.method(console, level, raw => logs.push({ level, ...raw }));
  return logs;
}

test('correlates concurrent requests without logging arbitrary request data', t => {
  const logs = capture(t);
  const a = { ...requestEvent(), route: { id: '/auth/github/callback' }, url: new URL('https://triples.love/auth/github/callback?code=PRIVATE_CODE'), cookies: { token: 'PRIVATE_COOKIE' } };
  const b = { ...requestEvent(), route: { id: '/PRIVATE_PATH' } };
  requestContext(a);
  requestContext(b);
  recordResult(a, 'oauth.callback', 400, 'state_mismatch', { body: 'PRIVATE_BODY', message: 'PRIVATE_MESSAGE' });
  recordResult(b, 'project.edit', 409, 'version_conflict');
  const error = { status: 409, message: 'This page changed. Reload before saving again.' };
  const overrides = handleError({ kind: 'app', event: { ...b }, error });
  assert.deepEqual({ ...error, ...overrides }, error);
  finishRequest(a, 400);
  finishRequest(b, 200); // Kit can include a load error in an HTTP 200 data response.
  assert.equal(logs[0].request_id, logs[2].request_id);
  assert.notEqual(logs[0].request_id, logs[1].request_id);
  assert.equal(logs[3].status, 200);
  assert.equal(logs[3].result_status, 409);
  assert.equal(logs[3].outcome, 'failure');
  assert.equal(logs[1].route, 'unmatched');
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
});

test('logs handled dependency failures as errors, rate limits as warnings and ordinary rejection as info', t => {
  const logs = capture(t);
  recordResult(requestEvent(), 'claim.verify', 400, 'dns_failed', { method: 'dns' });
  recordResult(requestEvent(), 'claim.verify', 429, 'retry_later');
  recordResult(requestEvent(), 'claim.verify', 400, 'not_verified');
  recordResult(requestEvent(), 'oauth.callback', 400, 'cancelled');
  assert.deepEqual(logs.map(x => x.level), ['error', 'warn', 'info', 'info']);
});

test('unexpected errors keep known locations, never messages, causes or URL credentials', t => {
  const logs = capture(t);
  const cause = new Error('PRIVATE_MESSAGE', { cause: new Error('PRIVATE_CAUSE') });
  cause.stack = [
    'Error: PRIVATE_MESSAGE',
    '    at PRIVATE_FUNCTION (/app/src/lib/server/auth.js:12:34)',
    '    at fetch (worker/index.js:20:30)',
    '    at fetch (index.js:40:50)',
    '    at helper (/PRIVATE_PATH/index.js:60:70)',
    '    at https://example.com/PRIVATE_URL?token=PRIVATE_TOKEN:10:20'
  ].join('\n');
  assert.equal(handleError({ kind: 'unknown', event: requestEvent(), error: cause }), undefined);
  assert.deepEqual(logs[0].stack_locations, ['auth.js:12:34', 'worker/index.js:20:30', 'index.js:40:50']);
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
});

test('DB and framework error handlers produce one failure detail plus one summary', async t => {
  const logs = capture(t);
  const cause = new Error('PRIVATE_SQL_PARAMETER');
  const db = { prepare: () => ({ async first() { throw cause; } }) };
  const event = requestEvent({ DB: db });
  await assert.rejects(getDb(event, 'session.read').prepare('PRIVATE_SQL').first(), error => error === cause);
  recordUnexpected({ ...event }, 'request', cause);
  recordResult(event, 'request', 500, 'http_error');
  finishRequest(event, 500);
  finishRequest(event, 500);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].operation, 'session.read');
  assert.equal(logs[0].error_code, 'db_failed');
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
});

test('D1 wrapper preserves bound reads, atomic batches and rejection behavior', async t => {
  const logs = capture(t);
  const raw = createTestDb();
  t.after(() => raw.close());
  const event = requestEvent({ DB: raw });
  const db = getDb(event, 'project.edit');
  await db.batch([db.prepare('INSERT INTO rate_limits VALUES (?, ?, ?)').bind('PRIVATE_KEY', 1, 10)]);
  assert.equal(await db.prepare('SELECT count FROM rate_limits WHERE key=?').bind('PRIVATE_KEY').first('count'), 1);
  await assert.rejects(db.batch([
    db.prepare('UPDATE rate_limits SET count=2'),
    db.prepare('INSERT INTO rate_limits VALUES (?, ?, ?)').bind('PRIVATE_KEY', 3, 10)
  ]));
  assert.equal((await db.prepare('SELECT count FROM rate_limits').all()).results[0].count, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].error_code, 'db_failed');
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
});

test('missing D1 is a recorded 503 and logging sink failures do not alter responses', t => {
  const logs = capture(t);
  assert.throws(() => getDb(requestEvent()), error => isHttpError(error, 503));
  assert.equal(logs[0].error_code, 'db_unavailable');
  t.mock.method(console, 'error', () => { throw new Error('sink unavailable'); });
  assert.throws(() => getDb(requestEvent()), error => isHttpError(error, 503));
});


test('a rendering failure after a successful action is not hidden by deduplication', t => {
  const logs = capture(t);
  const event = requestEvent();
  recordResult(event, 'project.edit', 200);
  recordResult({ ...event }, 'project.read', 500, 'db_failed');
  recordUnexpected({ ...event }, 'request', new Error('PRIVATE_ERROR'));
  finishRequest(event, 500);
  assert.equal(logs.length, 3);
  assert.equal(logs[1].error_code, 'db_failed');
  assert.equal(logs[2].outcome, 'failure');
});
