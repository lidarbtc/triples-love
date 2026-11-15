import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HTML_BYTES, ProofError, assertPublicTarget, decodeTxtRecord, hasVerificationMeta,
  isPublicAddress, resolveDns, validateTargetUrl, verifySiteProof
} from '../src/lib/server/proof.js';

const token = 'A'.repeat(43);
const meta = `<meta name="triples-love-verification" content="${token}">`;
const targetUrl = 'https://fans.example.com/wav-archive';
const publicDns = async (_name, type) => type === 'A' ? ['93.184.216.34'] : [];
const html = (content) => new Response(content, { headers: { 'content-type': 'text/html; charset=utf-8' } });

test('website target requires public HTTPS DNS hostname and preserves registered path', () => {
  assert.equal(validateTargetUrl(`${targetUrl}?locale=ko#details`).href, `${targetUrl}?locale=ko`);
  for (const address of [
    'http://fans.example.com', 'https://127.1/', 'https://2130706433/',
    'https://0x7f000001/', 'https://[::1]/', 'https://localhost/',
    'https://foo.local/', 'https://foo.internal/', 'https://single-label/',
    'https://fans.example.com:8443/', 'https://user:pass@fans.example.com/',
    'https://fans.example.com./', 'https://bad_label.example.com/'
  ]) assert.throws(() => validateTargetUrl(address), ProofError, address);
});

test('public-address check rejects both IPv4 and IPv6 special ranges', () => {
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicAddress(address), true, address);
  }
  for (const address of [
    '0.0.0.0', '10.2.3.4', '127.0.0.1', '169.254.169.254', '172.16.0.1',
    '192.168.1.1', '100.64.0.1', '198.18.0.1', '203.0.113.1', '192.0.2.1',
    '224.0.0.1', '255.255.255.255', '999.1.1.1', '::1', '::', 'fc00::1',
    'fe80::1', '::ffff:127.0.0.1', '64:ff9b::7f00:1', '2001:db8::1',
    '2002:7f00:1::', '2001::1', '3fff::1', '2001:abcd:::1'
  ]) assert.equal(isPublicAddress(address), false, address);
});

test('meta proof must be an actual HTML head meta element', () => {
  assert.equal(hasVerificationMeta(`<html><head>${meta}</head><body>WAV</body></html>`, token), true);
  assert.equal(hasVerificationMeta(`<HEAD><META CONTENT='${token}' NAME='TRIPLES-LOVE-VERIFICATION'></HEAD>`, token), true);
  for (const document of [
    `<head><!-- ${meta} --></head>`,
    `<head><script>const markup = '${meta}'</script></head>`,
    `<head><template>${meta}</template></head>`,
    `<head></head><body>${meta}</body>`,
    `<head><title>${meta}</title></head>`,
    `<head><noscript>${meta}</noscript></head>`,
    `<head><meta name="triples-love-verification" content="wrong" content="${token}"></head>`
  ]) assert.equal(hasVerificationMeta(document, token), false, document);
});

test('TXT proof parses quoted segments and requires an exact complete value', () => {
  assert.equal(decodeTxtRecord('"triples-love-" "verification=hello"'), 'triples-love-verification=hello');
  assert.equal(decodeTxtRecord('"a\\032b"'), 'a b');
  assert.equal(decodeTxtRecord('"a\\"b"'), 'a"b');
  for (const value of ['unquoted', '"unfinished', '"okay" garbage', '"\\999"']) {
    assert.equal(decodeTxtRecord(value), null);
  }
});

test('DNS resolver uses a fixed HTTPS resolver and ignores other record types', async () => {
  const records = await resolveDns('fans.example.com', 'A', {
    fetcher: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://cloudflare-dns.com');
      assert.equal(new URL(url).searchParams.get('name'), 'fans.example.com');
      assert.equal(options.redirect, 'manual');
      return Response.json({ Status: 0, Answer: [{ type: 5, data: 'alias.example.com' }, { type: 1, data: '8.8.8.8' }] });
    }
  });
  assert.deepEqual(records, ['8.8.8.8']);
  await assert.rejects(resolveDns('fans.example.com', 'A', { fetcher: async () => Response.json({ Status: 2 }) }), { code: 'dns_failed' });
});

test('DNS resolver rejects redirects without following an untrusted location', async () => {
  const requests = [];
  await assert.rejects(resolveDns('fans.example.com', 'A', {
    fetcher: async (url, options) => {
      requests.push(url);
      assert.equal(options.redirect, 'manual');
      return new Response(null, {
        status: 302,
        headers: { location: 'https://untrusted.example.com/collect' }
      });
    }
  }), { code: 'dns_failed' });
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0]).origin, 'https://cloudflare-dns.com');
});

