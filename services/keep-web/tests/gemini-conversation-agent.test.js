import assert from 'node:assert/strict';
import test from 'node:test';
import { GeminiConversationAgent } from '../server/agents/chat-agent.js';

test('Gemini conversation agent includes recent conversation for follow-up references', async () => {
  let requestBody = null;
  const agent = new GeminiConversationAgent({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '계획입니다.' }] } }] }) };
    },
  });

  const answer = await agent.answer({
    question: '그거 계획 짜줘.',
    profile: {},
    opportunities: [{ id: 'gdg', title: 'Google Developer Group 모집', summary: '개발 커뮤니티 모집' }],
    selectedOpportunity: null,
    recommendation: null,
    conversation: [
      { role: 'user', text: '구글' },
      { role: 'assistant', text: 'Google Developer Group 모집 공고입니다.' },
    ],
  });

  assert.equal(answer, '계획입니다.');
  const context = JSON.parse(requestBody.contents[0].parts[0].text);
  assert.deepEqual(context.conversation, [
    { role: 'user', text: '구글' },
    { role: 'assistant', text: 'Google Developer Group 모집 공고입니다.' },
  ]);
  assert.match(requestBody.systemInstruction.parts[0].text, /그거/);
});
