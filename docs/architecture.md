# Architecture

The site uses SvelteKit with `@sveltejs/adapter-static`. Cloudflare Workers Static
Assets serves the generated `build/` directory; no runtime SSR is required.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/lib/data.js` | Site listings and category definitions |
| `src/lib/i18n.js` | Interface translations, Korean listing copy, and search aliases |
| `src/routes/[lang=lang]/+page.svelte` | Localized directory, search, filters, and site cards |
| `src/routes/+page.svelte` | Language entry point and legacy-link redirect |
| `src/hooks.server.js` | HTML language selection during prerendering |
| `src/app.css` | Shared styling |
| `static/image-slot.js` | Image preview custom element |
| `static/site-screenshots/` | Committed site previews |
| `scripts/capture-screenshots.mjs` | Playwright screenshot capture script |
| `wrangler.jsonc` | Cloudflare Workers Static Assets configuration |

## Language routing

`/en/` and `/ko/` are prerendered separately, including their text, HTML language,
and metadata. Direct visits display the requested language before JavaScript
loads. The language switch links between these routes.

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

Outbound site links include `utm_source=triples.love`.
