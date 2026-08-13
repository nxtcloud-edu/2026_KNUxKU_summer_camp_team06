import { useSyncExternalStore } from 'react';

import { opportunities, type Opportunity } from '@/data';

export interface PlanTask {
  /** 캘린더 이벤트와 공유하는 식별자 */
  id: string;
  opportunityId: string;
  title: string;
  note: string;
  /** ISO 문자열. 마감 역산으로 배치된 뒤 사용자가 옮길 수 있다. */
  dueAt: string;
  done: boolean;
}

interface TaskOverride {
  dueAt?: string;
  done?: boolean;
}

type PlanOverrides = Record<string, TaskOverride>;

const STORAGE_KEY = 'keep-on-plan';
const EMPTY: PlanOverrides = {};

let cache: PlanOverrides | null = null;
const listeners = new Set<() => void>();

function readStorage(): PlanOverrides {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as PlanOverrides) : {};
  } catch {
    return {};
  }
}

function getOverrides(): PlanOverrides {
  if (!cache) cache = readStorage();
  return cache;
}

function commit(next: PlanOverrides) {
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

const PLAN_NOTES = [
  '조건과 일정에서 꼭 확인할 정보만 먼저 골라요.',
  '아이디어와 필요한 자료를 한 문장으로 정리해요.',
  '결정에 필요한 사람과 정보를 빠르게 연결해요.',
  '마감 전에 제출물을 마지막으로 점검해요.',
  '다음 기회를 위해 결과와 배운 점을 남겨요.',
];

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** '2026. 08. 15' 형태의 마감 문자열을 Date로 바꾼다. */
export function parseDeadline(deadline: string): Date | null {
  const match = deadline.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 18, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dayDiff(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

interface ExecutionTask {
  id: string;
  title: string;
  due_at?: string;
}

function readExecutionTasks(opportunityId: string): ExecutionTask[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`keep-on-execution-${opportunityId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tasks?: ExecutionTask[] };
    return Array.isArray(parsed.tasks) && parsed.tasks.length ? parsed.tasks : null;
  } catch {
    return null;
  }
}

/**
 * 마감 역산 배치.
 * 마지막 단계는 마감일에 두고, 앞 단계들은 남은 기간을 균등하게 나눠 거꾸로 배치한다.
 * 오늘보다 이전으로는 내려가지 않는다.
 */
export function scheduleBackwards(deadline: Date, count: number, today = new Date()): Date[] {
  if (count <= 0) return [];
  const base = startOfDay(today);
  const span = Math.max(0, dayDiff(base, deadline));
  if (count === 1) return [deadline];
  const step = Math.max(1, Math.floor(span / (count - 1)));
  return Array.from({ length: count }, (_, index) => {
    if (index === count - 1) return deadline;
    const candidate = addDays(deadline, -(count - 1 - index) * step);
    const clamped = candidate.getTime() < base.getTime() ? base : candidate;
    const withTime = new Date(clamped);
    withTime.setHours(10, 0, 0, 0);
    return withTime;
  });
}

/** 저장된 수정 내용을 반영하기 전의 기본 계획 */
export function basePlan(item: Opportunity, today = new Date()): PlanTask[] {
  const execution = readExecutionTasks(item.id);
  // 마감이 없는 일반 정보도 사용자가 계획을 만들 수 있게, 기본 시작일만 오늘로 둔다.
  const deadline = parseDeadline(item.deadline) ?? addDays(startOfDay(today), item.dDay ?? 0);
  const source = execution ?? item.tasks;
  const schedule = scheduleBackwards(deadline, source.length, today);

  return source.map((task, index) => {
    const executionDue = execution ? execution[index]?.due_at : undefined;
    const dueAt = executionDue ? new Date(executionDue) : schedule[index];
    return {
      id: task.id,
      opportunityId: item.id,
      title: task.title,
      note: PLAN_NOTES[index] ?? PLAN_NOTES[PLAN_NOTES.length - 1],
      dueAt: dueAt.toISOString(),
      done: execution ? false : Boolean((task as { done?: boolean }).done),
    };
  });
}

function applyOverrides(tasks: PlanTask[], overrides: PlanOverrides): PlanTask[] {
  return tasks.map((task) => {
    const override = overrides[`${task.opportunityId}:${task.id}`];
    if (!override) return task;
    return {
      ...task,
      dueAt: override.dueAt ?? task.dueAt,
      done: override.done ?? task.done,
    };
  });
}

export function setTaskDone(opportunityId: string, taskId: string, done: boolean) {
  const key = `${opportunityId}:${taskId}`;
  commit({ ...getOverrides(), [key]: { ...getOverrides()[key], done } });
}

export function setTaskDue(opportunityId: string, taskId: string, dueAt: Date) {
  const key = `${opportunityId}:${taskId}`;
  commit({ ...getOverrides(), [key]: { ...getOverrides()[key], dueAt: dueAt.toISOString() } });
}

/** 계획을 목록에서 지울 때 해당 항목의 완료·일정 수정 기록도 함께 비운다. */
export function clearPlan(opportunityId: string) {
  const next = Object.fromEntries(
    Object.entries(getOverrides()).filter(([key]) => !key.startsWith(`${opportunityId}:`)),
  );
  commit(next);
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(`keep-on-execution-${opportunityId}`);
  }
}

export function usePlanOverrides(): PlanOverrides {
  return useSyncExternalStore(subscribe, getOverrides, () => EMPTY);
}

export function planFor(item: Opportunity, overrides: PlanOverrides, today = new Date()): PlanTask[] {
  return applyOverrides(basePlan(item, today), overrides).sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );
}

export function allPlans(overrides: PlanOverrides, today = new Date()) {
  return opportunities.map((item) => ({ item, tasks: planFor(item, overrides, today) }));
}

export function formatPlanDate(dueAt: string) {
  return new Date(dueAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
