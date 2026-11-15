# triples.love

A community-curated index of fan-made tripleS & COSMO sites — tools, trackers,
hubs, and resources scattered across personal domains, github pages, and
vercel deploys, all in one place.

## Stack

SvelteKit SSG with `@sveltejs/adapter-static`. The built `build/` directory is
served as Cloudflare Workers Static Assets via Wrangler.

- `src/routes/+page.svelte` — header, toolbar, card grid, about block, footer
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
