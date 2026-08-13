import { useSyncExternalStore } from 'react';

/**
 * 사용자의 결정 상태.
 * Keep은 쉽고 정리는 어렵기 때문에, 긍정("할래")만 있으면 목록이 계속 쌓인다.
 * 보류(later)와 보관(archived)까지 있어야 목록이 줄어든다.
 */
export type DecisionState = 'none' | 'joined' | 'later' | 'archived';

export interface DecisionRecord {
  state: DecisionState;
  updatedAt: string;
  /** later 상태일 때 다시 알려줄 날짜 (ISO) */
  snoozeUntil?: string;
}

export type DecisionStore = Record<string, DecisionRecord>;

const STORAGE_KEY = 'keep-on-decisions';
const EMPTY: DecisionStore = {};

let cache: DecisionStore | null = null;
const listeners = new Set<() => void>();

function readStorage(): DecisionStore {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as DecisionStore) : {};
  } catch {
    return {};
  }
}

function getStore(): DecisionStore {
  if (!cache) cache = readStorage();
  return cache;
}

function commit(next: DecisionStore) {
  cache = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장 실패해도 화면 상태는 유지한다.
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const SNOOZE_DAYS = 3;

export function snoozeDate(from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + SNOOZE_DAYS);
  date.setHours(9, 0, 0, 0);
  return date;
}

export function setDecision(id: string, state: DecisionState) {
  const record: DecisionRecord = { state, updatedAt: new Date().toISOString() };
  if (state === 'later') record.snoozeUntil = snoozeDate().toISOString();
  commit({ ...getStore(), [id]: record });
}

export function clearDecision(id: string) {
  const next = { ...getStore() };
  delete next[id];
  commit(next);
}

/** 저장된 결정이 없으면 데이터에 있는 시드 값을 사용한다. */
export function resolveDecision(
  store: DecisionStore,
  id: string,
  seed: DecisionState,
): DecisionRecord {
  return store[id] ?? { state: seed, updatedAt: '' };
}

export function useDecisions(): DecisionStore {
  return useSyncExternalStore(subscribe, getStore, () => EMPTY);
}

export const DECISION_LABEL: Record<Exclude<DecisionState, 'none'>, string> = {
  joined: '참여 결정',
  later: '나중에',
  archived: '보관',
};
