<script>
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import ProjectShell from '$lib/components/ProjectShell.svelte';
  import { categories } from '$lib/data.js';
  import { categoryNames } from '$lib/i18n.js';
  import { TAGLINE_DISPLAY_MAX, displayTagline, projectCopy, projectHref } from '$lib/project-copy.js';
  import { badgePageHref } from '$lib/embed-badges.js';

  export let data;
  export let form = null;
  let saving = false;
  let previewLang = data.lang;
  let draft = initialDraft(data.project, form?.values);
  let previousForm = form;
  $: ({ project, user, lang } = data);
  $: t = projectCopy[lang] || projectCopy.en;
  $: if (form !== previousForm) {
    previousForm = form;
    if (form?.values) draft = { ...draft, ...form.values };
  }
  $: if (form?.saved) draft.version = data.project.version;
  $: previewTagline = draft[`tagline_${previewLang}`] || draft.tagline_en;
  $: previewDescription = draft[`description_${previewLang}`] || draft.description_en;
  $: previewBadges = String(draft[`badges_${previewLang}`] || draft.badges_en).split(',').map((tag) => tag.trim()).filter(Boolean);

  // Tells the owner when a short description is longer than what visitors see.
  function taglineNote(value, copy) {
    const count = String(value || '').trim().length;
    const over = count > TAGLINE_DISPLAY_MAX;
    const text = (over ? copy.taglineOver : copy.taglineLimit).replace('{count}', count).replace('{max}', TAGLINE_DISPLAY_MAX);
    return { over, text, count };
  }
  $: taglineNoteEn = taglineNote(draft.tagline_en, t);
  $: taglineNoteKo = taglineNote(draft.tagline_ko, t);

  function initialDraft(project, values) {
    return {
      name: project.name, category: project.category, accent: project.accent || 'blue', theme: project.theme || 'light',
      tagline_en: project.locales?.en?.tagline || '', description_en: project.locales?.en?.description || '', badges_en: (project.locales?.en?.badges || []).join(', '),
      tagline_ko: project.locales?.ko?.tagline || '', description_ko: project.locales?.ko?.description || '', badges_ko: (project.locales?.ko?.badges || []).join(', '),
      aliases: (project.aliases || []).join(', '), links: (project.links || []).map((link) => `${link.label} | ${link.url}`).join('\n'), version: project.version,
      ...values
    };
  }

  function savePage() {
    saving = true;
    return async ({ update }) => {
      try { await update({ reset: false }); } finally { saving = false; }
    };
  }
</script>

