const API_BASE = 'https://keep-on-web-4wvbvyiw4q-du.a.run.app';
const keepButton = document.querySelector('#keep');
const statusOutput = document.querySelector('#status');
const connectButton = document.querySelector('#connect');
const disconnectButton = document.querySelector('#disconnect');
const redirectOutput = document.querySelector('#redirect');

let accessToken = null;
let refreshToken = null;
let expiresAt = 0;

function setStatus(message) {
  statusOutput.textContent = message;
}

async function readJsonResponse(response) {
  const body = await response.text();
  if (!body) throw new Error('KEEP:ON 서버가 빈 응답을 반환했습니다. 서버가 실행 중인지 확인해 주세요.');
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('KEEP:ON 서버가 JSON이 아닌 응답을 반환했습니다. 서버가 실행 중인지 확인해 주세요.');
  }
}

function updateConnectionUi() {
  connectButton.hidden = Boolean(accessToken);
  disconnectButton.hidden = !accessToken;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(['accessToken', 'refreshToken', 'expiresAt']);
  accessToken = stored.accessToken || null;
  refreshToken = stored.refreshToken || null;
  expiresAt = Number(stored.expiresAt || 0);
  if (accessToken && !refreshToken) {
    accessToken = null;
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'expiresAt']);
    setStatus('연결 정보를 업데이트하려면 Google 계정을 한 번 다시 연결해 주세요.');
  }
  redirectOutput.textContent = `Supabase Redirect URL: ${chrome.identity.getRedirectURL('auth/callback')}`;
  updateConnectionUi();
}

async function authConfig() {
  const response = await fetch(`${API_BASE}/v1/auth/config`);
  const config = await readJsonResponse(response);
  if (!response.ok) throw new Error(config.error?.message || '인증 설정을 읽지 못했습니다.');
  return config;
}

