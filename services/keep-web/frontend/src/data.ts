import type { DecisionState } from './lib/decisionStore';

export type Accent = 'blue' | 'pink' | 'yellow' | 'green';

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  category: string;
  dDay: number | null;
  deadline: string;
  savedFrom: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  thumbnailKind: 'image' | 'pdf' | null;
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
  thumbnail_url?: string | null;
  thumbnail_kind?: 'image' | 'pdf' | null;
};

export let opportunities: Opportunity[] = [];
export const calendarEvents: { day: number; title: string; tone: string; category: string }[] = [];

const accents: Accent[] = ['blue', 'pink', 'yellow', 'green'];

function daysUntil(deadline?: string | null): number | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const target = new Date(`${deadline}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function setOpportunities(items: StoredOpportunity[]) {
  opportunities = items.map((item, index) => ({
    id: item.id,
    title: item.title || '제목을 정리하는 중이에요',
    organization: /^(unknown|정보 없음|null|n\/a)$/i.test(item.author || '') ? '' : item.author || '',
    category: item.category || '기타',
    dDay: daysUntil(item.deadline),
    deadline: item.deadline || '정보 없음',
    savedFrom: item.platform || '직접 저장',
    sourceUrl: item.canonical_url || item.source_url || '#',
    thumbnailUrl: item.thumbnail_url || null,
    thumbnailKind: item.thumbnail_kind || null,
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
