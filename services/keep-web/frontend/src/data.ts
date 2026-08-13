import type { DecisionState } from './lib/decisionStore';

export type Accent = 'blue' | 'pink' | 'yellow' | 'green';

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  category: string;
  dDay: number;
  deadline: string;
  savedFrom: string;
  sourceUrl: string;
  savedAt: string;
  accent: Accent;
  verdict: 'pass' | 'needsCheck';
  initialDecision: DecisionState;
  reason: string;
  summary: string;
  eligibility: string[];
  tasks: { id: string; title: string; due: string; done: boolean }[];
}

export type StoredOpportunity = {
  id: string;
  title?: string | null;
  author?: string | null;
  category?: string | null;
  deadline?: string | null;
  source_url?: string | null;
  canonical_url?: string | null;
  body?: string | null;
  summary?: string | null;
  platform?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export let opportunities: Opportunity[] = [];
export const calendarEvents: { day: number; title: string; tone: string; category: string }[] = [];

const accents: Accent[] = ['blue', 'pink', 'yellow', 'green'];

export function setOpportunities(items: StoredOpportunity[]) {
  opportunities = items.map((item, index) => ({
    id: item.id,
    title: item.title || '제목을 정리하는 중이에요',
    organization: item.author || '정보 없음',
    category: item.category || '기타',
    dDay: 999,
    deadline: item.deadline || '정보 없음',
    savedFrom: item.platform || '직접 저장',
    sourceUrl: item.canonical_url || item.source_url || '#',
    savedAt: item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR') : '방금',
    accent: accents[index % accents.length],
    verdict: item.status === 'NEEDS_REVIEW' ? 'needsCheck' : 'pass',
    initialDecision: 'none',
    reason: item.summary || '저장한 원문을 바탕으로 정리한 정보예요.',
    summary: item.body || item.summary || '본문을 정리하는 중이에요.',
    eligibility: [],
    tasks: [],
  }));
}