async function refreshSession() {
  const config = await authConfig();
  const response = await fetch(`${config.supabase_url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: config.supabase_anon_key, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const tokens = await readJsonResponse(response);
  if (!response.ok || !tokens.access_token || !tokens.refresh_token) throw new Error('로그인 세션이 만료되었습니다. Google 계정을 다시 연결해 주세요.');
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  expiresAt = Number(tokens.expires_at || 0);
  await chrome.storage.local.set({ accessToken, refreshToken, expiresAt });
}

async function ensureSession() {
  if (!accessToken || !refreshToken) throw new Error('먼저 Google 계정을 연결해 주세요.');
  if (expiresAt && expiresAt > Math.floor(Date.now() / 1000) + 30) return;
  try {
    await refreshSession();
  } catch (error) {
    accessToken = null;
    refreshToken = null;
    expiresAt = 0;
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'expiresAt']);
    updateConnectionUi();
    throw error;
  }
}

async function connectAccount() {
  connectButton.disabled = true;
  setStatus('Google 로그인 창을 여는 중...');
  try {
    const config = await authConfig();
    const redirectTo = chrome.identity.getRedirectURL('auth/callback');
    const authorizeUrl = new URL(`${config.supabase_url}/auth/v1/authorize`);
    authorizeUrl.searchParams.set('provider', 'google');
    authorizeUrl.searchParams.set('redirect_to', redirectTo);
    const callbackUrl = await chrome.identity.launchWebAuthFlow({ url: authorizeUrl.href, interactive: true });
    const callback = new URL(callbackUrl);
    const callbackError = callback.searchParams.get('error_description') || callback.hash.match(/error_description=([^&]+)/)?.[1];
    if (callbackError) throw new Error(decodeURIComponent(callbackError.replace(/\+/g, ' ')));
    const tokens = new URLSearchParams(callback.hash.replace(/^#/, ''));
    accessToken = tokens.get('access_token');
    refreshToken = tokens.get('refresh_token');
    expiresAt = Number(tokens.get('expires_at') || 0);
    if (!accessToken || !refreshToken) throw new Error('로그인 토큰을 받지 못했습니다. Supabase Redirect URL 설정을 확인해 주세요.');
    await chrome.storage.local.set({ accessToken, refreshToken, expiresAt });
    updateConnectionUi();
    setStatus('계정이 연결되었습니다. 이제 Keep할 수 있습니다.');
  } catch (error) {
    setStatus(`계정 연결 실패\n${error.message}`);
  } finally {
    connectButton.disabled = false;
  }
}

function collectPageEvidence() {
  const meta = (selector) => document.querySelector(selector)?.content?.trim() || '';
  const text = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
  const cleanText = (value) => typeof value === 'string'
    ? value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    : '';
  const firstContentLine = (value) => cleanText(value)
    .split('\n')
    .map((line) => line.trim().replace(/^\d+\s*\/\s*/, ''))
    .find((line) => line && !/^https?:\/\//i.test(line)) || '';
  const unwrapLink = (href) => {
    try {
      const url = new URL(href, window.location.href);
      if (url.hostname === 'l.threads.com' || url.hostname === 'l.instagram.com') {
        const target = url.searchParams.get('u');
        if (target) return decodeURIComponent(target);
      }
      if (url.hostname.includes('threads.com') || url.hostname.includes('instagram.com')) return '';
      return url.href;
    } catch {
      return '';
    }
  };
  const sourceUrl = window.location.href;
  const platform = document.body?.dataset?.platform || (() => {
    const host = window.location.hostname;
    if (host.includes('instagram')) return 'instagram';
    if (host.includes('threads')) return 'threads';
    return 'unknown';
  })();
  const isPostUrl = (value) => {
    try {
      const url = new URL(value);
      if (platform === 'threads') return /^(?:\/@[^/]+\/post|\/t)\/[^/]+/i.test(url.pathname);
      if (platform === 'instagram') return /^(?:\/(?:p|reel|reels|tv)\/[^/]+|\/[^/]+\/(?:p|reel|reels|tv)\/[^/]+)/i.test(url.pathname);
    } catch {
      return false;
    }
    return false;
  };
  const postIdentity = (value) => {
    try {
      const url = new URL(value);
      const match = platform === 'threads'
        ? url.pathname.match(/^(?:\/@[^/]+\/post|\/t)\/([^/]+)/i)
        : url.pathname.match(/^(?:\/(?:p|reel|reels|tv)|\/[^/]+\/(?:p|reel|reels|tv))\/([^/]+)/i);
      return match?.[1]?.toLowerCase() || '';
    } catch {
      return '';
    }
  };
  const sourceIdentity = postIdentity(sourceUrl);
  const ogTitle = meta('meta[property="og:title"]');
  const description = meta('meta[property="og:description"]')
    || meta('meta[name="twitter:description"]')
    || meta('meta[name="description"]');
  const rawInstagramDescriptions = platform === 'instagram'
    ? Array.from(document.querySelectorAll('meta[property="og:description"], meta[name="twitter:description"], meta[name="description"]'))
      .map((node) => node.content?.trim() || '')
      .filter(Boolean)
    : [];
  const instagramAuthor = platform === 'instagram'
    ? meta('meta[name="author"]')
      || ogTitle.match(/@([\w.]+)/)?.[1]
      || ogTitle.match(/^([^:\n]{1,120})\s+on Instagram:/i)?.[1]
      || ogTitle.match(/^@?[\w.]{1,60}$/)?.[0]
      || rawInstagramDescriptions[0]?.match(/^[\d,.]+\s+likes?,\s*[\d,.]+\s+comments?\s*-\s*([\w.]+)\s*-/i)?.[1]
      || text('[rel="author"]')
      || ''
    : '';
  const instagramContainers = platform === 'instagram'
    ? Array.from(document.querySelectorAll('article, [role="article"]'))
    : [];
  const currentInstagramContainer = sourceIdentity
    ? instagramContainers.find((container) => Array.from(container.querySelectorAll('a[href]'))
      .some((anchor) => postIdentity(anchor.href) === sourceIdentity))
    : null;
  const domText = cleanText((document.querySelector('article') || document.querySelector('[role="article"]') || document.querySelector('main') || document.body)?.innerText || '');
  const cleanInstagramCaption = (value) => cleanText(value)
    .replace(/^[^:\n]{1,120}\s+on Instagram:\s*/i, '')
    .replace(/^Instagram(?:에서|의)?\s*[:：-]\s*/i, '')
    .replace(/^["“](.*)["”]$/s, '$1')
    .trim();
  const normalizedInstagramAuthor = cleanInstagramCaption(instagramAuthor).replace(/^@/, '').toLowerCase();
  const isInstagramNoise = (value) => {
    const normalized = cleanInstagramCaption(value);
    const comparable = normalized.replace(/^@/, '').toLowerCase();
    return !normalized
      || comparable === normalizedInstagramAuthor
      || /^@?[a-z0-9._]{2,40}$/i.test(normalized)
      || /^(?:instagram(?:에서|의)?(?:\s*(?:로그인|가입|사진|동영상))?|log in|sign up|create an account|see photos and videos|follow|following|like|comment|share)$/i.test(normalized)
      || /^(?:\d+[\d,.]*\s*)?(?:likes?|comments?|번역 보기|더 보기)$/i.test(normalized);
  };
  const normalizedInstagramDescriptionOwner = (value) => value
    .match(/^[\d,.]+\s+likes?,\s*[\d,.]+\s+comments?\s*-\s*([\w.]+)\s*-/i)?.[1]
    ?.replace(/^@/, '')
    .toLowerCase() || '';
  const instagramDescriptionCandidates = [...new Set(rawInstagramDescriptions)]
    .map((value) => {
      const owner = normalizedInstagramDescriptionOwner(value);
      if (owner && normalizedInstagramAuthor && owner !== normalizedInstagramAuthor) return '';
      return cleanInstagramCaption(value)
        .replace(/^[\d,.]+\s+likes?,\s*[\d,.]+\s+comments?\s*-\s*[\w.]+\s*-\s*[^:]+:\s*/i, '')
        .trim();
    })
    .filter((candidate) => candidate && !isInstagramNoise(candidate));
  const instagramCaptionScope = currentInstagramContainer || document;
  const instagramExplicitCaptionNodes = Array.from(instagramCaptionScope.querySelectorAll('[data-testid="post-caption"], [data-testid="caption"]'));
  const instagramHeadingNodes = Array.from(instagramCaptionScope.querySelectorAll('h1'));
  const instagramGenericCaptionNodes = currentInstagramContainer
    ? Array.from(currentInstagramContainer.querySelectorAll('[dir="auto"]'))
    : Array.from(document.querySelectorAll('article [dir="auto"], [role="article"] [dir="auto"]'));
  const instagramDomCaptionCandidates = [
    ...instagramExplicitCaptionNodes.map((node) => cleanInstagramCaption(node.textContent)),
    ...instagramHeadingNodes.map((node) => cleanInstagramCaption(node.textContent)),
    ...instagramGenericCaptionNodes.map((node) => cleanInstagramCaption(node.textContent))
  ];
  const instagramCaption = platform === 'instagram'
    ? [
      ...(currentInstagramContainer ? instagramDomCaptionCandidates : []),
      ...(!currentInstagramContainer ? instagramDescriptionCandidates : []),
      ...(!currentInstagramContainer ? instagramDomCaptionCandidates : instagramDescriptionCandidates)
    ].find((candidate) => candidate && !isInstagramNoise(candidate)) || ''
    : '';
  const selectedDescription = platform === 'instagram'
    ? instagramDescriptionCandidates[0] || ''
    : description;
  const fallbackPattern = /Threads에 가입하여|Instagram 계정으로 로그인|로그인 또는 가입|Join Threads|Log in or sign up|Create an account to see/i;
  const looksLikeFallback = (value) => {
    const normalized = cleanText(value);
    return normalized.length > 0 && normalized.length <= 280 && fallbackPattern.test(normalized);
  };
  // OG 메타가 로그인 안내로 캐시되어도 실제 DOM에 게시물 본문이 있으면
  // DOM 본문을 우선한다. DOM도 짧은 로그인 안내인 경우에만 접근 실패로 본다.
  // Instagram은 릴스/일반 게시물 모두 영상이 아니라 캡션만 본문으로 취급한다.
  const bodySource = platform === 'instagram'
    ? instagramCaption
    : looksLikeFallback(description) && domText.length > 280 ? domText : description || domText;
  const bodyText = cleanText(bodySource).slice(0, 12000);
  const genericTitle = /^(threads|instagram)(의|에서| )|on (threads|instagram)$/i.test(ogTitle)
    || /^(threads|instagram)$/i.test(ogTitle);
  const instagramTitleUsesCaption = platform === 'instagram'
    && (cleanInstagramCaption(ogTitle).replace(/^@/, '').toLowerCase() === normalizedInstagramAuthor
      || /(?:^|\s)Instagram(?:의|에서)?\s+/i.test(ogTitle)
      || /\s+on Instagram:/i.test(ogTitle)
      || /^instagram$/i.test(ogTitle.trim())
      || ogTitle.length > 120);
  const pageTitle = genericTitle
    ? firstContentLine(bodyText) || firstContentLine(document.title) || ogTitle
    : instagramTitleUsesCaption
      ? firstContentLine(bodyText) || firstContentLine(document.title) || ogTitle
    : ogTitle || firstContentLine(bodyText) || document.title;
  const evidenceText = (value) => cleanText(value).slice(0, 2000);
  const metadataCanonicalUrl = meta('meta[property="og:url"]')
    || document.querySelector('link[rel="canonical"]')?.href
    || sourceUrl;
  const deadlineText = bodyText.match(/(?:마감|접수기간|신청기간|deadline)[^\n]*/i)?.[0] || '';
  const evidence = [];
  if (bodyText) evidence.push({ source: selectedDescription ? 'og' : 'dom', locator: selectedDescription ? 'meta[property="og:description"]' : 'article, main, body', text: evidenceText(bodyText) });
  if (pageTitle) evidence.push({ source: 'og', locator: 'meta[property="og:title"]', text: evidenceText(pageTitle) });
  if (selectedDescription) evidence.push({ source: 'og', locator: 'meta[property="og:description"]', text: evidenceText(selectedDescription) });
  const linkText = platform === 'instagram' ? bodyText : `${bodyText}\n${domText}`;
  const referencedUrls = [...new Set((linkText.match(/https?:\/\/[^\s<>"']+/gi) || []).map((url) => url.replace(/[),.;]+$/, '')))]
    .map((url) => unwrapLink(url))
    .filter(Boolean);
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((anchor) => ({
      url: unwrapLink(anchor.href),
      label: cleanText(anchor.textContent).slice(0, 200),
      inContentRegion: Boolean(anchor.closest('article, [role="article"], main'))
    }))
    .filter((link) => link.url && (link.inContentRegion || referencedUrls.includes(link.url)))
    .map(({ url, label }) => ({ url, label }))
    .concat(referencedUrls.map((url) => ({ url, label: url })))
    .filter((link) => link.url)
    .filter((link, index, all) => all.findIndex((candidate) => candidate.url === link.url) === index)
    .slice(0, 40);
  const publishedAt = document.querySelector('time[datetime]')?.dateTime || null;
  const author = instagramAuthor
    || ogTitle.match(/@([\w.]+)/)?.[1]
    || text('[rel="author"]')
    || '';
  const metadataOnlyFallback = bodyText.length < 20 && fallbackPattern.test([pageTitle, selectedDescription].filter(Boolean).join('\n'));
  const isAccessFallback = looksLikeFallback(bodyText) || metadataOnlyFallback;
  const sourcePost = isPostUrl(sourceUrl);
  const canonicalPost = isPostUrl(metadataCanonicalUrl);
  const samePost = sourcePost && canonicalPost && postIdentity(sourceUrl) === postIdentity(metadataCanonicalUrl);
  // Instagram의 main 영역에는 추천 게시물도 함께 렌더링될 수 있다.
  // 페이지 전체에서 첫 게시물 링크를 고르면 새 URL을 열었는데도 이전
  // 게시물로 오인하므로, 현재 캡션이 속한 article만 확인한다. 해당
  // 컨테이너에서 게시물 ID가 하나로 확정될 때만 불일치를 판정한다.
  const captionNode = platform === 'instagram'
    ? currentInstagramContainer?.querySelector('[data-testid="post-caption"], [data-testid="caption"], h1')
      || document.querySelector('[data-testid="post-caption"], [data-testid="caption"], article h1')
    : null;
  const renderedContainer = currentInstagramContainer
    || captionNode?.closest('article, [role="article"]')
    || (platform === 'instagram'
      ? document.querySelector('article, [role="article"]')
      : document.querySelector('article, [role="article"], main'));
  const renderedPostUrls = Array.from(renderedContainer?.querySelectorAll('a[href]') || [])
    .map((anchor) => anchor.href)
    .filter((href) => isPostUrl(href));
  const renderedPostIdentities = [...new Set(renderedPostUrls.map(postIdentity).filter(Boolean))];
  const renderedIdentity = renderedPostIdentities.length === 1 ? renderedPostIdentities[0] : '';
  const renderedPostUrl = renderedPostUrls.find((href) => postIdentity(href) === renderedIdentity) || '';
  const isRenderedMismatch = Boolean(sourceIdentity && renderedIdentity && sourceIdentity !== renderedIdentity);
  // Instagram은 이전 게시물의 og:url과 캡션을 함께 잠시 남길 수 있다.
  // 현재 URL과 canonical 주소가 다르고 현재 게시물 article도 아직 없으면
  // READY로 저장하지 않고 다음 캡처에서 다시 확인한다.
  const isStaleInstagramCapture = Boolean(
    platform === 'instagram'
      && sourcePost
      && !samePost
      && metadataCanonicalUrl !== sourceUrl
      && !currentInstagramContainer
  );
  const hasCaptureMismatch = isRenderedMismatch || isStaleInstagramCapture;
  // Threads는 SPA 내부 이동 때 og:url을 이전 게시물 값으로 남겨둘 수 있다.
  // 현재 탭이 실제 게시물 URL이면 주소창 URL을 게시물 식별자의 기준으로 삼는다.
  const canonicalUrl = sourcePost && !samePost ? sourceUrl : metadataCanonicalUrl;
  const isCanonicalMismatch = !sourcePost && canonicalPost && postIdentity(sourceUrl) !== postIdentity(metadataCanonicalUrl);
  const captureStatus = isAccessFallback
    ? 'ACCESS_REQUIRED'
    : isCanonicalMismatch || hasCaptureMismatch
      ? 'URL_MISMATCH'
      : bodyText.length >= 20
        ? 'READY'
        : 'INSUFFICIENT_EVIDENCE';
  return {
    source_url: sourceUrl,
    canonical_url: canonicalUrl,
    platform,
    captured_at: new Date().toISOString(),
    page_title: pageTitle,
    author,
    body_text: bodyText,
    rendered_post_url: renderedPostUrl || null,
    published_at: publishedAt,
    deadline_text: deadlineText,
    links,
    evidence,
    capture_status: captureStatus,
    capture_error_code: captureStatus === 'ACCESS_REQUIRED'
      ? 'PAGE_ACCESS_REQUIRED'
      : captureStatus === 'URL_MISMATCH'
        ? (hasCaptureMismatch ? 'RENDERED_POST_MISMATCH' : 'CANONICAL_POST_MISMATCH')
        : null
  };
}

async function captureTabEvidence(tabId) {
  let pageEvidence = null;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [execution] = await chrome.scripting.executeScript({ target: { tabId }, func: collectPageEvidence });
    pageEvidence = execution?.result || null;
    // Instagram/Threads SPA는 주소를 먼저 바꾸고 OG·DOM을 늦게 갱신할 수
    // 있으므로 READY여도 한 번 더 읽어 현재 게시물인지 확인한다.
    if (!pageEvidence || (attempt >= 1 && pageEvidence.capture_status === 'READY') || attempt === maxAttempts - 1) return pageEvidence;
    setStatus('현재 게시물 본문을 불러오는 중...');
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  return pageEvidence;
}

async function keepCurrentPage() {
  keepButton.disabled = true;
  setStatus('페이지 증거를 수집하는 중...');
  try {
    await ensureSession();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabs = activeTab && /^https?:\/\//i.test(activeTab.url || '')
      ? [activeTab]
      : await chrome.tabs.query({ currentWindow: true });
    const [tab] = tabs.filter((candidate) => /^https?:\/\//i.test(candidate.url || ''));
    if (!tab?.id) throw new Error('현재 탭을 찾을 수 없습니다.');
    const pageEvidence = await captureTabEvidence(tab.id);
    if (!pageEvidence) throw new Error('페이지 증거를 읽지 못했습니다.');
    if (pageEvidence.capture_status === 'ACCESS_REQUIRED') {
      throw new Error('게시물 본문을 읽지 못했습니다. Threads 또는 Instagram 게시물을 연 상태에서 로그인 후 다시 Keep해 주세요.');
    }
    if (pageEvidence.capture_status === 'URL_MISMATCH') {
      if (pageEvidence.capture_error_code === 'RENDERED_POST_MISMATCH') {
        throw new Error('현재 게시물이 아직 로딩 중입니다. 페이지가 완전히 표시된 뒤 다시 Keep해 주세요.');
      }
      throw new Error('게시물 주소와 페이지 canonical 주소가 다릅니다. 원문 게시물을 다시 연 뒤 Keep해 주세요.');
    }
    const response = await fetch(`${API_BASE}/v1/intakes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ source_type: 'page_evidence', page_evidence: pageEvidence })
    });
    const result = await readJsonResponse(response);
    if (!response.ok) {
      const details = Array.isArray(result.error?.details) && result.error.details.length
        ? ` (${result.error.details.join(', ')})`
        : '';
      throw new Error(`${result.error?.message || `Intake 실패 (${response.status})`}${details}`);
    }
    const dashboardUrl = `${API_BASE}${result.dashboard_url}`;
    setStatus(`저장됨\n${result.intake_id}\n처리 결과 화면을 여는 중...`);
    await chrome.tabs.create({ url: dashboardUrl });
  } catch (error) {
    setStatus(`Keep 실패\n${error.message}`);
  } finally {
    keepButton.disabled = false;
  }
}

keepButton.addEventListener('click', keepCurrentPage);
connectButton.addEventListener('click', connectAccount);
disconnectButton.addEventListener('click', async () => {
  accessToken = null;
  refreshToken = null;
  expiresAt = 0;
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'expiresAt']);
  updateConnectionUi();
  setStatus('계정 연결을 해제했습니다.');
});
loadSettings().catch((error) => setStatus(`설정 초기화 실패\n${error.message}`));