<svelte:head>
  <title>{t.edit} · {project.name} · triples.love</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<ProjectShell {lang} {user}>
  <a class="project-back" href={projectHref(project.id, lang)}>← {project.name}</a>
  <div class="editor-heading"><div><span class="project-eyebrow">{t.edit}</span><h1 class="project-flow-title">{t.editTitle}</h1><p class="project-intro">{t.editIntro}</p></div><div class="editor-actions"><a class="project-btn project-btn-secondary" href={projectHref(project.id, lang)}>{t.view} ↗</a></div></div>
  {#if form?.message}<div class="project-message project-message-error" role="alert">{form.message}</div>{/if}
  {#if form?.saved}<div class="project-message" role="status">{t.saved}</div>{:else if $page.url.searchParams.get('claimed') === '1'}<div class="project-message" role="status">{t.claimedSuccess}</div>{/if}
  <p class="editor-featured" class:on={data.featured}><span class="editor-featured-dot" aria-hidden="true"></span>{data.featured ? t.featuredOn : t.featuredOff} <a href={badgePageHref(project.id, lang)}>{data.featured ? t.featuredManage : t.featuredGet} →</a></p>
  <div class="editor-layout">
    <form method="POST" action={`?lang=${lang}`} use:enhance={savePage} class="editor-form">
      <input type="hidden" name="version" value={draft.version} />
      <section class="project-panel">
        <h2>{t.basics}</h2>
        <div class="project-field"><label for="project-name">{t.name}</label><input id="project-name" name="name" bind:value={draft.name} maxlength="80" required /></div>
        <div class="project-field"><label for="project-category">{t.category}</label><select id="project-category" name="category" bind:value={draft.category}>{#each categories.filter((category) => category.id !== 'all') as category}<option value={category.id}>{categoryNames[lang]?.[category.id] || category.label}</option>{/each}</select></div>
        <div class="editor-site-address"><span class="project-field-label">{t.url}</span><span class="editor-url">{project.url}</span><a class="project-inline-link" href={projectHref(project.id, lang, 'claim')}>{t.changeUrl} ↗</a></div>
      </section>
      <section class="project-panel">
        <h2>{t.appearance}</h2>
        <div class="project-field-row">
          <div class="project-field"><label for="project-accent">{t.accent}</label><select id="project-accent" name="accent" bind:value={draft.accent}><option value="blue">{t.blue}</option><option value="amber">{t.amber}</option><option value="violet">{t.violet}</option></select></div>
          <div class="project-field"><label for="project-theme">{t.theme}</label><select id="project-theme" name="theme" bind:value={draft.theme}><option value="light">{t.light}</option><option value="dark">{t.dark}</option><option value="auto">{t.auto}</option></select></div>
        </div>
      </section>
      <section class="project-panel" lang="en">
        <div class="editor-section-heading"><h2>{t.english}</h2><span>EN</span></div>
        <p class="editor-language-hint">{t.englishHint}</p>
        <div class="project-field"><label for="tagline-en">{t.tagline}</label><input id="tagline-en" name="tagline_en" bind:value={draft.tagline_en} maxlength="160" required aria-describedby="tagline-en-note" /><p id="tagline-en-note" class="project-help tagline-note" class:over={taglineNoteEn.over} aria-live="polite"><span>{taglineNoteEn.text}</span><span class="tagline-count">{taglineNoteEn.count}/{TAGLINE_DISPLAY_MAX}</span></p></div>
        <div class="project-field"><label for="description-en">{t.description}</label><textarea id="description-en" name="description_en" bind:value={draft.description_en} maxlength="3000" rows="5" required></textarea></div>
        <div class="project-field"><label for="badges-en">{t.badges}</label><input id="badges-en" name="badges_en" bind:value={draft.badges_en} maxlength="500" /><p class="project-help">{t.commaHint}</p></div>
      </section>
      <section class="project-panel" lang="ko">
        <div class="editor-section-heading"><h2>{t.korean}</h2><span>KO</span></div>
        <p class="editor-language-hint">{t.koreanHint}</p>
        <div class="project-field"><label for="tagline-ko">{t.tagline}</label><input id="tagline-ko" name="tagline_ko" bind:value={draft.tagline_ko} maxlength="160" aria-describedby="tagline-ko-note" /><p id="tagline-ko-note" class="project-help tagline-note" class:over={taglineNoteKo.over} aria-live="polite"><span>{taglineNoteKo.text}</span><span class="tagline-count">{taglineNoteKo.count}/{TAGLINE_DISPLAY_MAX}</span></p></div>
        <div class="project-field"><label for="description-ko">{t.description}</label><textarea id="description-ko" name="description_ko" bind:value={draft.description_ko} maxlength="3000" rows="5"></textarea></div>
        <div class="project-field"><label for="badges-ko">{t.badges}</label><input id="badges-ko" name="badges_ko" bind:value={draft.badges_ko} maxlength="500" /><p class="project-help">{t.commaHint}</p></div>
      </section>
      <section class="project-panel">
        <h2>{t.discovery}</h2>
        <div class="project-field"><label for="project-aliases">{t.aliases}</label><input id="project-aliases" name="aliases" bind:value={draft.aliases} maxlength="1200" /><p class="project-help">{t.aliasesHint}</p></div>
        <div class="project-field"><label for="project-links">{t.extraLinks}</label><textarea id="project-links" name="links" bind:value={draft.links} maxlength="6000" rows="4" placeholder="GitHub | https://github.com/…"></textarea><p class="project-help">{t.linksHint}</p></div>
      </section>
      <div class="editor-save"><button class="project-btn" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button></div>
    </form>
    <aside class="editor-preview">
      <div class="editor-preview-heading"><span class="project-eyebrow">{t.preview}</span><div class="editor-preview-languages" aria-label={lang === 'ko' ? '미리보기 언어' : 'Preview language'}><button type="button" class:active={previewLang === 'en'} aria-pressed={previewLang === 'en'} on:click={() => previewLang = 'en'}>EN</button><button type="button" class:active={previewLang === 'ko'} aria-pressed={previewLang === 'ko'} on:click={() => previewLang = 'ko'}>KO</button></div></div>
      <div class="editor-preview-card project-theme" data-theme={draft.theme} data-accent={draft.accent}>
        <div class="editor-preview-stripe"><span>{project.domain}</span></div>
        <div class="editor-preview-content"><span class="editor-preview-category">{categoryNames[previewLang]?.[draft.category]}</span><h2>{draft.name || project.name}</h2><p class="editor-preview-tagline">{displayTagline(previewTagline) || t.previewEmpty}</p>{#if previewBadges.length}<div class="project-tag-list">{#each previewBadges as badge}<span class="project-tag">{badge}</span>{/each}</div>{/if}<div class="editor-preview-divider"></div><p class="editor-preview-description">{previewDescription || t.previewEmpty}</p><span class="editor-preview-visit">{projectCopy[previewLang].visit}</span></div>
      </div>
    </aside>
  </div>
</ProjectShell>

<style>
  .editor-heading { display: flex; justify-content: space-between; gap: 22px; align-items: center; margin-bottom: 30px; }
  .editor-heading .project-intro { font-size: 13px; max-width: 620px; }
  .editor-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
  .editor-layout { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, .9fr); gap: 30px; align-items: start; }
  .editor-form { display: grid; gap: 18px; min-width: 0; }
  .editor-site-address { padding-top: 18px; border-top: 1px solid var(--line); display: grid; gap: 10px; }
  .editor-url { font: 12px/1.6 var(--mono); overflow-wrap: anywhere; color: var(--ink-2); }
  .editor-section-heading { display: flex; justify-content: space-between; align-items: start; }
  .editor-section-heading > span { font: 10px var(--mono); color: var(--ink-3); border: 1px solid var(--line-mid); border-radius: 5px; padding: 4px; }
  .editor-section-heading h2 { margin-bottom: 0; }
  .editor-language-hint { margin: 5px 0 22px; font-size: 12px !important; }
  .editor-save { display: flex; justify-content: flex-end; gap: 20px; align-items: center; padding: 6px 0; }
  .editor-save .project-btn { flex-shrink: 0; }
  .editor-preview { position: sticky; top: 24px; min-width: 0; }
  .tagline-note { display: flex; justify-content: space-between; gap: 12px; }
  .tagline-count { flex: none; font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .tagline-note.over { color: #a4420b; }
  .editor-preview-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .editor-preview-languages { display: flex; padding: 3px; border: 1px solid var(--line); border-radius: 7px; }
  .editor-preview-languages button { border: 0; border-radius: 4px; background: transparent; color: var(--ink-2); cursor: pointer; padding: 4px 7px; font: 10px var(--mono); }
  .editor-preview-languages button.active { background: white; color: var(--ink); box-shadow: 0 1px 4px #0000000f; }
  .editor-preview-card { overflow: hidden; border: 1px solid var(--project-border); border-radius: 16px; }
  .editor-preview-stripe { display: grid; place-items: center; height: 110px; background: var(--project-tint); }
  .editor-preview-stripe > span { font-size: 20px; color: var(--project-muted); max-width: 90%; overflow-wrap: anywhere; }
  .editor-preview-content { padding: 25px; }
  .editor-preview-category { color: var(--project-muted); font: 9px var(--mono); text-transform: uppercase; letter-spacing: .06em; }
  .editor-preview-content h2 { margin: 12px 0 9px; font-size: 29px; letter-spacing: -.04em; line-height: 1.15; overflow-wrap: anywhere; }
  .editor-preview-tagline { font-size: 13px; line-height: 1.55; color: var(--project-muted); margin: 0 0 18px; overflow-wrap: anywhere; }
  .editor-preview-description { margin: 0 0 22px; font-size: 12px; color: var(--project-muted); line-height: 1.8; white-space: pre-line; overflow-wrap: anywhere; max-height: 260px; overflow-y: auto; }
  .editor-preview-divider { height: 1px; background: var(--project-border); margin: 24px 0 20px; }
  .editor-preview-visit { display: inline-block; background: var(--project-ink); color: var(--project-paper); border-radius: 5px; padding: 9px 13px; font-size: 11px; }
  @media (max-width: 820px) {
    .editor-layout { grid-template-columns: 1fr; }
    .editor-preview { position: static; max-width: 100%; order: -1; }
    .editor-preview-card { display: grid; grid-template-columns: 100px 1fr; }
    .editor-preview-stripe { height: 100%; }
    .editor-preview-stripe > span { display: none; }
    .editor-preview-content { padding: 22px; }
    .editor-preview-divider, .editor-preview-description, .editor-preview-visit { display: none; }
    .editor-preview-tagline { margin-bottom: 12px; }
    .editor-preview-content h2 { font-size: 23px; }
  }
  @media (max-width: 540px) {
    .editor-heading { flex-direction: column; align-items: flex-start; }
    .editor-preview-card { grid-template-columns: 40px 1fr; }
    .editor-save { flex-direction: column; align-items: stretch; gap: 12px; }
  }
</style>
