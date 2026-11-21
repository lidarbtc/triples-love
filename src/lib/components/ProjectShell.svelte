<script>
  import { page } from '$app/state';
  import { projectCopy } from '#lib/project-copy.js';
  import '#lib/project.css';

  let { lang = 'en', user = null, children } = $props();
  const t = $derived(projectCopy[lang] || projectCopy.en);
  const nextLang = $derived(lang === 'ko' ? 'en' : 'ko');
  const languageUrl = $derived.by(() => {
    const url = new URL(page.url.href);
    url.searchParams.set('lang', nextLang);
    return `${url.pathname}${url.search}`;
  });
  const signInUrl = $derived(`/auth/github?returnTo=${encodeURIComponent(page.url.pathname + page.url.search)}`);
  $effect(() => {
    document.documentElement.lang = lang;
  });
</script>

<div class="project-shell" lang={lang}>
  <header class="project-nav">
    <a class="project-brand" href={`/${lang}/`} aria-label="triples.love">
      <span class="project-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6.2 7.4c1.4-2.2 4-3.2 6.5-2.5 2.6.7 4.4 2.8 4.8 5.3M18.1 15.8c-1.3 2.3-4 3.4-6.6 2.8-2.6-.6-4.6-2.6-5.1-5.1M6.4 13.4c-1.9-1.8-2.3-4.7-.9-6.9 1.4-2.2 4-3.3 6.5-2.6"/><circle cx="17.7" cy="10.7" r="1.8"/><circle cx="6.3" cy="13.2" r="1.8"/><circle cx="12.2" cy="4.7" r="1.8"/></svg>
      </span>
      <span>triples<span class="project-brand-dot">.</span>love</span>
    </a>
    <nav class="project-nav-actions" aria-label={lang === 'ko' ? '계정과 언어' : 'Account and language'}>
      <a class="project-language" href={languageUrl} hreflang={nextLang}>{t.language}</a>
      {#if user}
        <span class="project-account">@{user.handle}</span>
        <form method="POST" action="/auth/logout"><button class="project-text-button" type="submit">{t.signOut}</button></form>
      {:else}
        <a class="project-signin" href={signInUrl} data-sveltekit-reload>{t.signIn}</a>
      {/if}
    </nav>
  </header>
  <main class="project-main">{@render children?.()}</main>
  <footer class="project-footer"><a href={`/${lang}/`}>← {t.back}</a></footer>
</div>
