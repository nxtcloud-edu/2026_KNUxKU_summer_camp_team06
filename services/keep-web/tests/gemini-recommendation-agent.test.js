import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiRecommendationAgent } from '../server/agents/recommendation-agent.js';

test('Gemini 추천 에이전트는 좋아요한 공고만 점수순 카드 데이터로 반환한다', async () => {
  let request = null;
  const agent = new GeminiRecommendationAgent({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        recommendations: [
          { opportunity_id: 'liked-1', score: 68, label: '추천', rationale: '관심사와 교육 주제가 맞고 마감일이 확인됩니다.', factors: ['AI 관심사', '마감 확인'] },
          { opportunity_id: 'not-liked', score: 99, label: '지금 확인', rationale: '포함되면 안 됩니다.', factors: [] },
          { opportunity_id: 'liked-2', score: 82, label: '지금 확인', rationale: '프로필과 공고 내용이 잘 맞습니다.', factors: ['프로필 적합'] },
        ], follow_up_questions: ['어떤 공고부터 계획을 세울까요?'],
      }) }] } }] }) };
    },
  });
  const result = await agent.recommend({
    profile: { interests: ['AI'] },
    opportunities: [
      { id: 'liked-1', title: 'AI 교육 공고', summary: '교육', body: 'AI 교육 참가자 모집', deadline: '2026-08-20' },
      { id: 'liked-2', title: 'AI 해커톤', summary: '해커톤', body: 'AI 해커톤 참가자 모집', deadline: null },
    ],
  });

  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.match(request.systemInstruction.parts[0].text, /heart means the user wants it considered/i);
  assert.deepEqual(result.recommendations.map((item) => item.opportunity_id), ['liked-2', 'liked-1']);
  assert.deepEqual(result.recommendations.map((item) => item.rank), [1, 2]);
  assert.equal(result.recommendations[0].score, 82);
});

test('Gemini 추천 에이전트는 코드 펜스로 감싼 JSON도 처리한다', async () => {
  const agent = new GeminiRecommendationAgent({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, json: async () => ({
      candidates: [{ content: { parts: [{ text: '```json\n{"recommendations":[{"opportunity_id":"saved-1","score":80,"label":"추천","rationale":"저장한 공고의 핵심 내용이 분명합니다.","factors":["정보가 구체적"]}],"follow_up_questions":[]}\n```' }] } }],
    }) }),
  });
  const result = await agent.recommend({ profile: {}, opportunities: [{ id: 'saved-1', title: '테스트 공고' }] });
  assert.equal(result.recommendations[0].opportunity_id, 'saved-1');
});

test('Gemini 추천 에이전트는 형식 오류 뒤 JSON 전용 요청으로 재시도한다', async () => {
  let calls = 0;
  const agent = new GeminiRecommendationAgent({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      calls += 1;
      const request = JSON.parse(options.body);
      if (calls === 1) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '추천 결과입니다.' }] } }] }) };
      assert.match(request.contents[0].parts[0].text, /JSON 객체만 반환/);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"recommendations":[{"opportunity_id":"saved-1","score":71,"label":"추천","rationale":"공고 내용이 확인됩니다.","factors":[]}],"follow_up_questions":[]}' }] } }] }) };
    },
  });
  const result = await agent.recommend({ profile: {}, opportunities: [{ id: 'saved-1', title: '테스트 공고' }] });
  assert.equal(calls, 2);
  assert.equal(result.recommendations[0].score, 71);
});

test('Gemini 요청이 중단돼도 새 요청으로 한 번 더 추천한다', async () => {
  let calls = 0;
  const agent = new GeminiRecommendationAgent({
    apiKey: 'test-key', timeoutMs: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new DOMException('The operation was aborted', 'AbortError');
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"recommendations":[{"opportunity_id":"saved-1","score":75,"label":"추천","rationale":"관심사와 내용이 맞습니다.","factors":[]}],"follow_up_questions":[]}' }] } }] }) };
    },
  });
  const result = await agent.recommend({ profile: { interests: ['AI'] }, opportunities: [{ id: 'saved-1', title: 'AI 공고' }] });
  assert.equal(calls, 2);
  assert.equal(result.recommendations[0].score, 75);
});
