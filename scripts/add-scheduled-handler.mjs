// adapter-cloudflare only emits a fetch handler and writes it to wrangler's
// `main`. After the build, wrap that Worker and add the Cron handler.
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';

const MARKER = '// triples.love scheduled wrapper';
const directory = new URL('../.svelte-kit/cloudflare/', import.meta.url);
const entry = new URL('_worker.js', directory);
const source = await readFile(entry, 'utf8');
if (source.startsWith(MARKER)) {
  console.log('Scheduled handler already added.');
} else {
  await rename(entry, new URL('_sveltekit_worker.js', directory));
  await writeFile(entry, `${MARKER}
import app from './_sveltekit_worker.js';
import { runScheduledBacklinkChecks } from '../../src/lib/server/backlink-cron.js';

export default {
  ...app,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledBacklinkChecks(env));
  }
};
`);
  // Never serve the server bundle as a public static asset.
  await appendFile(new URL('.assetsignore', directory), '\n_sveltekit_worker.js\n');
  console.log('Added the scheduled banner-check handler.');
}
