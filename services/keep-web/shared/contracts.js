export const PLATFORMS = Object.freeze(['instagram', 'threads']);
export const CATEGORIES = Object.freeze(['Competition', 'Support', 'Benefit']);
export const INTAKE_STATES = Object.freeze([
  'QUEUED',
  'RECEIVED',
  'EVENT_PENDING',
  'EVENT_SENT',
  'EXTRACTING',
  'NORMALIZING',
  'VALIDATING',
  'READY_FOR_REVIEW',
  'NEEDS_REVIEW',
  'UNSUPPORTED',
  'CANCELLED',
  'FAILED'
]);

export const MAX_BODY_CHARS = 12000;
export const MAX_EVIDENCE_ITEMS = 24;
export const MAX_LINKS = 40;

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

const ACCESS_FALLBACK_PATTERN = /Threads에 가입하여|Instagram 계정으로 로그인|로그인 또는 가입|Join Threads|Log in or sign up|Create an account to see/i;

function postIdentity(value, platform) {
  if (!isHttpUrl(value)) return null;
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '');
    if (platform === 'threads') {
      const match = path.match(/^(?:\/@[^/]+\/post|\/t)\/([^/]+)/i);
      return match ? `threads:${match[1].toLowerCase()}` : null;
    }
    if (platform === 'instagram') {
      const match = path.match(/^(?:\/(?:p|reel|reels|tv)|\/[^/]+\/(?:p|reel|reels|tv))\/([^/]+)/i);
      return match ? `instagram:${match[1].toLowerCase()}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function isPlatformPostUrl(value, platform) {
  return Boolean(postIdentity(value, platform));
}

export function isAccessFallbackPage(evidence) {
  if (!evidence || typeof evidence !== 'object') return false;
  const bodyText = typeof evidence.body_text === 'string' ? evidence.body_text.replace(/\s+/g, ' ').trim() : '';
  const shortFallback = bodyText.length > 0 && bodyText.length <= 280 && ACCESS_FALLBACK_PATTERN.test(bodyText);
  const metadataOnlyFallback = bodyText.length < 20
    && ACCESS_FALLBACK_PATTERN.test([evidence.page_title, evidence.body_text].filter(Boolean).join('\n'));
  if (shortFallback || metadataOnlyFallback) return true;
  return false;
}

export function hasCanonicalPostMismatch(evidence) {
  if (!evidence || typeof evidence !== 'object') return false;
  const platform = inferPlatform(evidence.source_url, evidence.platform);
  if (!platform) return false;
  const sourceIdentity = postIdentity(evidence.source_url, platform);
  const canonicalIdentity = postIdentity(evidence.canonical_url || evidence.source_url, platform);
  // Threads SPA는 현재 탭이 가리키는 게시물과 stale canonical 메타가
  // 일시적으로 다를 수 있으므로, 유효한 source 게시물은 주소창을 기준으로 허용한다.
  return Boolean(!sourceIdentity && canonicalIdentity);
}

export function isHttpUrl(value) {
  return typeof value === 'string' && URL_PATTERN.test(value);
}

export function inferPlatform(sourceUrl, explicitPlatform) {
  if (explicitPlatform && explicitPlatform !== 'unknown' && !PLATFORMS.includes(explicitPlatform)) return explicitPlatform;
  if (PLATFORMS.includes(explicitPlatform)) return explicitPlatform;
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'threads.net' || host.endsWith('.threads.net') || host === 'threads.com' || host.endsWith('.threads.com')) return 'threads';
  } catch {
    // Validation reports the malformed URL to the caller.
  }
  return explicitPlatform || 'unknown';
}

export function validatePageEvidencePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['payload must be an object'] };
  }
  if (payload.source_type !== 'page_evidence') errors.push('source_type must be page_evidence');
  const evidence = payload.page_evidence;
  if (!evidence || typeof evidence !== 'object') {
    errors.push('page_evidence is required');
    return { ok: false, errors };
  }
  if (!isHttpUrl(evidence.source_url)) errors.push('source_url must be an absolute http(s) URL');
  const platform = inferPlatform(evidence.source_url, evidence.platform);
  if (!PLATFORMS.includes(platform)) errors.push('platform must be instagram or threads');
  if (typeof evidence.captured_at !== 'string' || Number.isNaN(Date.parse(evidence.captured_at))) {
    errors.push('captured_at must be an ISO date');
  }
  if (typeof evidence.body_text !== 'string') errors.push('body_text must be a string');
  if (typeof evidence.body_text === 'string' && evidence.body_text.length > MAX_BODY_CHARS) {
    errors.push(`body_text must be <= ${MAX_BODY_CHARS} characters`);
  }
  if (evidence.capture_status !== undefined && !['READY', 'INSUFFICIENT_EVIDENCE', 'ACCESS_REQUIRED', 'URL_MISMATCH'].includes(evidence.capture_status)) {
    errors.push('capture_status must be READY, INSUFFICIENT_EVIDENCE, ACCESS_REQUIRED, or URL_MISMATCH');
  }
  if (evidence.capture_status === 'ACCESS_REQUIRED' || isAccessFallbackPage(evidence)) errors.push('PAGE_ACCESS_REQUIRED');
  if (evidence.capture_status === 'URL_MISMATCH' || hasCanonicalPostMismatch(evidence)) errors.push('CANONICAL_POST_MISMATCH');
  if (evidence.page_title !== undefined && typeof evidence.page_title !== 'string') errors.push('page_title must be a string');
  if (evidence.links !== undefined && (!Array.isArray(evidence.links) || evidence.links.length > MAX_LINKS)) {
    errors.push(`links must contain <= ${MAX_LINKS} items`);
  }
  if (evidence.evidence !== undefined && (!Array.isArray(evidence.evidence) || evidence.evidence.length > MAX_EVIDENCE_ITEMS)) {
    errors.push(`evidence must contain <= ${MAX_EVIDENCE_ITEMS} items`);
  }
  for (const [index, item] of (evidence.evidence || []).entries()) {
    if (!item || typeof item !== 'object' || typeof item.text !== 'string' || item.text.length > 2000) {
      errors.push(`evidence[${index}] must contain text <= 2000 characters`);
    }
  }
  for (const [index, link] of (evidence.links || []).entries()) {
    if (!link || typeof link.url !== 'string' || !isHttpUrl(link.url)) errors.push(`links[${index}].url must be an absolute http(s) URL`);
  }
  if (errors.length) return { ok: false, errors };
  const metadataCanonicalUrl = evidence.canonical_url || evidence.source_url;
  const sourceIdentity = postIdentity(evidence.source_url, platform);
  const metadataCanonicalIdentity = postIdentity(metadataCanonicalUrl, platform);
  const canonicalUrl = sourceIdentity && sourceIdentity !== metadataCanonicalIdentity
    ? evidence.source_url
    : metadataCanonicalUrl;
  return {
    ok: true,
    value: {
      ...evidence,
      platform,
      canonical_url: canonicalUrl,
      page_title: evidence.page_title || '',
      body_text: evidence.body_text || '',
      links: evidence.links || [],
      evidence: evidence.evidence || []
    }
  };
}

export function createOpportunityId(sequence) {
  return `opp_local_${String(sequence).padStart(4, '0')}`;
}

export function createIntakeId(sequence) {
  return `intake_local_${String(sequence).padStart(4, '0')}`;
}
