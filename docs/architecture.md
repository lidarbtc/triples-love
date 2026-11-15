# Architecture

The site uses SvelteKit with `@sveltejs/adapter-cloudflare`. A Cloudflare Worker
renders the directory and project pages from D1. Workers Static Assets serves
images, styles and client scripts from `.svelte-kit/cloudflare/`. Only the language
entry page is prerendered.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/lib/data.js` | Initial listing import and category definitions |
| `src/lib/i18n.js` | Interface translations and initial Korean listing import |
| `src/routes/[lang=lang]/+page.svelte` | Localized directory, search, filters, and site cards |
| `src/routes/+page.svelte` | Language entry point and legacy-link redirect |
| `src/hooks.server.js` | Language selection, session lookup, response headers and request/error logging |
| `src/app.css` | Shared styling |
| `static/image-slot.js` | Image preview custom element |
| `static/site-screenshots/` | Committed site previews |
| `scripts/capture-screenshots.mjs` | Playwright screenshot capture script |
| `wrangler.jsonc` | Cloudflare Workers Static Assets configuration |
| `src/lib/server/auth.js` | GitHub OAuth, session cookies and identity |
| `src/lib/server/claims.js` | One-time challenges and atomic ownership grants |
| `src/lib/server/proof.js` | Bounded DNS and raw HTML verification |
| `src/lib/server/projects.js` | D1 reads and owner-only edits |
| `src/lib/server/backlinks.js` | Website-banner link checks and featured eligibility |
| `src/lib/server/render.js` | Browser Rendering for client-side banner links |
| `src/lib/server/backlink-cron.js` | Hourly banner rechecks |
| `scripts/add-scheduled-handler.mjs` | Adds the Cron handler to the built Worker |
| `src/lib/server/observability.js` | Allowlisted request/operation logs and request correlation |
| `src/routes/p/[slug]/` | Public project, claim and editing pages |
| `migrations/` | Versioned D1 schema |
| `scripts/seed-projects.mjs` | Non-destructive import of missing listings/locales |

See [Server logs](observability.md) for log fields, data boundaries, validation
and rollout checks.

## Language routing

`/en/` and `/ko/` are server-rendered with current D1 listing content, including
their text, HTML language and metadata. Direct visits display the requested
language before JavaScript loads. The language switch links between these routes.
Project routes use `?lang=en` or `?lang=ko`, with English as the default.

`/` chooses a language in this order:

1. The legacy `?lang=en|ko` query parameter.
2. The saved `triples-love.lang` preference.
3. The browser's language preferences, choosing Korean if present and English
   otherwise.

The redirect preserves other query parameters and the URL fragment. Without
JavaScript, the entry page offers links to both languages.

## Analytics and outbound links

`src/app.html` loads Umami from `l.triples.love` with a public website identifier.

Outbound site links include `utm_source=triples.love`. Their visit buttons record
one Umami event, `project_click`, with these properties:

- `project`: the listing's domain, such as `apollo.cafe`.
- `category`: the category key, such as `objekts` or `schedule`.
- `surface`: `search` when a non-empty search is active; otherwise `directory`,
  including category-filtered lists.

Project detail visit buttons also use `project_click`, with `surface=project`.
Card expansion is not an outbound click. Search text and impressions are not
collected by this event. Review project click counts in Umami's Events properties;
these counts do not measure impression-based click-through rates.

## Identity and ownership

GitHub sign-in identifies an account; it never grants project ownership by itself.
`/auth/github` starts OAuth on the canonical `APP_ORIGIN`. The callback at
`/auth/github/callback` checks a browser-bound, single-use state and S256 PKCE.
D1 stores hashed 30-day session tokens, never GitHub access tokens. Session and
OAuth cookies are Secure, HttpOnly and SameSite=Lax. Logout requires a same-origin
POST. Dynamic responses are private and not cached.

An unclaimed active project can be claimed by verifying either a TXT record at
`_triples-love.<registered hostname>` or a real `<meta>` tag in the HTML head at the
registered URL, including its path. A random token is tied to one account,
project, method, target URL and 48-hour attempt. Only its hash is stored. Starting
a new attempt invalidates that user's previous unused attempt for the project.
Checks are manual and rate-limited. Tokens are consumed in the same D1 transaction
as the unique project ownership record. Another account cannot replace an owner.

Apply `migrations/0005_verification_challenge_lifetime.sql` before deploying this
expiry change. It extends retained, unused challenges to 48 hours from creation
without changing their tokens, attempt limits, or ownership. It does not shorten
longer expiry times or revive consumed proofs. Deleted challenges cannot be
restored by this migration. Starting a new challenge still invalidates the old
token, so keep an already deployed proof while waiting for IPNS caches to update.
The 12 starts and 30 checks per user remain limited to a one-hour window.

Verified projects show a seal after their name in the directory and on the project
page. Expanded cards and project pages also show the owner's GitHub account.

HTML checks allow public HTTPS hostnames, validate A and AAAA records, follow only
same-origin redirects and impose time/body limits. Proof inside script, comment,
template or body content does not count. An HTML check may fail on an oversized
page, a bot challenge or a redirect to another hostname; DNS is the alternative.
DNS checks are a preflight, not IP pinning; outbound network isolation also relies
on the Cloudflare Worker runtime.

After verification, the owner can edit the name, category, English/Korean copy,
tags, search aliases, HTTPS links and fixed theme options. Unclaimed listings use
a light, neutral default; existing owners' selected themes are preserved.
Edits use an optimistic
version so a stale editor cannot overwrite a newer save. The registered URL only
changes through a new ownership proof; the previous address stays public until
that proof succeeds. Existing screenshots and curated archive status remain
maintainer-managed. Archived projects cannot be claimed or edited.

D1 is the source of truth after import. Seed scripts insert missing records and
never overwrite existing owner edits. R2 uploads, maker profiles, shared ownership
and ownership transfer/recovery are outside this first release.

## Website banners

The UI calls embedded link images **banners**, and reserves **verified badge**
for the blue ownership seal displayed beside a site's name on triples.love.
Banners can be used without verifying ownership.

`/badges/?project=<slug>&lang=ko` opens the banner chooser with a listing selected.
The public project and owner editor link to it; `/badges/` also works without a
project or sign-in. A Listed banner points to the selected project's page, while
a Discover banner points to the language-selecting directory homepage. Both add
`utm_source=badge` to the destination link.

`src/lib/embed-badges.js` generates absolute, escaped HTML and Markdown links.
The embed is only an anchor and image, with alt text and intrinsic dimensions;
it includes no JavaScript, iframe or ownership-verification claim. The four
self-contained light/dark SVGs in `static/badges/` are served as static assets
with a one-day public cache. Only existing directory records can be selected
for Listed links in the chooser. Downloaded SVGs can also be self-hosted.

## Featured projects

A project whose registered page links back to triples.love is featured;
ownership verification is not required. On the default directory view (all
categories, no search, A–Z order), up to four featured projects lead the list
as regular directory cards with a small Featured mark before the category, in
an order that changes once per Korean calendar day. Searches, category filters
and the other sort orders keep the neutral order without marks. While fewer
than four projects qualify, an open-spot card in the same card frame follows
them; it shows the Listed banner and links to `/badges/`. A featured card's visit
button records `project_click` with `surface=featured`.

A link counts when a real `<a href>` points to `https://triples.love/`, `/en/`,
`/ko/` or the same project's `/p/<id>/` page. Text in comments, scripts,
noscript or template content does not count, and the banner image URL is not
used, so self-hosted SVGs work. Only the registered URL is checked; visitors
cannot submit another address.

