// Only application-owned labels and numeric metadata enter these logs. Never
// pass request/response objects, error messages, SQL or authentication material.
const contexts = new WeakMap();
const label = value => typeof value === 'string' && /^[a-z][a-z0-9_.-]{0,63}$/.test(value) ? value : 'unknown';
const routes = new Set(['/', '/[lang=lang]', '/badges', '/p/[slug]', '/p/[slug]/claim', '/p/[slug]/edit', '/auth/github', '/auth/github/callback', '/auth/logout']);
const dependencyFailures = new Set(['dns_failed', 'timeout', 'fetch_failed', 'http_failed']);

export function requestContext(event) {
  // SvelteKit copies RequestEvent for loads/actions; locals is shared throughout
  // one request and prevents duplicate details across these wrappers.
  const key = event.locals ??= {};
  if (!contexts.has(key)) contexts.set(key, { id: crypto.randomUUID(), start: performance.now() });
  return contexts.get(key);
}

function write(event, level, fields) {
  const context = requestContext(event);
  const record = {
    event: label(fields.event), request_id: context.id,
    route: routes.has(event.route?.id) ? event.route.id : 'unmatched',
    operation: label(fields.operation), outcome: label(fields.outcome),
    duration_ms: Math.round(performance.now() - context.start)
  };
  if (Number.isInteger(fields.status)) record.status = fields.status;
  if (Number.isInteger(fields.result_status)) record.result_status = fields.result_status;
  if (Number.isInteger(fields.upstream_status)) record.upstream_status = fields.upstream_status;
  if (Number.isFinite(fields.operation_ms)) record.operation_ms = Math.round(fields.operation_ms);
  if (fields.error_code) record.error_code = label(fields.error_code);
  if (['dns', 'meta'].includes(fields.method)) record.method = fields.method;
  if (fields.stack_locations?.length) record.stack_locations = fields.stack_locations;
  // A broken logging sink must not break authentication or page responses.
  try { console[level](record); } catch { /* best effort */ }
}

export function recordResult(event, operation, status, code, extras = {}) {
  const context = requestContext(event);
  const priority = status >= 500 || dependencyFailures.has(code) ? 3 : status >= 400 ? 2 : 1;
  // A later render/DB failure must supersede an earlier successful action.
  if ((context.priority ?? 0) >= priority) return;
  context.priority = priority;
  context.resultStatus = status;
  const failed = status >= 400;
  const level = status >= 500 || dependencyFailures.has(code) ? 'error' : status === 429 ? 'warn' : 'info';
  write(event, level, { ...extras, event: 'operation.result', operation, status,
    outcome: failed ? 'failure' : 'success', error_code: code });
}

export function recordUnexpected(event, operation, cause) {
  // Keep only locations in known application modules. Error messages, function
  // names, arbitrary paths, URLs and the Error.cause chain may contain secrets.
  const stack = typeof cause?.stack === 'string' ? cause.stack : '';
  const stack_locations = [...stack.matchAll(/(?:\/|\b)(observability|auth|db|claims|proof|projects|hooks\.server|_worker)\.js:(\d+):(\d+)(?=[)\s]|$)/g)]
    .slice(0, 8).map(match => `${match[1]}.js:${match[2]}:${match[3]}`);
  recordResult(event, operation, 500, 'unexpected_error', { stack_locations });
}

export function finishRequest(event, status) {
  const context = requestContext(event);
  if (context.finished) return;
  context.finished = true;
  write(event, 'info', { event: 'request.complete', operation: 'request', status,
    result_status: context.resultStatus ?? status,
    outcome: (context.resultStatus ?? status) >= 400 ? 'failure' : 'success' });
}
