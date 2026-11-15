import { isSupportedLang } from '$lib/i18n.js';
import { getUser } from '$lib/server/auth.js';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { requestContext, recordResult, recordUnexpected, finishRequest } from '$lib/server/observability.js';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  requestContext(event);
  let status = 500;
  try {
    const lang = isSupportedLang(event.params.lang)
      ? event.params.lang
      : (event.url.pathname.startsWith('/p/') || ['/badges', '/badges/'].includes(event.url.pathname)) && event.url.searchParams.get('lang') === 'ko' ? 'ko' : 'en';
    event.locals.user = await getUser(event);

    const response = await resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', lang)
    });
    // Pages may contain session identity or one-time verification tokens.
    response.headers.set('cache-control', 'private, no-store');
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set('x-frame-options', 'DENY');
    response.headers.set('x-request-id', requestContext(event).id);
    status = response.status;
    if (status >= 400) recordResult(event, 'request', status, 'http_error');
    return response;
  } catch (cause) {
    if (isRedirect(cause) || isHttpError(cause)) {
      status = cause.status;
      if (status >= 400) recordResult(event, 'request', status, 'http_error');
    } else recordUnexpected(event, 'request', cause);
    throw cause;
  } finally {
    finishRequest(event, status);
  }
}

/** @type {import('@sveltejs/kit').HandleServerError} */
export function handleError({ event, error, status }) {
  if (status >= 500) recordUnexpected(event, 'request', error);
  return { message: status >= 500 ? 'Internal Error' : 'Not Found' };
}
