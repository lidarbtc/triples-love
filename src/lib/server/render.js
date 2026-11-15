// Cloudflare Browser Rendering: load a registered page in a real browser so
// client-rendered banner links can be found. Only link URLs leave the browser.
import puppeteer from '@cloudflare/puppeteer';

export const RENDER_NAVIGATION_MS = 15000;
export const RENDER_LINK_WAIT_MS = 8000;
const MAX_LINKS = 2000;

export async function renderPageLinks(binding, url) {
  const browser = await puppeteer.launch(binding);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: RENDER_NAVIGATION_MS });
    // Wait for a banner link instead of network idle; live sites may keep sockets open.
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('a[href]')).some(anchor => /^https?:\/\/(www\.)?triples\.love(\/|$)/.test(anchor.href)),
      { timeout: RENDER_LINK_WAIT_MS }
    ).catch(() => {});
    const hrefs = await page.evaluate(max => Array.from(document.querySelectorAll('a[href]'), anchor => anchor.href).slice(0, max), MAX_LINKS);
    return { url: page.url(), hrefs };
  } finally {
    await browser.close().catch(() => {});
  }
}
