import { CATEGORIES } from '../../shared/contracts.js';

export const NORMALIZATION_SYSTEM_INSTRUCTION = [
  'You are the KEEP:ON normalization agent.',
  'Turn only the provided SNS post evidence into a Korean opportunity card.',
  'Use only facts explicitly present in the supplied title, body, and links.',
  'Never browse, search, infer missing facts, or make up a deadline, benefit, eligibility, or official URL.',
  'category must be Competition, Support, Benefit, or null.',
  'deadline must be YYYY-MM-DD only when the input explicitly states an application deadline or application period end date. A published_at value is never a deadline.',
  'title must name the opportunity or benefit, not the SNS account, author handle, or platform.',
  'author must be an account name or handle only when it is explicitly present in the supplied author candidate, title, or body. Otherwise return null; never use "unknown" or a guessed account.',
  'When page_title is an account name, handle, or generic platform text, write a concise Korean title from the body subject (15 to 60 Korean characters).',
  'summary must be a concise Korean summary of the supplied body, no more than 400 characters.',
  'If a field cannot be confirmed, return null for it. Return JSON only.'
].join('\n');

const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: ['string', 'null'] },
    summary: { type: ['string', 'null'] },
    category: { type: ['string', 'null'], enum: ['Competition', 'Support', 'Benefit', null] },
    deadline: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' }
    ,author: { type: ['string', 'null'] }
  },
  required: ['title', 'summary', 'category', 'deadline', 'author']
};

const CATEGORY_RULES = [
  { category: 'Competition', words: ['공모전', '해커톤', '경진대회', 'competition', 'hackathon', 'contest'] },
  { category: 'Support', words: ['정부지원', '정부 지원', '청년정책', '청년 정책', '취업지원', '취업 지원', '창업지원', '창업 지원', '지원금', '정책', '지원사업', '지원 사업', '지원 대상', '지원 프로그램', '활동 지원금', '교육 프로그램', '프로그램 참가자', '학부생', '모집', '워크숍', 'campus lead', 'student collective', 'grant'] },
  { category: 'Benefit', words: ['할인', '무료', '혜택', '쿠폰', '선물하기', 'benefit', 'discount', 'free'] }
];

function parseDeadline(value) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ');
  const match = normalized.match(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (match) return match[1] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[3]).padStart(2, '0');
  const iso = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return iso ? iso[0] : null;
}

function compact(value, limit = 0) {
  if (typeof value !== 'string') return '';
  const result = value.replace(/\s+/g, ' ').trim();
  return limit ? result.slice(0, limit) : result;
}

function knownAuthor(value) {
  const author = compact(value, 120);
  return /^(unknown|정보 없음|null|n\/a)$/i.test(author) ? '' : author;
}

function summaryFromBody(body) {
  return compact(body.replace(/https?:\/\/\S+/gi, ''), 500);
}

function contentCategory(deadline) {
  // 개인 자격 조건을 추출하지 못한 SNS 저장 항목은 공고 판정 대상으로 보내지 않는다.
  // 마감이 있으면 일정 정보, 없으면 일반 정보로 구분해 C가 '해당 없음'으로 표시한다.
  return deadline ? 'time_sensitive_info' : 'general_info';
}

function ruleBasedNormalize(extracted) {
  const searchable = [extracted.title, extracted.body, extracted.deadline_text].join('\n').toLowerCase();
  const scores = CATEGORY_RULES.map(({ category, words }) => ({
    category,
    score: words.reduce((sum, word) => sum + (searchable.includes(word.toLowerCase()) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score);
  const best = scores[0];
  const category = best && best.score ? best.category : null;
  return {
    canonical_url: extracted.canonical_url,
    source_url: extracted.source_url,
    platform: extracted.platform,
    title: extracted.title,
    summary: summaryFromBody(extracted.body),
    body: extracted.body,
    author: knownAuthor(extracted.author),
    published_at: extracted.published_at,
    category: CATEGORIES.includes(category) ? category : null,
    deadline: parseDeadline(extracted.deadline_text),
    links: extracted.links,
    evidence: extracted.evidence,
    thumbnail_url: extracted.thumbnail_url || null,
    confidence: category ? Math.min(0.98, 0.7 + best.score * 0.1) : 0.2,
    normalization_method: 'rules',
    content_category: contentCategory(parseDeadline(extracted.deadline_text)),
    conditions: [],
    status: 'ok'
  };
}

function normalizeGeminiResult(result, fallback) {
  const category = CATEGORIES.includes(result && result.category) ? result.category : fallback.category;
  const title = compact(result && result.title, 180) || fallback.title;
  const summary = compact(result && result.summary, 500) || fallback.summary;
  const deadline = typeof (result && result.deadline) === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result.deadline)
    ? result.deadline
    : fallback.deadline;
  return {
    ...fallback,
    title,
    summary,
    category,
    deadline,
    author: knownAuthor(result && result.author) || fallback.author,
    confidence: category ? 0.85 : fallback.confidence,
    normalization_method: 'gemini',
    content_category: contentCategory(deadline),
    conditions: [],
    status: 'ok'
  };
}

function promptFor(extracted) {
  return JSON.stringify({
    source_url: extracted.source_url,
    platform: extracted.platform,
    page_title: extracted.title,
    author_candidate: knownAuthor(extracted.author) || null,
    body_text: extracted.body,
    deadline_text: extracted.deadline_text || null,
    links: (extracted.links || []).map(({ url, label }) => ({ url, label })).slice(0, 10)
  });
}

export class NormalizationAgent {
  normalize(extracted) {
    return ruleBasedNormalize(extracted);
  }
}

export class GeminiNormalizationAgent extends NormalizationAgent {
  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    fetchImpl = globalThis.fetch,
    timeoutMs = 12000,
    requireGemini = process.env.REQUIRE_GEMINI === 'true'
  } = {}) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.requireGemini = requireGemini;
  }

  async normalize(extracted) {
    const fallback = super.normalize(extracted);
    if (!this.apiKey || !compact(extracted.body, 20)) {
      if (this.requireGemini) throw new Error('Gemini 정규화에 필요한 본문 또는 서버 설정이 없습니다.');
      return fallback;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/'
        + encodeURIComponent(this.model) + ':generateContent?key=' + encodeURIComponent(this.apiKey);
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: NORMALIZATION_SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: promptFor(extracted) }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseJsonSchema: GEMINI_RESPONSE_SCHEMA
          }
        })
      });
      if (!response.ok) throw new Error('Gemini request failed (' + response.status + ')');
      const payload = await response.json();
      const text = (payload.candidates && payload.candidates[0] && payload.candidates[0].content && payload.candidates[0].content.parts || [])
        .map((part) => part.text || '')
        .join('')
        .trim();
      if (!text) throw new Error('Gemini returned an empty response');
      return normalizeGeminiResult(JSON.parse(text), fallback);
    } catch (error) {
      if (this.requireGemini) throw error;
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }
}
