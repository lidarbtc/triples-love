import { truncate } from './seo.js';

export const projectCopy = {
  en: {
    back: 'All projects', signIn: 'Sign in with GitHub', signOut: 'Sign out', language: '한국어', badgeCode: 'Website banners',
    featuredOn: 'Featured at the front of the triples.love directory.', featuredOff: 'Add a website banner to your site to be featured at the front of the directory.',
    featuredManage: 'Banner settings', featuredGet: 'Get featured', featuredNow: 'Featured now', bannerCta: 'Add a banner',
    operatorOwner: 'For the site owner', operatorNote: 'Two separate things you can do. Either one works on its own.',
    operatorVerifyTitle: 'Verified badge',
    fanProject: 'Project', visit: 'Visit site ↗', about: 'About', links: 'Links',
    archived: 'Archived', archivedNote: 'This project is preserved in the directory. Ownership claims are unavailable for archived projects.',
    savedScreenshot: 'View saved screenshot ↗', verified: 'Ownership verified', verifiedByBefore: 'Verified by ', verifiedByAfter: '', unclaimed: 'Is this your site?',
    claimIntro: 'Verify ownership to add a blue badge beside your site’s name and edit its description and links.', claim: 'Get your verified badge', edit: 'Edit page',
    badgePreview: 'Preview after verification',
    claimSignInHint: 'Sign in with GitHub, then verify site ownership using DNS or HTML.',
    ownerNote: 'Site ownership verified.', editNote: '',
    claimTitle: 'Get your site verified', changeTitle: 'Change site address',
    claimDescription: 'Add a blue badge beside your site’s name in the directory and on its project page. You can also edit its description and links.',
    changeDescription: 'Verify ownership of the new address to update the site link.',
    stepSignIn: 'Sign in', stepVerify: 'Verify your site', stepEdit: 'Edit your page', stepBadge: 'Get your badge',
    signedIn: 'Signed in as', verifying: 'Site to verify', newUrl: 'New site URL',
    newUrlHint: 'Use the full public HTTPS address, including the page path if your project lives in a subdirectory.',
    chooseMethod: 'Choose how to verify', dnsTitle: 'DNS TXT record', dnsHint: 'For your own domain. Also works when bot protection blocks automated visits to your site.',
    metaTitle: 'HTML meta tag', metaHint: 'Add one line to your page’s HTML. Works on any host, including GitHub Pages and Vercel.',
    methodNote: 'You can switch methods later without losing your verification details.',
    metaSteps: ['Copy the tag below.', 'Add it inside the <head> of the page at the address above and publish.', 'Come back and press “Check verification”.'],
    dnsSteps: ['Open the DNS settings of your domain.', 'Add a TXT record with the hostname and value below.', 'Come back and press “Check verification”.'],
    retryHintMeta: 'If it isn’t found, make sure the new version of your page is published, then check again.',
    proofKeep: 'These details stay valid until {expiry}. You can close this page and come back to them, and remove them from your site once verified.',
    switchToDns: 'Switch to DNS verification',
    start: 'Get verification details', starting: 'Preparing…', proofTitle: 'Add verification details',
    dnsHostHint: 'This is the full hostname. Some DNS providers add your domain automatically; enter only the part before your domain in that case.',
    dnsName: 'Hostname', dnsValue: 'TXT value',
    metaHintDetail: 'The tag must be in the HTML response itself, not inserted later by JavaScript. Keep the address publicly accessible.',
    verify: 'Check verification', checking: 'Checking…', retryHint: 'DNS changes can take time to appear. After publishing, check again when you are ready.',
    differentMethod: 'Start again or change method', copied: 'Copied', copy: 'Copy',
    taken: 'This page already has an owner.', takenHint: 'The verified owner can edit this page from their GitHub account.',
    editTitle: 'Edit project', editIntro: 'Changes appear on your page and in the directory as soon as you save.',
    claimedSuccess: 'Ownership verified. Your badge now appears in the directory and on your project page.', saved: 'Changes saved.',
    basics: 'Project details', name: 'Project name', category: 'Category', url: 'Site address', changeUrl: 'Verify a new address',
    appearance: 'Appearance', accent: 'Accent', blue: 'Blue', amber: 'Amber', violet: 'Violet', theme: 'Page theme',
    light: 'Light', dark: 'Dark', auto: 'Match device', english: 'English', korean: 'Korean',
    tagline: 'Short description', description: 'About the project', badges: 'Tags', commaHint: 'Separate with commas.',
    taglineLimit: 'The directory and your page show the first {max} characters.',
    taglineOver: 'This is {count} characters. Visitors see only the first {max}, ending in “…”. The preview shows how it will look.',
    discovery: 'Search & links', aliases: 'Search aliases', aliasesHint: 'Other names people might search for, separated with commas.',
    extraLinks: 'Additional links', linksHint: 'One link per line: label | https://example.com',
    save: 'Save changes', saving: 'Saving…', view: 'View page', preview: 'Page preview', previewHint: '',
    previewEmpty: 'Project description', englishHint: 'Shown on the English page.', koreanHint: 'Shown on the Korean page. Leave empty to use the English copy.',
    footer: '',
  },
  ko: {
    back: '모든 프로젝트', signIn: 'GitHub로 로그인', signOut: '로그아웃', language: 'English', badgeCode: '사이트용 배너',
    featuredOn: '첫 화면 목록 맨 앞에 Featured로 소개되고 있어요.', featuredOff: '사이트에 배너를 달면 첫 화면 목록 맨 앞에 소개돼요.',
    featuredManage: '배너 설정', featuredGet: '첫 화면에 소개되기', featuredNow: '소개 중', bannerCta: '배너 달기',
    operatorOwner: '운영자 메뉴', operatorNote: '할 수 있는 일은 두 가지이고, 서로 별개라 하나만 해도 됩니다.',
    operatorVerifyTitle: '인증 배지',
    fanProject: '프로젝트', visit: '사이트 열기 ↗', about: '프로젝트 소개', links: '관련 링크',
    archived: '아카이브', archivedNote: '기록으로 보관 중인 프로젝트입니다. 아카이브된 프로젝트는 소유권을 인증할 수 없습니다.',
    savedScreenshot: '저장된 스크린샷 보기 ↗', verified: '소유권 인증됨', verifiedByBefore: '', verifiedByAfter: ' 님이 사이트 소유권을 인증했습니다.', unclaimed: '운영하는 사이트인가요?',
    claimIntro: '사이트 소유권을 인증하면 이름 옆에 파란 인증 배지가 표시되고, 소개와 링크를 직접 수정할 수 있어요.', claim: '인증 배지 받기', edit: '페이지 편집',
    badgePreview: '인증 후 표시 예시',
    claimSignInHint: 'GitHub 로그인 후 DNS 또는 HTML로 사이트 소유권을 확인해요.',
    ownerNote: '사이트 소유권이 인증되었습니다.', editNote: '',
    claimTitle: '사이트 인증하고 배지 받기', changeTitle: '사이트 주소 변경',
    claimDescription: '인증하면 디렉토리와 프로젝트 페이지의 이름 옆에 파란 인증 배지가 표시돼요. 소개와 링크도 직접 수정할 수 있어요.',
    changeDescription: '새 주소의 소유권을 인증하면 프로젝트의 사이트 링크가 바뀝니다.',
    stepSignIn: '로그인', stepVerify: '사이트 인증', stepEdit: '페이지 편집', stepBadge: '배지 받기',
    signedIn: '로그인한 계정', verifying: '인증할 사이트', newUrl: '새 사이트 주소',
    newUrlHint: '공개된 HTTPS 주소 전체를 입력하세요. 하위 경로에 있는 프로젝트라면 해당 경로도 포함해 주세요.',
    chooseMethod: '인증 방법 선택', dnsTitle: 'DNS TXT 레코드', dnsHint: '내 도메인을 쓰는 사이트용입니다. 봇 차단 때문에 자동 접속이 막히는 사이트도 이 방법으로 인증할 수 있어요.',
    metaTitle: 'HTML 메타 태그', metaHint: '페이지 HTML에 한 줄만 추가하면 됩니다. GitHub Pages나 Vercel처럼 어떤 호스팅에서도 쓸 수 있어요.',
    methodNote: '나중에 방법을 바꿔도 인증 정보는 그대로 유지됩니다.',
    metaSteps: ['아래 태그를 복사하세요.', '위 주소의 페이지 <head> 안에 넣고 배포하세요.', '돌아와서 “인증 확인하기”를 누르세요.'],
    dnsSteps: ['도메인의 DNS 설정을 여세요.', '아래 호스트 이름과 값으로 TXT 레코드를 추가하세요.', '돌아와서 “인증 확인하기”를 누르세요.'],
    retryHintMeta: '찾지 못한다면 새 버전이 배포됐는지 확인한 뒤 다시 눌러 주세요.',
    proofKeep: '이 인증 정보는 {expiry}까지 유효합니다. 페이지를 닫았다가 다시 와도 그대로 표시되고, 인증이 끝나면 사이트에서 지워도 됩니다.',
    switchToDns: 'DNS 인증으로 바꾸기',
    start: '인증 정보 받기', starting: '준비 중…', proofTitle: '인증 정보 추가하기',
    dnsHostHint: '전체 호스트 이름입니다. 도메인을 자동으로 붙이는 DNS 서비스에서는 도메인 앞부분만 입력하세요.',
    dnsName: '호스트 이름', dnsValue: 'TXT 값',
    metaHintDetail: 'JavaScript로 삽입하지 않고 HTML 응답에 직접 포함해야 합니다. 로그인 없이 접속할 수 있어야 합니다.',
    verify: '인증 확인하기', checking: '확인 중…', retryHint: 'DNS 변경은 반영에 시간이 걸릴 수 있습니다. 반영된 뒤 다시 확인하세요.',
    differentMethod: '다시 시작하기 또는 방법 바꾸기', copied: '복사됨', copy: '복사',
    taken: '이미 소유권이 인증된 페이지입니다.', takenHint: '인증한 소유자의 GitHub 계정으로 로그인하면 편집할 수 있습니다.',
    editTitle: '프로젝트 편집', editIntro: '저장하면 프로젝트 페이지와 디렉토리에 바로 반영됩니다.',
    claimedSuccess: '인증이 완료됐어요. 디렉토리와 프로젝트 페이지에 인증 배지가 표시됩니다.', saved: '저장했습니다.',
    basics: '프로젝트 정보', name: '프로젝트 이름', category: '카테고리', url: '사이트 주소', changeUrl: '새 주소 인증하기',
    appearance: '페이지 스타일', accent: '포인트 색상', blue: '파랑', amber: '노랑', violet: '보라', theme: '페이지 테마',
    light: '라이트', dark: '다크', auto: '기기 설정에 맞춤', english: 'English', korean: '한국어',
    tagline: '짧은 소개', description: '프로젝트 설명', badges: '태그', commaHint: '쉼표로 구분해 주세요.',
    taglineLimit: '목록과 프로젝트 페이지에는 앞에서부터 {max}자까지 표시됩니다.',
    taglineOver: '지금 {count}자입니다. 방문자에게는 앞 {max}자만 보이고 뒤는 “…”로 줄어듭니다. 미리보기에서 실제 모습을 확인하세요.',
    discovery: '검색과 링크', aliases: '검색 별칭', aliasesHint: '다른 이름이나 검색어를 쉼표로 구분해 주세요.',
    extraLinks: '추가 링크', linksHint: '한 줄에 하나씩 입력하세요: 이름 | https://example.com',
    save: '변경 사항 저장', saving: '저장 중…', view: '페이지 보기', preview: '페이지 미리보기', previewHint: '',
    previewEmpty: '프로젝트 설명', englishHint: '영어 페이지에 표시됩니다.', koreanHint: '한국어 페이지에 표시됩니다. 비워 두면 영어 소개를 사용합니다.',
    footer: '',
  }
};

export function projectHref(id, lang = 'en', suffix = '') {
  return `/p/${encodeURIComponent(id)}/${suffix}${suffix ? '/' : ''}?lang=${lang === 'ko' ? 'ko' : 'en'}`;
}

// Short descriptions are stored as written and shortened only where they are shown.
export const TAGLINE_DISPLAY_MAX = 60;

export function displayTagline(text) {
  return truncate(text, TAGLINE_DISPLAY_MAX);
}

// Splits off the last word so a verified seal wraps together with it.
export function splitLastWord(text) {
  const start = text.lastIndexOf(' ') + 1;
  return [text.slice(0, start), text.slice(start)];
}

export function localizedProject(project, lang) {
  const english = project.locales?.en || {};
  const local = project.locales?.[lang] || {};
  return {
    tagline: local.tagline || english.tagline || project.tagline || '',
    description: local.description || english.description || project.description || '',
    badges: local.badges?.length ? local.badges : english.badges || project.badges || []
  };
}
