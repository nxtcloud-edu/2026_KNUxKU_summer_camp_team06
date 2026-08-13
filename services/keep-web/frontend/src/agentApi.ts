export type ProfilePayload = {
  birth_date: string;
  region?: string;
  status?: string;
  interests: string[];
  weekly_available_hours?: number;
};

const fallbackProfile: ProfilePayload = {
  birth_date: '2002-01-01', region: '서울 관악구', status: 'student', interests: ['AI', '클라우드'], weekly_available_hours: 8,
};

export function loadProfile(): ProfilePayload {
  try { return { ...fallbackProfile, ...JSON.parse(localStorage.getItem('keep-on-profile') || '{}') }; } catch { return fallbackProfile; }
}

export function saveProfile(profile: ProfilePayload) {
  localStorage.setItem('keep-on-profile', JSON.stringify(profile));
}

export async function startExecution(opportunityId: string, likedOpportunityIds: string[]) {
  const response = await fetch('/v1/agent/execution', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: loadProfile(), liked_opportunity_ids: likedOpportunityIds, opportunity_id: opportunityId }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || '실행 계획을 만들지 못했어요.');
  return body;
}

export async function evaluateOpportunity(opportunityId: string) {
  const response = await fetch('/v1/agent/evaluate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: loadProfile(), opportunity_id: opportunityId }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || '조건을 확인하지 못했어요.');
  return body;
}
