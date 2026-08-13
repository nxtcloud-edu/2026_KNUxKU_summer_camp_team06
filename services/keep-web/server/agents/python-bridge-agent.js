// OWNER: B (신민서)
//
// Node workflow.js가 정규화 단계에서 호출하는 브릿지 클라이언트.
// GeminiNormalizationAgent와 같은 패턴(NormalizationAgent를 상속해 로컬 규칙 기반
// fallback을 항상 확보)을 따른다 — Python 브릿지 서버(src/bridge_server.py, 기본
// 포트 5001)가 꺼져있거나(테스트/CI 환경 등) 네트워크 오류가 나도 워크플로우가
// 통째로 실패하지 않고 fallback으로 계속 진행된다.
//
// 브릿지가 살아있을 때는 8종 자격조건 구조화(raw_quote/span 근거 포함)와
// content_category 분류를 Node에서 다시 구현하지 않고 그대로 위임한다.
// 자세한 이유는 docs/merge_plan_a_b.md 참고.

import { GeminiNormalizationAgent, NormalizationAgent } from './normalization-agent.js';

const DEFAULT_BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:5001/normalize';

export class PythonBridgeNormalizationAgent extends NormalizationAgent {
  constructor({
    bridgeUrl = DEFAULT_BRIDGE_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15000,
    fallbackAgent
  } = {}) {
    super();
    this.bridgeUrl = bridgeUrl;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    // Cloud Run에서는 Python HTTP 브릿지를 별도 프로세스로 띄우지 않는다.
    // 따라서 브릿지 미연결 시에도 서버에만 있는 Gemini 키로 제목·요약을 정리한다.
    this.fallbackAgent = fallbackAgent || new GeminiNormalizationAgent({ fetchImpl, timeoutMs });
  }

  async normalize(extracted) {
    const fallback = super.normalize(extracted);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.bridgeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(extracted)
      });
      if (!response.ok) return this.fallbackAgent.normalize(extracted);
      const result = await response.json();
      if (!result || typeof result !== 'object') return this.fallbackAgent.normalize(extracted);
      // 브릿지 필드를 우선하되, 혹시 비어있는 필드는 fallback으로 채워 안전망을 유지한다.
      return { ...fallback, ...result };
    } catch {
      return this.fallbackAgent.normalize(extracted);
    } finally {
      clearTimeout(timer);
    }
  }
}
