function compact(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function firstMeaningfulLine(value) {
  return compact(value)
    .split('\n')
    .map((line) => line.trim().replace(/^\d+\s*\/\s*/, ''))
    .find((line) => line && !/^https?:\/\//i.test(line)) || '';
}

function isGenericPlatformTitle(title, platform) {
  const value = compact(title).toLowerCase();
  return !value
    || new RegExp(`^(threads|instagram)(의|에서| )`, 'i').test(value)
    || /on (threads|instagram)$/i.test(value)
    || value === platform;
}

class PlatformExtractionAgent {
  constructor(platform) {
    this.platform = platform;
  }

  extract(pageEvidence) {
    const body = compact(pageEvidence.body_text);
    const suppliedTitle = compact(pageEvidence.page_title);
    const title = isGenericPlatformTitle(suppliedTitle, this.platform)
      ? firstMeaningfulLine(body) || suppliedTitle || `${this.platform} 저장 항목`
      : suppliedTitle || firstMeaningfulLine(body) || `${this.platform} 저장 항목`;
    const evidence = Array.isArray(pageEvidence.evidence) ? pageEvidence.evidence : [];
    return {
      platform: this.platform,
      source_url: pageEvidence.source_url,
      canonical_url: pageEvidence.canonical_url || pageEvidence.source_url,
      title,
      body,
      author: compact(pageEvidence.author, 'unknown'),
      published_at: pageEvidence.published_at || null,
      deadline_text: compact(pageEvidence.deadline_text, body.match(/(?:마감|접수기간|신청기간|deadline)[^\n]*/i)?.[0] || ''),
      thumbnail_url: compact(pageEvidence.thumbnail_url),
      thumbnail_kind: pageEvidence.thumbnail_url ? 'image' : null,
      links: pageEvidence.links || [],
      evidence
    };
  }
}

export class InstagramExtractionAgent extends PlatformExtractionAgent {
  constructor() {
    super('instagram');
  }
}

export class ThreadsExtractionAgent extends PlatformExtractionAgent {
  constructor() {
    super('threads');
  }
}

export function createPlatformAgent(platform) {
  if (platform === 'instagram') return new InstagramExtractionAgent();
  if (platform === 'threads') return new ThreadsExtractionAgent();
  return null;
}
