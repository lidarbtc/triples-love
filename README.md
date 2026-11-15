# triples.love

A community-curated index of fan-made tripleS & COSMO sites — tools, trackers,
hubs, and resources scattered across personal domains, github pages, and
vercel deploys, all in one place.

## Stack

SvelteKit SSG with `@sveltejs/adapter-static`. The built `build/` directory is
served as Cloudflare Workers Static Assets via Wrangler.

- `src/routes/[lang=lang]/+page.svelte` — localized header, toolbar, card grid, about block, footer
- `src/routes/+page.svelte` — language entry point and legacy-link redirect
- `src/hooks.server.js` — sets the HTML language during prerendering
- `src/app.css` — migrated styling from the original static page
- `src/lib/data.js` — site list + category definitions
- `static/image-slot.js` — `<image-slot>` custom element asset
- `wrangler.jsonc` — Workers static assets deployment config

## Run locally

```sh
npm install
npm run dev
```

## Build and preview

```sh
npm run build
npm run preview
```

The generated static files are written to `build/`.

## Languages

`/en/` and `/ko/` are prerendered separately, including their text, HTML language,
and metadata. Direct visits display the requested language before JavaScript
loads. The language switch links between these routes.

`/` redirects to a language route using the legacy `?lang=en|ko` parameter first,
then the saved `triples-love.lang` preference, then the browser language. Other
query parameters and the URL fragment are preserved. If JavaScript is disabled,
the entry page offers links to both languages. No runtime SSR is required.

## Capture fan site screenshots

```sh
npm run screenshots
```

This visits every site in `src/lib/data.js` and writes deployable card previews
to `static/site-screenshots/{site.id}.jpg`.

Capture one listing:

```sh
npm run screenshots -- --site apollo
```

## 사이트 추가 및 업로드 절차

1. **사이트 확인**: 링크에 직접 접속해 실제 기능과 운영 여부를 확인하고,
   기존 목록에 같은 사이트나 이전 도메인이 있는지 확인합니다.
2. **목록 등록**: `src/lib/data.js`의 `sites`에 고유한 `id`, 이름, 도메인,
   URL, 기존 카테고리, 영어 소개와 배지, 색상(`accent`)을 추가합니다.
   `addedAt`은 최초 등록 시각을 시간대가 있는 ISO 8601 형식으로 기록합니다
   (예: `2026-09-19T14:30:00+09:00`). 이후 설명 수정 때는 바꾸지 않습니다.
3. **한국어 및 검색어 추가**: `src/lib/i18n.js`의 `siteCopy.ko[id]`에
   한국어 소개와 배지를 작성합니다. 필요한 별칭·한글명은 `siteSearchAliases[id]`에
   추가합니다. 새 카테고리가 필요하면 `data.js`의 `categories`와
   `i18n.js`의 `categoryLabels`, `categoryNames`를 한·영 모두 갱신합니다.
4. **미리보기 이미지 저장**: `npm run screenshots -- --site <id>`로
   `static/site-screenshots/<id>.jpg`를 만들고, 오류 화면이나 로딩 화면이
   아닌지 직접 확인합니다. 이미지도 변경 파일에 포함합니다.
5. **뉴스와 수정일 갱신**: 업로드 전에 `src/lib/i18n.js`의 `ui.en.hero`와
   `ui.ko.hero`를 함께 수정합니다.
   - `updateTitle`과 `updateBody`: 이번에 추가한 사이트 이름과 무엇을 할 수
     있는지 제목 + 1~2문장으로 소개합니다. 여러 사이트를 추가하면 함께 요약합니다.
     ‘매주 업데이트’ 같은 일반 안내 대신 실제 추가 소식을 적습니다.
   - `date`: 뉴스 작성·수정 날짜입니다.
   - `statusValue`: 사이트 콘텐츠를 마지막으로 수정한 날짜입니다.
     사이트 추가 시에는 뉴스 날짜와 함께 갱신합니다. 뉴스 변경이 없는 설명 수정은
     `statusValue`만 갱신하고, 문서만 수정한 경우에는 화면 날짜를 바꾸지 않습니다.
6. **업로드 전 확인**: `npm run build` 성공 후 `npm run preview`로
   `/ko/`와 `/en/`을 확인합니다. 새 카드의 이미지·소개·외부 링크, 이름과 별칭 검색,
   카테고리 필터, 최근 추가순 정렬, 모바일 화면의 뉴스 줄바꿈을 확인합니다.
   `git diff --check`와 `git diff`로 누락이나 의도하지 않은 변경도 확인합니다.
7. **배포 및 확인**: 데이터·번역·뉴스·이미지를 함께 커밋하고 아래 명령으로
   배포합니다. 배포 후에도 실제 사이트의 `/ko/`와 `/en/`에서 새 카드와 뉴스,
   이미지, 외부 링크가 정상인지 확인합니다.

## Deploy to Cloudflare Workers

```sh
npm run deploy
```

This runs the SvelteKit static build and deploys `build/` with Wrangler.
