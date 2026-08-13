import test from 'node:test';
import assert from 'node:assert/strict';

import { PythonBridgeNormalizationAgent } from '../server/agents/python-bridge-agent.js';

test('운영 환경에서 Python 브릿지가 없으면 Gemini 정규화를 사용한다', async () => {
  const fallbackAgent = {
    normalize: async (input) => ({ ...input, title: '고프코어 슈즈 컬렉션 소개', summary: '브랜드별 슈즈 컬렉션을 소개합니다.', normalization_method: 'gemini' })
  };
  const agent = new PythonBridgeNormalizationAgent({
    fetchImpl: async () => { throw new Error('bridge unavailable'); },
    fallbackAgent,
  });
  const result = await agent.normalize({ title: 'sh_seoul_youth', body: 'SALOMON과 Nike 슈즈를 소개합니다.' });
  assert.equal(result.title, '고프코어 슈즈 컬렉션 소개');
  assert.equal(result.normalization_method, 'gemini');
});
