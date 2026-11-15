export const SITE_ORIGIN = 'https://triples.love';
export const ROBOTS_CONTENT = 'index, follow, max-image-preview:large';

const TITLE_TAGLINE_MAX = 48;
const DESCRIPTION_MAX = 160;

// English is the default language of /p/ and /badges/ pages; Korean lives at ?lang=ko.
export function localizedUrl(path, lang = 'en') {
  return `${SITE_ORIGIN}${path}${lang === 'ko' ? '?lang=ko' : ''}`;
}

export function projectUrl(id, lang = 'en') {
  return localizedUrl(`/p/${encodeURIComponent(id)}/`, lang);
}

export function screenshotUrl(id) {
  return `${SITE_ORIGIN}/site-screenshots/${encodeURIComponent(id)}.jpg`;
}

export function truncate(text, max = DESCRIPTION_MAX) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:·]+$/, '')}…`;
}

// Search result text for a project page. The tagline says what the site is, so it
// goes in the title; the full description becomes the snippet.
export function projectMeta(project, copy, lang = 'en') {
  const tagline = String(copy.tagline || '').trim();
  const heading = tagline && tagline.length <= TITLE_TAGLINE_MAX ? `${project.name} – ${tagline}` : project.name;
  return {
    title: `${heading} | triples.love`,
    heading,
    description: truncate(copy.description || tagline),
    canonical: projectUrl(project.id, lang),
    image: screenshotUrl(project.id),
    imageAlt: lang === 'ko' ? `${project.name} 사이트 화면` : `Screenshot of the ${project.name} website`
  };
}

export function projectJsonLd(project, meta, lang = 'en') {
  const home = `${SITE_ORIGIN}/${lang === 'ko' ? 'ko' : 'en'}/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': meta.canonical,
    url: meta.canonical,
    name: meta.heading,
    description: meta.description,
    inLanguage: lang === 'ko' ? 'ko' : 'en',
    isPartOf: { '@type': 'WebSite', name: 'triples.love', url: `${SITE_ORIGIN}/` },
    primaryImageOfPage: { '@type': 'ImageObject', url: meta.image, caption: meta.imageAlt },
    mainEntity: {
      '@type': 'WebSite',
      name: project.name,
      url: project.url,
      description: meta.description,
      image: meta.image
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'triples.love', item: home },
        { '@type': 'ListItem', position: 2, name: project.name, item: meta.canonical }
      ]
    }
  };
}

export function siteJsonLd(lang, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'triples.love',
    url: `${SITE_ORIGIN}/`,
    description,
    inLanguage: lang === 'ko' ? 'ko' : 'en'
  };
}

// Serialized for {@html}; escaping "<" keeps project text from closing the script tag.
export function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">' + json + '</scr' + 'ipt>';
}

function xml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildSitemap(projects) {
  const link = (hreflang, href) => `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${xml(href)}"/>`;
  const pair = (en, ko, extra = '', fallback = en) => {
    const links = link('en', en) + link('ko', ko) + link('x-default', fallback);
    return [en, ko].map((loc) => `<url><loc>${xml(loc)}</loc>${links}${extra}</url>`);
  };

  const urls = [
    // The root page sends visitors to their language, matching the pages' own x-default.
    ...pair(`${SITE_ORIGIN}/en/`, `${SITE_ORIGIN}/ko/`, '', `${SITE_ORIGIN}/`),
    ...pair(localizedUrl('/badges/', 'en'), localizedUrl('/badges/', 'ko'))
  ];
  for (const project of projects) {
    const updated = Number.isFinite(project.updatedAt) && project.updatedAt > 0 ? new Date(project.updatedAt) : null;
    const lastmod = updated ? `<lastmod>${updated.toISOString().slice(0, 10)}</lastmod>` : '';
    const image = `<image:image><image:loc>${xml(screenshotUrl(project.id))}</image:loc></image:image>`;
    urls.push(...pair(projectUrl(project.id, 'en'), projectUrl(project.id, 'ko'), lastmod + image));
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n');
}
