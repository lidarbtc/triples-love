<script>
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { categories } from '$lib/data.js';
  import { categoryLabels, categoryNames, ui } from '$lib/i18n.js';

  export let data;

  const nameCollator = new Intl.Collator('en', { sensitivity: 'base' });
  const metaImage = 'https://triples.love/og-image.png';
  const metaImageAlt =
    'triples.love directory preview showing fan-made tripleS project cards and site screenshots.';

  $: lang = data.lang;
  $: sites = data.sites;
  $: nextLang = lang === 'ko' ? 'en' : 'ko';
  $: languageHref = getLanguageHref(nextLang, browser ? $page.url : null);
  $: canonicalUrl = `https://triples.love/${lang}/`;
  let active = 'all';
  let query = '';
  let expandedId = null;
  let sort = 'alpha';
  let interactive = false;
  let archiveOpen = false;

  let now = null;
  $: locale = lang === 'ko' ? 'ko-KR' : 'en-GB';
  $: todayDate = now ? now.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '—';
  $: todayTime = now
    ? now.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    : '--:--:--';

  onMount(() => {
    interactive = true;
    const updateClock = () => {
      now = new Date();
    };

    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  });

  function getLanguageHref(nextLang, currentUrl) {
    const path = `/${nextLang}/`;
    if (!currentUrl) return path;

    const url = new URL(currentUrl);
    url.searchParams.delete('lang');
    return `${path}${url.search}${url.hash}`;
  }

  $: t = ui[lang];
  $: labels = categoryLabels[lang];
  $: names = categoryNames[lang];
  $: localizedSites = sites.map((site) => {
    const localizedCopy = site.locales[lang] || {};
    const koreanCopy = site.locales.ko || {};

    return {
      ...site,
      ...localizedCopy,
      tagline: localizedCopy.tagline || site.tagline,
      description: localizedCopy.description || site.description,
      badges: localizedCopy.badges?.length ? localizedCopy.badges : site.badges,
      searchText: [
        site.name,
        site.domain,
        site.category,
        site.tagline,
        site.description,
        ...(site.badges || []),
        koreanCopy.tagline,
        koreanCopy.description,
        ...(koreanCopy.badges || []),
        categoryLabels.en[site.category],
        categoryLabels.ko[site.category],
        categoryNames.en[site.category],
        categoryNames.ko[site.category],
        ...(site.aliases || [])
      ]
        .filter(Boolean)
        .join('\n')
        .toLocaleLowerCase()
    };
  });

  $: if (browser) {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem('triples-love.lang', lang);
    } catch {
      // Language routes also work when browser storage is unavailable.
    }
  }

  $: counts = sites.reduce(
    (acc, site) => {
      acc[site.category] = (acc[site.category] || 0) + 1;
      return acc;
    },
    { all: sites.length }
  );

  $: filtered = (() => {
    let out = localizedSites;

    if (active !== 'all') out = out.filter((site) => site.category === active);

    if (query.trim()) {
      const q = query.trim().toLocaleLowerCase();
      out = out.filter((site) => site.searchText.includes(q));
    }

    if (sort === 'alpha') {
      out = [...out].sort((a, b) => nameCollator.compare(a.name, b.name));
    } else if (sort === 'category') {
      out = [...out].sort(
        (a, b) => a.category.localeCompare(b.category) || nameCollator.compare(a.name, b.name)
      );
    } else if (sort === 'recent') {
      out = [...out].sort(
        (a, b) =>
          Date.parse(b.addedAt) - Date.parse(a.addedAt) ||
          nameCollator.compare(a.name, b.name) ||
          a.id.localeCompare(b.id)
      );
    }

    return out;
  })();

  $: directorySites = filtered.filter((site) => site.status !== 'archived');
  $: archivedSites = filtered.filter((site) => site.status === 'archived');
  $: archivedCount = sites.filter((site) => site.status === 'archived').length;
  $: archiveOpen = Boolean(query.trim() && archivedSites.length);

  function setActiveTab(id) {
    active = id;
    expandedId = null;
  }

  function updateQuery(value) {
    query = value;
    expandedId = null;
  }

  function resetFilters() {
    query = '';
    active = 'all';
    expandedId = null;
  }

  function handleCardToggle(event, id) {
    if (event.currentTarget.open) expandedId = id;
    else if (expandedId === id) expandedId = null;
  }

  function closeCard(event) {
    event.currentTarget.closest('details').querySelector('summary').focus({ preventScroll: true });
    expandedId = null;
  }

  function stripeAngle(site) {
    const seed = site.id.charCodeAt(0) + site.id.length;
    return [12, -8, 22, -16, 4, 30, -28][seed % 7];
  }

  function stripeColor(accent) {
    if (accent === 'amber') return '#e9b66e';
    if (accent === 'violet') return '#9788d6';
    return '#6f9bff';
  }

  function screenshotPath(site) {
    return `/site-screenshots/${site.id}.jpg`;
  }

  function formatArchiveDate(date) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
  }

  function outboundHref(href) {
    const url = new URL(href);
    url.searchParams.set('utm_source', 'triples.love');
    return url.href;
  }

  function hideBrokenThumbnail(event) {
    event.currentTarget.hidden = true;
  }
