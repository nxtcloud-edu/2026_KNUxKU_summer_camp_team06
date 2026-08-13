import type { DecisionResult } from './types/decision';
import type { Intake } from './types/intake';
import { authorizedFetch } from './lib/auth';
import { uploadPrivateFile } from './lib/auth';
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

export async function createSourceIntake(file: File) {
  const type = file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('image/') ? 'image' : file.type === 'text/plain' ? 'text' : null;
  if (!type) throw new Error('이미지, PDF, 텍스트 파일만 지원합니다.');
  if (file.size > 15 * 1024 * 1024) throw new Error('파일은 15MB 이하만 업로드할 수 있습니다.');
  const payload: Record<string, unknown> = { source_type: type };
  if (type === 'text') {
    payload.source_text = (await file.text()).slice(0, 12000);
    payload.source_metadata = { original_filename: file.name };
  } else {
    const upload = await uploadPrivateFile(file);
    payload.source_metadata = {
      object_path: upload.objectPath, original_filename: file.name,
      mime_type: file.type, byte_size: file.size,
      thumbnail_url: `storage://keeper-uploads/${upload.objectPath}`,
      thumbnail_kind: type,
    };
  }
  const response = await authorizedFetch('/v1/intakes/source', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || '파일 분석을 시작하지 못했습니다.');
  return body as { intake_id: string };
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

export type RecommendationFeed = {
  liked_opportunity_ids: string[];
  recommendations: Array<{ ranking: { opportunity_id: string; title: string; score: number; recommendation: string; reasons: string[]; liked: boolean } }>;
  follow_up_questions: string[];
};

export async function getRecommendations(likedOpportunityIds: string[]): Promise<RecommendationFeed> {
  const response = await authorizedFetch('/v1/agent/recommendations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: loadProfile(), liked_opportunity_ids: likedOpportunityIds }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || 'AI 추천을 만들지 못했습니다.');
  return body;
}

export async function askConversation(question: string, opportunityId: string | null, likedOpportunityIds: string[]) {
  const response = await authorizedFetch('/v1/agent/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, opportunity_id: opportunityId, liked_opportunity_ids: likedOpportunityIds, profile: loadProfile() }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || 'AI 대화 응답을 받지 못했습니다.');
  return String(body.answer || '답변을 만들지 못했습니다.');
}
