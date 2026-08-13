import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePageEvidencePayload } from '../shared/contracts.js';
import { InMemoryKeeperStore, SupabaseKeeperStore } from './store.js';
import { SupabaseAuthService } from './auth.js';
import { processIntake } from './workflow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const BODY_LIMIT = 64 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  response.end(JSON.stringify(body));
}

function sendText(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  response.end(body);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw Object.assign(new Error('request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('request body must be valid JSON'), { statusCode: 400 });
  }
}

async function runAgent(command, payload, userId) {
  const result = await new Promise((resolve, reject) => {
    const projectPython = path.resolve(ROOT, '..', '..', '.venv', 'bin', 'python');
    const python = process.env.AGENT_PYTHON || (existsSync(projectPython) ? projectPython : 'python3');
    const child = spawn(python, [path.join(ROOT, 'server', 'agent-bridge.py')], {
      cwd: path.resolve(ROOT, '..'), stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(Object.assign(new Error(stderr || stdout || 'Agent command failed.'), { statusCode: 422 }));
      try { resolve(JSON.parse(stdout)); } catch { reject(Object.assign(new Error('Agent returned invalid JSON.'), { statusCode: 502 })); }
    });
    child.stdin.end(JSON.stringify({ command, ...payload, user_id: userId }));
  });
  if (result.error) throw Object.assign(new Error(result.error), { statusCode: 422 });
  return result;
}

async function serveStatic(requestPath, response) {
  const files = {
    '/': 'web/index.html',
    '/auth/callback': 'web/index.html',
    '/app.js': 'web/app.js',
    '/styles.css': 'web/styles.css',
    '/vendor/supabase.js': 'node_modules/@supabase/supabase-js/dist/umd/supabase.js',
    '/fixtures/instagram.html': 'fixtures/instagram.html',
    '/fixtures/threads.html': 'fixtures/threads.html'
  };
  const relative = files[requestPath];
  if (!relative) return false;
  try {
    const body = await readFile(path.join(ROOT, relative));
    sendText(response, 200, body, MIME_TYPES[path.extname(relative)] || 'application/octet-stream');
  } catch {
    sendText(response, 404, 'Not found');
  }
  return true;
}

function configuredSupabase() {
  return process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY }
    : null;
}

