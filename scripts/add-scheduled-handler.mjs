import { readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../.svelte-kit/cloudflare/worker/', import.meta.url);
const configFile = new URL('wrangler.json', directory);
const config = JSON.parse(await readFile(configFile, 'utf8'));

// The adapter generates index.js for HTTP requests and deploys this directory
// independently of the public client assets. Add the Cron entry to its config.
await writeFile(new URL('scheduled.js', directory), `import app from './index.js';
import { runScheduledBacklinkChecks } from './server/backlink-cron.js';

export default {
  ...app,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledBacklinkChecks(env));
  }
};
`);
config.main = 'scheduled.js';
await writeFile(configFile, JSON.stringify(config, null, 2) + '\n');
