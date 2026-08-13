import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  RotateCw,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { IntakeState } from '@/lib/useIntakeStatus';
import { cn } from '@/lib/utils';
import { INTAKE_STEPS, STATUS_COPY, isTerminal, stepIndexOf } from '@/types/intake';

type StepTone = 'done' | 'active' | 'todo' | 'stopped';

function StepRail({ current, tone }: { current: number; tone: 'running' | 'done' | 'stopped' }) {
  return (
    <ol className="mt-4 grid gap-2 sm:grid-cols-4">
      {INTAKE_STEPS.map((step, index) => {
        let state: StepTone = 'todo';
        if (tone === 'stopped' && index === current) state = 'stopped';
        else if (index < current || (tone === 'done' && index <= current)) state = 'done';
        else if (index === current) state = 'active';

        return (
          <li
            key={step.key}
            className={cn(
              'rounded-lg border p-3',
              state === 'done' && 'border-emerald-200 bg-emerald-50',
              state === 'active' && 'border-primary/40 bg-primary/5',
              state === 'stopped' && 'border-red-200 bg-red-50',
              state === 'todo' && 'bg-muted/30',
            )}
          >
            <div className="flex items-center gap-1.5">
              {state === 'done' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              {state === 'active' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              {state === 'stopped' && <X className="h-3.5 w-3.5 text-red-600" />}
              {state === 'todo' && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />}
              <strong className="text-xs font-bold">{step.label}</strong>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{step.hint}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function IntakeProgress({
  state,
  onRetry,
  onDismiss,
}: {
  state: IntakeState;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <div className="tw-root mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <strong className="text-sm font-bold">저장한 페이지를 확인하고 있어요</strong>
          </div>
          <StepRail current={0} tone="running" />
        </Card>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="tw-root mb-6">
        <Card className="border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <strong className="text-sm font-bold text-amber-900">처리 상태를 확인하지 못했어요</strong>
            <span className="text-sm text-amber-900/80">{state.message}</span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={onRetry}>
                <RotateCw className="h-3.5 w-3.5" />
                다시 확인
              </Button>
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                닫기
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { intake } = state;
  const copy = STATUS_COPY[intake.status];
  const current = stepIndexOf(intake.status);
  const done = intake.status === 'READY_FOR_REVIEW' || intake.status === 'NEEDS_REVIEW';
  const stopped = intake.status === 'FAILED' || intake.status === 'UNSUPPORTED' || intake.status === 'CANCELLED';
  const tone = stopped ? 'stopped' : done ? 'done' : 'running';

  return (
    <div className="tw-root mb-6">
      <Card
        className={cn(
          'p-4',
          done && intake.status === 'READY_FOR_REVIEW' && 'border-emerald-200',
          intake.status === 'NEEDS_REVIEW' && 'border-amber-300 bg-amber-50/60',
          stopped && 'border-red-200 bg-red-50/60',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {!isTerminal(intake.status) && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <strong className="text-sm font-bold">{copy.title}</strong>
          <Badge variant="outline" className="h-5 px-2 font-mono text-[10px]">
            {intake.status}
          </Badge>
          {intake.platform && (
            <Badge variant="secondary" className="h-5 px-2 text-[11px]">
              {intake.platform}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            {intake.status === 'READY_FOR_REVIEW' && intake.opportunity_id && (
              <Button size="sm" asChild>
                <Link to={`/saved/${intake.opportunity_id}`}>
                  카드 열기 <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            {stopped && (
              <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={onRetry}>
                <RotateCw className="h-3.5 w-3.5" />
                다시 확인
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="처리 상태 닫기">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">{copy.body}</p>

        {intake.error?.message && (
          <p className="mt-1.5 text-sm text-red-700">{intake.error.message}</p>
        )}

        <StepRail current={current} tone={tone} />

        {(intake.canonical_url || intake.source_url) && (
          <a
            href={intake.canonical_url || intake.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            저장한 원문 열기 <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </Card>
    </div>
  );
}
