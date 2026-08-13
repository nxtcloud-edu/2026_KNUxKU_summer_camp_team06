import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeeperServer } from '../server/index.js';

async function waitForTerminal(baseUrl, intakeId, accessToken = '') {
  const terminal = new Set(['READY_FOR_REVIEW', 'NEEDS_REVIEW', 'UNSUPPORTED', 'FAILED', 'CANCELLED']);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/v1/intakes/${intakeId}`, {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}
    });
    const intake = await response.json();
    if (terminal.has(intake.status)) return intake;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Intake ${intakeId} did not reach a terminal state`);
}

function payload({ platform, url, title, body, categoryText }) {
  return {
    source_type: 'page_evidence',
    page_evidence: {
      source_url: url,
      canonical_url: url,
      platform,
      captured_at: new Date().toISOString(),
      page_title: title,
      body_text: `${body}\n${categoryText}`,
      deadline_text: body.match(/마감[^\n]*/)?.[0] || '',
      evidence: [{ source: 'dom', locator: 'article', text: body }],
      links: [{ url: 'https://example.com/official', label: '공식 안내' }]
    }
  };
}

test('Keep payload가 Agent를 거쳐 웹 목록에 나타난다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const instagram = payload({
    platform: 'instagram',
    url: 'https://www.instagram.com/p/competition-fixture',
    title: '청년 창업 아이디어 공모전',
    body: '대학생 대상 공모전입니다. 마감 2026년 9월 30일까지.',
    categoryText: 'Competition'
  });
  const accepted = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(instagram)
  });
  assert.equal(accepted.status, 202);
  const acceptedBody = await accepted.json();
  const intake = await waitForTerminal(baseUrl, acceptedBody.intake_id);
  assert.equal(intake.status, 'READY_FOR_REVIEW');

  const listResponse = await fetch(`${baseUrl}/v1/opportunities`);
  const list = await listResponse.json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].platform, 'instagram');
  assert.equal(list.items[0].category, 'Competition');
  assert.equal(list.items[0].deadline, '2026-09-30');
  assert.equal(list.items[0].normalization_method, 'rules');
  assert.equal(list.items[0].intake_id, acceptedBody.intake_id);
  const normalizations = app.store.listNormalizedOpportunities('local-test-user');
  assert.equal(normalizations.length, 1);
  assert.equal(normalizations[0].opportunity_id, list.items[0].id);
});

test('직접 입력 텍스트도 Intake를 거쳐 개인 저장 목록에 정리된다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const response = await fetch(`${baseUrl}/v1/intakes/source`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_type: 'text', source_text: '대학생 대상 AI 해커톤입니다. 접수 마감은 2026년 9월 30일입니다.' })
  });
  assert.equal(response.status, 202);
  const accepted = await response.json();
  const intake = await waitForTerminal(baseUrl, accepted.intake_id);
  assert.equal(intake.status, 'READY_FOR_REVIEW');
  const list = await (await fetch(`${baseUrl}/v1/opportunities`)).json();
  assert.equal(list.items[0].platform, 'direct');
  assert.equal(list.items[0].deadline, '2026-09-30');
});

test('Threads 분류와 동일 URL 중복 방지를 확인한다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const threads = payload({
    platform: 'threads',
    url: 'https://www.threads.net/@local/post/benefit-fixture',
    title: '대학생 무료 혜택',
    body: '학생 인증 시 무료로 이용할 수 있는 할인 혜택입니다.',
    categoryText: 'Benefit'
  });
  const send = () => fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(threads)
  });
  const first = await (await send()).json();
  const firstIntake = await waitForTerminal(baseUrl, first.intake_id);
  assert.equal(firstIntake.status, 'READY_FOR_REVIEW');
  const second = await (await send()).json();
  const secondIntake = await waitForTerminal(baseUrl, second.intake_id);
  assert.equal(secondIntake.status, 'READY_FOR_REVIEW');

  const list = await (await fetch(`${baseUrl}/v1/opportunities`)).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].platform, 'threads');
  assert.equal(list.items[0].category, 'Benefit');
  assert.equal(firstIntake.opportunity_id, secondIntake.opportunity_id);
  assert.equal(list.items[0].title, '대학생 무료 혜택');
});

