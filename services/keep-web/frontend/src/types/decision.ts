/**
 * /v1/agent/evaluate 응답 계약.
 * 백엔드 src/decision_engine.py 의 DecisionResult 를 그대로 따른다.
 */
export type Verdict = 'pass' | 'fail' | 'unknown' | 'not_applicable';

export type ConditionType =
  | 'age'
  | 'region'
  | 'status'
  | 'income'
  | 'duplicate'
  | 'military'
  | 'period'
  | 'etc';

export interface ConditionVerdict {
  condition_type: ConditionType;
  verdict: Verdict;
  reason: string;
  /** 원문에서 그대로 가져온 근거 문장 */
  raw_quote: string;
}

export interface EligibilityVerdict {
  opportunity_id: string;
  content_category: string | null;
  conditions: ConditionVerdict[];
  overall: Verdict;
  reason: string;
  normalization_status: string;
}

export type FeasibilityLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface FeasibilityVerdict {
  level: FeasibilityLevel;
  score: number | null;
  reasons: string[];
  warnings: string[];
  days_remaining: number | null;
}

export interface DecisionResult {
  eligibility: EligibilityVerdict;
  feasibility: FeasibilityVerdict;
  ranking?: {
    score: number;
    recommendation: string;
    reasons: string[];
  };
}

export const CONDITION_LABEL: Record<ConditionType, string> = {
  age: '나이',
  region: '거주 지역',
  status: '신분·상태',
  income: '소득·재산',
  duplicate: '중복 수혜',
  military: '병역',
  period: '신청 기간',
  etc: '기타 조건',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: '충족',
  fail: '불충족',
  unknown: '확인 필요',
  not_applicable: '해당 없음',
};

export const FEASIBILITY_LABEL: Record<FeasibilityLevel, string> = {
  high: '여유 있어요',
  medium: '가능해요',
  low: '빡빡해요',
  unknown: '판단 보류',
};
