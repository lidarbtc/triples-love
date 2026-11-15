<script>
  import { onMount } from 'svelte';
  import { categories, sites } from '$lib/data.js';

  const catLabel = {
    objekts: 'objekts',
    stats: 'stats',
    schedule: 'schedule',
    market: 'market',
    tools: 'tools',
    wiki: 'wiki',
    hub: 'hub'
  };

  const catDots = {
    objekts: '#3b6dff',
    stats: '#1f4ad6',
    schedule: '#d68a2a',
    market: '#c47a2a',
    tools: '#7b6cd1',
    wiki: '#a07028',
    hub: '#5b7eee'
  };

  let active = 'all';
  let query = '';
  let expandedId = null;
  let sort = 'alpha';

  const accentHue = 255;
  const density = 'regular';
  const showThumbnails = true;
  const glassIntensity = 2;

  let todayDate = '10 May';
  let todayTime = '00:00:00';

  onMount(() => {
    const updateClock = () => {
      const now = new Date();
      todayTime = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      todayDate = now.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short'
      });
    };

    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  });

  $: counts = sites.reduce(
    (acc, site) => {
      acc[site.category] = (acc[site.category] || 0) + 1;
      return acc;
    },
    { all: sites.length }
  );

  $: filtered = (() => {
    let out = sites;

    if (active !== 'all') out = out.filter((site) => site.category === active);

    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (site) =>
          site.name.toLowerCase().includes(q) ||
          site.domain.toLowerCase().includes(q) ||
          site.tagline.toLowerCase().includes(q) ||
          (site.badges || []).some((badge) => badge.toLowerCase().includes(q))
      );
    }

    if (sort === 'alpha') {
      out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'category') {
      out = [...out].sort(
        (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
      );
    }

    return out;
  })();

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

  function openCard(event, id) {
    if (event.target?.closest?.('.card-expand')) return;
    if (expandedId !== id) expandedId = id;
  }

  function handleCardKeydown(event, id) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    if (expandedId !== id) expandedId = id;
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
</script>

<svelte:head>
  <title>triples.love — fan-made tripleS sites directory</title>
</svelte:head>

<div
  id="top"
  class={`app density-${density}`}
  style:--accent-hue={accentHue}
  style:--glass-blur={`${glassIntensity * 4}px`}
