import { parse } from 'parse5';

export const PROOF_META_NAME = 'triples-love-verification';
export const PROOF_TIMEOUT_MS = 8000;
export const MAX_HTML_BYTES = 256 * 1024;
const MAX_DNS_BYTES = 32 * 1024;

export class ProofError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProofError';
    this.code = code;
  }
}

/** Only HTTPS DNS hostnames can become publicly listed project addresses. */
export function validateTargetUrl(value) {
  let url;
  try {
    if (typeof value !== 'string' || value.length > 2048) throw new Error();
    url = new URL(value);
  } catch {
    throw new ProofError('invalid_url', 'Enter a valid HTTPS website address.');
  }
  const hostname = url.hostname;
  if (
    url.protocol !== 'https:' || url.username || url.password || url.port ||
    !hostname.includes('.') || hostname.length > 253 ||
    /^[\d.]+$/.test(hostname) || hostname.includes(':') ||
    !hostname.split('.').every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/i.test(hostname)
  ) {
    throw new ProofError('invalid_url', 'Use a public HTTPS hostname without credentials or a custom port.');
  }
  // Fragments never reach the website and cannot be part of a proof target.
  url.hash = '';
  return url;
}

export function isPublicAddress(address) {
  if (typeof address !== 'string') return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
    const parts = address.split('.').map(Number);
    if (parts.some((part) => part > 255)) return false;
    const [a, b, c] = parts;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Global unicast IPv6 only. This excludes loopback, link-local, ULA, mapped
  // IPv4, NAT64 and multicast rather than trying to enumerate private ranges.
  if (!/^[a-f\d:]+$/i.test(address) || !address.includes(':')) return false;
  try {
    new URL(`https://[${address}]/`);
  } catch {
    return false;
  }
  const [first = '', second = ''] = address.split(':');
  const prefix = Number.parseInt(first, 16);
  const next = Number.parseInt(second || '0', 16);
  return prefix >= 0x2000 && prefix <= 0x3fff &&
    prefix !== 0x2002 &&
    !(prefix === 0x2001 && (next < 0x0200 || next === 0x0db8)) &&
    !(prefix === 0x3fff && next < 0x1000);
}

