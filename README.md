# triples.love

A community-curated index of fan-made tripleS & COSMO sites — tools, trackers,
hubs, and resources scattered across personal domains, github pages, and
vercel deploys, all in one place.

## Stack

Static site, no build step. React + Babel are loaded from CDN and the JSX is
compiled in the browser.

- `index.html` — markup, CSS, and CDN imports
- `data.js` — site list + category definitions (`window.TRIPLES_SITES`)
- `app.jsx` — header, toolbar (tabs + search + sort), card grid, about block
- `tweaks-panel.jsx` — design-time tweaks shell (hidden in production; only
  opens when a parent frame posts `__activate_edit_mode`)
- `image-slot.js` — `<image-slot>` custom element for drop-to-fill images
  (read-only outside the design host)

## Run locally

Any static server works — for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