test('근거 부족 입력도 최소 카드와 NEEDS_REVIEW로 보존한다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const response = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source_type: 'page_evidence',
      page_evidence: {
        source_url: 'https://www.threads.net/@local/post/insufficient',
        platform: 'threads',
        captured_at: new Date().toISOString(),
        page_title: '',
        body_text: '',
        evidence: []
      }
    })
  });
  const accepted = await response.json();
  const intake = await waitForTerminal(baseUrl, accepted.intake_id);
  assert.equal(intake.status, 'NEEDS_REVIEW');
  const detail = await (await fetch(`${baseUrl}/v1/opportunities`)).json();
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0].needs_review, true);
  assert.equal(detail.items[0].source_url, 'https://www.threads.net/@local/post/insufficient');
});

test('Threads OG 본문을 제목·내용으로 쓰고 게시일을 마감일로 오인하지 않는다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const response = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source_type: 'page_evidence',
      page_evidence: {
        source_url: 'https://www.threads.com/@choi.openai/post/DJWWfIDv2SN/long-slug',
        canonical_url: 'https://www.threads.com/@choi.openai/post/DJWWfIDv2SN',
        platform: 'threads',
        captured_at: new Date().toISOString(),
        page_title: 'Threads의 CHOI(@choi.openai)님',
        author: 'choi.openai',
        body_text: '3/ 대학생들 노트정리 위해서 노션 많이 사용하시죠?!\n교육 플랜으로 사용해서 플러스 기능 무료로 사용해보세요.\nhttps://www.notion.com/ko/help/notion-for-education',
        published_at: '2025-05-07T10:37:01.000Z',
        deadline_text: '',
        links: [{ url: 'https://www.notion.com/ko/help/notion-for-education', label: 'Notion for education' }],
        evidence: [{ source: 'og', locator: 'meta[property="og:description"]', text: '3/ 대학생들 노트정리 위해서 노션 많이 사용하시죠?! 교육 플랜으로 사용해서 플러스 기능 무료로 사용해보세요.' }]
      }
    })
  });
  const accepted = await response.json();
  const intake = await waitForTerminal(baseUrl, accepted.intake_id);
  assert.equal(intake.status, 'READY_FOR_REVIEW');

  const list = await (await fetch(`${baseUrl}/v1/opportunities`)).json();
  const item = list.items[0];
  assert.equal(item.title, '대학생들 노트정리 위해서 노션 많이 사용하시죠?!');
  assert.match(item.summary, /교육 플랜으로 사용해서 플러스 기능 무료로 사용해보세요/);
  assert.doesNotMatch(item.summary, /https?:\/\//);
  assert.equal(item.published_at, '2025-05-07T10:37:01.000Z');
  assert.equal(item.deadline, null);
  assert.equal(item.canonical_url, 'https://www.threads.com/@choi.openai/post/DJWWfIDv2SN');
  assert.equal(item.links[0].url, 'https://www.notion.com/ko/help/notion-for-education');
});

