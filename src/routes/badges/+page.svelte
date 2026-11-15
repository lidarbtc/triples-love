<script>
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import ProjectShell from '$lib/components/ProjectShell.svelte';
  import { badgeTypes, createBadgeEmbed } from '$lib/embed-badges.js';

  export let data;
  export let form = null;
  let type = data.type;
  let theme = data.theme;
  let projectId = data.projectId;
  let format = 'html';
  let copyState = '';
  let codeArea;
  let settingsForm;
  let checking = false;
  let previousData = data;
  $: if (data !== previousData) {
    previousData = data;
    type = data.type;
    theme = data.theme;
    projectId = data.projectId;
    copyState = '';
  }
  $: lang = data.lang;
  $: t = copy[lang];
  $: selectedProject = data.projects.find(project => project.id === projectId);
  $: embed = type === 'discover' || selectedProject ? createBadgeEmbed({ type, theme, projectId, lang }) : null;
  $: code = embed ? embed[format] : '';
  $: checkResult = form?.check?.projectId === projectId ? form.check : null;
  $: featuredNow = checkResult ? checkResult.featured : Boolean(data.projectId === projectId && data.backlink?.featured);
  $: lastChecked = data.projectId === projectId && data.backlink?.lastCheckedAt
    ? new Date(data.backlink.lastCheckedAt).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })
    : '';
  $: checkQuery = new URLSearchParams({ lang, type: 'listed', theme, project: projectId }).toString();
  $: signInHref = `/auth/github?returnTo=${encodeURIComponent(`/badges/?${checkQuery}`)}`;

  const copy = {
    ko: {
      title: '배너 달고 첫 화면에 소개되기', intro: '내 사이트에 triples.love 배너를 달면 첫 화면 목록 맨 앞에 Featured로 소개돼요. 소유권 인증은 필요 없습니다.',
      step1: '내 프로젝트 고르기', step2: '배너를 사이트에 넣기', step3: '확인하고 소개받기',
      notListed: '목록에 없나요?', submit: '사이트 제보하기', chooseForListed: '이 배너는 위에서 프로젝트를 고르면 만들어져요.',
      needProject: '위에서 프로젝트를 고르면 여기서 배너를 확인할 수 있어요.',
      rules: [
        'triples.love에 등록된 사이트 주소의 페이지에 넣어 주세요. 푸터처럼 페이지를 열면 바로 있는 곳이 좋아요.',
        '버튼을 눌러야 열리는 창이나 메뉴 안에만 있으면 확인할 수 없어요.',
        '배너 이미지 대신 같은 주소로 가는 일반 링크를 써도 됩니다.'
      ],
      message: '배너 종류', project: '등록된 프로젝트', choose: '프로젝트를 선택하세요', color: '배너 색상', light: '밝게', dark: '어둡게',
      listedHint: '등록된 사이트임을 알리고, 내 프로젝트 페이지로 연결합니다.', discoverHint: '다른 팬 프로젝트를 찾아볼 수 있는 전체 목록으로 연결합니다.',
      preview: '미리보기', destination: '연결 주소', code: '삽입 코드', copyHtml: 'HTML 복사', copyMarkdown: 'Markdown 복사',
      copied: '복사했습니다.', manual: '코드를 선택했습니다. Ctrl+C 또는 ⌘C로 복사하세요.', download: 'SVG 다운로드', apply: '배너 보기',
      checkedPage: '배너를 확인하는 페이지', check: '배너 확인하기', checking: '확인 중… 최대 30초 걸릴 수 있어요',
      signInToCheck: 'GitHub로 로그인하고 확인하기', statusFeatured: '지금 첫 화면에 소개되고 있어요.', statusNot: '아직 소개되지 않았어요.', lastChecked: '마지막 확인',
      featureNote: '배너가 확인되면 바로 소개되고, 그 뒤로는 자동으로 다시 확인해요. 두 번 연속 보이지 않으면 소개에서 빠집니다.',
      result: {
        featured: '배너를 찾았어요. 이제 첫 화면에 소개됩니다.', found: '배너를 찾았어요.',
        not_found: '등록된 페이지에서 triples.love 배너 링크를 찾지 못했어요. 배너를 배포한 뒤 다시 확인해 주세요.',
        render_unavailable: '지금은 JavaScript로 그려지는 사이트를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',
        render_failed: '페이지가 끝까지 열리지 않았어요. 잠시 후 다시 시도해 주세요.',
        redirect: '등록된 주소가 다른 도메인으로 이동해서 확인할 수 없어요. 주소가 바뀌었다면 알려 주세요.',
        blocked: '사이트의 봇 차단(예: Cloudflare 챌린지)이 확인 요청을 막았어요. User-Agent에 “triples.love”가 들어간 요청을 허용한 뒤 다시 확인해 주세요.',
        timeout: '페이지 응답이 너무 느려서 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
        rate_limited: '확인 요청이 너무 많아요. 몇 분 뒤 다시 시도해 주세요.',
        archived: '보관된 프로젝트는 소개되지 않아요.',
        unreachable: '등록된 페이지를 열지 못했어요. 잠시 후 다시 시도해 주세요.'
      }
    },
    en: {
      title: 'Get featured with a banner', intro: 'Add a triples.love banner to your site and your project is featured at the front of the directory. No ownership verification needed.',
      step1: 'Choose your project', step2: 'Add the banner to your site', step3: 'Check it and get featured',
      notListed: 'Not in the list?', submit: 'Submit your site', chooseForListed: 'Choose your project above to create this banner.',
      needProject: 'Choose your project above to check its banner here.',
      rules: [
        'Put it on the page at your listed site address. A footer works well, as it is there as soon as the page opens.',
        'A banner that only appears inside a dialog or menu opened by a button can’t be checked.',
        'A plain link to the same address works instead of the banner image.'
      ],
      message: 'Banner type', project: 'Listed project', choose: 'Choose a project', color: 'Banner color', light: 'Light', dark: 'Dark',
      listedHint: 'Show that your site is listed and link to its project page.', discoverHint: 'Help visitors discover other fan projects in the directory.',
      preview: 'Preview', destination: 'Link destination', code: 'Embed code', copyHtml: 'Copy HTML', copyMarkdown: 'Copy Markdown',
      copied: 'Copied.', manual: 'Code selected. Press Ctrl+C or ⌘C to copy it.', download: 'Download SVG', apply: 'Show banner',
      checkedPage: 'Page we check for the banner', check: 'Check my banner', checking: 'Checking… this can take up to 30 seconds.',
      signInToCheck: 'Sign in with GitHub to check', statusFeatured: 'Featured on the homepage now.', statusNot: 'Not featured yet.', lastChecked: 'Last checked',
      featureNote: 'Your project is featured as soon as the banner is found, and we recheck automatically after that. If it is missing twice in a row, the project leaves the featured list.',
      result: {
        featured: 'Banner found. Your project is now featured on the homepage.', found: 'Banner found.',
        not_found: 'We couldn’t find a triples.love banner link on your listed page. Publish the banner, then check again.',
        render_unavailable: 'Sites that render with JavaScript can’t be checked right now. Please try again later.',
        render_failed: 'Your page didn’t finish loading. Please try again later.',
        redirect: 'Your listed address redirects to another domain, so it can’t be checked. Contact us if your address changed.',
        blocked: 'Your site’s bot protection blocked our check. Allow requests whose User-Agent contains “triples.love”, then check again.',
        timeout: 'Your page took too long to respond. Please try again later.',
        rate_limited: 'Too many checks. Please wait a few minutes and try again.',
        archived: 'Archived projects are not featured.',
        unreachable: 'We couldn’t open your listed page. Please try again later.'
      }
    }
  };

  function resultMessage(check) {
    if (check.state === 'found') return check.featured ? t.result.featured : t.result.found;
    return t.result[check.code] || (check.state === 'missing' ? t.result.not_found : t.result.unreachable);
  }

  function submitCheck() {
    checking = true;
    return async ({ update }) => {
      try { await update({ reset: false, invalidateAll: true }); } finally { checking = false; }
    };
  }

  async function rememberSelection() {
    // The project select sits outside the form but belongs to it.
    const values = new FormData(settingsForm);
    type = String(values.get('type'));
    theme = String(values.get('theme'));
    if (values.has('project')) projectId = String(values.get('project'));
    copyState = '';
    const params = new URLSearchParams({ lang, type, theme });
    if (projectId) params.set('project', projectId);
    await goto(`/badges/?${params}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  async function copyCode() {
    const currentCode = code;
    try {
      await navigator.clipboard.writeText(currentCode);
      if (code === currentCode) copyState = 'copied';
    } catch {
      if (code !== currentCode) return;
      codeArea.focus();
      codeArea.select();
      copyState = 'manual';
    }
  }
</script>

<svelte:head>
  <title>{t.title} · triples.love</title>
  <meta name="description" content={t.intro} />
  <link rel="canonical" href="https://triples.love/badges/" />
</svelte:head>

<ProjectShell {lang} user={data.user}>
  <h1 class="badge-title">{t.title}</h1>
  <p class="badge-intro">{t.intro}</p>

  <section class="badge-step" aria-labelledby="step-project">
    <h2 id="step-project"><span class="step-number" aria-hidden="true">1</span>{t.step1}</h2>
    <div class="badge-project">
      <label class="sr-only" for="badge-project">{t.project}</label>
      <select id="badge-project" name="project" form="badge-settings" bind:value={projectId} on:change={rememberSelection}>
        <option value="">{t.choose}</option>
        {#each data.projects as project}<option value={project.id}>{project.name}</option>{/each}
      </select>
      {#if selectedProject}
        <p class="feature-target"><span>{t.checkedPage}</span><a href={selectedProject.url} target="_blank" rel="noopener">{selectedProject.url}</a></p>
      {:else}
        <p class="badge-help">{t.notListed} <a href="mailto:hello@triples.love">{t.submit}</a></p>
      {/if}
    </div>
  </section>

  <section class="badge-step" aria-labelledby="step-banner">
    <h2 id="step-banner"><span class="step-number" aria-hidden="true">2</span>{t.step2}</h2>
    <div class="badge-layout">
      <form id="badge-settings" class="badge-settings" action="/badges/" method="GET" bind:this={settingsForm} on:change={rememberSelection}>
        <input type="hidden" name="lang" value={lang} />
        <fieldset>
          <legend>{t.message}</legend>
          {#each Object.entries(badgeTypes) as [value, badge]}
            <label class="badge-choice" class:selected={type === value}>
              <input type="radio" name="type" {value} bind:group={type} />
              <span><strong>{badge.label}</strong><small>{value === 'listed' ? t.listedHint : t.discoverHint}</small></span>
            </label>
          {/each}
        </fieldset>
        <fieldset class="badge-colors">
          <legend>{t.color}</legend>
          <label><input type="radio" name="theme" value="light" bind:group={theme} /> {t.light}</label>
          <label><input type="radio" name="theme" value="dark" bind:group={theme} /> {t.dark}</label>
        </fieldset>
        <noscript><button class="btn btn-primary" type="submit">{t.apply}</button></noscript>
      </form>
      <div class="badge-output">
        <div class="badge-preview" class:dark={theme === 'dark'} aria-label={t.preview}>
          {#if embed}
            <a href={embed.href} target="_blank" rel="noopener">
              <img src={`/badges/${type}-${theme}.svg`} alt={embed.alt} width={embed.width} height={embed.height} />
            </a>
          {:else}<p>{t.chooseForListed}</p>{/if}
        </div>
        {#if embed}
          <div class="badge-code-head">
            <label for="badge-code">{t.code}</label>
            <div class="format-buttons" aria-label={t.code}>
              {#each ['html', 'markdown'] as value}
                <button class="tab" class:tab-active={format === value} type="button" aria-pressed={format === value} on:click={() => { format = value; copyState = ''; }}>{value === 'html' ? 'HTML' : 'Markdown'}</button>
              {/each}
            </div>
          </div>
          <textarea id="badge-code" bind:this={codeArea} value={code} readonly spellcheck="false" rows={format === 'html' ? 6 : 3} on:focus={event => event.currentTarget.select()}></textarea>
          <div class="badge-actions">
            <button class="btn btn-primary" type="button" on:click={copyCode}>{format === 'html' ? t.copyHtml : t.copyMarkdown}</button>
            <a class="btn btn-ghost" href={`/badges/${type}-${theme}.svg`} download>{t.download}</a>
            <span class="copy-status" role="status" aria-live="polite">{copyState ? t[copyState] : ''}</span>
          </div>
        {/if}
      </div>
    </div>
    <ul class="badge-rules">
      {#each t.rules as rule}<li>{rule}</li>{/each}
    </ul>
  </section>

  <section class="badge-step" aria-labelledby="step-check">
    <h2 id="step-check"><span class="step-number" aria-hidden="true">3</span>{t.step3}</h2>
    {#if !selectedProject}
      <p class="badge-help">{t.needProject}</p>
    {:else if selectedProject.status !== 'active'}
      <p class="feature-status">{t.result.archived}</p>
    {:else}
      <div class="feature-action">
        <p class="feature-status" class:on={featuredNow}>
          <span class="feature-dot" aria-hidden="true"></span>{featuredNow ? t.statusFeatured : t.statusNot}
          {#if lastChecked}<small>{t.lastChecked} · {lastChecked}</small>{/if}
        </p>
        {#if data.user}
          <form method="POST" action={`?/check&${checkQuery}`} use:enhance={submitCheck}>
            <input type="hidden" name="project" value={projectId} />
            <button class="btn btn-primary" type="submit" disabled={checking}>{checking ? t.checking : t.check}</button>
          </form>
        {:else}
          <a class="btn btn-primary" href={signInHref} data-sveltekit-reload>{t.signInToCheck}</a>
        {/if}
      </div>
      <p class="feature-result" class:problem={checkResult && checkResult.state !== 'found'} role="status" aria-live="polite">{checkResult ? resultMessage(checkResult) : ''}</p>
      <p class="feature-note">{t.featureNote}</p>
    {/if}
  </section>
</ProjectShell>

<style>
  .badge-title { margin: 0 0 12px; font-size: clamp(28px, 4vw, 42px); letter-spacing: -.025em; line-height: 1.15; }
  .badge-intro { max-width: 640px; color: var(--ink-2); font-size: 14px; line-height: 1.6; margin: 0 0 26px; }
  .badge-step { margin-top: 16px; padding: 22px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); }
  .badge-step > h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 18px; font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
  .step-number { flex-shrink: 0; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: var(--ink); color: #fff; font: 11px var(--mono); }
  .badge-layout { display: grid; grid-template-columns: minmax(240px, .8fr) minmax(0, 1.4fr); gap: 26px; align-items: start; }
  .badge-output { min-width: 0; }
  fieldset { padding: 0; border: 0; margin: 0 0 22px; min-width: 0; }
  legend, .badge-code-head > label { display: block; margin-bottom: 10px; font-size: 13px; font-weight: 500; }
  .badge-choice { display: flex; align-items: flex-start; gap: 10px; border: 1px solid var(--line-mid); border-radius: var(--radius-sm); padding: 13px 12px; margin-top: 8px; cursor: pointer; }
  .badge-choice.selected { border-color: var(--ink); }
  input[type="radio"] { accent-color: var(--ink); margin: 3px 0 0; }
  .badge-choice strong { font-size: 13px; font-weight: 500; line-height: 1.4; }
  .badge-choice small { display: block; margin-top: 5px; font-size: 12px; line-height: 1.5; color: var(--ink-2); }
  .badge-project { display: grid; gap: 12px; max-width: 520px; }
  select { width: 100%; border: 1px solid var(--line-mid); border-radius: var(--radius-sm); background: var(--card); color: var(--ink); font: inherit; font-size: 14px; padding: 10px 12px; }
  .badge-colors { margin-bottom: 0; }
  .badge-colors label { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; margin-right: 20px; cursor: pointer; }
  .badge-colors input { margin: 0; }
  .badge-preview { display: grid; place-items: center; padding: 26px 20px; min-height: 112px; margin-bottom: 18px; background: var(--bg-soft); border: 1px solid var(--line); border-radius: var(--radius); }
  .badge-preview.dark { background: #303039; }
  .badge-preview img { display: block; max-width: 100%; height: auto; }
  .badge-preview p { margin: 0; color: var(--ink-2); font-size: 13px; text-align: center; }
  .badge-preview.dark p { color: #dddde4; }
  .badge-code-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .badge-code-head > label { margin: 0; }
  .format-buttons { display: flex; gap: 2px; }
  .format-buttons .tab { font-size: 12px; padding: 5px 9px; }
  textarea { display: block; width: 100%; min-height: 70px; padding: 13px; border: 1px solid var(--line-mid); border-radius: var(--radius-sm); background: var(--card); color: var(--ink); font: 11px/1.7 var(--mono); resize: vertical; }
  .badge-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .badge-actions .btn { display: inline-flex; align-items: center; justify-content: center; }
  .copy-status { color: var(--ink-2); font-size: 12px; }
  .badge-help { margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink-2); }
  .badge-help a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
  .badge-rules { margin: 22px 0 0; padding: 16px 0 0 18px; border-top: 1px solid var(--line); display: grid; gap: 6px; font-size: 12.5px; line-height: 1.6; color: var(--ink-2); }
  .feature-target { display: grid; gap: 5px; margin: 0; font-size: 11px; color: var(--ink-2); }
  .feature-target a { font-family: var(--mono); font-size: 12px; color: var(--ink); overflow-wrap: anywhere; text-decoration: underline; text-underline-offset: 3px; }
  .feature-action { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px 24px; }
  .feature-action form { margin: 0; }
  .feature-action .btn { display: inline-flex; align-items: center; justify-content: center; min-width: 220px; }
  .feature-action .btn:disabled { opacity: .7; cursor: progress; }
  .feature-status { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 0; font-size: 14px; font-weight: 500; }
  .feature-status small { flex-basis: 100%; padding-left: 16px; font-size: 11px; font-weight: 400; color: var(--ink-3); }
  .feature-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
  .feature-status.on .feature-dot { background: #2f9e6a; box-shadow: 0 0 0 3px color-mix(in oklab, #2f9e6a 18%, transparent); }
  .feature-result { margin: 16px 0 0; padding: 12px 14px; border: 1px solid #d2dfd7; border-radius: var(--radius-sm); background: #f0f7f2; color: #29513a; font-size: 13px; line-height: 1.6; }
  .feature-result.problem { border-color: #ead9b8; background: #fbf6ea; color: #6d5417; }
  .feature-result:empty { display: none; }
  .feature-note { margin: 16px 0 0; font-size: 12px; line-height: 1.6; color: var(--ink-3); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  @media (max-width: 720px) {
    .badge-layout { grid-template-columns: 1fr; gap: 22px; }
    .badge-step { padding: 18px; }
    .feature-action { flex-direction: column; align-items: stretch; }
    .feature-action .btn { width: 100%; min-width: 0; }
  }
</style>
