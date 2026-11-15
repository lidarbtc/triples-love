import { isSupportedLang } from '$lib/i18n.js';
import { getUser } from '$lib/server/auth.js';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const lang = isSupportedLang(event.params.lang)
    ? event.params.lang
    : event.url.pathname.startsWith('/p/') && event.url.searchParams.get('lang') === 'ko' ? 'ko' : 'en';
  event.locals.user = await getUser(event);

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', lang)
  });
  // Pages may contain session identity or one-time verification tokens.
  response.headers.set('cache-control', 'private, no-store');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  return response;
}
