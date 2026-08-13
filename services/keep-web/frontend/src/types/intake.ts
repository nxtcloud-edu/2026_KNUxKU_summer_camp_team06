/**
 * GET /v1/intakes/:id 응답 계약.
 * 상태 목록은 services/keep-web/shared/contracts.js 의 INTAKE_STATES 와 같다.
 */
export type IntakeStatus =
  | 'QUEUED'
  | 'RECEIVED'
  | 'EVENT_PENDING'
  | 'EVENT_SENT'
  | 'EXTRACTING'
  | 'NORMALIZING'
  | 'VALIDATING'
  | 'READY_FOR_REVIEW'
  | 'NEEDS_REVIEW'
  | 'UNSUPPORTED'
  | 'CANCELLED'
  | 'FAILED';

export interface Intake {
  id: string;
  status: IntakeStatus;
  platform?: string;
  source_url?: string;
  canonical_url?: string;
  opportunity_id?: string | null;
  error?: { code?: string; message?: string } | null;
  updated_at?: string;
}

export const TERMINAL_STATUSES: IntakeStatus[] = [
  'READY_FOR_REVIEW',
  'NEEDS_REVIEW',
  'UNSUPPORTED',
  'CANCELLED',
  'FAILED',
];

export const isTerminal = (status: IntakeStatus) => TERMINAL_STATUSES.includes(status);

/** 화면에 보여줄 4단계. 서버 상태를 사용자 언어로 묶는다. */
export const INTAKE_STEPS = [
  { key: 'collect', label: '수집', hint: '저장한 페이지의 근거를 받았어요' },
  { key: 'extract', label: '추출', hint: '제목·본문·기간을 읽고 있어요' },
  { key: 'normalize', label: '정리', hint: '분류와 마감일을 맞추고 있어요' },
  { key: 'review', label: '확인 대기', hint: '카드로 정리됐어요' },
] as const;

export type IntakeStepKey = (typeof INTAKE_STEPS)[number]['key'];

const STEP_BY_STATUS: Record<IntakeStatus, number> = {
  QUEUED: 0,
  RECEIVED: 0,
  EVENT_PENDING: 0,
  EVENT_SENT: 0,
  EXTRACTING: 1,
  NORMALIZING: 2,
  VALIDATING: 2,
  READY_FOR_REVIEW: 3,
  NEEDS_REVIEW: 3,
  UNSUPPORTED: 1,
  CANCELLED: 0,
  FAILED: 1,
};

/** 현재 진행 중인 단계 인덱스 */
export const stepIndexOf = (status: IntakeStatus) => STEP_BY_STATUS[status] ?? 0;

export const STATUS_COPY: Record<IntakeStatus, { title: string; body: string }> = {
  QUEUED: { title: '저장을 받았어요', body: '처리 순서를 기다리고 있어요.' },
  RECEIVED: { title: '저장을 받았어요', body: '페이지 근거를 확인했어요.' },
  EVENT_PENDING: { title: '처리를 준비하고 있어요', body: '잠시만 기다려 주세요.' },
  EVENT_SENT: { title: '처리를 시작했어요', body: '곧 본문을 읽어요.' },
  EXTRACTING: { title: '본문을 읽고 있어요', body: '제목, 내용, 기간을 찾는 중이에요.' },
  NORMALIZING: { title: '정보를 정리하고 있어요', body: '분류와 마감일을 맞추는 중이에요.' },
  VALIDATING: { title: '마지막으로 검증하고 있어요', body: '빠진 값이 없는지 확인해요.' },
  READY_FOR_REVIEW: { title: '카드로 정리했어요', body: '이제 열어보고 결정하면 됩니다.' },
  NEEDS_REVIEW: {
    title: '정리 필요 카드로 남겼어요',
    body: '본문에서 확인하지 못한 값이 있어요. 원문을 함께 확인해 주세요.',
  },
  UNSUPPORTED: {
    title: '지원하지 않는 페이지예요',
    body: '지금은 Instagram과 Threads 게시물만 정리할 수 있어요.',
  },
  CANCELLED: { title: '저장을 취소했어요', body: '다시 Keep하면 처음부터 처리해요.' },
  FAILED: {
    title: '정리하지 못했어요',
    body: '저장한 링크는 그대로 남아 있어요. 잠시 후 다시 시도해 주세요.',
  },
};
