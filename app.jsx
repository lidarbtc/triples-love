// app.jsx — triples.love card listing app

const { useState, useMemo, useEffect, useRef } = React;

// ─── theme tokens (Tweaks-driven defaults are in the HTML) ───────────────────

const CAT_LABEL = {
  objekts: "objekts",
  stats: "stats",
  schedule: "schedule",
  market: "market",
  tools: "tools",
  wiki: "wiki",
  hub: "hub",
};

// striped placeholder (subtle, monospace caption)
function ScreenshotPlaceholder({ site, accent }) {
  // deterministic stripe variation
  const seed = site.id.charCodeAt(0) + site.id.length;
  const angle = [12, -8, 22, -16, 4, 30, -28][seed % 7];
  const stripeColor = accent === "amber" ? "#e9b66e" :
                      accent === "violet" ? "#9788d6" :
                      "#6f9bff";
  return (
    <div className="thumb">
      <svg viewBox="0 0 400 240" preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <pattern id={`stripes-${site.id}`} patternUnits="userSpaceOnUse"
                   width="14" height="14" patternTransform={`rotate(${angle})`}>
            <rect width="14" height="14" fill="#fbfbfd" />
            <line x1="0" y1="0" x2="0" y2="14" stroke={stripeColor} strokeWidth="1" strokeOpacity="0.18" />
          </pattern>
        </defs>
        <rect width="400" height="240" fill={`url(#stripes-${site.id})`} />
        {/* faint browser chrome */}
        <g opacity="0.42">
          <rect x="20" y="20" width="360" height="22" rx="4" fill="#ffffff" stroke="#dfe1ea" />
          <circle cx="32" cy="31" r="2.5" fill="#dfe1ea" />
          <circle cx="42" cy="31" r="2.5" fill="#dfe1ea" />
          <circle cx="52" cy="31" r="2.5" fill="#dfe1ea" />
          <rect x="68" y="25" width="240" height="12" rx="2" fill="#f1f2f6" />
        </g>
      </svg>
      <div className="thumb-caption">{site.domain}</div>
    </div>
  );
}

function CategoryDot({ cat }) {
  const map = {
    objekts: "#3b6dff",
    stats: "#1f4ad6",
    schedule: "#d68a2a",
    market: "#c47a2a",
    tools: "#7b6cd1",
    wiki: "#a07028",
    hub: "#5b7eee",
  };
  return <span className="cat-dot" style={{ background: map[cat] || "#999" }} />;
}

// ─── card ────────────────────────────────────────────────────────────────────

function SiteCard({ site, expanded, onToggle, onClose }) {
  return (
    <article className={`card ${expanded ? "card-expanded" : ""}`}
             onClick={() => !expanded && onToggle(site.id)}>
      <ScreenshotPlaceholder site={site} accent={site.accent} />

      <div className="card-body">
        <div className="card-meta">
          <CategoryDot cat={site.category} />
          <span className="cat-name">{CAT_LABEL[site.category]}</span>
          <span className="meta-spacer" />
          <span className="card-domain">{site.domain}</span>
        </div>
        <h3 className="card-title">{site.name}</h3>
        <p className="card-tagline">{site.tagline}</p>
      </div>

      {expanded && (
        <div className="card-expand" onClick={(e) => e.stopPropagation()}>
          <p className="card-desc">{site.description}</p>
          <div className="card-badges">
            {site.badges.map((b) => <span key={b} className="badge">{b}</span>)}
          </div>
          <div className="card-actions">
            <a className="btn btn-primary" href={site.url} target="_blank" rel="noopener">
              visit ↗
            </a>
            <button className="btn btn-ghost" onClick={() => onClose()}>close</button>
          </div>
        </div>
      )}
    </article>
  );
}

// ─── header (Aéza-style big tinted box) ──────────────────────────────────────

