import { defineParams } from '@sveltejs/kit/params';
import { isSupportedLang } from '#lib/i18n.js';

export const params = defineParams({
  lang: (value) => isSupportedLang(value) ? value : undefined
});
