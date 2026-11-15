# triples.love

A community-curated index of fan-made tripleS & COSMO sites — tools, trackers,
hubs, and resources scattered across personal domains, github pages, and
vercel deploys, all in one place.

## Stack

SvelteKit SSG with `@sveltejs/adapter-static`. The built `build/` directory is
served as Cloudflare Workers Static Assets via Wrangler.

- `src/routes/[lang=lang]/+page.svelte` — localized header, toolbar, card grid, about block, footer
- `src/routes/+page.svelte` — language entry point and legacy-link redirect
- `src/hooks.server.js` — sets the HTML language during prerendering
- `src/app.css` — migrated styling from the original static page
- `src/lib/data.js` — site list + category definitions
- `static/image-slot.js` — `<image-slot>` custom element asset
- `wrangler.jsonc` — Workers static assets deployment config

## Run locally

```sh
npm install
npm run dev
```

## Build and preview

```sh
npm run build
npm run preview
```

The generated static files are written to `build/`.

## Languages

`/en/` and `/ko/` are prerendered separately, including their text, HTML language,
and metadata. Direct visits display the requested language before JavaScript
loads. The language switch links between these routes.

`/` redirects to a language route using the legacy `?lang=en|ko` parameter first,
then the saved `triples-love.lang` preference, then the browser language. Other
query parameters and the URL fragment are preserved. If JavaScript is disabled,
the entry page offers links to both languages. No runtime SSR is required.

## Capture fan site screenshots

```sh
npm run screenshots
```

This visits every site in `src/lib/data.js` and writes deployable card previews
to `static/site-screenshots/{site.id}.jpg`.

Capture one listing:

```sh
npm run screenshots -- --site apollo
```

## Deploy to Cloudflare Workers

```sh
npm run deploy
```

This runs the SvelteKit static build and deploys `build/` with Wrangler.
