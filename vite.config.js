import { sveltekit } from '@sveltejs/kit/vite';

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [sveltekit(), {
    name: 'private-server-source-maps',
    enforce: 'post',
    config(config) {
      // SvelteKit selects SSR in its own config hook, after Vite's initial env.
      return { build: { sourcemap: Boolean(config.build?.ssr) } };
    }
  }]
};

export default config;
