import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { sites } from '../src/lib/data.js';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultOutDir = path.join(projectRoot, 'static', 'site-screenshots');

const options = parseArgs(process.argv.slice(2));

main().catch((error) => {
  if (String(error?.message ?? error).includes("Executable doesn't exist")) {
    console.error('Playwright Chromium is not installed. Run: npx playwright install chromium');
  }

  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const targets = getTargets(options.siteIds);

  if (targets.length === 0) {
    throw new Error('No sites matched the requested filter.');
  }

  await fs.mkdir(options.outDir, { recursive: true });

  let browser;
  const failures = [];

  try {
    browser = await chromium.launch({ headless: !options.headed });

    for (const site of targets) {
      const result = await captureSite(browser, site);

      if (!result.ok) {
        failures.push(result);
      }

      if (!result.ok && options.failFast) {
        break;
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const capturedCount = targets.length - failures.length;
  console.log(`Done. ${capturedCount}/${targets.length} screenshots written to ${relative(options.outDir)}/`);

  if (failures.length > 0) {
    console.error('Failed captures:');
    for (const failure of failures) {
      console.error(`- ${failure.site.id}: ${failure.message}`);
    }

    process.exitCode = 1;
  }
}

async function captureSite(browser, site) {
  const filePath = path.join(options.outDir, `${site.id}.${options.format}`);
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 1,
    locale: 'en-US',
    reducedMotion: 'reduce',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeout);
    page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));

    console.log(`Capturing ${site.id} from ${site.url}`);
    const response = await page.goto(site.url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout
    });
    const status = response?.status();
    if (status >= 400) {
      throw new Error(`HTTP ${status}; preserving the existing screenshot.`);
    }

    await page.waitForLoadState('networkidle', { timeout: options.settleTimeout }).catch(() => {});
    await page.waitForTimeout(options.delay);
    const screenshotOptions = {
      path: filePath,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide'
    };

    if (options.format === 'jpg') {
      screenshotOptions.type = 'jpeg';
      screenshotOptions.quality = options.quality;
    }

    await page.screenshot(screenshotOptions);

    const statusText = status ? `HTTP ${status}` : 'no HTTP status';
    console.log(`Saved ${relative(filePath)} (${statusText})`);

    return { ok: true, site, filePath, status };
  } catch (error) {
    const message = error?.message ?? String(error);
    console.error(`Failed ${site.id}: ${message}`);
    return { ok: false, site, filePath, message };
  } finally {
    await context.close();
  }
}

function getTargets(siteIds) {
  if (siteIds.length === 0) {
    return sites.filter((site) => site.status !== 'archived');
  }

  const wanted = new Set(siteIds);
  const matched = sites.filter((site) => wanted.has(site.id) || wanted.has(site.domain));
  const found = new Set(matched.flatMap((site) => [site.id, site.domain]));
  const missing = [...wanted].filter((id) => !found.has(id));

  if (missing.length > 0) {
    throw new Error(`Unknown site id/domain: ${missing.join(', ')}`);
  }

  const archived = matched.filter((site) => site.status === 'archived');
  if (archived.length > 0) {
    throw new Error(
      `Cannot capture archived sites: ${archived.map((site) => site.id).join(', ')}. Their existing screenshots are preserved.`
    );
  }

  return matched;
}

function parseArgs(args) {
  const parsed = {
    delay: 1200,
    failFast: false,
    format: 'jpg',
    headed: false,
    height: 900,
    outDir: defaultOutDir,
    quality: 82,
    settleTimeout: 10000,
    siteIds: [],
    timeout: 45000,
    width: 1440
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--site') {
      parsed.siteIds.push(...splitList(requireValue(args, index, arg)));
      index += 1;
      continue;
    }

    if (arg === '--out') {
      parsed.outDir = resolvePath(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--format') {
      parsed.format = parseFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--quality') {
      parsed.quality = parseQuality(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === '--width') {
      parsed.width = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === '--height') {
      parsed.height = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === '--timeout') {
      parsed.timeout = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === '--settle-timeout') {
      parsed.settleTimeout = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === '--delay') {
      parsed.delay = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === '--fail-fast') {
      parsed.failFast = true;
      continue;
    }

    if (arg === '--headed') {
      parsed.headed = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, flag) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return number;
}

function parseFormat(value) {
  if (value === 'jpg' || value === 'png') {
    return value;
  }

  throw new Error('--format must be jpg or png.');
}

function parseQuality(value, flag) {
  const quality = parsePositiveInteger(value, flag);

  if (quality > 100) {
    throw new Error(`${flag} must be 100 or lower.`);
  }

  return quality;
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function relative(filePath) {
  return path.relative(projectRoot, filePath);
}

function printHelp() {
  console.log(`Usage: npm run screenshots -- [options]

Captures the fan sites listed in src/lib/data.js and writes deployable images to
static/site-screenshots/{site.id}.jpg by default.
Archived sites are skipped by default and cannot be selected with --site.

Options:
  --site <id>          Capture one or more ids/domains. Repeat or comma-separate.
  --out <dir>          Output directory. Default: static/site-screenshots
  --format <jpg|png>   Screenshot format. Default: jpg
  --quality <1-100>    JPEG quality. Default: 82
  --width <px>         Browser viewport width. Default: 1440
  --height <px>        Browser viewport height. Default: 900
  --timeout <ms>       Navigation timeout. Default: 45000
  --settle-timeout <ms>  Extra network-idle wait timeout. Default: 10000
  --delay <ms>         Extra delay before capture. Default: 1200
  --headed             Run with a visible browser window
  --fail-fast          Stop at the first failed capture
  -h, --help           Show this help

Examples:
  npm run screenshots
  npm run screenshots -- --site apollo
  npm run screenshots -- --site apollo,rachive --height 810`);
}
