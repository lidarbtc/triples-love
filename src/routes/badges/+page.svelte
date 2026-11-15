<script>
  import { goto } from '$app/navigation';
  import ProjectShell from '$lib/components/ProjectShell.svelte';
  import { badgeTypes, createBadgeEmbed } from '$lib/embed-badges.js';

  export let data;
  let type = data.type;
  let theme = data.theme;
  let projectId = data.projectId;
  let format = 'html';
  let copyState = '';
  let codeArea;
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

  const copy = {
    ko: {
      title: '사이트에 배지 달기', intro: '배지를 고르고 HTML 코드를 사이트의 푸터나 소개 페이지에 붙여 넣으세요.',
      message: '문구', project: '등록된 프로젝트', choose: '프로젝트를 선택하세요', color: '배지 색상', light: '밝게', dark: '어둡게',
      listedHint: '프로젝트 페이지로 연결됩니다.', discoverHint: '전체 프로젝트 목록으로 연결됩니다.',
      preview: '미리보기', destination: '연결 주소', code: '삽입 코드', copyHtml: 'HTML 복사', copyMarkdown: 'Markdown 복사',
      copied: '복사했습니다.', manual: '코드를 선택했습니다. Ctrl+C 또는 ⌘C로 복사하세요.',
      help: 'HTML은 웹사이트에, Markdown은 GitHub README 등에 사용할 수 있습니다.', download: 'SVG 다운로드', apply: '배지 보기'
    },
    en: {
      title: 'Add a badge to your site', intro: 'Choose a badge and paste the HTML into your footer or about page.',
      message: 'Text', project: 'Listed project', choose: 'Choose a project', color: 'Badge color', light: 'Light', dark: 'Dark',
      listedHint: 'Links to your project page.', discoverHint: 'Links to the full project directory.',
      preview: 'Preview', destination: 'Link destination', code: 'Embed code', copyHtml: 'Copy HTML', copyMarkdown: 'Copy Markdown',
      copied: 'Copied.', manual: 'Code selected. Press Ctrl+C or ⌘C to copy it.',
      help: 'Use HTML on your website or Markdown in a GitHub README.', download: 'Download SVG', apply: 'Show badge'
    }
  };

  async function rememberSelection(event) {
    const values = new FormData(event.currentTarget);
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
  <div class="badge-layout">
    <form class="badge-settings" action="/badges/" method="GET" on:change={rememberSelection}>
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
      {#if type === 'listed'}
        <div class="badge-project">
          <label for="badge-project">{t.project}</label>
          <select id="badge-project" name="project" bind:value={projectId} required>
            <option value="">{t.choose}</option>
            {#each data.projects as project}<option value={project.id}>{project.name}</option>{/each}
          </select>
        </div>
      {:else if projectId}
        <input type="hidden" name="project" value={projectId} />
      {/if}
      <fieldset class="badge-colors">
        <legend>{t.color}</legend>
        <label><input type="radio" name="theme" value="light" bind:group={theme} /> {t.light}</label>
        <label><input type="radio" name="theme" value="dark" bind:group={theme} /> {t.dark}</label>
      </fieldset>
      <noscript><button class="btn btn-primary" type="submit">{t.apply}</button></noscript>
    </form>
    <section class="badge-output" aria-label={t.preview}>
      <div class="badge-preview" class:dark={theme === 'dark'}>
        {#if embed}
          <a href={embed.href} target="_blank" rel="noopener noreferrer">
            <img src={`/badges/${type}-${theme}.svg`} alt={embed.alt} width={embed.width} height={embed.height} />
          </a>
        {:else}<p>{t.choose}</p>{/if}
      </div>
      {#if embed}
        <p class="badge-destination"><span>{t.destination}</span><a href={embed.href} target="_blank" rel="noopener noreferrer">{embed.href}</a></p>
        <div class="badge-code-head">
          <label for="badge-code">{t.code}</label>
          <div class="format-buttons" aria-label={t.code}>
            {#each ['html', 'markdown'] as value}
              <button class="tab" class:tab-active={format === value} type="button" aria-pressed={format === value} on:click={() => { format = value; copyState = ''; }}>{value === 'html' ? 'HTML' : 'Markdown'}</button>
            {/each}
          </div>
        </div>
        <textarea id="badge-code" bind:this={codeArea} value={code} readonly spellcheck="false" rows={format === 'html' ? 8 : 4} on:focus={event => event.currentTarget.select()}></textarea>
        <div class="badge-actions">
          <button class="btn btn-primary" type="button" on:click={copyCode}>{format === 'html' ? t.copyHtml : t.copyMarkdown}</button>
          <a class="btn btn-ghost" href={`/badges/${type}-${theme}.svg`} download>{t.download}</a>
          <span class="copy-status" role="status" aria-live="polite">{copyState ? t[copyState] : ''}</span>
        </div>
        <p class="badge-help">{t.help}</p>
      {/if}
    </section>
  </div>
</ProjectShell>

<style>
  .badge-title { margin: 0 0 12px; font-size: clamp(28px, 4vw, 42px); letter-spacing: -.025em; line-height: 1.15; }
  .badge-intro { color: var(--ink-2); font-size: 14px; line-height: 1.55; margin: 0 0 30px; }
  .badge-layout { display: grid; grid-template-columns: minmax(260px, .85fr) minmax(0, 1.4fr); gap: 24px; align-items: start; }
  .badge-settings { padding: 20px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); }
  fieldset { padding: 0; border: 0; margin: 0 0 24px; min-width: 0; }
  legend, .badge-project > label, .badge-code-head > label { display: block; margin-bottom: 12px; font-size: 13px; font-weight: 500; }
  .badge-choice { display: flex; align-items: flex-start; gap: 10px; border: 1px solid var(--line-mid); border-radius: var(--radius-sm); padding: 13px 12px; margin-top: 8px; cursor: pointer; }
  .badge-choice.selected { border-color: var(--ink); }
  input[type="radio"] { accent-color: var(--ink); margin: 3px 0 0; }
  .badge-choice strong { font-size: 13px; font-weight: 500; line-height: 1.4; }
  .badge-choice small { display: block; margin-top: 5px; font-size: 12px; line-height: 1.5; color: var(--ink-2); }
  .badge-project { margin-bottom: 24px; }
  select { width: 100%; border: 1px solid var(--line-mid); border-radius: var(--radius-sm); background: var(--card); color: var(--ink); font: inherit; font-size: 13px; padding: 8px 10px; }
  .badge-colors { margin-bottom: 0; }
  .badge-colors label { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; margin-right: 20px; cursor: pointer; }
  .badge-colors input { margin: 0; }
  .badge-preview { display: grid; place-items: center; padding: 30px 20px; min-height: 136px; background: var(--bg-soft); border: 1px solid var(--line); border-radius: var(--radius); }
  .badge-preview.dark { background: #303039; }
  .badge-preview img { display: block; max-width: 100%; height: auto; }
  .badge-preview p { color: var(--ink-2); font-size: 13px; }
  .badge-preview.dark p { color: #dddde4; }
  .badge-destination { margin: 14px 0 22px; display: grid; gap: 5px; font-size: 11px; color: var(--ink-2); }
  .badge-destination a { font-family: var(--mono); overflow-wrap: anywhere; text-decoration: underline; text-underline-offset: 3px; }
  .badge-code-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .badge-code-head > label { margin: 0; }
  .format-buttons { display: flex; gap: 2px; }
  .format-buttons .tab { font-size: 12px; padding: 5px 9px; }
  textarea { display: block; width: 100%; min-height: 90px; padding: 13px; border: 1px solid var(--line-mid); border-radius: var(--radius-sm); background: var(--card); color: var(--ink); font: 11px/1.7 var(--mono); resize: vertical; }
  .badge-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .badge-actions .btn { display: inline-flex; align-items: center; justify-content: center; }
  .copy-status { color: var(--ink-2); font-size: 12px; }
  .badge-help { margin: 13px 0 0; font-size: 12px; line-height: 1.55; color: var(--ink-2); }
  @media (max-width: 720px) { .badge-layout { grid-template-columns: 1fr; gap: 20px; } .badge-intro { margin-bottom: 22px; } }
</style>
