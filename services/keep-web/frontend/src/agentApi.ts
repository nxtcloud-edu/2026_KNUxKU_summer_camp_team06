import type { DecisionResult } from './types/decision';
import type { Intake } from './types/intake';
import { authorizedFetch } from './lib/auth';
import type { StoredOpportunity } from './data';

export type ProfilePayload = {
  birth_date?: string;
  region?: string;
  status?: string;
  /** 백엔드 UserProfileDraft 의 소득 구간 (소득 조건 판정에 사용) */
  income_bracket?: string;
  interests: string[];
  weekly_available_hours?: number;
};

const fallbackProfile: ProfilePayload = { interests: [] };

export function loadProfile(): ProfilePayload {
  try { return { ...fallbackProfile, ...JSON.parse(localStorage.getItem('keep-on-profile') || '{}') }; } catch { return fallbackProfile; }
}

export function saveProfile(profile: ProfilePayload) {
  localStorage.setItem('keep-on-profile', JSON.stringify(profile));
}

export async function getIntake(intakeId: string): Promise<Intake> {
  const response = await authorizedFetch(`/v1/intakes/${encodeURIComponent(intakeId)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || '처리 상태를 확인하지 못했어요.');
  return body as Intake;
}

export async function getMyOpportunities(): Promise<StoredOpportunity[]> {
  const response = await authorizedFetch('/v1/opportunities');
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || '저장 목록을 불러오지 못했습니다.');
  return body.items || [];
}

export async function startExecution(opportunityId: string, likedOpportunityIds: string[]) {
  const response = await authorizedFetch('/v1/agent/execution', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: loadProfile(), liked_opportunity_ids: likedOpportunityIds, opportunity_id: opportunityId }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || '실행 계획을 만들지 못했어요.');
  return body;
}

export async function evaluateOpportunity(opportunityId: string): Promise<DecisionResult> {
  const response = await authorizedFetch('/v1/agent/evaluate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: loadProfile(), opportunity_id: opportunityId }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || '조건을 확인하지 못했어요.');
  return body;
}
