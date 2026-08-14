const SYSTEM_PROMPT = [
  'You are the KEEP:ON recommendation agent for Korean students and young adults.',
  'Evaluate ONLY the liked saved announcements supplied by the user. Return up to three strongest recommendations; do not add other announcements.',
  'Use only the supplied profile and announcement evidence. Never invent eligibility, deadlines, benefits, or interests.',
  'Each announcement includes deterministic eligibility and feasibility signals. Treat those signals as ground truth: never include eligibility=fail, and call out unknown or not_applicable neutrally instead of guessing.',
  'Score each announcement from 0 to 100 using: interest fit (0-35), eligibility or profile applicability (0-25), feasibility (0-20), deadline urgency (0-10), and actionability or information completeness (0-10).',
  'A heart means the user wants it considered. It is not a score bonus. Missing profile, deadline, or feasibility information must be called out neutrally, not treated as a disqualifier.',
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

function fallbackRecommendations(profile, opportunities, decisionById = new Map()) {
  const interests = (Array.isArray(profile?.interests) ? profile.interests : [])
    .map((interest) => compact(String(interest), 60).toLowerCase()).filter(Boolean);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return opportunities.slice(0, 12).map((item) => {
    const evidence = `${item.title || ''} ${item.category || ''} ${item.summary || item.body || ''}`.toLowerCase();
    const matched = interests.filter((interest) => evidence.includes(interest));
    const decision = decisionById.get(item.id) || {};
    const eligibility = decision.eligibility || {};
    const feasibility = decision.feasibility || {};
    const factors = [];
    let score = 20;
    if (matched.length) {
      score += Math.min(35, matched.length * 18);
      factors.push(`관심사 ${matched.slice(0, 2).join(', ')} 관련`);
    }
    if (eligibility.overall === 'pass') {
      score += 25;
      factors.push('지원 조건 충족');
    } else if (eligibility.overall === 'unknown') {
      score += 12;
      factors.push('지원 조건 확인 필요');
    } else if (eligibility.overall === 'not_applicable') {
      score += 12;
      factors.push('개인 자격 조건 없음');
    }
    if (feasibility.level === 'high') {
      score += 20;
      factors.push('준비 여유 있음');
    } else if (feasibility.level === 'medium') {
      score += 12;
      factors.push('준비 일정 확인');
    } else if (feasibility.level === 'low') {
      score += 3;
      factors.push('일정 여유 확인 필요');
    } else {
      score += 8;
      factors.push('실행 여건 확인 필요');
    }
    if (item.deadline && /^\d{4}-\d{2}-\d{2}$/.test(item.deadline)) {
      const days = Math.ceil((new Date(`${item.deadline}T00:00:00`).getTime() - today.getTime()) / 86400000);
      if (days >= 0 && days <= 14) { score += 10; factors.push('마감 일정 확인'); }
      else if (days >= 0) { score += 5; factors.push('일정 여유 있음'); }
    }
    if (compact(item.summary || item.body, 80)) { score += 10; factors.push('핵심 정보 확인'); }
    const rationale = eligibility.overall === 'unknown'
      ? `지원 조건 일부가 확인되지 않아 원문을 함께 확인하며 추천합니다.`
      : matched.length
      ? `관심사와 공고 내용이 맞아 맞춤 공고로 추천합니다.`
      : `좋아요로 저장한 공고 중 핵심 정보가 확인되어 먼저 살펴볼 만합니다.`;
    return {
      opportunity_id: item.id,
      score: Math.min(100, score),
      label: eligibility.overall === 'unknown' || feasibility.level === 'unknown' ? '검토 필요' : matched.length ? '추천' : '검토 필요',
      rationale,
      factors: factors.length ? factors : ['좋아요한 공고'],
    };
  }).sort((a, b) => b.score - a.score).slice(0, 3)
    .map((item, index) => ({ ...item, rank: index + 1 }));
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

  async recommend({ profile, opportunities, decisionSignals = [] }) {
    if (!this.apiKey) throw new Error('Gemini 추천 에이전트 설정이 없습니다.');
    if (!opportunities?.length) throw new Error('좋아요한 공고가 없습니다.');
    const decisionById = new Map((Array.isArray(decisionSignals) ? decisionSignals : [])
      .filter((signal) => signal && typeof signal.opportunity_id === 'string')
      .map((signal) => [signal.opportunity_id, signal]));
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
        eligibility: decisionById.get(item.id)?.eligibility || { overall: 'unknown', reason: '판정 정보 없음' },
        feasibility: decisionById.get(item.id)?.feasibility || { level: 'unknown', warnings: ['판정 정보 없음'] },
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
      for (const attempt of [
        { strictSchema: true },
        { strictSchema: true, retryForJson: true, concise: true },
      ]) {
        try {
          const raw = await request(attempt);
          if (!raw) throw new Error('Gemini 추천 응답이 비어 있습니다.');
          parsed = parseGeminiJson(raw);
          break;
        } catch {}
      }
      if (!parsed) {
        // Gemini가 추천 내용은 반환했지만 JSON 계약을 지키지 못한 경우에도
        // 사용자는 좋아요한 공고 카드를 바로 확인할 수 있어야 한다.
        return {
          provider: 'fallback',
          liked_opportunity_ids: opportunities.map((item) => item.id),
          recommendations: fallbackRecommendations(profile, opportunities, decisionById),
          follow_up_questions: [],
        };
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
      provider: 'gemini',
      liked_opportunity_ids: opportunities.map((item) => item.id),
      recommendations: recommendations.map((item, index) => ({ ...item, rank: index + 1 })),
      follow_up_questions: (Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions : []).map((question) => compact(question, 120)).filter(Boolean).slice(0, 2),
    };
  }
}
