const SYSTEM_PROMPT = [
  'You are the KEEP:ON recommendation agent for Korean students and young adults.',
  'Evaluate ONLY the liked saved announcements supplied by the user. Return up to three strongest recommendations; do not add other announcements.',
  'Use only the supplied profile and announcement evidence. Never invent eligibility, deadlines, benefits, or interests.',
  'Score each announcement from 0 to 100 using: interest fit (0-35), profile applicability (0-25), deadline urgency (0-20), and actionability or information completeness (0-20).',
  'A heart means the user wants it considered. It is not a score bonus. Missing profile or deadline information must be called out neutrally, not treated as a disqualifier.',
  'Return Korean JSON only: {"recommendations":[{"opportunity_id":"...","score":0,"label":"지금 확인|추천|검토 필요","rationale":"complete Korean sentence","factors":["...","..."]}],"follow_up_questions":["..."]}.',
  'Keep rationale and factors concise, factual, and complete.',
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

function parseGeminiJson(value) {
  const raw = compact(value, 20_000);
  const unwrapped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(unwrapped); } catch {
    // Gemini 2.5는 내부 사고 텍스트와 최종 JSON을 같은 응답에 넣을 수 있다.
    // 중괄호가 사고 문장에 있어도 최종 JSON 객체를 찾아 읽는다.
    const candidates = [];
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < unwrapped.length; index += 1) {
      const char = unwrapped[index];
      if (quoted) {
        escaped = char === '\\' && !escaped;
        if (char === '"' && !escaped) quoted = false;
        if (char !== '\\') escaped = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') { if (depth === 0) start = index; depth += 1; continue; }
      if (char === '}' && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          try {
            const candidate = JSON.parse(unwrapped.slice(start, index + 1));
            if (Array.isArray(candidate.recommendations)) candidates.push(candidate);
          } catch {}
          start = -1;
        }
      }
    }
    if (candidates.length) return candidates.at(-1);
    throw new Error('Gemini 추천 응답의 JSON 형식이 올바르지 않습니다.');
  }
}

function finalResponseText(payload) {
  const parts = payload.candidates?.[0]?.content?.parts || [];
  // 사고 과정(thought)은 사용자의 추천 결과도 아니고 JSON 파싱 대상도 아니다.
  return parts.filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text).join('').trim();
}

export class GeminiRecommendationAgent {
  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    fetchImpl = globalThis.fetch,
    timeoutMs = 15000,
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
      // 추천 카드는 최대 3개만 보여주므로, 긴 원문을 통째로 전송하지 않는다.
      // Gemini 지연으로 전체 추천이 취소되는 것을 막기 위해 최근 좋아요 12개까지만 비교한다.
      liked_announcements: opportunities.slice(0, 12).map((item) => ({
        id: item.id,
        title: compact(item.title, 220),
        category: item.category || null,
        author: compact(item.author, 100) || null,
        deadline: item.deadline || null,
        summary: compact(item.summary || item.body, 450),
      })),
    };
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const request = async ({ strictSchema, retryForJson = false, concise = false }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const promptContext = concise
          ? {
            profile: context.profile,
            liked_announcements: context.liked_announcements.map(({ id, title, category, deadline, summary }) => ({ id, title, category, deadline, summary })),
          }
          : context;
        try {
          const response = await this.fetchImpl(endpoint, {
            method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: [{ role: 'user', parts: [{ text: `${JSON.stringify(promptContext)}${retryForJson ? '\n\n이전 응답은 형식이 맞지 않았습니다. 최대 3개의 공고만 포함한 JSON 객체만 반환하세요. 설명, Markdown, 코드 펜스는 쓰지 마세요.' : ''}` }] }],
              generationConfig: {
                temperature: 0.1, maxOutputTokens: 1200, responseMimeType: 'application/json',
                ...(strictSchema ? { responseSchema: RESPONSE_SCHEMA } : {}),
              },
            }),
          });
          if (!response.ok) throw new Error(`Gemini 추천 요청 실패 (${response.status})`);
          const payload = await response.json();
          return finalResponseText(payload);
        } finally { clearTimeout(timer); }
      };
      let parsed;
      let lastError;
      for (const attempt of [
        { strictSchema: true },
        { strictSchema: true, retryForJson: true, concise: true },
      ]) {
        try {
          const raw = await request(attempt);
          if (!raw) throw new Error('Gemini 추천 응답이 비어 있습니다.');
          parsed = parseGeminiJson(raw);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!parsed) {
        if (lastError?.name === 'AbortError' || /aborted/i.test(lastError?.message || '')) {
          throw new Error('Gemini 추천 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
        }
        throw lastError || new Error('Gemini 추천 결과를 만들지 못했습니다.');
      }
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
  }
}
