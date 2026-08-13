export type Accent = 'blue' | 'pink' | 'yellow' | 'green';

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  category: string;
  dDay: number;
  deadline: string;
  savedFrom: string;
  savedAt: string;
  accent: Accent;
  reason: string;
  summary: string;
  eligibility: string[];
  tasks: { id: string; title: string; due: string; done: boolean }[];
}

export const opportunities: Opportunity[] = [
  {
    id: 'opp-contest-02',
    title: 'AWS AI Challenge 2026',
    organization: 'Amazon Web Services',
    category: '공모전',
    dDay: 2,
    deadline: '2026. 08. 15',
    savedFrom: 'Instagram',
    savedAt: '오늘',
    accent: 'yellow',
    reason: 'AI·클라우드 관심사와 맞고, 지금 바로 시작해도 제출까지 필요한 시간을 확보할 수 있어요.',
    summary: '생성형 AI를 활용해 실제 문제를 해결하는 아이디어와 프로토타입을 제안하는 대학생 대상 챌린지입니다.',
    eligibility: ['국내 대학(원)생', '개인 또는 4인 이하 팀', '프로토타입 제출 가능'],
    tasks: [
      { id: 'a1', title: '모집 요강 다시 확인하기', due: '오늘', done: true },
      { id: 'a2', title: '아이디어 한 문장으로 정리하기', due: '오늘', done: false },
      { id: 'a3', title: '팀원에게 참가 의사 묻기', due: '8월 14일', done: false },
      { id: 'a4', title: '지원서와 소개 자료 제출하기', due: '8월 15일', done: false },
    ],
  },
  {
    id: 'opp-bootcamp-02',
    title: '클라우드 실무 캠퍼스',
    organization: '한국클라우드산업협회',
    category: '교육·훈련',
    dDay: 7,
    deadline: '2026. 08. 20',
    savedFrom: 'Threads',
    savedAt: '어제',
    accent: 'blue',
    reason: '주 4시간 온라인 과정이라 현재 일정 안에서 무리 없이 수강할 수 있어요.',
    summary: '클라우드 아키텍처와 배포 실습을 중심으로 포트폴리오까지 완성하는 6주 실무 과정입니다.',
    eligibility: ['만 34세 이하', '온라인 수강 가능', '기초 개발 경험 권장'],
    tasks: [
      { id: 'b1', title: '커리큘럼 확인하기', due: '8월 16일', done: false },
      { id: 'b2', title: '지원 동기 작성하기', due: '8월 18일', done: false },
    ],
  },
  {
    id: 'opp-grant-03',
    title: '청년 월세 특별지원',
    organization: '국토교통부',
    category: '지원 정책',
    dDay: 11,
    deadline: '2026. 08. 24',
    savedFrom: 'Instagram',
    savedAt: '3일 전',
    accent: 'pink',
    reason: '연령 조건은 맞지만 소득·주거 조건을 한 번 더 확인해야 해요.',
    summary: '독립 거주 청년의 월세 부담을 줄이기 위해 최대 12개월 동안 월세를 지원하는 정책입니다.',
    eligibility: ['만 19~34세', '부모와 별도 거주', '소득·재산 기준 충족'],
    tasks: [
      { id: 'c1', title: '모의 계산기로 자격 확인하기', due: '8월 16일', done: false },
      { id: 'c2', title: '임대차계약서 준비하기', due: '8월 20일', done: false },
    ],
  },
  {
    id: 'opp-supporters-02',
    title: '첨단분야 COSS 서포터즈',
    organization: '첨단분야 혁신융합대학',
    category: '대외활동',
    dDay: 18,
    deadline: '2026. 08. 31',
    savedFrom: 'Threads',
    savedAt: '5일 전',
    accent: 'green',
    reason: '콘텐츠 제작 경험을 살리면서 다른 대학 학생들과 협업할 수 있는 기회예요.',
    summary: '첨단분야 교육 프로그램을 직접 경험하고 카드뉴스와 영상으로 알리는 대학생 서포터즈입니다.',
    eligibility: ['대학생', '월 2회 콘텐츠 제작', '오프라인 행사 참여 가능'],
    tasks: [
      { id: 'd1', title: '이전 콘텐츠 포트폴리오 고르기', due: '8월 22일', done: false },
      { id: 'd2', title: '자기소개 영상 촬영하기', due: '8월 27일', done: false },
    ],
  },
];

export const calendarEvents = [
  { day: 13, title: 'AWS 아이디어 정리', tone: 'blue', category: '해야 할 일' },
  { day: 14, title: '팀원 참가 확인', tone: 'pink', category: '준비' },
  { day: 15, title: 'AWS Challenge 마감', tone: 'yellow', category: '마감' },
  { day: 18, title: '캠퍼스 지원 동기 작성', tone: 'blue', category: '해야 할 일' },
  { day: 20, title: '클라우드 캠퍼스 마감', tone: 'yellow', category: '마감' },
  { day: 24, title: '월세 지원 자격 확인', tone: 'pink', category: '준비' },
  { day: 31, title: 'COSS 서포터즈 마감', tone: 'yellow', category: '마감' },
];