function Header({ siteCount, accentHue }) {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const d = time.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <header className="hero" style={{ "--hero-tint": `oklch(94% 0.04 ${accentHue})` }}>
      <div className="hero-inner">
        <div className="hero-row hero-row-top">
          <div className="brand">
            <span className="brand-mark">三</span>
            <span className="brand-name">triples<span className="brand-dot">.</span>love</span>
          </div>
          <nav className="hero-nav">
            <a href="#about">about</a>
            <a href="#submit">submit a site</a>
            <a href="#" className="hero-pill">en</a>
          </nav>
        </div>

        <div className="hero-headline-wrap">
          <h1 className="hero-headline">
            a directory of <em>fan-made</em><br/>
            tripleS sites
          </h1>
          <aside className="hero-aside">
            <div className="hero-aside-date">May 10, 2026</div>
            <div className="hero-aside-title">Updated weekly</div>
            <div className="hero-aside-body">
              An ever-growing index of community-built tools, trackers, and resources around tripleS &amp; COSMO.
            </div>
            <a href="#submit" className="hero-aside-cta" aria-label="submit">→</a>
          </aside>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <span className="stat-icon" aria-hidden>◷</span>
            <div>
              <div className="stat-label">today</div>
              <div className="stat-val">{d}, {t}</div>
            </div>
          </div>
          <div className="hero-stat">
            <span className="stat-icon" aria-hidden>◉</span>
            <div>
              <div className="stat-label">status</div>
              <div className="stat-val">all sites linked</div>
            </div>
          </div>
          <div className="hero-stat">
            <span className="stat-icon" aria-hidden>▦</span>
            <div>
              <div className="stat-label">{siteCount}</div>
              <div className="stat-val">sites in directory</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── tabs + search bar ───────────────────────────────────────────────────────

function Toolbar({ active, onActive, query, onQuery, counts, sort, onSort }) {
  return (
    <div className="toolbar">
      <div className="tabs" role="tablist">
        {window.TRIPLES_CATEGORIES.map((c) => (
          <button key={c.id}
                  className={`tab ${active === c.id ? "tab-active" : ""}`}
                  onClick={() => onActive(c.id)}>
            <span>{c.label}</span>
            <span className="tab-count">{counts[c.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-right">
        <div className="search">
          <span className="search-icon" aria-hidden>⌕</span>
          <input value={query} onChange={(e) => onQuery(e.target.value)}
                 placeholder="search by name, domain, or tag…" />
          {query && <button className="search-clear" onClick={() => onQuery("")} aria-label="clear">×</button>}
        </div>
        <div className="sort">
          <label>sort</label>
          <select value={sort} onChange={(e) => onSort(e.target.value)}>
            <option value="alpha">a → z</option>
            <option value="category">by category</option>
            <option value="recent">recent additions</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── showcase strip (visual blocks above the grid) ──────────────────────────

function Sparkline() {
  const points = [2, 3, 4, 4, 6, 7, 9, 11, 13, 14, 16, 17];
  const w = 220, h = 64;
  const max = Math.max(...points), min = Math.min(...points);
  const coords = points.map((p, i) => [
    (i / (points.length - 1)) * w,
    h - ((p - min) / (max - min)) * (h - 8) - 4,
  ]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fill = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sparkline" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#sg)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      {coords.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3 : 1.6} fill="var(--accent)" />)}
    </svg>
  );
}

function MemberMosaic() {
  // 24 deterministic hues, mostly cool with a few warm pops
  const hues = [255, 240, 230, 215, 200, 270, 280, 260, 250, 245, 235, 225, 220, 210, 290, 30, 350, 320, 300, 195, 180, 60, 80, 305];
  return (
    <div className="mosaic">
      {hues.map((h, i) => (
        <div key={i} className="mosaic-cell" style={{
          background: `linear-gradient(135deg, oklch(78% 0.10 ${h}) 0%, oklch(60% 0.16 ${h}) 100%)`,
          animationDelay: `${(i % 8) * 60}ms`,
        }}>
          <span className="mosaic-num">{String(i + 1).padStart(2, "0")}</span>
        </div>
      ))}
    </div>
  );
}

function LiveDropPulse() {
  // CSS-driven animated dots simulating activity
  return (
    <div className="pulse-stage">
      <div className="pulse-rings"><span /><span /><span /></div>
      <ul className="pulse-feed">
        <li><span className="dot live" /> 24 sites synced</li>
        <li><span className="dot" /> 8 trackers online</li>
        <li><span className="dot" /> indexed 03:42 ago</li>
      </ul>
    </div>
  );
}

function Showcase() {
  return (
    <section className="showcase">
      <div className="showcase-grid">
        {/* Featured site — photo-style card */}
        <div className="show-card show-featured">
          <div className="show-featured-image">
            <image-slot id="featured-screenshot" shape="rect" placeholder="drop a screenshot of any tripleS site" />
          </div>
          <div className="show-featured-body">
            <div className="show-eyebrow"><span className="dot live" /> featured this week</div>
            <h3 className="show-title">apollo.cafe</h3>
            <p className="show-desc">
              The de-facto Objekt browser for the fandom. Sub-100ms search, faceted filters,
              and a UI that actually respects the cards.
            </p>
            <a className="btn btn-ghost show-btn" href="https://apollo.cafe/objekts" target="_blank" rel="noopener">
              visit apollo.cafe ↗
            </a>
          </div>
        </div>

        {/* Members infographic */}
        <div className="show-card show-members">
          <div className="show-eyebrow">the 24</div>
          <h4 className="show-h">one fandom, twenty-four members</h4>
          <MemberMosaic />
          <p className="show-desc-sm">every site in this directory revolves around the same 24.</p>
        </div>

        {/* Stats sparkline */}
        <div className="show-card show-stat-card">
          <div className="show-eyebrow">directory growth</div>
          <div className="big-stat">
            <span className="big-stat-num">17</span>
            <span className="big-stat-trend">▲ 6 this quarter</span>
          </div>
          <Sparkline />
          <div className="show-axis">
            <span>q1·25</span><span>q2·25</span><span>q3·25</span><span>q4·25</span><span>q1·26</span>
          </div>
        </div>

        {/* Photo strip — 3 image slots side-by-side */}
        <div className="show-card show-photos">
          <div className="show-eyebrow">community</div>
          <h4 className="show-h">made by fans, used by everyone</h4>
          <div className="photo-strip">
            <image-slot id="photo-a" shape="rounded" placeholder="creator portrait" />
            <image-slot id="photo-b" shape="rounded" placeholder="event photo" />
            <image-slot id="photo-c" shape="rounded" placeholder="screen capture" />
          </div>
        </div>

        {/* Live activity (Aéza-premium-style dark card) */}
        <div className="show-card show-live">
          <div className="show-eyebrow show-eyebrow-dark"><span className="dot live" /> status</div>
          <h4 className="show-h-dark">all sites linked &amp; healthy</h4>
          <LiveDropPulse />
        </div>
      </div>
    </section>
  );
}

// ─── about / info block ──────────────────────────────────────────────────────

function AboutBlock({ siteCount }) {
  return (
    <section className="about" id="about">
      <div className="about-head">
        <h2 className="about-h">
          what is <em>triples.love</em>?
        </h2>
        <p className="about-sub">
          a community-curated index of fan-made sites built around tripleS &amp; COSMO.<br/>
          everything here is unofficial — made by fans, for fans.
        </p>
      </div>

      <div className="about-grid">
        <div className="about-card about-card-tint">
          <div className="about-card-eyebrow">about</div>
          <h3 className="about-card-h">a single index for every fan project</h3>
          <p className="about-card-p">
            scattered across personal domains, github pages, and vercel deploys —
            we collect them in one place so you can find the right tool for the moment,
            whether you're tracking a livestream, planning a trade, or just
            looking up an Objekt.
          </p>
          <div className="about-card-stat">
            <span className="about-stat-num">{siteCount}</span>
            <span className="about-stat-lbl">sites indexed &amp; growing</span>
          </div>
        </div>

        <div className="about-card">
          <h4>community-curated</h4>
          <p>every site is submitted, reviewed, and categorized by fans. no algorithms, no SEO games — just a clean directory.</p>
          <div className="about-viz viz-network" aria-hidden>
            <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
              <g stroke="var(--accent)" strokeWidth="0.8" opacity="0.55" fill="none">
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
              <g fill="none" stroke="var(--accent)" strokeWidth="0.6" opacity="0.3">
                <circle cx="80" cy="40" r="11" />
                <circle cx="115" cy="80" r="9" />
              </g>
            </svg>
          </div>
        </div>

        <div className="about-card">
          <h4>the long memory</h4>
          <p>fan projects come and go. when a site retires, we keep its entry with a snapshot link — so the work isn't lost when a domain expires.</p>
          <div className="about-viz viz-archive" aria-hidden>
            <div className="archive-row"><span className="archive-tag">'24</span><span className="archive-name">apollo.cafe</span><span className="archive-status archive-ok">snapshot</span></div>
            <div className="archive-row"><span className="archive-tag">'25</span><span className="archive-name">objektify.xyz</span><span className="archive-status archive-ok">snapshot</span></div>
            <div className="archive-row archive-live"><span className="archive-tag">'26</span><span className="archive-name">tracker.objekt.tools</span><span className="archive-status archive-now"><span className="dot live" />live</span></div>
          </div>
        </div>

        <div className="about-card about-card-cta" id="submit">
          <h4>built something?</h4>
          <p>made a tool, tracker, or wiki for tripleS? we'd love to add it to the directory.</p>
          <a className="btn btn-primary about-cta-btn" href="mailto:hello@triples.love">submit a site ↗</a>
          <div className="about-viz viz-flow" aria-hidden>
            <svg viewBox="0 0 200 60" preserveAspectRatio="xMidYMid meet">
              <g fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="0.8">
                <rect x="6" y="20" width="36" height="20" rx="3" />
                <rect x="82" y="20" width="36" height="20" rx="3" />
                <rect x="158" y="20" width="36" height="20" rx="3" />
                <path d="M42 30 L82 30 M118 30 L158 30" strokeDasharray="2 2" />
                <path d="M76 26 L82 30 L76 34 M152 26 L158 30 L152 34" />
              </g>
              <g fill="rgba(255,255,255,.7)" fontFamily="ui-monospace, monospace" fontSize="6.5" textAnchor="middle">
                <text x="24" y="33">submit</text>
                <text x="100" y="33">review</text>
                <text x="176" y="33">listed</text>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── main app ────────────────────────────────────────────────────────────────

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentHue": 255,
  "density": "regular",
  "showThumbnails": true,
  "glassIntensity": 2
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [active, setActive] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState("alpha");

  const sites = window.TRIPLES_SITES;

  const counts = useMemo(() => {
    const c = { all: sites.length };
    for (const s of sites) c[s.category] = (c[s.category] || 0) + 1;
    return c;
  }, [sites]);

  const filtered = useMemo(() => {
    let out = sites;
    if (active !== "all") out = out.filter((s) => s.category === active);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.domain.toLowerCase().includes(q) ||
        s.tagline.toLowerCase().includes(q) ||
        (s.badges || []).some((b) => b.toLowerCase().includes(q))
      );
    }
    if (sort === "alpha") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "category") out = [...out].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return out;
  }, [sites, active, query, sort]);

  return (
    <div className={`app density-${t.density}`}
         style={{
           "--accent-hue": t.accentHue,
           "--glass-blur": `${t.glassIntensity * 4}px`,
         }}>
      <Header siteCount={sites.length} accentHue={t.accentHue} />

      <main className="content">
        <Toolbar active={active} onActive={(id) => { setActive(id); setExpandedId(null); }}
                 query={query} onQuery={(q) => { setQuery(q); setExpandedId(null); }}
                 counts={counts}
                 sort={sort} onSort={setSort} />

        {filtered.length === 0 ? (
          <div className="empty">
            <p>no sites match <strong>"{query}"</strong> in <em>{active === "all" ? "everything" : CAT_LABEL[active]}</em>.</p>
            <button className="btn btn-ghost" onClick={() => { setQuery(""); setActive("all"); }}>reset</button>
          </div>
        ) : (
          <div className={`grid ${t.showThumbnails ? "" : "grid-no-thumbs"}`}>
            {filtered.map((s) => (
              <SiteCard key={s.id} site={s}
                        expanded={expandedId === s.id}
                        onToggle={(id) => setExpandedId(id === expandedId ? null : id)}
                        onClose={() => setExpandedId(null)} />
            ))}
          </div>
        )}

        <AboutBlock siteCount={sites.length} />

        <footer className="foot">
          <div className="foot-row">
            <span>© 2026 triples.love</span>
            <span className="foot-sep">·</span>
            <span>not affiliated with MODHAUS or tripleS</span>
            <span className="foot-sep">·</span>
            <a href="#submit">submit a site</a>
            <span className="foot-sep">·</span>
            <a href="#about">about</a>
          </div>
          <div className="foot-meta">
            built by fans, for fans · {sites.length} sites indexed
          </div>
        </footer>
      </main>

      <TweaksPanel>
        <TweakSection label="Color" />
        <TweakColor label="Accent" value={`oklch(60% 0.18 ${t.accentHue})`}
          options={[
            "oklch(60% 0.18 255)", // tripleS blue
            "oklch(60% 0.18 230)", // azure
            "oklch(62% 0.16 280)", // violet
            "oklch(70% 0.14 80)",  // amber
            "oklch(64% 0.16 350)", // rose
          ]}
          onChange={(v) => {
            const m = v.match(/(\d+(?:\.\d+)?)\)/);
            if (m) setTweak("accentHue", parseFloat(m[1]));
          }} />

        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density}
          options={["compact", "regular", "comfy"]}
          onChange={(v) => setTweak("density", v)} />
        <TweakToggle label="Show thumbnails" value={t.showThumbnails}
          onChange={(v) => setTweak("showThumbnails", v)} />

        <TweakSection label="Glass" />
        <TweakSlider label="Intensity" value={t.glassIntensity}
          min={0} max={8} step={1}
          onChange={(v) => setTweak("glassIntensity", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
