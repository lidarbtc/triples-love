# triples.love

A curated directory of fan-made tripleS and COSMO sites, from Objekt tools and
collection trackers to schedules, video archives, and games.

[Visit triples.love](https://triples.love) · [English](https://triples.love/en/) · [Korean](https://triples.love/ko/)

## Features

- Search by name, domain, tags, and English or Korean aliases.
- Browse by category and sort alphabetically or by recent additions.
- Preview each site with screenshots and localized descriptions.
- Sign in with GitHub, verify a project's website, and edit its page.
- Copy HTML or Markdown badges to link back from your own website.

Built with SvelteKit and Svelte, with Cloudflare Workers and D1.

## Development

Use Node.js 22.12+ (or a newer supported LTS release) and npm.

```sh
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

To build and preview the production site:

```sh
npm run build
npm run cf:dev
```

## Contributing

To suggest a site or report an outdated listing, [open an issue](https://github.com/lidarbtc/triples-love/issues)
with its URL and a short description. Pull requests are welcome.

See the [maintenance guide](docs/maintenance.md) for listing updates, translations,
screenshots, and deployment. The [architecture notes](docs/architecture.md) describe
the source layout and language routing.

Unofficial fan project. Not affiliated with MODHAUS or tripleS.
