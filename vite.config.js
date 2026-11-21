import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [sveltekit({ adapter: adapter() })],
  environments: {
    client: { build: { sourcemap: false } },
    ssr: {
      build: {
        sourcemap: true,
        rolldownOptions: {
          // Compile the Cron handler with the app so both share server dependencies.
          input: { 'backlink-cron': './src/lib/server/backlink-cron.js' }
        }
      }
    }
  }
};

export default config;
