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
| `src/hooks.server.js` | HTML language selection during prerendering |
| `src/app.css` | Shared styling |
| `static/image-slot.js` | Image preview custom element |
| `static/site-screenshots/` | Committed site previews |
| `scripts/capture-screenshots.mjs` | Playwright screenshot capture script |
| `wrangler.jsonc` | Cloudflare Workers Static Assets configuration |
| `src/lib/server/auth.js` | GitHub OAuth, session cookies and identity |
| `src/lib/server/claims.js` | One-time challenges and atomic ownership grants |
| `src/lib/server/proof.js` | Bounded DNS and raw HTML verification |
| `src/lib/server/projects.js` | D1 reads and owner-only edits |
| `src/routes/p/[slug]/` | Public project, claim and editing pages |
| `migrations/` | Versioned D1 schema |
| `scripts/seed-projects.mjs` | Non-destructive import of missing listings/locales |

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
`static/js/umami-thumbmark.js` loads the vendored ThumbmarkJS library and sends a
browser fingerprint as the `rough_id` session property, together with its profile
version. This is an approximate identifier, not a verified user identity.

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
project, method, target URL and one-hour attempt. Only its hash is stored. Starting
a new attempt invalidates that user's previous unused attempt for the project.
Checks are manual and rate-limited. Tokens are consumed in the same D1 transaction
as the unique project ownership record. Another account cannot replace an owner.

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

## Embeddable badges

`/badges/?project=<slug>&lang=ko` opens the badge chooser with a listing selected.
The public project and owner editor link to it; `/badges/` also works without a
project or sign-in. A Listed badge points to the selected project's page, while
a Discover badge points to the language-selecting directory homepage. Both add
`utm_source=badge` to the destination link.

`src/lib/embed-badges.js` generates absolute, escaped HTML and Markdown links.
The embed is only an anchor and image, with alt text and intrinsic dimensions;
it includes no JavaScript, iframe or ownership-verification claim. The four
self-contained light/dark SVGs in `static/badges/` are served as static assets
with a one-day public cache. Only existing directory records can be selected
for Listed links in the chooser. Downloaded SVGs can also be self-hosted.