test('Threads 학생 프로그램 본문은 Support로 정규화하고 마감일 없이도 READY가 된다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const response = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source_type: 'page_evidence',
      page_evidence: {
        source_url: 'https://www.threads.com/@choi.openai/post/DbWnfnGAGrg',
        canonical_url: 'https://www.threads.com/@choi.openai/post/DbWnfnGAGrg',
        platform: 'threads',
        captured_at: new Date().toISOString(),
        page_title: 'CHOI (@choi.openai) on Threads',
        author: 'choi.openai',
        body_text: '대학생이라면 참고해보세요. 좋은 기회가 될 것 같습니다.\n오픈AI가 대학생을 대상으로 OpenAI Student Collective 프로그램 참가자를 모집합니다.\n참가자에게는 ChatGPT 구독, Codex 크레딧, 활동 지원금, 교육 프로그램, 글로벌 커뮤니티 참여 기회 등이 제공됩니다.\n지원 대상은 한국을 포함한 일부 국가의 학부생입니다.',
        published_at: '2026-08-11T11:30:52.000Z',
        deadline_text: '',
        links: [{ url: 'https://openai.com/student-collective/', label: 'openai.com/student-collective' }],
        evidence: [{ source: 'og', locator: 'meta[property="og:description"]', text: '대학생이라면 참고해보세요. 좋은 기회가 될 것 같습니다.' }]
      }
    })
  });
  const accepted = await response.json();
  const intake = await waitForTerminal(baseUrl, accepted.intake_id);
  assert.equal(intake.status, 'READY_FOR_REVIEW');

  const list = await (await fetch(`${baseUrl}/v1/opportunities`)).json();
  const item = list.items[0];
  assert.equal(item.category, 'Support');
  assert.equal(item.title, '대학생이라면 참고해보세요. 좋은 기회가 될 것 같습니다.');
  assert.equal(item.deadline, null);
  assert.equal(item.canonical_url, 'https://www.threads.com/@choi.openai/post/DbWnfnGAGrg');
  assert.equal(item.links[0].url, 'https://openai.com/student-collective/');
});

test('Threads SPA의 stale canonical은 현재 탭 게시물 URL로 정규화한다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const currentPost = 'https://www.threads.com/@local/post/current-post';
  const response = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source_type: 'page_evidence',
      page_evidence: {
        source_url: currentPost,
        canonical_url: 'https://www.threads.com/@local/post/previous-post',
        platform: 'threads',
        captured_at: new Date().toISOString(),
        page_title: 'Threads의 작성자님',
        body_text: '대학생 대상 지원 프로그램입니다. 모집 대상과 신청 방법을 확인하세요.',
        evidence: [{ source: 'dom', locator: 'body', text: '대학생 대상 지원 프로그램입니다.' }]
      }
    })
  });
  const accepted = await response.json();
  const intake = await waitForTerminal(baseUrl, accepted.intake_id);
  assert.equal(intake.status, 'READY_FOR_REVIEW');

  const list = await (await fetch(`${baseUrl}/v1/opportunities`)).json();
  assert.equal(list.items[0].canonical_url, currentPost);
});

test('Instagram 릴스는 영상 없이 캡션 본문만 Opportunity로 저장한다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const caption = '대학생을 위한 창업 지원 프로그램입니다. 신청 방법과 기간을 확인하세요.';
  const response = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source_type: 'page_evidence',
      page_evidence: {
        source_url: 'https://www.instagram.com/reels/CysmJV1uQSn/',
        canonical_url: 'https://www.instagram.com/reel/CysmJV1uQSn/',
        platform: 'instagram',
        captured_at: new Date().toISOString(),
        page_title: 'Instagram 릴스',
        body_text: caption,
        deadline_text: '',
        links: [{ url: 'https://example.com/apply', label: '신청하기' }],
        evidence: [{ source: 'og', locator: 'meta[property="og:description"]', text: caption }]
      }
    })
  });
  assert.equal(response.status, 202);
  const accepted = await response.json();
  const intake = await waitForTerminal(baseUrl, accepted.intake_id);
  assert.equal(intake.status, 'READY_FOR_REVIEW');

  const list = await (await fetch(`${baseUrl}/v1/opportunities`)).json();
  const item = list.items[0];
  assert.equal(item.platform, 'instagram');
  assert.equal(item.body, caption);
  assert.equal(item.canonical_url, 'https://www.instagram.com/reel/CysmJV1uQSn/');
  assert.equal(item.links[0].url, 'https://example.com/apply');
});

