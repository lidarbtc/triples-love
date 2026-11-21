# Maintenance guide

## When a listing is published

A listing is published only after its production D1 records and live pages have
been verified. `git push`, a successful build, or a Worker deployment alone does
not complete a listing addition.

The directory cards, descriptions, and search aliases come from **remote D1**.
Hero news and screenshot files come from the **Worker deployment**. An announcement
can therefore say a site was added while its card is still missing. Local D1,
`npm test`, and `npm run db:seed:local` never populate production D1.

For publication, complete the [production checklist](#production-checklist).
When reporting progress, distinguish **source pushed**, **remote D1 updated**,
**Worker deployed**, and **live pages verified**. If work stops at a local change
or push, or any production step fails, state which steps remain pending rather
than reporting the site as added to the live directory.

## Add or update a listing

1. Visit the site to confirm its features and availability. Check the directory
   for duplicates, including previous domains.
2. Add an entry to `sites` in `src/lib/data.js` with a unique `id`, name, domain,
   URL, an existing category, English tagline and description, badges, and an
   `accent` color. Set `addedAt` to the original listing time in ISO 8601 format
   with a time zone, such as `2026-09-19T14:30:00+09:00`. Keep that timestamp when
   editing the listing later.
3. Add Korean copy and badges to `siteCopy.ko[id]` in `src/lib/i18n.js`. Add useful
   aliases and Korean names to `siteSearchAliases[id]`. For a new category, update
   `categories` in `data.js` and both languages of `categoryLabels` and
   `categoryNames` in `i18n.js`.
4. Capture a preview with `npm run screenshots -- --site <id>`. Inspect
   `static/site-screenshots/<id>.jpg` to make sure it shows the site, rather than
   an error or loading screen. Include the image with the listing changes.
5. Update `ui.en.hero` and `ui.ko.hero` in `src/lib/i18n.js` before publishing:
   - Set `updateTitle` and `updateBody` to the new site's name and what visitors
     can do there, using a title and one or two sentences. Summarize multiple
     additions together. Describe the actual additions instead of a generic
     update schedule.
   - Set `date` to the date the news was written or revised.
   - Set `statusValue` to the last content update date. Update both dates when
     adding a site. For a description edit without news changes, update only
     `statusValue`. Documentation-only changes do not change the displayed dates.
6. For a new listing, run `npm run db:seed:local`. D1 is the live data source:
   the seed inserts missing listings/translations but never overwrites existing
   records. Editing a source entry alone does not update an existing D1 record.
   Owners use their project editor; maintainer corrections or archive changes
   require a reviewed D1 migration with an explicit project ID.
   Run `npm test` and `npm run build`, then `npm run cf:dev` to check `/en/` and `/ko/`.
   Verify the new card's image, copy, and outbound link; name and alias search;
   category filters; recent-addition sorting; and news wrapping on mobile.
   Review `git diff --check` and `git diff` for omissions or unintended changes.
7. Commit the data, translations, news, and images together. For publication,
   follow the [production checklist](#production-checklist), including remote D1
   import and live verification even when a push triggers automatic deployment.

## Archive or restore a listing

Keep an unavailable project's listing in the directory. Set `status: 'archived'`,
`archivedAt` to the date it was moved into the archive (`YYYY-MM-DD`), and
`archiveReason: 'unavailable'` when access has stopped without a confirmed closure.
The archive date is not a service closure date; do not describe a site as closed
solely because it is unavailable.

Retain its `id`, original category, `addedAt`, URL, search aliases, and existing
`static/site-screenshots/<id>.jpg`. Update the English and Korean descriptions to
describe the preserved project, and update both languages of the hero news and
content dates. Add an optional `archiveUrl` only after verifying that it opens a
usable web archive. A screenshot alone should be labeled as a saved screen, not
a working archived website.

Check `/en/` and `/ko/` for the archive badge, saved-screen or archive link,
search results, category filters, and counts. Confirm the archived listing no
longer presents the unavailable website as its primary action.

If the project returns, verify its identity and functionality before removing
`status`, `archivedAt`, and `archiveReason` and restoring current descriptions and
news. Preserve the original listing date; capture a new screenshot only after it
has returned to the active directory.

## Capture screenshots

Install Playwright's Chromium browser before the first capture:

```sh
npx playwright install chromium
```

Capture every active site in `src/lib/data.js`:

```sh
npm run screenshots
```

Capture one listing:

```sh
npm run screenshots -- --site apollo
```

Images are saved to `static/site-screenshots/{site.id}.jpg`. Capture runs use a
fresh browser context for each site. Archived listings are skipped by default;
explicitly selecting an archived id or domain with `--site` fails before the
browser launches. HTTP error responses (400 or higher) fail without overwriting
an existing screenshot. Always review successful output before committing,
since an error or loading screen can also return HTTP 200.
Run `npm run screenshots -- --help` for viewport, format, and timeout options.

## Deploy to Cloudflare Workers

Check the Wrangler identity with `npx wrangler whoami`. If authentication is
needed, run `npx wrangler login` with the account that owns the deployment.
Use the following commands as part of the production checklist:

```sh
npm run db:migrate:remote
npm run db:seed:remote
npm run deploy
```

The D1 instance is `triples-love-db`, bound as `DB` in `wrangler.jsonc`.
The Wrangler account is pinned to the existing `lidarbtc` deployment, so signing
in to an account with multiple memberships does not change the target.
`npm run deploy` builds and deploys the adapter's generated Worker and client assets.
Neither `npm run build` nor `npm run deploy` runs the remote seed. A Git-triggered
deployment also needs the D1 import unless its configured build process explicitly
runs it; confirm the remote records regardless of deployment status.
Apply pending schema migrations before deploying code that needs them. Seeding is
safe to repeat, but changes to an existing listing must use the editor or a
targeted migration. Do not modify an already-applied migration file.

For local work, run `npm run db:migrate:local`, `npm run db:seed:local`, then
`npm run dev`. To check the built Worker, run `npm run build` and
`npm run cf:dev`. Local D1 state is separate from production. OAuth deliberately
uses the canonical HTTPS origin, so sign-in from a local/preview URL moves to the
production site; it does not create a local signed-in session.

### Production checklist

1. Use the intended, reviewed commit for both seed data and deployment. Confirm
   it was pushed to the target branch. If the checkout contains unrelated changes,
   use a separate clean checkout of that commit; do not deploy those changes.
2. Run the [production inventory check](#check-production-inventory) before import.
   Check all source IDs and their English/Korean translation rows, including
   archived projects, so earlier missed additions are found too.
3. Apply pending migrations, then run `node scripts/seed-projects.mjs` and review
   `.wrangler/seed-projects.sql` against the inventory result. Run
   `npm run db:seed:remote` for the intended missing listings/translations. The full
   seed may also insert earlier missing entries. For a narrower scope, prepare
   reviewed SQL limited to the intended project IDs and use
   `npx wrangler d1 execute DB --remote --file=<reviewed-sql-file>`.
4. Verify the Worker deployment for that commit has succeeded, or run
   `npm run deploy` if it has not been deployed. If the live news and assets are
   already current and only D1 records were missing, another deployment is not
   needed.
5. Rerun the production inventory check after import. For each new listing,
   verify the final URL, category, aliases, and both translations against the
   intended source data. `INSERT OR IGNORE` preserves existing records, so another
   seed does **not** apply later copy, alias, or archive-status corrections. Owners
   can update copy and aliases in the editor. Maintainer corrections and all
   archive/restore changes require a reviewed migration with explicit project IDs.
6. Open the actual `https://triples.love/en/` and `/ko/` pages, reloading after the
   import. For every addition, verify its card, final description, loaded image,
   outbound URL, name/alias search, category filter, recent-addition order, and
   `/p/<id>/?lang=en` and `?lang=ko` detail pages. Check news wrapping on mobile
   when its text changed. Search-engine snapshots and an updated announcement
   are not evidence that a card is live.

If news is current but a card is absent, check remote D1 first. If the card exists
but its image or news is missing, check the Worker deployment. Record any failed
stage and resolve it before claiming publication is complete.

### Check production inventory

Run from the intended source checkout. This reads production; it does not change
the database. The JSON snapshot is saved under the ignored `.wrangler/` directory.
Stop if the Wrangler query fails; do not use an older snapshot as current evidence.

```sh
mkdir -p .wrangler
npx wrangler d1 execute DB --remote --json --command \
  "SELECT id FROM projects ORDER BY id; SELECT project_id, lang FROM project_translations ORDER BY project_id, lang;" \
  > .wrangler/production-listings.json

node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { sites } from './src/lib/data.js';

const responses = JSON.parse(readFileSync('.wrangler/production-listings.json', 'utf8'));
if (!Array.isArray(responses) || responses.length !== 2 ||
    responses.some(result => result.success !== true || !Array.isArray(result.results))) {
  throw new Error('Production inventory query failed. Check Wrangler authentication and DB target.');
}
const [projects, translations] = responses.map(result => result.results);
const expectedIds = new Set(sites.map(site => site.id));
const actualIds = new Set(projects.map(project => project.id));
const localePairs = new Set(translations.map(row => `${row.project_id}:${row.lang}`));
const missingProjects = [...expectedIds].filter(id => !actualIds.has(id));
const missingTranslations = [...expectedIds].flatMap(id =>
  ['en', 'ko'].filter(lang => !localePairs.has(`${id}:${lang}`)).map(lang => `${id}:${lang}`)
);
const extraProjects = [...actualIds].filter(id => !expectedIds.has(id));
console.log(JSON.stringify({
  expectedProjects: expectedIds.size, actualProjects: actualIds.size,
  expectedTranslations: expectedIds.size * 2, actualTranslations: translations.length,
  missingProjects, missingTranslations, extraProjects
}, null, 2));
if (missingProjects.length || missingTranslations.length) process.exitCode = 1;
NODE
```

Both missing lists must be empty. Counts are a summary, not a substitute for ID
and language-pair checks; expected totals come from the source, not a fixed number.
Investigate extra remote projects without deleting them. This check establishes
record presence only: it does not validate description text, aliases, images, or
the deployed UI. A Korean card can fall back to English, so seeing it on `/ko/`
alone does not prove its Korean translation row exists.

## GitHub sign-in setup

The OAuth app homepage is `https://triples.love` and its callback is
`https://triples.love/auth/github/callback` (no language prefix or trailing slash).
Device flow is not needed. Only public GitHub account identity is used, with no
repository or email scope. Register these Worker secrets once:

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

`APP_ORIGIN` is a public Wrangler variable. The client secret belongs in Wrangler
secrets, never a Git commit. After rotating a secret, check a real GitHub sign-in
through to the return page. The OAuth tests mock GitHub's token and profile
responses; they do not prove that an external OAuth app's configuration is valid.

## Claim and edit checks

Run `npm test` for OAuth state/session handling, DNS/HTML proof restrictions,
expiration/replay/concurrent claims, owner permissions, version conflicts, and
bilingual seed/edit behavior. `npm run test:worker` checks migrations, all imported
listing data, reimport preservation, rollback on SQL failure, ownership races and
OAuth requests against isolated workerd/D1 instances. `npm run test:flow` builds
the app and tests its actual HTTP routes end to end: login, DNS and HTML proofs,
editing and public pages, a new site address, a second save, and logout. These
tests use real application code and local D1, but GitHub, DNS and project website
responses are fixtures; they do not complete real OAuth consent or verify a real
operator's domain. Browser interaction is checked separately.

These tests never write to production. If a system proxy intercepts localhost, exempt
`localhost,127.0.0.1,::1` or temporarily unset HTTP(S)/ALL proxy variables for
this local-only test.

A successful claim should redirect immediately to
the editor; save and check both the project page and the directory. Do not test
claims against production projects using synthetic users or bypassed proofs.

The editor keeps a site's existing address until a newly requested address is
verified. Neither a fresh claim nor a successful proof from another account
transfers ownership. Contact the maintainer for ownership recovery or transfer;
there is no self-service transfer interface in this release.

For an explicitly authorized maintainer approval, use `verification_method =
'manual'` and an audit reference prefixed with `manual:` in `challenge_id`.
Confirm the existing GitHub user ID, exact project ID and registered URL before
inserting the ownership record. Guard the insert against an existing owner and
an archived or changed project, then verify the remote row and live page. Manual
approval does not create a DNS/HTML proof or expose a self-service verification
method.

## Featured projects

Apply `migrations/0004_project_backlinks.sql` to remote D1 before deploying a
Worker that reads it; the directory query fails without the table. The
`BROWSER` binding and the hourly Cron trigger come from `wrangler.jsonc`. After
deployment, confirm that `/en/` and `/ko/` render, that a signed-in banner check
on `/badges/` completes, and that the Cron run appears in Worker logs as
`cron.backlinks` with counts only.

When a maker's site cannot be checked (for example a bot challenge) and the
banner has been confirmed by hand, feature it with an explicit audit note.
Exclude an abusive project, such as one hiding the link, the same way with
`force_off`. Overridden projects are not rechecked, so remove the override when
it is no longer needed.

```sql
INSERT INTO project_backlinks (project_id, state, detected_by, last_checked_at, override, override_note)
SELECT id, 'found', 'manual', unixepoch() * 1000, 'force_on', 'manual:<date> <how it was confirmed>'
FROM projects WHERE id = '<project-id>' AND status = 'active'
ON CONFLICT(project_id) DO UPDATE SET override = excluded.override, override_note = excluded.override_note;
```

`npm test` covers link matching, check order, state transitions, rotation, the
render budget and Cron selection. `npm run test:flow` checks the real routes:
banner check, D1 record, the featured card, the owner status and the one-miss
grace. Neither uses a real browser renderer.

Keep deployment credentials outside the repository. Local `.env` files and
Wrangler state are ignored by Git.
