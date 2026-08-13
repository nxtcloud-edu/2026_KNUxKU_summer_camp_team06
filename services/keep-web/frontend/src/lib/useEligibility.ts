import { useCallback, useEffect, useState } from 'react';

import { evaluateOpportunity } from '@/agentApi';
import type { DecisionResult } from '@/types/decision';

export type EligibilityState =
  | { status: 'loading' }
  | { status: 'ready'; result: DecisionResult }
  | { status: 'error'; message: string };

export interface EligibilityHandle {
  state: EligibilityState;
  retry: () => void;
}

/**
 * 한 화면에서 상세 근거 카드와 결정 버튼이 같은 판정 결과를 공유한다.
 * 판정 실패는 '조건 불충족'과 구분해서 error 로 유지한다.
 */
export function useEligibility(opportunityId: string): EligibilityHandle {
  const [state, setState] = useState<EligibilityState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    evaluateOpportunity(opportunityId)
      .then((result) => {
        if (live) setState({ status: 'ready', result });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '조건을 확인하지 못했어요.',
        });
      });
    return () => {
      live = false;
    };
  }, [opportunityId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}
