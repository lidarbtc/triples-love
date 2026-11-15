<script>
  import { enhance } from '$app/forms';
  import ProjectShell from '$lib/components/ProjectShell.svelte';
  import { projectCopy, projectHref } from '$lib/project-copy.js';

  export let data;
  export let form = null;
  let method = 'dns';
  let targetUrl = data.project.url;
  let pending = '';
  $: ({ project, user, lang } = data);
  $: t = projectCopy[lang] || projectCopy.en;
  $: isOwner = Boolean(user && project.owner?.id === user.id);
  $: ownedBySomeoneElse = Boolean(project.owner && !isOwner);
  $: challenge = form?.challenge;
  $: signInUrl = `/auth/github?returnTo=${encodeURIComponent(projectHref(project.id, lang, 'claim'))}`;
  $: expiry = challenge ? new Date(challenge.expiresAt).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '';

  function submitState(label) {
    return () => {
      pending = label;
      return async ({ update }) => {
        try { await update({ reset: false }); } finally { pending = ''; }
      };
    };
  }
</script>

<svelte:head>
  <title>{isOwner ? t.changeTitle : t.claim} · {project.name} · triples.love</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<ProjectShell {lang} {user}>
  <a class="project-back" href={projectHref(project.id, lang)}>← {project.name}</a>
  <div class="claim-layout">
    <div class="claim-intro">
      <span class="project-eyebrow">{project.name} · {project.domain}</span>
      <h1 class="project-flow-title">{isOwner ? t.changeTitle : t.claimTitle}</h1>
      <p class="project-intro">{isOwner ? t.changeDescription : t.claimDescription}</p>
      <ol class="claim-steps">
        <li class:complete={!!user}><span>{user ? '✓' : '01'}</span>{t.stepSignIn}</li>
        <li class:active={!!user}><span>02</span>{t.stepVerify}</li>
        <li><span>03</span>{t.stepEdit}</li>
      </ol>
    </div>
    <div class="claim-content">
      {#if form?.message}<div class="project-message project-message-error" role="alert">{form.message}</div>{/if}
      {#if project.status === 'archived'}
        <section class="project-panel"><h2>{t.archived}</h2><p>{t.archivedNote}</p></section>
      {:else if ownedBySomeoneElse}
        <section class="project-panel"><h2>{t.taken}</h2><p>{t.takenHint}</p></section>
      {:else if !user}
        <section class="project-panel claim-signin-panel"><span class="claim-number">01</span><h2>{t.stepSignIn}</h2><p>{t.claimIntro}</p><a class="project-btn" href={signInUrl} data-sveltekit-reload>{t.signIn}</a></section>
      {:else}
        <div class="claim-account"><span class="project-owner-check" aria-hidden="true">✓</span><span>{t.signedIn} <strong>@{user.handle}</strong></span></div>
        {#if challenge}
          <section class="project-panel claim-proof">
            <div class="claim-panel-heading"><span class="claim-number">02</span><h2>{t.proofTitle}</h2></div>
            <p>{challenge.method === 'dns' ? t.dnsInstructions : t.metaInstructions}</p>
            <div class="claim-proof-url"><span>{t.verifying}</span><code>{challenge.targetUrl}</code></div>
            {#if challenge.method === 'dns'}
              <div class="project-field"><label for="dns-host">{t.dnsName}</label><input id="dns-host" class="claim-code" readonly value={challenge.dnsName} on:focus={(event) => event.currentTarget.select()} /></div>
              <div class="project-field"><label for="dns-value">{t.dnsValue}</label><textarea id="dns-value" class="claim-code" readonly rows="3" value={challenge.dnsValue} on:focus={(event) => event.currentTarget.select()}></textarea></div>
              <p class="project-help">{t.dnsHostHint}</p>
            {:else}
              <div class="project-field"><label for="meta-tag">{t.metaTitle}</label><textarea id="meta-tag" class="claim-code" readonly rows="4" value={challenge.metaTag} on:focus={(event) => event.currentTarget.select()}></textarea></div>
              <p class="project-help">{t.metaHintDetail}</p>
            {/if}
            <div class="claim-expiry"><p>{t.oneHour}</p><span>{t.expires}: {expiry}</span></div>
            <form method="POST" action={`?/verify&lang=${lang}`} use:enhance={submitState('verify')}>
              <input type="hidden" name="challengeId" value={challenge.id} />
              <input type="hidden" name="token" value={challenge.token} />
              <button class="project-btn" type="submit" disabled={!!pending}>{pending === 'verify' ? t.checking : t.verify}</button>
              <p class="project-help">{t.retryHint}</p>
            </form>
          </section>
          <a class="claim-restart" href={projectHref(project.id, lang, 'claim')} data-sveltekit-reload>{t.differentMethod} ↻</a>
        {:else}
          <form class="project-panel claim-method-form" method="POST" action={`?/start&lang=${lang}`} use:enhance={submitState('start')}>
            <h2>{t.chooseMethod}</h2>
            {#if isOwner}
              <div class="project-field"><label for="target-url">{t.newUrl}</label><input id="target-url" type="url" name="targetUrl" bind:value={targetUrl} placeholder="https://" required /><p class="project-help">{t.newUrlHint}</p></div>
            {:else}
              <div class="claim-proof-url"><span>{t.verifying}</span><code>{project.url}</code></div>
            {/if}
            <fieldset class="claim-methods">
              <legend class="sr-only">{t.chooseMethod}</legend>
              <label class:chosen={method === 'dns'}><input type="radio" name="method" value="dns" bind:group={method} /><span><strong>{t.dnsTitle}</strong><span>{t.dnsHint}</span></span></label>
              <label class:chosen={method === 'meta'}><input type="radio" name="method" value="meta" bind:group={method} /><span><strong>{t.metaTitle}</strong><span>{t.metaHint}</span></span></label>
            </fieldset>
            <button class="project-btn" type="submit" disabled={!!pending}>{pending === 'start' ? t.starting : t.start}</button>
            <p class="project-help">{t.oneHour}</p>
          </form>
        {/if}
      {/if}
    </div>
  </div>
</ProjectShell>

<style>
  .claim-layout { display: grid; grid-template-columns: .95fr 1.05fr; gap: 70px; align-items: start; padding-top: 15px; }
  .claim-intro { padding-top: 9px; }
  .claim-intro .project-flow-title { max-width: 440px; }
  .claim-intro .project-intro { font-size: 14px; }
  .claim-steps { padding: 0; margin: 38px 0 0; list-style: none; display: grid; gap: 22px; color: var(--ink-3); font-size: 13px; }
  .claim-steps li { display: flex; gap: 13px; align-items: center; }
  .claim-steps li > span { width: 29px; height: 29px; border: 1px solid var(--line-mid); border-radius: 50%; display: grid; place-items: center; font: 10px var(--mono); }
  .claim-steps li.complete { color: var(--ink-2); }
  .claim-steps li.complete > span { color: #53765a; background: #edf2ec; border-color: #d9e4d9; }
  .claim-steps li.active { color: var(--ink); }
  .claim-steps li.active > span { background: #18171f; color: #fff; border-color: #18171f; }
  .claim-content { min-width: 0; }
  .claim-content > .project-message:first-child { margin-top: 0; }
  .claim-account { font-size: 12px; color: var(--ink-2); display: flex; align-items: center; gap: 8px; margin-bottom: 17px; }
  .claim-account strong { font-weight: 500; color: var(--ink); }
  .claim-number { color: var(--ink-3); font: 12px var(--mono); }
  .claim-panel-heading { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
  .claim-panel-heading h2 { margin: 0; }
  .claim-proof-url { display: grid; gap: 7px; border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 22px; }
  .claim-proof-url > span { color: var(--ink-2); font-size: 11px; }
  .claim-proof-url code { font: 12px var(--mono); line-height: 1.6; overflow-wrap: anywhere; }
  .claim-methods { border: 0; padding: 0; display: grid; gap: 10px; margin: 0 0 24px; min-width: 0; }
  .claim-methods label { border: 1px solid var(--line-mid); border-radius: 10px; padding: 16px 15px; display: flex; align-items: flex-start; gap: 11px; cursor: pointer; }
  .claim-methods label.chosen { background: var(--bg-soft); border-color: #929286; }
  .claim-methods input { margin: 2px 0 0; accent-color: #393932; }
  .claim-methods label > span { display: grid; gap: 5px; }
  .claim-methods strong { font-weight: 500; font-size: 13px; }
  .claim-methods label > span > span { font-size: 12px; color: var(--ink-2); line-height: 1.5; }
  .claim-method-form > .project-btn, .claim-proof form > .project-btn { width: 100%; }
  .project-field .claim-code { font: 11px/1.8 var(--mono); background: var(--bg); }
  .claim-expiry { padding: 16px 0 20px; margin-top: 12px; border-top: 1px solid var(--line); }
  .claim-expiry p { margin: 0 0 5px; font-size: 12px; }
  .claim-expiry span { color: var(--ink-3); font-size: 11px; }
  .claim-restart { display: block; margin-top: 18px; color: var(--ink-2); font-size: 12px; text-align: center; text-decoration: underline; text-underline-offset: 3px; }
  .claim-signin-panel > h2 { margin-top: 12px; }
  .claim-signin-panel .project-btn { margin-top: 13px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  @media (max-width: 820px) {
    .claim-layout { grid-template-columns: 1fr; gap: 35px; }
    .claim-intro .project-flow-title { max-width: none; }
    .claim-steps { display: flex; flex-wrap: wrap; gap: 15px; margin-top: 25px; font-size: 11px; }
    .claim-steps li { gap: 7px; }
  }
</style>
