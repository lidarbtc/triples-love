<script>
  import ProjectShell from '$lib/components/ProjectShell.svelte';
  import VerifiedSeal from '$lib/components/VerifiedSeal.svelte';
  import VerificationPreview from '$lib/components/VerificationPreview.svelte';
  import { categoryNames } from '$lib/i18n.js';
  import { localizedProject, projectCopy, projectHref, splitLastWord } from '$lib/project-copy.js';
  import { badgePageHref } from '$lib/embed-badges.js';

  export let data;
  $: ({ project, user, lang } = data);
  $: t = projectCopy[lang] || projectCopy.en;
  $: copy = localizedProject(project, lang);
  $: isOwner = Boolean(user && project.owner?.id === user.id);
  $: archived = project.status === 'archived';
  $: visitUrl = (() => {
    const url = new URL(project.url);
    url.searchParams.set('utm_source', 'triples.love');
    return url.href;
  })();
  $: canonical = `https://triples.love/p/${encodeURIComponent(project.id)}/`;
  let screenshotFailed = false;
  let screenshotProjectId;
  $: if (screenshotProjectId !== project.id) {
    screenshotProjectId = project.id;
    screenshotFailed = false;
  }
</script>

<svelte:head>
  <title>{project.name} · triples.love</title>
  <meta name="description" content={copy.tagline || copy.description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={`${project.name} · triples.love`} />
  <meta property="og:description" content={copy.tagline || copy.description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={`https://triples.love/site-screenshots/${project.id}.jpg`} />
</svelte:head>

<ProjectShell {lang} {user}>
  <a class="project-back" href={`/${lang}/`}>← {t.back}</a>
  <article class="project-profile project-theme" data-theme={project.owner ? project.theme || 'light' : 'light'} data-accent={project.owner ? project.accent : 'neutral'}>
    <div class="project-cover">
      <div class="project-cover-placeholder" aria-hidden="true"><span>{project.domain}</span></div>
      <img src={`/site-screenshots/${project.id}.jpg`} alt={lang === 'ko' ? `${project.name} 사이트 미리보기` : `${project.name} site preview`} hidden={screenshotFailed} on:error={() => screenshotFailed = true} />
    </div>
    <div class="project-profile-body">
      <div class="project-profile-heading">
        <div>
          <h1 class="project-title">
            {#if project.owner}
              {@const [nameStart, nameEnd] = splitLastWord(project.name)}
              {nameStart}<span class="project-title-end">{nameEnd}<VerifiedSeal label={t.verified} /></span>
            {:else}
              {project.name}
            {/if}
          </h1>
          <p class="project-tagline">{copy.tagline}</p>
        </div>
        <div class="project-profile-visit">
          {#if archived}
            <a class="project-btn" href={`/site-screenshots/${project.id}.jpg`} target="_blank" rel="noopener">{t.savedScreenshot}</a>
          {:else}
            <a class="project-btn" href={visitUrl} target="_blank" rel="noopener" data-umami-event="project_click" data-umami-event-project={project.domain} data-umami-event-category={project.category} data-umami-event-surface="project">{t.visit}</a>
          {/if}
          <span class="project-source-url">{project.domain}</span>
        </div>
      </div>
      <div class="project-tag-list">
        <span class="project-tag">{categoryNames[lang]?.[project.category] || project.category}</span>
        {#if archived}<span class="project-tag">{t.archived}</span>{/if}
        {#each copy.badges as badge}<span class="project-tag">{badge}</span>{/each}
      </div>
      <div class="project-detail-grid">
        <section class="project-description" aria-label={t.about}>
          <p>{copy.description}</p>
          {#if archived}<p class="project-archive-note">{t.archivedNote}</p>{/if}
        </section>
        {#if project.links?.length}
          <section class="project-extra-links">
            <h2>{t.links}</h2>
            {#each project.links as link}
              <a href={link.url} target="_blank" rel="noopener"><span>{link.label}</span><span aria-hidden="true">↗</span></a>
            {/each}
          </section>
        {/if}
      </div>
    </div>
  </article>
  <aside class="project-ownership" class:project-ownership-verified={project.owner} class:project-ownership-unclaimed={!project.owner && !archived}>
    {#if project.owner}
      <div class="project-owner">
        {#if project.owner.avatarUrl}
          <img class="project-owner-avatar" src={project.owner.avatarUrl} alt="" width="40" height="40" referrerpolicy="no-referrer" on:error={(event) => event.currentTarget.hidden = true} />
        {/if}
        <div class="project-owner-text">
          <span class="project-owner-status"><VerifiedSeal />{t.verified}</span>
          <span class="project-owner-meta">{t.verifiedByBefore}<a href={`https://github.com/${encodeURIComponent(project.owner.handle)}`} target="_blank" rel="noopener">@{project.owner.handle}</a>{t.verifiedByAfter}</span>
        </div>
      </div>
      {#if isOwner && !archived}<a class="project-btn project-btn-secondary" href={projectHref(project.id, lang, 'edit')}>{t.edit}</a>{/if}
    {:else if !archived}
      <div class="project-claim-copy">
        <h2>{t.unclaimed}</h2><p>{t.claimIntro}</p>
        <div class="project-claim-preview"><VerificationPreview name={project.name} {lang} /></div>
      </div>
      <a class="project-btn" href={projectHref(project.id, lang, 'claim')}>{t.claim}</a>
    {/if}
  </aside>
  <p class="project-badge-link"><a href={badgePageHref(project.id, lang)}>{t.badgeCode} →</a></p>
</ProjectShell>

<style>
  .project-profile { border: 1px solid var(--project-border); border-radius: 8px; overflow: hidden; }
  .project-cover { height: clamp(210px, 34vw, 380px); position: relative; background: var(--project-tint); overflow: hidden; border-bottom: 1px solid var(--project-border); }
  .project-cover img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; position: relative; }
  .project-cover img[hidden] { display: none; }
  .project-cover-placeholder { position: absolute; inset: 0; display: grid; place-items: center; background: var(--project-tint); }
  .project-cover-placeholder span { font-size: 24px; color: var(--project-muted); }
  .project-profile-body { padding: 30px 34px; }
  .project-profile-heading { display: grid; grid-template-columns: 1fr minmax(170px, 220px); gap: 30px; align-items: center; margin-bottom: 25px; }
  .project-profile-heading .project-title { margin: 0 0 12px; }
  .project-tagline { margin: 0; color: var(--project-muted); font-size: 17px; line-height: 1.5; }
  .project-profile-visit { display: grid; gap: 10px; }
  .project-profile-visit .project-btn { background: var(--project-ink); color: var(--project-paper); }
  .project-profile-visit .project-btn:hover { filter: brightness(.9); }
  .project-source-url { display: block; font-size: 12px; color: var(--project-muted); text-align: center; line-height: 1.65; overflow-wrap: anywhere; }
  .project-detail-grid { display: grid; grid-template-columns: 1fr; gap: 28px; margin-top: 23px; padding-top: 23px; border-top: 1px solid var(--project-border); }
  .project-detail-grid:has(.project-extra-links) { grid-template-columns: 1.6fr 1fr; }
  .project-detail-grid h2 { margin: 0 0 13px; font-size: 12px; font-weight: 600; color: var(--project-ink); }
  .project-description p { margin: 0; white-space: pre-line; font-size: 14px; line-height: 1.85; color: var(--project-muted); overflow-wrap: anywhere; }
  .project-description .project-archive-note { margin-top: 22px; font-size: 12px; }
  .project-extra-links a { display: flex; justify-content: space-between; gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--project-border); font-size: 13px; color: var(--project-accent); overflow-wrap: anywhere; }
  .project-extra-links a:first-of-type { padding-top: 1px; }
  .project-ownership { display: flex; justify-content: space-between; gap: 22px; align-items: center; padding: 26px 4px 0; }
  .project-ownership h2 { font-size: 13px; margin: 0 0 7px; font-weight: 500; }
  .project-ownership p { margin: 7px 0 0; font-size: 12px; color: var(--ink-2); line-height: 1.5; }
  .project-ownership .project-btn { flex-shrink: 0; }
  .project-ownership-verified { margin-top: 22px; padding: 18px 20px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
  .project-ownership-unclaimed { margin-top: 22px; padding: 24px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
  .project-claim-copy { min-width: 0; }
  .project-claim-copy p { max-width: 58ch; line-height: 1.7; }
  .project-claim-preview { margin-top: 18px; }
  .project-title-end { display: inline-block; }
  .project-title-end :global(.verified-seal) { width: .6em; height: .6em; margin-left: .18em; vertical-align: .06em; }
  .project-badge-link { margin: 20px 4px 0; font-size: 13px; color: var(--ink-2); }
  .project-badge-link a { text-decoration: underline; text-underline-offset: 3px; }
  @media (max-width: 680px) {
    .project-profile-body { padding: 25px 22px; }
    .project-profile-heading { grid-template-columns: 1fr; gap: 24px; }
    .project-profile-visit { justify-items: start; }
    .project-source-url { text-align: left; }
    .project-detail-grid:has(.project-extra-links) { grid-template-columns: 1fr; gap: 25px; }
    .project-ownership { align-items: flex-start; flex-direction: column; }
    .project-ownership-unclaimed { align-items: stretch; }
  }
</style>
