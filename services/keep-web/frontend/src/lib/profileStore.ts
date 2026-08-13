import { useSyncExternalStore } from 'react';

import type { ProfilePayload } from '@/agentApi';

/**
 * 실제로 사용자가 입력한 값만 담는다.
 * agentApi.loadProfile 은 API 호출용 기본값을 채워 주기 때문에,
 * '무엇이 비어 있는지' 판단에는 이 스토어를 써야 한다.
 */
export type StoredProfile = Partial<ProfilePayload>;

const STORAGE_KEY = 'keep-on-profile';
const ONBOARDING_KEY = 'keep-on-profile-onboarded';
const EMPTY: StoredProfile = {};

let cache: StoredProfile | null = null;
const listeners = new Set<() => void>();

function readStorage(): StoredProfile {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as StoredProfile) : {};
  } catch {
    return {};
  }
}

function getStored(): StoredProfile {
  if (!cache) cache = readStorage();
  return cache;
}

function commit(next: StoredProfile) {
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

export function patchProfile(patch: StoredProfile) {
  commit({ ...getStored(), ...patch });
}

export function useStoredProfile(): StoredProfile {
  return useSyncExternalStore(subscribe, getStored, () => EMPTY);
}

/** 조건 판정에 쓰이는 항목과, 비었을 때 어떤 조건이 확인 필요로 남는지 */
export const PROFILE_FIELDS = [
  {
    key: 'birth_date' as const,
    label: '생년월일',
    conditionLabel: '나이 조건',
    why: '만 나이를 정확히 계산해 나이 제한을 확인해요.',
    missing: '생년월일이 없으면 나이 조건이 ‘확인 필요’로 남아요.',
  },
  {
    key: 'region' as const,
    label: '거주 지역',
    conditionLabel: '거주 지역 조건',
    why: '지역 제한이 있는 공고에서 대상 여부를 확인해요.',
    missing: '지역이 없으면 지역 제한 공고를 판단할 수 없어요.',
  },
  {
    key: 'status' as const,
    label: '현재 상태',
    conditionLabel: '신분·상태 조건',
    why: '대학생·재직자처럼 신분을 요구하는 조건에 사용해요.',
    missing: '상태가 없으면 신분 조건이 ‘확인 필요’로 남아요.',
  },
  {
    key: 'income_bracket' as const,
    label: '소득 구간',
    conditionLabel: '소득·재산 조건',
    why: '소득 기준이 있는 지원 정책에서 대상 여부를 확인해요.',
    missing: '소득 구간이 없으면 소득 조건은 판단하지 않고 남겨 둬요.',
  },
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]['key'];

const REQUIRED_KEYS: ProfileFieldKey[] = ['birth_date', 'region', 'status'];

const isFilled = (value: unknown) =>
  typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;

export const missingRequired = (profile: StoredProfile) =>
  REQUIRED_KEYS.filter((key) => !isFilled(profile[key]));

export const isFieldFilled = (profile: StoredProfile, key: ProfileFieldKey) => isFilled(profile[key]);

export function completionRatio(profile: StoredProfile) {
  const filled = PROFILE_FIELDS.filter(({ key }) => isFilled(profile[key])).length;
  return filled / PROFILE_FIELDS.length;
}

export function isOnboardingDone() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(ONBOARDING_KEY) === 'true';
}

export function markOnboardingDone() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // 무시
  }
  listeners.forEach((listener) => listener());
}
