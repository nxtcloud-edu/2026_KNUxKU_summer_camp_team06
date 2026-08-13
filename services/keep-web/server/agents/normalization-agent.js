import { CATEGORIES } from '../../shared/contracts.js';

const CATEGORY_RULES = [
  { category: 'Competition', words: ['공모전', '해커톤', '경진대회', 'competition', 'hackathon', 'contest'] },
  { category: 'Support', words: ['정부지원', '정부 지원', '청년정책', '청년 정책', '취업지원', '취업 지원', '창업지원', '창업 지원', '지원금', '정책', '지원사업', '지원 사업', '지원 대상', '지원 프로그램', '활동 지원금', '교육 프로그램', '프로그램 참가자', '학부생', '모집', '워크숍', 'campus lead', 'student collective', 'grant'] },
  { category: 'Benefit', words: ['할인', '무료', '혜택', '쿠폰', '선물하기', 'benefit', 'discount', 'free'] }
];

function parseDeadline(value) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ');
  const match = normalized.match(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  const iso = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  return null;
}

export class NormalizationAgent {
  normalize(extracted) {
    const searchable = `${extracted.title}\n${extracted.body}\n${extracted.deadline_text}`.toLowerCase();
    const scores = CATEGORY_RULES.map(({ category, words }) => ({
      category,
      score: words.reduce((sum, word) => sum + (searchable.includes(word.toLowerCase()) ? 1 : 0), 0)
    })).sort((a, b) => b.score - a.score);
    const best = scores[0];
    const category = best?.score ? best.category : null;
    // 게시일(예: 2025-05-07)을 마감일로 추정하지 않는다. 마감 키워드가
    // 붙은 deadline_text만 마감일 후보로 인정한다.
    const deadline = parseDeadline(extracted.deadline_text);
    const summary = extracted.body
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 500);
    return {
      canonical_url: extracted.canonical_url,
      source_url: extracted.source_url,
      platform: extracted.platform,
      title: extracted.title,
      summary,
      body: extracted.body,
      author: extracted.author,
      published_at: extracted.published_at,
      category: CATEGORIES.includes(category) ? category : null,
      deadline,
      links: extracted.links,
      evidence: extracted.evidence,
      confidence: category ? Math.min(0.98, 0.7 + best.score * 0.1) : 0.2
    };
  }
}
