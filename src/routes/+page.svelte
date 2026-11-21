<script>
  import { ui } from '#lib/i18n.js';

  const metaImage = 'https://triples.love/og-image.png';
  const metaImageAlt =
    'triples.love directory preview showing fan-made tripleS project cards and site screenshots.';
</script>

<svelte:head>
  <title>{ui.en.metaTitle}</title>
  <meta
    name="description"
    content={ui.en.metaDescription}
  />
  <link rel="canonical" href="https://triples.love/" />
  <link rel="alternate" hreflang="en" href="https://triples.love/en/" />
  <link rel="alternate" hreflang="ko" href="https://triples.love/ko/" />
  <link rel="alternate" hreflang="x-default" href="https://triples.love/" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="triples.love" />
  <meta property="og:title" content={ui.en.metaTitle} />
  <meta property="og:description" content={ui.en.metaDescription} />
  <meta property="og:url" content="https://triples.love/" />
  <meta property="og:image" content={metaImage} />
  <meta property="og:image:secure_url" content={metaImage} />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={metaImageAlt} />
  <meta property="og:locale" content="en_US" />
  <meta property="og:locale:alternate" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={ui.en.metaTitle} />
  <meta name="twitter:description" content={ui.en.metaDescription} />
  <meta name="twitter:image" content={metaImage} />
  <meta name="twitter:image:alt" content={metaImageAlt} />
  <script>
    (() => {
      const url = new URL(window.location.href);
      const supported = ['en', 'ko'];
      let lang = url.searchParams.get('lang');

      if (!supported.includes(lang)) {
        try {
          lang = window.localStorage.getItem('triples-love.lang');
        } catch {
          // Browser language remains available when storage is blocked.
        }
      }

      if (!supported.includes(lang)) {
        const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
        lang = languages.some((language) => /^ko(?:-|$)/i.test(language)) ? 'ko' : 'en';
      }

      url.pathname = `/${lang}/`;
      url.searchParams.delete('lang');
      window.location.replace(url.href);
    })();
  </script>
</svelte:head>

<main class="language-entry">
  <span class="brand-name">triples<span class="brand-dot">.</span>love</span>
  <nav aria-label="Language / 언어">
    <a href="/en/" lang="en" hreflang="en">English</a>
    <a href="/ko/" lang="ko" hreflang="ko">한국어</a>
  </nav>
</main>

<style>
  .language-entry {
    min-height: 100svh;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 24px;
  }

  .brand-name {
    font-size: 24px;
  }

  nav {
    display: flex;
    gap: 24px;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
