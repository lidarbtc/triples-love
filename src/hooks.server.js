import { isSupportedLang } from '$lib/i18n.js';

/** @type {import('@sveltejs/kit').Handle} */
export function handle({ event, resolve }) {
  const lang = isSupportedLang(event.params.lang) ? event.params.lang : 'en';

  // Runs at build time so each static page has the right language before hydration.
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', lang)
  });
}
