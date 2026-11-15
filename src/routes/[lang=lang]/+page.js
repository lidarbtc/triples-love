import { supportedLangs } from '$lib/i18n.js';

export function entries() {
  return supportedLangs.map((lang) => ({ lang }));
}

export function load({ params }) {
  return { lang: params.lang };
}
