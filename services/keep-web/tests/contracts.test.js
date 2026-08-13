import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePageEvidencePayload } from '../shared/contracts.js';

function validPayload(overrides = {}) {
  return {
    source_type: 'page_evidence',
    page_evidence: {
      source_url: 'https://www.instagram.com/p/local-fixture',
      canonical_url: 'https://www.instagram.com/p/local-fixture',
      platform: 'instagram',
      captured_at: new Date().toISOString(),
      page_title: '청년 공모전',
      body_text: '공모전 마감 2026년 9월 30일까지',
      evidence: [{ source: 'dom', locator: 'article', text: '공모전 마감 2026년 9월 30일까지' }],
      ...overrides
    }
  };
}

test('PageEvidencePayload 계약을 통과시킨다', () => {
  const result = validatePageEvidencePayload(validPayload());
  assert.equal(result.ok, true);
  assert.equal(result.value.platform, 'instagram');
  assert.equal(result.value.canonical_url, 'https://www.instagram.com/p/local-fixture');
});

test('지원하지 않는 플랫폼과 과대 payload를 거부한다', () => {
  const unsupported = validatePageEvidencePayload(validPayload({ platform: 'youtube' }));
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.errors.join(','), /platform/);

  const oversized = validatePageEvidencePayload(validPayload({ body_text: 'x'.repeat(12001) }));
  assert.equal(oversized.ok, false);
  assert.match(oversized.errors.join(','), /body_text/);
});

test('Threads 로그인 대체 페이지는 거부하고 stale canonical은 현재 게시물 URL을 사용한다', () => {
  const fallback = validatePageEvidencePayload(validPayload({
    source_url: 'https://www.threads.com/@local/post/fallback',
    canonical_url: 'https://www.threads.com/',
    platform: 'threads',
    page_title: 'Threads에 가입하여 아이디어를 나눠보세요',
    body_text: 'Threads에 가입하여 아이디어를 나누고, 질문을 남기고, 떠오르는 생각을 게시하세요.'
  }));
  assert.equal(fallback.ok, false);
  assert.ok(fallback.errors.includes('PAGE_ACCESS_REQUIRED'));
  assert.equal(fallback.errors.includes('CANONICAL_POST_MISMATCH'), false);

  const mismatch = validatePageEvidencePayload(validPayload({
    source_url: 'https://www.threads.com/@local/post/first',
    canonical_url: 'https://www.threads.com/@local/post/second',
    platform: 'threads'
  }));
  assert.equal(mismatch.ok, true);
  assert.equal(mismatch.value.canonical_url, 'https://www.threads.com/@local/post/first');
});

test('긴 게시물 본문 안의 전역 로그인 문구는 접근 실패로 오인하지 않는다', () => {
  const body = '대학생 대상 지원 프로그램 안내입니다. '.repeat(12)
    + 'Threads에 가입하여 아이디어를 나누세요. '
    + '지원 대상과 신청 방법을 확인한 뒤 제출하면 됩니다.';
  const result = validatePageEvidencePayload(validPayload({
    source_url: 'https://www.threads.com/@local/post/long-body',
    canonical_url: 'https://www.threads.com/@local/post/long-body',
    platform: 'threads',
    page_title: 'Threads의 작성자님',
    body_text: body
  }));
  assert.equal(result.ok, true);
});

test('Threads 짧은 /t/ 게시물 주소와 canonical 게시물 주소를 같은 게시물로 인식한다', () => {
  const result = validatePageEvidencePayload(validPayload({
    source_url: 'https://www.threads.com/t/short-post-id',
    canonical_url: 'https://www.threads.com/@local/post/short-post-id',
    platform: 'threads',
    page_title: 'Threads 게시물',
    body_text: '대학생 대상 지원 프로그램 안내입니다. 신청 방법과 지원 대상을 확인하세요.'
  }));
  assert.equal(result.ok, true);
});

test('Instagram 릴스의 /reels/ 주소와 /reel/ canonical 주소를 같은 게시물로 인식한다', () => {
  const result = validatePageEvidencePayload(validPayload({
    source_url: 'https://www.instagram.com/reels/CysmJV1uQSn/',
    canonical_url: 'https://www.instagram.com/reel/CysmJV1uQSn/',
    platform: 'instagram',
    page_title: 'Instagram 릴스',
    body_text: '대학생을 위한 지원 프로그램 안내입니다. 신청 방법과 기간을 확인하세요.'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.canonical_url, 'https://www.instagram.com/reel/CysmJV1uQSn/');
});

test('Instagram 릴스의 사용자명 포함 canonical 주소도 같은 게시물로 인식한다', () => {
  const result = validatePageEvidencePayload(validPayload({
    source_url: 'https://www.instagram.com/reels/CysmJV1uQSn/',
    canonical_url: 'https://www.instagram.com/linamond.insight/reel/CysmJV1uQSn/',
    platform: 'instagram',
    page_title: 'Instagram 릴스',
    body_text: '대학생을 위한 지원 프로그램 안내입니다. 신청 방법과 기간을 확인하세요.'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.canonical_url, 'https://www.instagram.com/linamond.insight/reel/CysmJV1uQSn/');
});

test('근거 텍스트가 2000자를 넘으면 계약에서 거부한다', () => {
  const result = validatePageEvidencePayload(validPayload({
    evidence: [{ source: 'og', locator: 'meta[property="og:description"]', text: 'x'.repeat(2001) }]
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(','), /evidence\[0\]/);
});