>
  <header class="hero" style:--hero-tint={`oklch(94% 0.04 ${accentHue})`}>
    <div class="hero-inner">
      <div class="hero-row hero-row-top">
        <div class="brand">
          <span class="brand-mark">三</span>
          <span class="brand-name">triples<span class="brand-dot">.</span>love</span>
        </div>
        <nav class="hero-nav">
          <a href="#about">about</a>
          <a href="#submit">submit a site</a>
          <a href="#top" class="hero-pill">en</a>
        </nav>
      </div>

      <div class="hero-headline-wrap">
        <h1 class="hero-headline">
          a directory of <em>fan-made</em><br />
          tripleS sites
        </h1>
        <aside class="hero-aside">
          <div class="hero-aside-date">May 10, 2026</div>
          <div class="hero-aside-title">Updated weekly</div>
          <div class="hero-aside-body">
            An ever-growing index of community-built tools, trackers, and resources around tripleS &amp;
            COSMO.
          </div>
          <a href="#submit" class="hero-aside-cta" aria-label="submit">→</a>
        </aside>
      </div>

      <div class="hero-stats">
        <div class="hero-stat">
          <span class="stat-icon" aria-hidden="true">◷</span>
          <div>
            <div class="stat-label">today</div>
            <div class="stat-val">{todayDate}, {todayTime}</div>
          </div>
        </div>
        <div class="hero-stat">
          <span class="stat-icon" aria-hidden="true">◉</span>
          <div>
            <div class="stat-label">status</div>
            <div class="stat-val">all sites linked</div>
          </div>
        </div>
        <div class="hero-stat">
          <span class="stat-icon" aria-hidden="true">▦</span>
          <div>
            <div class="stat-label">{sites.length}</div>
            <div class="stat-val">sites in directory</div>
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
            <span>{category.label}</span>
            <span class="tab-count">{counts[category.id] ?? 0}</span>
          </button>
        {/each}
      </div>

      <div class="toolbar-right">
        <div class="search">
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input
            value={query}
            on:input={(event) => updateQuery(event.currentTarget.value)}
            placeholder="search by name, domain, or tag…"
          />
          {#if query}
            <button
              class="search-clear"
              type="button"
              aria-label="clear"
              on:click={() => updateQuery('')}
            >
              ×
            </button>
          {/if}
        </div>

        <div class="sort">
          <label for="site-sort">sort</label>
          <select id="site-sort" bind:value={sort}>
            <option value="alpha">a → z</option>
            <option value="category">by category</option>
            <option value="recent">recent additions</option>
          </select>
        </div>
      </div>
    </div>

    {#if filtered.length === 0}
      <div class="empty">
        <p>
          no sites match <strong>"{query}"</strong> in
          <em>{active === 'all' ? 'everything' : catLabel[active]}</em>.
        </p>
        <button class="btn btn-ghost" type="button" on:click={resetFilters}>reset</button>
      </div>
    {:else}
      <div class="grid" class:grid-no-thumbs={!showThumbnails}>
        {#each filtered as site (site.id)}
          <div
            class="card"
            class:card-expanded={expandedId === site.id}
            role="button"
            tabindex="0"
            on:click={(event) => openCard(event, site.id)}
            on:keydown={(event) => handleCardKeydown(event, site.id)}
          >
            <div class="thumb">
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
              <div class="thumb-caption">{site.domain}</div>
            </div>

            <div class="card-body">
              <div class="card-meta">
                <span class="cat-dot" style:background={catDots[site.category] || '#999'}></span>
                <span class="cat-name">{catLabel[site.category]}</span>
                <span class="meta-spacer"></span>
                <span class="card-domain">{site.domain}</span>
              </div>
              <h3 class="card-title">{site.name}</h3>
              <p class="card-tagline">{site.tagline}</p>
            </div>

            {#if expandedId === site.id}
              <div class="card-expand">
                <p class="card-desc">{site.description}</p>
                <div class="card-badges">
                  {#each site.badges as badge}
                    <span class="badge">{badge}</span>
                  {/each}
                </div>
                <div class="card-actions">
                  <a class="btn btn-primary" href={site.url} target="_blank" rel="noopener">
                    visit ↗
                  </a>
                  <button class="btn btn-ghost" type="button" on:click={() => (expandedId = null)}>
                    close
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <section class="about" id="about">
      <div class="about-head">
        <h2 class="about-h">what is <em>triples.love</em>?</h2>
        <p class="about-sub">
          a community-curated index of fan-made sites built around tripleS &amp; COSMO.<br />
          everything here is unofficial — made by fans, for fans.
        </p>
      </div>

      <div class="about-grid">
        <div class="about-card about-card-tint">
          <div class="about-card-eyebrow">about</div>
          <h3 class="about-card-h">a single index for every fan project</h3>
          <p class="about-card-p">
            scattered across personal domains, github pages, and vercel deploys — we collect them in
            one place so you can find the right tool for the moment, whether you're tracking a
            livestream, planning a trade, or just looking up an Objekt.
          </p>
          <div class="about-card-stat">
            <span class="about-stat-num">{sites.length}</span>
            <span class="about-stat-lbl">sites indexed &amp; growing</span>
          </div>
        </div>

        <div class="about-card">
          <h4>community-curated</h4>
          <p>
            every site is submitted, reviewed, and categorized by fans. no algorithms, no SEO games —
            just a clean directory.
          </p>
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
          <h4>the long memory</h4>
          <p>
            fan projects come and go. when a site retires, we keep its entry with a snapshot link —
            so the work isn't lost when a domain expires.
          </p>
          <div class="about-viz viz-archive" aria-hidden="true">
            <div class="archive-row">
              <span class="archive-tag">'24</span>
              <span class="archive-name">apollo.cafe</span>
              <span class="archive-status archive-ok">snapshot</span>
            </div>
            <div class="archive-row">
              <span class="archive-tag">'25</span>
              <span class="archive-name">objektify.xyz</span>
              <span class="archive-status archive-ok">snapshot</span>
            </div>
            <div class="archive-row archive-live">
              <span class="archive-tag">'26</span>
              <span class="archive-name">tracker.objekt.tools</span>
              <span class="archive-status archive-now"><span class="dot live"></span>live</span>
            </div>
          </div>
        </div>

        <div class="about-card about-card-cta" id="submit">
          <h4>built something?</h4>
          <p>made a tool, tracker, or wiki for tripleS? we'd love to add it to the directory.</p>
          <a class="btn btn-primary about-cta-btn" href="mailto:hello@triples.love">submit a site ↗</a>
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
                <text x="24" y="33">submit</text>
                <text x="100" y="33">review</text>
                <text x="176" y="33">listed</text>
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
        <span>not affiliated with MODHAUS or tripleS</span>
        <span class="foot-sep">·</span>
        <a href="#submit">submit a site</a>
        <span class="foot-sep">·</span>
        <a href="#about">about</a>
      </div>
      <div class="foot-meta">built by fans, for fans · {sites.length} sites indexed</div>
    </footer>
  </main>
</div>
