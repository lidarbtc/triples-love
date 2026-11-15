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
6. Run `npm run build`, then use `npm run preview` to check `/en/` and `/ko/`.
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
npm run deploy
```

`npm run deploy` builds the static site and deploys `build/` using
`wrangler.jsonc`. For a local preview of the Workers configuration, run
`npm run build` followed by `npm run cf:dev`.

Keep deployment credentials outside the repository. Local `.env` files and
Wrangler state are ignored by Git.
