import { recordResult } from '#lib/server/observability.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth.js';
import { ClaimError, findActiveChallenge, startClaim, verifyClaim } from '#lib/server/claims.js';
import { getDb } from '#lib/server/db.js';
import { getProject } from '#lib/server/projects.js';

function language(event) {
  return event.url.searchParams.get('lang') === 'ko' ? 'ko' : 'en';
}

function noStore(event) {
  if (event.locals.claimHeadersSet) return;
  event.locals.claimHeadersSet = true;
  event.setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'same-origin' });
}

async function projectFor(event) {
  const project = await getProject(getDb(event), event.params.slug);
  if (!project) error(404, 'Project not found.');
  return project;
}

export async function load(event) {
  noStore(event);
  const project = await projectFor(event);
  const user = event.locals.user ?? null;
  // ?restart=1 shows the method form; starting again for the same address keeps the token.
  const activeChallenge = user && event.url.searchParams.get('restart') !== '1'
    ? await findActiveChallenge(getDb(event), { project, userId: user.id })
    : null;
  return { project, user, lang: language(event), activeChallenge };
}

const koreanErrors = {
  not_found: '프로젝트를 찾을 수 없습니다.',
  archived: '보관된 프로젝트는 소유권을 인증할 수 없습니다.',
  already_claimed: '이미 다른 계정이 소유권을 인증한 프로젝트입니다.',
  invalid_method: 'DNS 또는 HTML 인증을 선택해 주세요.',
  invalid_url: '사용자 정보나 별도 포트가 없는 공개 HTTPS 사이트 주소를 입력해 주세요.',
  changed: '인증 중에 프로젝트 정보나 소유권이 변경되었습니다. 새로고침 후 다시 인증해 주세요.',
  invalid_challenge: '유효하지 않거나 만료된 인증입니다. 새 인증을 시작해 주세요.',
  attempts_exhausted: '이 인증의 확인 횟수를 모두 사용했습니다. “다시 시작하기”를 누르세요. 이미 올린 인증 정보는 그대로 쓸 수 있습니다.',
  rate_limited: '확인 요청이 너무 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.',
  retry_later: '몇 초 기다린 뒤 다시 확인해 주세요.',
  not_verified: '아직 인증 토큰을 찾지 못했습니다. 변경 사항을 확인한 뒤 다시 시도해 주세요.',
  dns_failed: 'DNS를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  private_target: '공개 인터넷 주소로 연결되는 사이트만 인증할 수 있습니다.',
  too_large: '페이지가 너무 큽니다. DNS 인증을 이용해 주세요.',
  meta_too_late: '인증 태그를 찾지 못했습니다. 큰 페이지는 앞부분 2MB만 확인하니 토큰 값이 맞는지, 태그가 <head> 맨 위쪽에 있는지 확인해 주세요.',
  timeout: '인증 시간이 초과되었습니다. 다시 시도해 주세요.',
  redirect: '페이지가 다른 호스트나 확인할 수 없는 주소로 이동합니다. DNS 인증을 이용해 주세요.',
  http_failed: '사이트에서 정상적인 페이지를 받지 못했습니다. 다시 시도하거나 DNS 인증을 이용해 주세요.',
  blocked: '사이트의 봇 차단(예: Cloudflare 챌린지)이 triples.love의 확인 요청을 막았습니다. DNS 인증을 이용하거나, User-Agent에 “triples.love”가 들어간 요청을 허용한 뒤 다시 확인해 주세요.',
  not_html: '사이트가 HTML 페이지를 반환하지 않습니다. DNS 인증을 이용해 주세요.',
  fetch_failed: '사이트에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
};

function claimFailure(caught, lang, event, operation) {
  if (!(caught instanceof ClaimError)) throw caught;
  recordResult(event, operation, caught.status, caught.code, { method: caught.challenge?.method });
  const message = lang === 'ko' ? (koreanErrors[caught.code] || caught.message) : caught.message;
  return fail(caught.status, { message, code: caught.code, challenge: caught.challenge });
}

export const actions = {
  start: async (event) => {
    noStore(event);
    const user = await requireUser(event);
    const project = await projectFor(event);
    const data = await event.request.formData();
    try {
      const challenge = await startClaim(getDb(event, 'claim.start'), {
        project, userId: user.id, method: data.get('method'), targetUrl: data.get('targetUrl')
      });
      recordResult(event, 'claim.start', 200, undefined, { method: challenge.method });
      return { challenge };
    } catch (caught) {
      return claimFailure(caught, language(event), event, 'claim.start');
    }
  },
  verify: async (event) => {
    noStore(event);
    const user = await requireUser(event);
    const project = await projectFor(event);
    const data = await event.request.formData();
    try {
      const verified = await verifyClaim(getDb(event, 'claim.verify'), {
        project, userId: user.id, challengeId: data.get('challengeId'), token: data.get('token')
      });
      recordResult(event, 'claim.verify', 303, undefined, { method: verified.method });
    } catch (caught) {
      return claimFailure(caught, language(event), event, 'claim.verify');
    }
    redirect(303, `/p/${encodeURIComponent(project.id)}/edit/?claimed=1&lang=${language(event)}`);
  }
};
