const SYSTEM_PROMPT = [
  'You are the KEEP:ON conversation agent for Korean students and young adults.',
  'Answer in Korean using only the supplied user profile, saved opportunities, selected opportunity, and recommendation evidence.',
  'In Korean UI wording, call saved opportunities "공고" rather than "기회" whenever describing a saved announcement.',
  'Your role is to route naturally among: saved-information explanation, profile-fit recommendation, eligibility explanation, deadline/action guidance, and planning guidance.',
  'Never invent a requirement, deadline, source link, score, or recommendation reason.',
  'If evidence is missing, say what is not confirmed and suggest the next useful action.',
  'Keep answers practical and concise: use short paragraphs or bullets when helpful.',
  'Always finish the answer as a complete Korean response. If the answer would be long, use at most five bullets and never stop mid-sentence.',
].join('\n');

function compact(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

export class GeminiConversationAgent {
  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    fetchImpl = globalThis.fetch,
    timeoutMs = 18000,
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async answer({ question, profile, opportunities, selectedOpportunity, recommendation }) {
    if (!this.apiKey) throw new Error('Gemini 대화 에이전트 설정이 없습니다.');
    const context = {
      question: compact(question, 1000),
      profile: profile || {},
      selected_opportunity: selectedOpportunity || null,
      liked_recommendation: recommendation || null,
      saved_opportunities: (opportunities || []).slice(0, 30).map((item) => ({
        id: item.id, title: compact(item.title, 180), category: item.category || null,
        author: compact(item.author, 100) || null, deadline: item.deadline || null,
        summary: compact(item.summary, 500), body: compact(item.body, 1200), source_url: item.source_url || item.canonical_url || null,
      })),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await this.fetchImpl(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(context) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1800 },
        }),
      });
      if (!response.ok) throw new Error(`Gemini 대화 요청 실패 (${response.status})`);
      const payload = await response.json();
      const answer = (payload.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
      if (!answer) throw new Error('Gemini 대화 응답이 비어 있습니다.');
      return answer;
    } finally { clearTimeout(timer); }
  }
}
