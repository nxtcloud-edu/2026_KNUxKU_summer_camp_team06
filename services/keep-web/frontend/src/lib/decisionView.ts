import type { Opportunity } from '@/data';
import { resolveDecision, type DecisionState, type DecisionStore } from '@/lib/decisionStore';

/** 저장된 결정이 없으면 데이터 시드를 쓰는 공통 조회 함수 */
export const decisionOf = (store: DecisionStore, item: Opportunity): DecisionState =>
  resolveDecision(store, item.id, item.initialDecision).state;