</script>

<svelte:head>
  <title>{t.metaTitle}</title>
  <meta name="description" content={t.metaDescription} />
  <link rel="canonical" href={canonicalUrl} />
  <link rel="alternate" hreflang="en" href="https://triples.love/en/" />
  <link rel="alternate" hreflang="ko" href="https://triples.love/ko/" />
  <link rel="alternate" hreflang="x-default" href="https://triples.love/" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="triples.love" />
  <meta property="og:title" content={t.metaTitle} />
  <meta property="og:description" content={t.metaDescription} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={metaImage} />
  <meta property="og:image:secure_url" content={metaImage} />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={metaImageAlt} />
  <meta property="og:locale" content={lang === 'ko' ? 'ko_KR' : 'en_US'} />
  <meta property="og:locale:alternate" content={lang === 'ko' ? 'en_US' : 'ko_KR'} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={t.metaTitle} />
  <meta name="twitter:description" content={t.metaDescription} />
  <meta name="twitter:image" content={metaImage} />
  <meta name="twitter:image:alt" content={metaImageAlt} />
</svelte:head>

{#snippet projectCard(site)}
  <details
    class="card"
    name="site-cards"
    open={expandedId === site.id}
    on:toggle={(event) => handleCardToggle(event, site.id)}
  >
    <summary class="card-summary">
      <span class="thumb">
        <span class="thumb-fallback" aria-hidden="true">
          <svg viewBox="0 0 400 240" preserveAspectRatio="none" width="100%" height="100%">
            <defs>
              <pattern
                id={`stripes-${site.id}`}
                patternUnits="userSpaceOnUse"
                width="14"
                height="14"
                patternTransform={`rotate(${stripeAngle(site)})`}
              >
                <rect width="14" height="14" fill="#fbfbfd" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="14"
                  stroke={stripeColor(site.accent)}
                  stroke-width="1"
                  stroke-opacity="0.18"
                />
              </pattern>
            </defs>
            <rect width="400" height="240" fill={`url(#stripes-${site.id})`} />
            <g opacity="0.42">
              <rect x="20" y="20" width="360" height="22" rx="4" fill="#ffffff" stroke="#dfe1ea" />
              <circle cx="32" cy="31" r="2.5" fill="#dfe1ea" />
              <circle cx="42" cy="31" r="2.5" fill="#dfe1ea" />
              <circle cx="52" cy="31" r="2.5" fill="#dfe1ea" />
              <rect x="68" y="25" width="240" height="12" rx="2" fill="#f1f2f6" />
            </g>
          </svg>
        </span>
        <img
          class="thumb-image"
          src={screenshotPath(site)}
          alt=""
          loading="lazy"
          decoding="async"
          on:error={hideBrokenThumbnail}
        />
      </span>

      <span class="card-meta">
        <span class="cat-name">{names[site.category]}</span>
        <span class="meta-spacer"></span>
        <span class="card-domain">{site.domain}</span>
      </span>
      <h3 class="card-title">
        {site.name}
        {#if site.status === 'archived'}
          <span class="archive-badge">{t.archive.badge}</span>
        {/if}
      </h3>
      <span class="card-tagline">{site.tagline}</span>
    </summary>

    <div class="card-expand">
      {#if site.status === 'archived'}
        <div class="archive-notice">
          <p>{t.archive.reasons[site.archiveReason]}</p>
          <span>{t.archive.savedOn} <time datetime={site.archivedAt}>{formatArchiveDate(site.archivedAt)}</time></span>
        </div>
      {/if}
      <p class="card-desc">{site.description}</p>
      <div class="card-badges">
        {#each site.badges as badge}
          <span class="badge">{badge}</span>
        {/each}
      </div>
      <div class="card-actions">
        <a class="btn btn-ghost" href={`/p/${site.id}/?lang=${lang}`}>
          {lang === 'ko' ? '프로젝트 페이지' : 'Project page'}
        </a>
        {#if site.status === 'archived'}
          <a class="btn btn-primary" href={screenshotPath(site)} target="_blank" rel="noopener">
            {t.archive.screenshot}
          </a>
          {#if site.archiveUrl}
            <a class="btn btn-ghost" href={site.archiveUrl} target="_blank" rel="noopener">
              {t.archive.snapshot}
            </a>
          {/if}
        {:else}
        <a
          class="btn btn-primary"
          href={outboundHref(site.url)}
          target="_blank"
          rel="noopener"
          data-umami-event="project_click"
          data-umami-event-project={site.domain}
          data-umami-event-category={site.category}
          data-umami-event-surface={query.trim() ? 'search' : 'directory'}
        >
          {t.card.visit}
        </a>
        {/if}
        {#if interactive}
          <button class="btn btn-ghost" type="button" on:click={closeCard}>
            {t.card.close}
          </button>
        {/if}
      </div>
      {#if site.owner}
        <p class="card-owner">{lang === 'ko' ? '소유권 인증' : 'Claimed by'} @{site.owner.handle}</p>
      {/if}
    </div>
  </details>
{/snippet}

<div id="top" class="app">
  <header class="hero">
    <div class="hero-inner">
      <div class="hero-row hero-row-top">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img">
              <path d="M6.2 7.4c1.4-2.2 4-3.2 6.5-2.5 2.6.7 4.4 2.8 4.8 5.3" />
              <path d="M18.1 15.8c-1.3 2.3-4 3.4-6.6 2.8-2.6-.6-4.6-2.6-5.1-5.1" />
              <path d="M6.4 13.4c-1.9-1.8-2.3-4.7-.9-6.9 1.4-2.2 4-3.3 6.5-2.6" />
              <circle cx="17.7" cy="10.7" r="1.8" />
              <circle cx="6.3" cy="13.2" r="1.8" />
              <circle cx="12.2" cy="4.7" r="1.8" />
            </svg>
          </span>
          <span class="brand-name">triples<span class="brand-dot">.</span>love</span>
        </div>
        <nav class="hero-nav">
          <a href="mailto:hello@triples.love">{t.nav.submit}</a>
          {#if data.user}
            <form method="POST" action="/auth/logout">
              <button class="btn btn-ghost" type="submit">@{data.user.handle} · {lang === 'ko' ? '로그아웃' : 'Sign out'}</button>
            </form>
          {:else}
            <a href={`/auth/github?returnTo=${encodeURIComponent(`/${lang}/`)}`} data-sveltekit-reload>
              {lang === 'ko' ? 'GitHub 로그인' : 'Sign in'}
            </a>
          {/if}
          <a
            class="hero-pill lang-toggle"
            href={languageHref}
            hreflang={nextLang}
            aria-label={t.languageToggleLabel}
            data-sveltekit-noscroll
          >
            {t.languagePill}
          </a>
        </nav>
      </div>

      <div class="hero-headline-wrap">
        <h1 class="hero-headline">
          {#if t.hero.titleBefore}{t.hero.titleBefore}{' '}{/if}<em>{t.hero.titleEm}</em><br />
          {t.hero.titleAfter}
        </h1>
        <aside class="hero-aside">
          <div class="hero-aside-date">{t.hero.date}</div>
          <div class="hero-aside-title">{t.hero.updateTitle}</div>
          <div class="hero-aside-body">{t.hero.updateBody}</div>
        </aside>
      </div>

      <div class="hero-stats">
        <div class="hero-stat">
          <div class="stat-label">{t.hero.today}</div>
          <div class="stat-val">{todayDate}, {todayTime}</div>
        </div>
        <div class="hero-stat">
          <div class="stat-label">{t.hero.status}</div>
          <div class="stat-val">{t.hero.statusValue}</div>
        </div>
        <div class="hero-stat">
          <div class="stat-label">{t.hero.directoryCount}</div>
          <div class="stat-val">
            {sites.length}
            {#if archivedCount}
              <span class="stat-archive">· {t.archive.count.replace('{count}', archivedCount)}</span>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </header>

  <main class="content">
    <div class="toolbar">
      <div class="tabs" role="tablist">
        {#each categories as category}
          <button
            class="tab"
            class:tab-active={active === category.id}
            type="button"
            on:click={() => setActiveTab(category.id)}
          >
            <span>{labels[category.id] ?? category.label}</span>
            <span class="tab-count">{counts[category.id] ?? 0}</span>
          </button>
        {/each}
      </div>

      <div class="toolbar-right">
        <div class="search">
          <svg class="search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7.2" cy="7.2" r="4.4" />
            <path d="m10.6 10.6 2.9 2.9" />
          </svg>
          <input
            value={query}
            on:input={(event) => updateQuery(event.currentTarget.value)}
            placeholder={t.toolbar.searchPlaceholder}
          />
          {#if query}
            <button
              class="search-clear"
              type="button"
              aria-label={t.toolbar.clear}
              on:click={() => updateQuery('')}
            >
              ×
            </button>
          {/if}
        </div>

        <div class="sort">
          <label for="site-sort">{t.toolbar.sort}</label>
          <select id="site-sort" bind:value={sort}>
            <option value="alpha">{t.toolbar.sortAlpha}</option>
            <option value="category">{t.toolbar.sortCategory}</option>
            <option value="recent">{t.toolbar.sortRecent}</option>
          </select>
        </div>
      </div>
    </div>

    {#if filtered.length === 0}
      <div class="empty">
        <p>
          {t.empty.before}<strong>“{query.trim()}”</strong>{t.empty.after}
          {#if active !== 'all'}
            · {t.empty.category} <em>{names[active]}</em>
          {/if}
        </p>
        <button class="btn btn-ghost" type="button" on:click={resetFilters}>{t.empty.reset}</button>
      </div>
    {:else if directorySites.length}
      <div class="grid directory-grid">
        {#each directorySites as site (site.id)}
          {@render projectCard(site)}
        {/each}
      </div>
    {/if}

    {#if archivedSites.length}
      <details class="project-archive" id="archive" bind:open={archiveOpen}>
        <summary class="project-archive-summary">
          <span class="project-archive-heading">{t.archive.title} <span class="archive-count">{archivedSites.length}</span></span>
          <span class="project-archive-subtitle">{t.archive.subtitle}</span>
          <span class="archive-chevron" aria-hidden="true"></span>
        </summary>
        <div class="grid archive-grid">
          {#each archivedSites as site (site.id)}
            {@render projectCard(site)}
          {/each}
        </div>
      </details>
    {/if}

    <section class="about" id="about">
      <div class="about-head">
        <h2 class="about-h">
          {#if t.about.titleBefore}{t.about.titleBefore}{' '}{/if}<em>triples.love</em>{t.about.titleAfter}
        </h2>
        <p class="about-sub">
          {t.about.subtitle}<br />
          {t.about.subtitle2}
        </p>
      </div>

      <div class="about-grid">
        <div class="about-card about-card-tint">
          <div class="about-card-eyebrow">{t.about.eyebrow}</div>
          <h3 class="about-card-h">{t.about.indexTitle}</h3>
          <p class="about-card-p">{t.about.indexBody}</p>
          <div class="about-card-stat">
            <span class="about-stat-num">{sites.length}</span>
            <span class="about-stat-lbl">{t.about.statLabel}</span>
          </div>
        </div>

        <div class="about-card">
          <h4>{t.about.curatedTitle}</h4>
          <p>{t.about.curatedBody}</p>
          <div class="about-viz viz-network" aria-hidden="true">
            <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
              <g stroke="var(--accent)" stroke-width="0.8" opacity="0.55" fill="none">
                <line x1="40" y1="70" x2="80" y2="40" />
                <line x1="80" y1="40" x2="130" y2="55" />
                <line x1="130" y1="55" x2="170" y2="30" />
                <line x1="80" y1="40" x2="115" y2="80" />
                <line x1="115" y1="80" x2="160" y2="75" />
                <line x1="40" y1="70" x2="115" y2="80" />
              </g>
              <g fill="var(--accent)">
                <circle cx="40" cy="70" r="3.5" />
                <circle cx="80" cy="40" r="5" />
                <circle cx="130" cy="55" r="3.5" />
                <circle cx="170" cy="30" r="3" />
                <circle cx="115" cy="80" r="4" />
                <circle cx="160" cy="75" r="2.5" />
              </g>
              <g fill="none" stroke="var(--accent)" stroke-width="0.6" opacity="0.3">
                <circle cx="80" cy="40" r="11" />
                <circle cx="115" cy="80" r="9" />
              </g>
            </svg>
          </div>
        </div>

        <div class="about-card">
          <h4>{t.about.memoryTitle}</h4>
          <p>{t.about.memoryBody}</p>
          <div class="about-viz viz-archive" aria-hidden="true">
            <div class="archive-row">
              <span class="archive-tag">'24</span>
              <span class="archive-name">orbitobjekts.example</span>
              <span class="archive-status archive-ok">{t.about.snapshot}</span>
            </div>
            <div class="archive-row">
              <span class="archive-tag">'25</span>
              <span class="archive-name">wav-archive.example</span>
              <span class="archive-status archive-ok">{t.about.snapshot}</span>
            </div>
            <div class="archive-row archive-live">
              <span class="archive-tag">'26</span>
              <span class="archive-name">cosmo-ledger.example</span>
              <span class="archive-status archive-now"><span class="dot live"></span>{t.about.live}</span>
            </div>
          </div>
        </div>

        <div class="about-card about-card-cta" id="submit">
          <h4>{t.about.submitTitle}</h4>
          <p>{t.about.submitBody}</p>
          <a class="btn btn-primary about-cta-btn" href="mailto:hello@triples.love">
            {t.about.submitButton}
          </a>
          <div class="about-viz viz-flow" aria-hidden="true">
            <svg viewBox="0 0 200 60" preserveAspectRatio="xMidYMid meet">
              <g fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.8">
                <rect x="6" y="20" width="36" height="20" rx="3" />
                <rect x="82" y="20" width="36" height="20" rx="3" />
                <rect x="158" y="20" width="36" height="20" rx="3" />
                <path d="M42 30 L82 30 M118 30 L158 30" stroke-dasharray="2 2" />
                <path d="M76 26 L82 30 L76 34 M152 26 L158 30 L152 34" />
              </g>
              <g
                fill="rgba(255,255,255,.7)"
                font-family="ui-monospace, monospace"
                font-size="6.5"
                text-anchor="middle"
              >
                <text x="24" y="33">{t.about.flowSubmit}</text>
                <text x="100" y="33">{t.about.flowReview}</text>
                <text x="176" y="33">{t.about.flowListed}</text>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>

    <footer class="foot">
      <div class="foot-row">
        <span>© 2026 triples.love</span>
        <span class="foot-sep">·</span>
        <span>{t.footer.unofficial}</span>
        <span class="foot-sep">·</span>
        <a href="mailto:hello@triples.love">{t.footer.submit}</a>
      </div>
      <div class="foot-meta">{t.footer.meta.replace('{count}', sites.length)}</div>
    </footer>
  </main>
</div>