export function createKeeperServer({ port = DEFAULT_PORT, host = process.env.HOST || '0.0.0.0', store, authService } = {}) {
  const supabase = configuredSupabase();
  const keeperStore = store || (supabase ? new SupabaseKeeperStore(supabase) : new InMemoryKeeperStore());
  const auth = authService || (supabase ? new SupabaseAuthService(supabase) : null);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
      });
      response.end();
      return;
    }

    try {
      if (request.method === 'GET' && await serveStatic(url.pathname, response)) return;
      if (request.method === 'GET' && url.pathname === '/v1/auth/config') {
        if (!supabase) {
          return sendJson(response, 503, { error: { code: 'AUTH_NOT_CONFIGURED', message: 'Supabase 인증 설정이 필요합니다.' } });
        }
        sendJson(response, 200, { supabase_url: supabase.url, supabase_anon_key: supabase.anonKey });
        return;
      }
      const session = auth
        ? await auth.authenticate(request.headers)
        : { userId: 'local-test-user', accessToken: null, email: null };
      if (!session) {
        sendJson(response, 401, { error: { code: 'AUTH_REQUIRED', message: 'KEEP:ON 계정 로그인이 필요합니다.' } });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/me') {
        if (typeof keeperStore.ensureProfile === 'function') {
          await keeperStore.ensureProfile(session.userId, session.email ? session.email.split('@')[0] : null, session.accessToken);
        }
        sendJson(response, 200, { user: { id: session.userId, email: session.email } });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/agent/dashboard') {
        sendJson(response, 200, await runAgent('dashboard', await readJson(request), session.userId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/agent/recommendations') {
        sendJson(response, 200, await runAgent('recommend', await readJson(request), session.userId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/agent/evaluate') {
        sendJson(response, 200, await runAgent('evaluate', await readJson(request), session.userId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/agent/execution') {
        sendJson(response, 200, await runAgent('execution', await readJson(request), session.userId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/intakes') {
        const raw = await readJson(request);
        const checked = validatePageEvidencePayload(raw);
        if (!checked.ok) {
          sendJson(response, 422, { error: { code: 'INVALID_PAGE_EVIDENCE', message: '페이지 증거 계약을 확인하세요.', details: checked.errors } });
          return;
        }
        const intake = await keeperStore.createIntake(checked.value, session.userId, session.accessToken);
        setImmediate(() => processIntake(keeperStore, intake.id, session));
        sendJson(response, 202, {
          intake_id: intake.id,
          status: intake.status,
          status_url: `/v1/intakes/${intake.id}`,
          dashboard_url: `/?intake_id=${encodeURIComponent(intake.id)}`
        });
        return;
      }

      const intakeMatch = url.pathname.match(/^\/v1\/intakes\/([^/]+)$/);
      if (request.method === 'GET' && intakeMatch) {
        const intake = await keeperStore.getIntake(intakeMatch[1], session.userId, session.accessToken);
        if (!intake) return sendJson(response, 404, { error: { code: 'INTAKE_NOT_FOUND', message: 'Intake를 찾을 수 없습니다.' } });
        sendJson(response, 200, intake);
        return;
      }

      const cancelMatch = url.pathname.match(/^\/v1\/intakes\/([^/]+)\/cancel$/);
      if (request.method === 'POST' && cancelMatch) {
        const intake = await keeperStore.markCancelled(cancelMatch[1], session.userId, session.accessToken);
        if (!intake) return sendJson(response, 404, { error: { code: 'INTAKE_NOT_FOUND', message: 'Intake를 찾을 수 없습니다.' } });
        sendJson(response, 200, intake);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/opportunities') {
        sendJson(response, 200, { items: await keeperStore.listOpportunities(session.userId, session.accessToken) });
        return;
      }

      const opportunityMatch = url.pathname.match(/^\/v1\/opportunities\/([^/]+)$/);
      if (request.method === 'GET' && opportunityMatch) {
        const opportunity = await keeperStore.getOpportunity(opportunityMatch[1], session.userId, session.accessToken);
        if (!opportunity || opportunity.status === 'DELETED') return sendJson(response, 404, { error: { code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity를 찾을 수 없습니다.' } });
        sendJson(response, 200, opportunity);
        return;
      }

      const confirmMatch = url.pathname.match(/^\/v1\/opportunities\/([^/]+)\/confirm$/);
      if (request.method === 'POST' && confirmMatch) {
        const opportunity = await keeperStore.getOpportunity(confirmMatch[1], session.userId, session.accessToken);
        if (!opportunity || opportunity.status === 'DELETED') return sendJson(response, 404, { error: { code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity를 찾을 수 없습니다.' } });
        const confirmed = await keeperStore.updateOpportunity(opportunity.id, { status: 'CONFIRMED' }, session.userId, session.accessToken);
        sendJson(response, 200, confirmed);
        return;
      }

      if (request.method === 'DELETE' && opportunityMatch) {
        const deleted = await keeperStore.deleteOpportunity(opportunityMatch[1], session.userId, session.accessToken);
        if (!deleted) return sendJson(response, 404, { error: { code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity를 찾을 수 없습니다.' } });
        response.writeHead(204, { 'access-control-allow-origin': '*' });
        response.end();
        return;
      }

      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: '요청 경로를 찾을 수 없습니다.' } });
    } catch (error) {
      const status = error.statusCode || 500;
      sendJson(response, status, { error: { code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'REQUEST_FAILED', message: error.message } });
    }
  });

  return {
    server,
    store: keeperStore,
    start() {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address())));
    },
    stop() {
      return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const app = createKeeperServer();
  app.start().then((address) => {
    const shownHost = typeof address === 'object' && address ? address.address : '127.0.0.1';
    const shownPort = typeof address === 'object' && address ? address.port : DEFAULT_PORT;
    console.log(`Opportunity Keeper local server: http://${shownHost}:${shownPort}`);
    console.log('Fixture: /fixtures/instagram.html and /fixtures/threads.html');
  });
}