test('one private AAAA result blocks a hostname even when A is public', async () => {
  await assert.rejects(assertPublicTarget(targetUrl, {
    resolve: async (_name, type) => type === 'A' ? ['8.8.8.8'] : ['fd00::1']
  }), { code: 'private_target' });
  await assert.rejects(assertPublicTarget(targetUrl, { resolve: async () => [] }), { code: 'private_target' });
});

test('DNS proof accepts split TXT value and does not fetch the target website', async () => {
  let txtName;
  const options = {
    fetcher: async () => { throw new Error('Unexpected website fetch'); },
    resolve: async (name, type) => {
      if (type !== 'TXT') return publicDns(name, type);
      txtName = name;
      return [`"triples-love-verification=" "${token}"`];
    }
  };
  assert.equal(await verifySiteProof({ method: 'dns', targetUrl, token }, options), true);
  assert.equal(txtName, '_triples-love.fans.example.com');
  assert.equal(await verifySiteProof({ method: 'dns', targetUrl, token: 'wrong' }, options), false);
});

test('HTML proof starts at exact registered path and sends no token or credentials', async () => {
  assert.equal(await verifySiteProof({ method: 'meta', targetUrl, token }, {
    resolve: publicDns,
    fetcher: async (url, options) => {
      assert.equal(url, targetUrl);
      assert.equal(options.redirect, 'manual');
      assert.equal(options.method, 'GET');
      assert.equal(JSON.stringify(options.headers).includes(token), false);
      assert.equal(new Headers(options.headers).has('authorization'), false);
      assert.equal(new Headers(options.headers).has('cookie'), false);
      return html(`<head>${meta}</head>`);
    }
  }), true);
});

test('same-origin redirects work, but each hop is checked again', async () => {
  const urls = [];
  let resolutions = 0;
  assert.equal(await verifySiteProof({ method: 'meta', targetUrl, token }, {
    resolve: async (name, type) => { resolutions += 1; return publicDns(name, type); },
    fetcher: async (url) => {
      urls.push(url);
      return urls.length === 1 ? new Response(null, { status: 302, headers: { location: '/wav-archive/' } }) : html(`<head>${meta}</head>`);
    }
  }), true);
  assert.deepEqual(urls, [targetUrl, `${targetUrl}/`]);
  assert.equal(resolutions, 4);
});

test('cross-origin and unsafe redirects are rejected before a second fetch', async () => {
  for (const location of ['https://other.example.com/proof', 'http://fans.example.com/proof', 'https://127.0.0.1/', 'https://user:pass@fans.example.com/']) {
    let calls = 0;
    await assert.rejects(verifySiteProof({ method: 'meta', targetUrl, token }, {
      resolve: publicDns,
      fetcher: async () => { calls += 1; return new Response(null, { status: 302, headers: { location } }); }
    }), { code: 'redirect' });
    assert.equal(calls, 1);
  }
});

test('private resolution on a later redirect is rejected before fetching', async () => {
  let aLookups = 0;
  let fetches = 0;
  await assert.rejects(verifySiteProof({ method: 'meta', targetUrl, token }, {
    resolve: async (_name, type) => type === 'AAAA' ? [] : [++aLookups === 1 ? '8.8.8.8' : '127.0.0.1'],
    fetcher: async () => { fetches += 1; return new Response(null, { status: 302, headers: { location: '/again' } }); }
  }), { code: 'private_target' });
  assert.equal(fetches, 1);
});

test('HTML response must be successful and HTML', async () => {
  for (const [response, code] of [
    [new Response('error', { status: 500 }), 'http_failed'],
    [new Response(`<head>${meta}</head>`, { headers: { 'content-type': 'text/plain' } }), 'not_html']
  ]) {
    await assert.rejects(verifySiteProof({ method: 'meta', targetUrl, token }, {
      resolve: publicDns, fetcher: async () => response
    }), { code });
  }
});

test('large HTML pages are checked by their first bytes only', async () => {
  const filler = `<script>${'x'.repeat(MAX_HTML_BYTES)}</script>`;
  const check = (content, extra = {}) => verifySiteProof({ method: 'meta', targetUrl, token }, {
    resolve: publicDns,
    fetcher: async () => new Response(content, {
      headers: { 'content-type': 'text/html', 'content-length': String(new TextEncoder().encode(content).length), ...extra }
    })
  });
  assert.equal(await check(`<head>${meta}${filler}</head><body></body>`), true);
  await assert.rejects(check(`<head>${filler}${meta}</head>`), { code: 'meta_too_late' });
  // A tag inside an unfinished script in the prefix is still not proof.
  await assert.rejects(check(`<head><script>${meta}${'x'.repeat(MAX_HTML_BYTES)}</script></head>`), { code: 'meta_too_late' });
});

test('slow target fetch is aborted with a retryable timeout', async () => {
  await assert.rejects(verifySiteProof({ method: 'meta', targetUrl, token }, {
    resolve: publicDns, timeoutMs: 10,
    fetcher: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    })
  }), { code: 'timeout' });
});