export async function readLimitedText(response, maxBytes, signal) {
  const contentLength = Number(response.headers.get('content-length'));
  if (contentLength > maxBytes) {
    await response.body?.cancel();
    throw new ProofError('too_large', 'The verification response is too large. Try DNS verification.');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new ProofError('timeout', 'Verification timed out. Please try again.');
      const chunk = await reader.read();
      if (signal?.aborted) throw new ProofError('timeout', 'Verification timed out. Please try again.');
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ProofError('too_large', 'The verification response is too large. Try DNS verification.');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export async function resolveDns(name, type, { fetcher = fetch, signal } = {}) {
  const endpoint = new URL('https://cloudflare-dns.com/dns-query');
  endpoint.searchParams.set('name', name);
  endpoint.searchParams.set('type', type);
  const response = await fetcher(endpoint.href, {
    headers: { accept: 'application/dns-json' }, redirect: 'manual', signal,
    cache: 'no-store'
  });
  if (!response.ok) throw new ProofError('dns_failed', 'DNS could not be checked. Please try again.');
  let result;
  try {
    result = JSON.parse(await readLimitedText(response, MAX_DNS_BYTES, signal));
  } catch (error) {
    if (error instanceof ProofError) throw error;
    throw new ProofError('dns_failed', 'DNS could not be checked. Please try again.');
  }
  if (result.Status === 3) return [];
  if (result.Status !== 0 || (result.Answer && !Array.isArray(result.Answer))) {
    throw new ProofError('dns_failed', 'DNS could not be checked. Please try again.');
  }
  const typeNumber = { A: 1, AAAA: 28, TXT: 16 }[type];
  return (result.Answer || []).filter((record) => record.type === typeNumber).map((record) => record.data);
}

export async function assertPublicTarget(url, { resolve = resolveDns, fetcher = fetch, signal } = {}) {
  const target = validateTargetUrl(typeof url === 'string' ? url : url.href);
  const answers = await Promise.all([
    resolve(target.hostname, 'A', { fetcher, signal }),
    resolve(target.hostname, 'AAAA', { fetcher, signal })
  ]);
  const addresses = answers.flat();
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw new ProofError('private_target', 'The website must resolve only to public internet addresses.');
  }
  return target;
}

/** Parse actual HTML: text inside comments, scripts, templates or body is not proof. */
export function hasVerificationMeta(html, token) {
  const document = parse(html);
  const root = document.childNodes.find((node) => node.tagName === 'html');
  const head = root?.childNodes.find((node) => node.tagName === 'head');
  return Boolean(head?.childNodes.some((node) => {
    if (node.tagName !== 'meta' || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
    const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
    return attrs.name?.toLowerCase() === PROOF_META_NAME && attrs.content === token;
  }));
}

/** Decode DNS presentation-format TXT segments, including escaped characters. */
export function decodeTxtRecord(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  let index = 0;
  let result = '';
  let segments = 0;
  while (index < value.length) {
    while (/\s/.test(value[index] || '') && index < value.length) index += 1;
    if (index === value.length) break;
    if (value[index++] !== '"') return null;
    segments += 1;
    let closed = false;
    while (index < value.length) {
      const character = value[index++];
      if (character === '"') { closed = true; break; }
      if (character !== '\\') { result += character; continue; }
      if (index >= value.length) return null;
      const decimal = value.slice(index, index + 3);
      if (/^\d{3}$/.test(decimal)) {
        const code = Number(decimal);
        if (code > 255) return null;
        result += String.fromCharCode(code);
        index += 3;
      } else {
        result += value[index++];
      }
    }
    if (!closed) return null;
  }
  return segments ? result : null;
}

/**
 * Fetch raw HTML from an already validated public target. Each redirect hop is
 * validated and resolved again and must stay on the registered origin. No
 * browser cookies, authorization headers or tokens are ever forwarded.
 */
async function readPublicHtml(target, { resolve, fetcher, signal, userAgent }) {
  let current = target;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (redirects) await assertPublicTarget(current, { resolve, fetcher, signal });
    const response = await fetcher(current.href, {
      method: 'GET', redirect: 'manual', signal, cache: 'no-store',
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': userAgent }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 3) throw new ProofError('redirect', 'Too many redirects. Try DNS verification.');
      let next;
      try { next = validateTargetUrl(new URL(location, current).href); }
      catch { throw new ProofError('redirect', 'The website redirected to an unsafe address. Try DNS verification.'); }
      if (next.origin !== target.origin) {
        throw new ProofError('redirect', 'The website redirects to another hostname. Use DNS verification for the registered hostname.');
      }
      current = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProofError('http_failed', 'The website did not return a successful page. Try again or use DNS verification.');
    }
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (type !== 'text/html' && type !== 'application/xhtml+xml') {
      await response.body?.cancel();
      throw new ProofError('not_html', 'The website did not return HTML. Use DNS verification instead.');
    }
    return { url: current, html: await readLimitedText(response, MAX_HTML_BYTES, signal) };
  }
  throw new ProofError('redirect', 'Too many redirects. Try DNS verification.');
}

function unexpectedFetchError(error, signal) {
  if (error instanceof ProofError) return error;
  if (signal.aborted) return new ProofError('timeout', 'Verification timed out. Please try again.');
  return new ProofError('fetch_failed', 'The website could not be checked. Please try again.');
}

/** Bounded public HTML fetch for non-proof checks, such as website-banner links. */
export async function fetchSiteHtml(targetUrl, options = {}) {
  const fetcher = options.fetcher || fetch;
  const resolve = options.resolve || resolveDns;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || PROOF_TIMEOUT_MS);
  const signal = controller.signal;
  try {
    const target = await assertPublicTarget(targetUrl, { resolve, fetcher, signal });
    return await readPublicHtml(target, { resolve, fetcher, signal, userAgent: options.userAgent || 'triples.love site check' });
  } catch (error) {
    throw unexpectedFetchError(error, signal);
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifySiteProof({ method, targetUrl, token }, options = {}) {
  if (method !== 'dns' && method !== 'meta') throw new ProofError('invalid_method', 'Choose DNS or HTML verification.');
  const fetcher = options.fetcher || fetch;
  const resolve = options.resolve || resolveDns;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || PROOF_TIMEOUT_MS);
  const signal = controller.signal;
  try {
    const target = await assertPublicTarget(targetUrl, { resolve, fetcher, signal });
    if (method === 'dns') {
      const answers = await resolve(`_triples-love.${target.hostname}`, 'TXT', { fetcher, signal });
      return answers.some((answer) => decodeTxtRecord(answer) === `${PROOF_META_NAME}=${token}`);
    }
    const { html } = await readPublicHtml(target, { resolve, fetcher, signal, userAgent: 'triples.love ownership verification' });
    return hasVerificationMeta(html, token);
  } catch (error) {
    throw unexpectedFetchError(error, signal);
  } finally {
    clearTimeout(timeout);
  }
}