test('페이지 접근 실패 payload는 최소 카드로 저장하지 않고 거부한다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const response = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source_type: 'page_evidence',
      page_evidence: {
        source_url: 'https://www.threads.com/@choi.openai/post/DbWngWngKps',
        canonical_url: 'https://www.threads.com/',
        platform: 'threads',
        captured_at: new Date().toISOString(),
        page_title: 'Threads에 가입하여 아이디어를 나눠보세요',
        body_text: 'Threads에 가입하여 아이디어를 나누고, 질문을 남기고, 떠오르는 생각을 게시하세요.',
        evidence: [{ source: 'og', locator: 'meta[property="og:description"]', text: 'Threads에 가입하여 아이디어를 나누고...' }]
      }
    })
  });
  const result = await response.json();
  assert.equal(response.status, 422);
  assert.equal(result.error.code, 'INVALID_PAGE_EVIDENCE');
  assert.ok(result.error.details.includes('PAGE_ACCESS_REQUIRED'));
});

test('플랫폼 제목만 있고 본문이 없으면 READY가 아니라 NEEDS_REVIEW다', async (t) => {
  const app = createKeeperServer({ port: 0 });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const response = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source_type: 'page_evidence',
      page_evidence: {
        source_url: 'https://www.threads.com/@local/post/title-only',
        canonical_url: 'https://www.threads.com/@local/post/title-only',
        platform: 'threads',
        captured_at: new Date().toISOString(),
        page_title: 'Threads의 CHOI(@local)님',
        body_text: '',
        evidence: [{ source: 'og', locator: 'meta[property="og:title"]', text: 'Threads의 CHOI(@local)님' }]
      }
    })
  });
  const accepted = await response.json();
  const intake = await waitForTerminal(baseUrl, accepted.intake_id);
  assert.equal(intake.status, 'NEEDS_REVIEW');
  const list = await (await fetch(`${baseUrl}/v1/opportunities`)).json();
  assert.equal(list.items[0].needs_review, true);
  assert.ok(list.items[0].error_codes.includes('CONTENT_INSUFFICIENT'));
});

test('인증 모드에서는 Bearer 토큰의 사용자별 저장소만 사용한다', async (t) => {
  const authService = {
    async authenticate(headers) {
      if (headers.authorization === 'Bearer user-a-token') {
        return { userId: 'user-a', accessToken: 'user-a-token', email: 'a@example.com' };
      }
      if (headers.authorization === 'Bearer user-b-token') {
        return { userId: 'user-b', accessToken: 'user-b-token', email: 'b@example.com' };
      }
      return null;
    }
  };
  const app = createKeeperServer({ port: 0, authService });
  const address = await app.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => app.stop());

  const denied = await fetch(`${baseUrl}/v1/opportunities`);
  assert.equal(denied.status, 401);

  const accepted = await fetch(`${baseUrl}/v1/intakes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer user-a-token' },
    body: JSON.stringify(payload({
      platform: 'threads',
      url: 'https://www.threads.com/@local/post/private-item',
      title: '대학생 공모전',
      body: '대학생 대상 공모전입니다. 마감 2026년 9월 30일까지.',
      categoryText: 'Competition'
    }))
  });
  const acceptedBody = await accepted.json();
  const intake = await waitForTerminal(baseUrl, acceptedBody.intake_id, 'user-a-token');
  assert.equal(intake.status, 'READY_FOR_REVIEW');

  const userA = await (await fetch(`${baseUrl}/v1/opportunities`, {
    headers: { authorization: 'Bearer user-a-token' }
  })).json();
  assert.equal(userA.items.length, 1);
  assert.equal(userA.items[0].user_id, 'user-a');

  const userB = await (await fetch(`${baseUrl}/v1/opportunities`, {
    headers: { authorization: 'Bearer user-b-token' }
  })).json();
  assert.equal(userB.items.length, 0);
});
