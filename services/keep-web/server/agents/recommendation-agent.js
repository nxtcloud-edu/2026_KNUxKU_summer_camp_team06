const SYSTEM_PROMPT = [
  'You are the KEEP:ON recommendation agent for Korean students and young adults.',
  'Evaluate ONLY the liked saved announcements supplied by the user. Rank every supplied announcement; do not add other announcements.',
  'Use only the supplied profile and announcement evidence. Never invent eligibility, deadlines, benefits, or interests.',
  'Score each announcement from 0 to 100 using: interest fit (0-35), profile applicability (0-25), deadline urgency (0-20), and actionability or information completeness (0-20).',
  'A heart means the user wants it considered. It is not a score bonus. Missing profile or deadline information must be called out neutrally, not treated as a disqualifier.',
  'Return Korean JSON only: {"recommendations":[{"opportunity_id":"...","score":0,"label":"지금 확인|추천|검토 필요","rationale":"complete Korean sentence","factors":["...","..."]}],"follow_up_questions":["..."]}.',
  'Keep rationale and factors concise, factual, and complete. Return every supplied opportunity exactly once.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          opportunity_id: { type: 'STRING' },
          score: { type: 'NUMBER' },
          label: { type: 'STRING', enum: ['지금 확인', '추천', '검토 필요'] },
          rationale: { type: 'STRING' },
          factors: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['opportunity_id', 'score', 'label', 'rationale', 'factors'],
      },
    },
    follow_up_questions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['recommendations', 'follow_up_questions'],
};

function compact(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function clampScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
}

export class GeminiRecommendationAgent {
  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    fetchImpl = globalThis.fetch,
    timeoutMs = 22000,
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async recommend({ profile, opportunities }) {
    if (!this.apiKey) throw new Error('Gemini 추천 에이전트 설정이 없습니다.');
    if (!opportunities?.length) throw new Error('좋아요한 공고가 없습니다.');
    const context = {
      profile: profile || {},
      liked_announcements: opportunities.map((item) => ({
        id: item.id,
        title: compact(item.title, 220),
        category: item.category || null,
        author: compact(item.author, 100) || null,
        deadline: item.deadline || null,
        summary: compact(item.summary, 700),
        body: compact(item.body, 1800),
        source_url: item.source_url || item.canonical_url || null,
      })),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const request = async (strictSchema) => {
        const response = await this.fetchImpl(endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(context) }] }],
            generationConfig: {
              temperature: 0.1, maxOutputTokens: 1800, responseMimeType: 'application/json',
              ...(strictSchema ? { responseSchema: RESPONSE_SCHEMA } : {}),
            },
          }),
        });
        if (!response.ok) throw new Error(`Gemini 추천 요청 실패 (${response.status})`);
        const payload = await response.json();
        return (payload.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
      };
      let raw = '';
      try { raw = await request(true); } catch { raw = await request(false); }
      if (!raw) throw new Error('Gemini 추천 응답이 비어 있습니다.');
      const parsed = JSON.parse(raw);
      const allowedIds = new Set(opportunities.map((item) => item.id));
      const seen = new Set();
      const recommendations = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
        .filter((item) => item && allowedIds.has(item.opportunity_id) && !seen.has(item.opportunity_id) && seen.add(item.opportunity_id))
        .map((item) => ({
          opportunity_id: item.opportunity_id,
          score: clampScore(item.score),
          label: ['지금 확인', '추천', '검토 필요'].includes(item.label) ? item.label : '검토 필요',
          rationale: compact(item.rationale, 300),
          factors: (Array.isArray(item.factors) ? item.factors : []).map((factor) => compact(factor, 120)).filter(Boolean).slice(0, 4),
        }))
        .filter((item) => item.score !== null && item.rationale);
      if (!recommendations.length) throw new Error('Gemini가 유효한 추천 결과를 만들지 못했습니다.');
      recommendations.sort((a, b) => b.score - a.score);
      return {
        liked_opportunity_ids: opportunities.map((item) => item.id),
        recommendations: recommendations.map((item, index) => ({ ...item, rank: index + 1 })),
        follow_up_questions: (Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions : []).map((question) => compact(question, 120)).filter(Boolean).slice(0, 2),
      };
    } finally { clearTimeout(timer); }
  }
}
