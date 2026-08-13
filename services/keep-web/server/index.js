import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePageEvidencePayload } from '../shared/contracts.js';
import { InMemoryKeeperStore } from './store.js';
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
    'access-control-allow-headers': 'content-type, x-local-test-key',
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

async function serveStatic(requestPath, response) {
  const files = {
    '/': 'web/index.html',
    '/app.js': 'web/app.js',
    '/styles.css': 'web/styles.css',
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

export function createKeeperServer({ port = DEFAULT_PORT, host = '127.0.0.1', store = new InMemoryKeeperStore() } = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, x-local-test-key',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
      });
      response.end();
      return;
    }

    try {
      if (request.method === 'GET' && await serveStatic(url.pathname, response)) return;

      if (request.method === 'POST' && url.pathname === '/v1/intakes') {
        const raw = await readJson(request);
        const checked = validatePageEvidencePayload(raw);
        if (!checked.ok) {
          sendJson(response, 422, { error: { code: 'INVALID_PAGE_EVIDENCE', message: '페이지 증거 계약을 확인하세요.', details: checked.errors } });
          return;
        }
        const intake = store.createIntake(checked.value);
        setImmediate(() => processIntake(store, intake.id));
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
        const intake = store.getIntake(intakeMatch[1]);
        if (!intake) return sendJson(response, 404, { error: { code: 'INTAKE_NOT_FOUND', message: 'Intake를 찾을 수 없습니다.' } });
        sendJson(response, 200, intake);
        return;
      }

      const cancelMatch = url.pathname.match(/^\/v1\/intakes\/([^/]+)\/cancel$/);
      if (request.method === 'POST' && cancelMatch) {
        const intake = store.markCancelled(cancelMatch[1]);
        if (!intake) return sendJson(response, 404, { error: { code: 'INTAKE_NOT_FOUND', message: 'Intake를 찾을 수 없습니다.' } });
        sendJson(response, 200, intake);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/opportunities') {
        sendJson(response, 200, { items: store.listOpportunities() });
        return;
      }

      const opportunityMatch = url.pathname.match(/^\/v1\/opportunities\/([^/]+)$/);
      if (request.method === 'GET' && opportunityMatch) {
        const opportunity = store.getOpportunity(opportunityMatch[1]);
        if (!opportunity || opportunity.status === 'DELETED') return sendJson(response, 404, { error: { code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity를 찾을 수 없습니다.' } });
        sendJson(response, 200, opportunity);
        return;
      }

      const confirmMatch = url.pathname.match(/^\/v1\/opportunities\/([^/]+)\/confirm$/);
      if (request.method === 'POST' && confirmMatch) {
        const opportunity = store.getOpportunity(confirmMatch[1]);
        if (!opportunity || opportunity.status === 'DELETED') return sendJson(response, 404, { error: { code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity를 찾을 수 없습니다.' } });
        opportunity.status = 'CONFIRMED';
        opportunity.updated_at = new Date().toISOString();
        sendJson(response, 200, opportunity);
        return;
      }

      if (request.method === 'DELETE' && opportunityMatch) {
        const deleted = store.deleteOpportunity(opportunityMatch[1]);
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
    store,
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
