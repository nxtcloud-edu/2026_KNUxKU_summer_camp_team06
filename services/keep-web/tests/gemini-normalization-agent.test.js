import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiNormalizationAgent, NORMALIZATION_SYSTEM_INSTRUCTION } from '../server/agents/normalization-agent.js';

function extracted() {
  return {
    source_url: 'https://www.threads.com/@local/post/student-program',
    canonical_url: 'https://www.threads.com/@local/post/student-program',
    platform: 'threads',
    title: 'Threads의 작성자님',
    body: '오픈AI가 대학생을 대상으로 Student Collective 프로그램 참가자를 모집합니다. 지원 마감은 2026년 8월 10일입니다.',
    author: 'local',
    published_at: '2026-08-01T00:00:00.000Z',
    deadline_text: '지원 마감은 2026년 8월 10일입니다.',
    links: [{ url: 'https://openai.com/student-collective/', label: '공식 안내' }],
    evidence: [{ source: 'dom', locator: 'article', text: '오픈AI가 대학생을 대상으로 Student Collective 프로그램 참가자를 모집합니다.' }]
  };
}

test('Gemini Agent는 구조화 JSON을 카드 필드로 정규화한다', async () => {
  let request = null;
  const agent = new GeminiNormalizationAgent({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  title: 'OpenAI Student Collective 참가자 모집',
                  summary: '대학생 대상 OpenAI Student Collective 프로그램 참가자를 모집합니다.',
                  category: 'Support',
                  deadline: '2026-08-10'
                })
              }]
            }
          }]
        })
      };
    }
  });

  const result = await agent.normalize(extracted());
  assert.equal(result.normalization_method, 'gemini');
  assert.equal(result.title, 'OpenAI Student Collective 참가자 모집');
  assert.equal(result.category, 'Support');
  assert.equal(result.deadline, '2026-08-10');
  assert.equal(result.body, extracted().body);
  assert.match(request.systemInstruction.parts[0].text, /Never browse/);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.equal(NORMALIZATION_SYSTEM_INSTRUCTION.includes('published_at value is never a deadline'), true);
});

test('Gemini 오류 시 규칙 기반 정규화 결과로 복구한다', async () => {
  const agent = new GeminiNormalizationAgent({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
  });

  const result = await agent.normalize(extracted());
  assert.equal(result.normalization_method, 'rules');
  assert.equal(result.category, 'Support');
  assert.equal(result.deadline, '2026-08-10');
});

test('운영 strict 모드에서는 Gemini 오류를 규칙 기반 결과로 숨기지 않는다', async () => {
  const agent = new GeminiNormalizationAgent({
    apiKey: 'test-key',
    requireGemini: true,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
  });
  await assert.rejects(() => agent.normalize(extracted()), /Gemini request failed/);
});
