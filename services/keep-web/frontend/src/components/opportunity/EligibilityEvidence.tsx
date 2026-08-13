import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  HelpCircle,
  MinusCircle,
  Quote,
  RotateCw,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Opportunity } from '@/data';
import type { EligibilityState } from '@/lib/useEligibility';
import { cn } from '@/lib/utils';
import {
  CONDITION_LABEL,
  FEASIBILITY_LABEL,
  VERDICT_LABEL,
  type ConditionVerdict,
  type Verdict,
} from '@/types/decision';

const VERDICT_STYLE: Record<Verdict, { icon: typeof CheckCircle2; badge: string; rail: string }> = {
  pass: {
    icon: CheckCircle2,
    badge: 'border-transparent bg-emerald-100 text-emerald-800',
    rail: 'bg-emerald-500',
  },
  fail: {
    icon: XCircle,
    badge: 'border-transparent bg-red-100 text-red-800',
    rail: 'bg-red-500',
  },
  unknown: {
    icon: HelpCircle,
    badge: 'border-transparent bg-amber-100 text-amber-900',
    rail: 'bg-amber-500',
  },
  not_applicable: {
    icon: MinusCircle,
    badge: 'border-transparent bg-muted text-muted-foreground',
    rail: 'bg-muted-foreground/40',
  },
};

const OVERALL_COPY: Record<Verdict, string> = {
  pass: '조건을 모두 확인했어요',
  fail: '지금은 조건이 맞지 않아요',
  unknown: '아직 확인하지 못한 조건이 있어요',
  not_applicable: '판단할 조건이 없어요',
};

function ConditionRow({ condition, sourceUrl }: { condition: ConditionVerdict; sourceUrl: string }) {
  const style = VERDICT_STYLE[condition.verdict];
  const Icon = style.icon;

  return (
    <li className="relative overflow-hidden rounded-lg border bg-card p-4 pl-5">
      <span className={cn('absolute left-0 top-0 h-full w-1.5', style.rail)} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <strong className="text-sm font-semibold">
          {CONDITION_LABEL[condition.condition_type] ?? condition.condition_type}
        </strong>
        <Badge className={cn('h-5 px-2 text-[11px]', style.badge)}>
          {VERDICT_LABEL[condition.verdict]}
        </Badge>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{condition.reason}</p>

      {condition.raw_quote && (
        <figure className="mt-3 rounded-md border-l-2 border-l-primary bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Quote className="h-3 w-3" />
            원문 근거
          </div>
          <blockquote className="mt-1 text-sm leading-relaxed">{condition.raw_quote}</blockquote>
          <figcaption className="mt-2">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              원문에서 확인 <ExternalLink className="h-3 w-3" />
            </a>
          </figcaption>
        </figure>
      )}
    </li>
  );
}

/** 판정 서비스에 연결하지 못했을 때, 저장해 둔 조건 문장을 '확인 필요'로 보여준다. */
function FallbackConditions({ item, message, onRetry }: { item: Opportunity; message: string; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold text-amber-900">
            조건을 자동으로 확인하지 못했어요
          </strong>
          <p className="mt-1 text-sm text-amber-900/80">{message}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={onRetry}>
            <RotateCw className="h-3.5 w-3.5" />
            다시 확인
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/profile">내 정보 채우기</Link>
          </Button>
        </div>
      </Card>

      <ul className="space-y-2">
        {item.eligibility.map((condition) => (
          <li
            key={condition}
            className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
          >
            <CircleDashed className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">{condition}</span>
            <Badge className={cn('h-5 px-2 text-[11px]', VERDICT_STYLE.unknown.badge)}>
              {VERDICT_LABEL.unknown}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        위 문장은 저장할 때 수집한 원문 조건이에요. 판정과 근거는 연결이 복구되면 자동으로 채워집니다.
      </p>
    </div>
  );
}

export function EligibilityEvidence({
  item,
  state,
  onRetry,
}: {
  item: Opportunity;
  state: EligibilityState;
  onRetry: () => void;
}) {
  if (state.status === 'loading') {
    return (
      <div className="tw-root space-y-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="tw-root">
        <FallbackConditions item={item} message={state.message} onRetry={onRetry} />
      </div>
    );
  }

  const { eligibility, feasibility } = state.result;
  const overallStyle = VERDICT_STYLE[eligibility.overall];
  const OverallIcon = overallStyle.icon;
  const unknownCount = eligibility.conditions.filter((c) => c.verdict === 'unknown').length;

  return (
    <div className="tw-root space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <OverallIcon className="h-5 w-5 text-muted-foreground" />
          <strong className="text-base font-bold">{OVERALL_COPY[eligibility.overall]}</strong>
          <Badge className={cn('h-6 px-2.5', overallStyle.badge)}>
            {VERDICT_LABEL[eligibility.overall]}
          </Badge>
          {unknownCount > 0 && (
            <Badge variant="outline" className="h-6 px-2.5">
              확인 필요 {unknownCount}건
            </Badge>
          )}
        </div>
        {eligibility.reason && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{eligibility.reason}</p>
        )}
        {unknownCount > 0 && (
          <p className="mt-3 text-sm">
            <Link to="/profile" className="font-semibold text-primary hover:underline">
              내 정보를 채우면
            </Link>{' '}
            남은 조건도 자동으로 확인해 드려요.
          </p>
        )}
      </Card>

      {eligibility.conditions.length > 0 ? (
        <ul className="space-y-2">
          {eligibility.conditions.map((condition, index) => (
            <ConditionRow
              key={`${condition.condition_type}-${index}`}
              condition={condition}
              sourceUrl={item.sourceUrl}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {eligibility.overall === 'not_applicable'
            ? '이 저장 정보에는 개인 자격 조건을 확인할 내용이 없어요.'
            : '원문에서 확인된 참여 조건이 없어요.'}
        </p>
      )}

      {!(eligibility.overall === 'not_applicable' && feasibility.days_remaining === null) && <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-semibold">준비 여유</strong>
          <Badge variant="secondary" className="h-5 px-2 text-[11px]">
            {FEASIBILITY_LABEL[feasibility.level]}
          </Badge>
          {typeof feasibility.days_remaining === 'number' && (
            <span className="text-xs tabular-nums text-muted-foreground">
              마감까지 {feasibility.days_remaining}일
            </span>
          )}
        </div>
        {feasibility.reasons.length > 0 && (
          <ul className="mt-2 space-y-1">
            {feasibility.reasons.map((reason) => (
              <li key={reason} className="text-sm text-muted-foreground">
                · {reason}
              </li>
            ))}
          </ul>
        )}
        {feasibility.warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {feasibility.warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-1.5 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {warning}
              </li>
            ))}
          </ul>
        )}
      </Card>}
    </div>
  );
}
