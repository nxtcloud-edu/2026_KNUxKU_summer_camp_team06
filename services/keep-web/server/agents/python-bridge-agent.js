// OWNER: B (신민서)
//
// Node workflow.js가 정규화 단계에서 호출하는 브릿지 클라이언트.
//
// 2026-08-14 이전에는 HTTP(127.0.0.1:5001)로 src/bridge_server.py를 호출했는데,
// Cloud Run은 단일 프로세스 컨테이너라 그 서버가 애초에 떠 있지 않았다 — 즉
// 프로덕션에서는 매번 연결 실패 → GeminiNormalizationAgent 폴백(비결정론적)이
// 상시 경로였다. 실제로 같은 입력을 두 번 넣었을 때 마감 연도가 다르게 나오는
// 버그로 이어졌다 (docs/troubleshooting_and_eval_plan.md 참고).
//
// 고침: server/index.js의 runAgent()가 이미 쓰고 있는 subprocess 패턴을 그대로
// 재사용한다 (server/agent-bridge.py의 `normalize` 커맨드, stdin/stdout JSON).
// 별도 서버 프로세스가 필요 없어서 컨테이너 구성과 무관하게 항상 B의 결정론적
// 파이프라인(정규식 + _verify_grounding)을 탄다. GeminiNormalizationAgent는
// Python 서브프로세스 자체가 죽었을 때만 쓰는 최후 안전망으로 남긴다.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GeminiNormalizationAgent, NormalizationAgent } from './normalization-agent.js';

const AGENTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const KEEP_WEB_ROOT = path.resolve(AGENTS_DIR, '..', '..');
const SCRIPT_PATH = path.join(KEEP_WEB_ROOT, 'server', 'agent-bridge.py');
const PROJECT_PYTHON = path.resolve(KEEP_WEB_ROOT, '..', '..', '.venv', 'bin', 'python');

function defaultSpawn(payload, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const python = process.env.AGENT_PYTHON || (existsSync(PROJECT_PYTHON) ? PROJECT_PYTHON : 'python3');
    const child = spawn(python, [SCRIPT_PATH], {
      cwd: path.resolve(KEEP_WEB_ROOT, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`agent-bridge.py normalize 호출이 ${timeoutMs}ms 안에 끝나지 않았습니다.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr || stdout || 'agent-bridge.py normalize 호출 실패'));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('agent-bridge.py가 올바른 JSON을 반환하지 않았습니다.'));
      }
    });
    child.stdin.end(JSON.stringify({ command: 'normalize', payload }));
  });
}

export class PythonBridgeNormalizationAgent extends NormalizationAgent {
  constructor({ spawnImpl = defaultSpawn, timeoutMs = 15000, fallbackAgent, fetchImpl = globalThis.fetch } = {}) {
    super();
    this.spawnImpl = spawnImpl;
    this.timeoutMs = timeoutMs;
    // Python 서브프로세스 자체가 실패했을 때만 쓰는 최후 안전망 (상시 경로 아님).
    this.fallbackAgent = fallbackAgent || new GeminiNormalizationAgent({ fetchImpl, timeoutMs });
  }

  async normalize(extracted) {
    const fallback = super.normalize(extracted);
    try {
      const result = await this.spawnImpl(extracted, { timeoutMs: this.timeoutMs });
      if (result && result.error) return this.fallbackAgent.normalize(extracted);
      if (!result || typeof result !== 'object') return this.fallbackAgent.normalize(extracted);
      // 브릿지 필드를 우선하되, 혹시 비어있는 필드는 fallback으로 채워 안전망을 유지한다.
      return { ...fallback, ...result };
    } catch {
      return this.fallbackAgent.normalize(extracted);
    }
  }
}
