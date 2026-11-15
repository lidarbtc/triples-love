# Maintenance guide

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
7. Commit the data, translations, news, and images together. Deploy using the
   instructions below, then check the new cards, news, images, and outbound links
   on both language routes of the live site.

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

Authenticate Wrangler with the Cloudflare account that owns the deployment:

```sh
npx wrangler login
npm run db:migrate:remote
npm run db:seed:remote
npm run deploy
```

The D1 instance is `triples-love-db`, bound as `DB` in `wrangler.jsonc`.
The Wrangler account is pinned to the existing `lidarbtc` deployment, so signing
in to an account with multiple memberships does not change the target.
`npm run deploy` builds and deploys `.svelte-kit/cloudflare/`, including the Worker.
Apply pending schema migrations before deploying code that needs them. Seeding is
safe to repeat, but changes to an existing listing must use the editor or a
targeted migration. Do not modify an already-applied migration file.

For local work, run `npm run db:migrate:local`, `npm run db:seed:local`, then
`npm run dev`. To check the built Worker, run `npm run build` and
`npm run cf:dev`. Local D1 state is separate from production. OAuth deliberately
uses the canonical HTTPS origin, so sign-in from a local/preview URL moves to the
production site; it does not create a local signed-in session.

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
bilingual seed/edit behavior. `npm run test:worker` repeats transaction and race
checks against an isolated, temporary workerd D1 instance, with no production
data or external requests. If a system proxy intercepts localhost, exempt
`localhost,127.0.0.1,::1` or temporarily unset HTTP(S)/ALL proxy variables for
this local-only test.

A successful claim should redirect immediately to
the editor; save and check both the project page and the directory. Do not test
claims against production projects using synthetic users or bypassed proofs.

The editor keeps a site's existing address until a newly requested address is
verified. Neither a fresh claim nor a successful proof from another account
transfers ownership. Contact the maintainer for ownership recovery or transfer;
there is no self-service transfer interface in this release.

Keep deployment credentials outside the repository. Local `.env` files and
Wrangler state are ignored by Git.