A check first fetches raw HTML with the same public-address, same-origin
redirect, time and size limits as ownership proofs. If the link is absent or
the raw fetch fails (for example a 403 or an oversized page), Cloudflare Browser
Rendering (`BROWSER` binding) loads the page and collects rendered anchor URLs.
Most listed sites are client-rendered apps, so this second step matters. Browser
time is limited by a shared budget of 40 renders per day. Sites behind a bot
challenge cannot be checked automatically.

Signed-in users start a check from `/badges/` (10 per hour per user, 4 per ten
minutes per project). An hourly Cron run rechecks the three projects checked
longest ago, so the directory is revisited about twice a day; it renders only
projects whose banner was previously found by rendering.

`project_backlinks` stores one row per project. Found resets the miss count;
missing increments it; unreachable (outage, render failure, budget exhausted)
keeps the previous evidence. A project is featured while its link was found
within the last 7 days and the miss count is below 2. A maintainer can set
`override` to `force_on` or `force_off`; overridden projects are not rechecked.

adapter-cloudflare emits only a fetch handler and writes it to Wrangler's `main`
path, so `npm run build` runs `scripts/add-scheduled-handler.mjs` afterwards. It
renames the generated Worker to `_sveltekit_worker.js`, writes a `_worker.js` that
adds `scheduled`, and excludes the server bundle from static assets.
