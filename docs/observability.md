# Server logs

The Worker stores structured console records in Cloudflare Workers Logs. The
Wrangler configuration is the source of truth: logs are enabled, persisted and
sampled at 100%; traces and automatic invocation logs are disabled.

## Request and operation records

`request.complete` is emitted once per SvelteKit request. It includes a generated
`request_id`, a route pattern (never the raw URL), HTTP `status`, `result_status`,
`outcome` and `duration_ms`. Successful responses and handled route errors expose
the same ID in `x-request-id`. Failures before `resolve()` still have a log ID,
but their framework-generated error response may not contain that header.

`operation.result` records authentication, claim and edit outcomes, as well as
database and unexpected failures. It adds `operation`, optional `error_code`,
`method` (`dns` or `meta`), `upstream_status` and `operation_ms`. An operation's
duration is present for failed GitHub calls and failed asynchronous D1 calls.
`duration_ms` always measures elapsed request time, not Worker CPU time or the
browser's complete page load time.

The framework shares `locals` across hook/load/action event wrappers. Logging
context is keyed by that object so a database failure and its framework handler
share an ID and emit one failure detail. A later, more severe failure can add a
detail after an earlier success or ordinary rejection. For request/error rates,
count only `request.complete`, not all records.

Enhanced form submissions may return HTTP 200 while the action failed. Use
`result_status` or `outcome` when investigating those flows. DNS/HTML dependency
failures also intentionally remain HTTP 400 for the existing form UI, but are
logged at error level.

| Level | Examples |
| --- | --- |
| info | Request summary, successful sign-in/save, cancelled sign-in, invalid input, proof not found, version conflict |
| warn | HTTP 429 / retry or attempt limits |
| error | D1 failure/missing binding, GitHub HTTP/timeout/invalid response, DNS/HTML connection failure, unexpected exception |

## Data boundaries

The application logs only fixed labels, route patterns, generated IDs and numeric
metadata. It does not log cookies, IPs, account identities, OAuth code/state,
access/session/proof tokens, form bodies, SQL/parameters, target URLs, or upstream
response bodies. Unexpected exceptions retain only file/line/column locations in
known application modules; messages, arbitrary paths and causes are omitted.
Logger failures do not change the application's response behavior.

Wrangler is pinned to 4.155.0 so `redact_query_string: true` is supported.
Cloudflare attaches request URLs to custom-log metadata even with invocation
logs disabled. Query redaction is therefore mandatory: disabling invocation logs
alone does not protect OAuth code/state. The application still uses its own
request summaries to avoid duplicate records and excessive request metadata.
Do not enable invocation logs or traces without checking their URL/header data.

Disposable-deployment validation must inspect the entire stored record, including
platform metadata, for fixture code/state/cookies/authorization/referrer values.
Local tests alone cannot establish platform redaction behavior. Retest after
changing Wrangler or these settings; do not use real authentication secrets as
probe values.

Static assets and the prerendered language entry page can bypass SvelteKit;
their requests are not counted by these summaries. Use Cloudflare traffic metrics
for overall traffic and static-asset failures.

## Investigation filters

Select the `triples-love` service and a recent time window. Verify the available
keys against actual ingested records before using these Query Builder filters.
These are investigation recipes; no saved queries or scheduled runs are required.

| View | Filter | Group / calculation |
| --- | --- | --- |
| Request failures | `event = request.complete`, `outcome = failure` | Count by route and result_status |
| Login failures | `event = operation.result`, `outcome = failure`, operation starts with `oauth.` or equals `auth.config` | Count by operation and error_code |
| Database failures | error_code in `db_failed`, `db_unavailable` | Count by operation and route |
| Claim failures | `event = operation.result`, `operation = claim.verify`, `outcome = failure` | Count by error_code and method |
| Request duration | `event = request.complete` | p95 duration_ms by route |

Filter by `request_id` to join a failure detail with its summary. Use Cloudflare's
Worker version metadata to identify the deployment. Keep ordinary validation
failures separate from dependency failures when defining future alerts.

## Validation and rollout

Run `npm test`, `npm run test:worker` and `npm run test:flow`. Worker tests use
isolated D1 and mocked GitHub/DNS/site responses, never production data. The HTTP
flow includes a real ten-second GitHub timeout, DNS failure, stale/invalid edits,
initial session lookup failure and a page-load D1 failure. It checks correlation,
deduplication and the absence of fixture credentials/proof tokens in runtime logs.

Run `npx wrangler deploy --dry-run --outdir .wrangler/logging-dry-run` to check
the upload. The emitted `_worker.js.map` must contain the original application
sources, and `.svelte-kit/output/client` must contain no `.map` files. Vite
generates server-only maps and Wrangler includes them in the private Worker
upload. Custom `stack_locations` are conservative locations, not a full Error
stack; automatic remapping of that custom field is not assumed. Retain the
matching build/map when manually resolving a bundled location.

After disposable-environment validation, record the current production version,
deploy, visit `/en/`, `/ko/` and a project detail page, and confirm the corresponding
request records and IDs. Test a safe invalid callback without real credentials.
Do not deliberately break production D1 or inject production OAuth failures.
Verify field ingestion using the filters above. Review the first
24 hours of log volume and the account's actual plan before changing sampling;
head sampling can also discard failures. A previous Worker version restores the
previous application/configuration if rollback is needed. No schema migration or
production seed is required for this logging change.
