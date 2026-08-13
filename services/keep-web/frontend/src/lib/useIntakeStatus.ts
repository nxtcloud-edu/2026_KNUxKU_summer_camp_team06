import { useCallback, useEffect, useRef, useState } from 'react';

import { getIntake } from '@/agentApi';
import { isTerminal, type Intake } from '@/types/intake';

export type IntakeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; intake: Intake }
  | { status: 'error'; message: string };

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 60;

/**
 * Keep 직후 처리 상태를 폴링한다.
 * 종료 상태(READY_FOR_REVIEW / NEEDS_REVIEW / UNSUPPORTED / CANCELLED / FAILED)에 도달하면 멈춘다.
 */
export function useIntakeStatus(intakeId: string | null) {
  const [state, setState] = useState<IntakeState>(intakeId ? { status: 'loading' } : { status: 'idle' });
  const [attemptToken, setAttemptToken] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!intakeId) {
      setState({ status: 'idle' });
      return;
    }

    let live = true;
    let attempts = 0;
    setState({ status: 'loading' });

    const clear = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const tick = async () => {
      attempts += 1;
      try {
        const intake = await getIntake(intakeId);
        if (!live) return;
        setState({ status: 'ready', intake });
        if (isTerminal(intake.status) || attempts >= MAX_ATTEMPTS) return;
      } catch (error) {
        if (!live) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '처리 상태를 확인하지 못했어요.',
        });
        return;
      }
      timer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    void tick();

    return () => {
      live = false;
      clear();
    };
  }, [intakeId, attemptToken]);

  const retry = useCallback(() => setAttemptToken((value) => value + 1), []);

  return { state, retry };
}
