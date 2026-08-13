import { AlertTriangle, Check, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { opportunities } from '@/data';
import {
  PROFILE_FIELDS,
  completionRatio,
  isFieldFilled,
  type StoredProfile,
} from '@/lib/profileStore';
import { cn } from '@/lib/utils';

/** 프로필 항목 → 어떤 조건 판정에 쓰이는지, 비었을 때 무슨 일이 생기는지 보여준다. */
export function ProfileImpact({ profile }: { profile: StoredProfile }) {
  const ratio = completionRatio(profile);
  const missing = PROFILE_FIELDS.filter(({ key }) => !isFieldFilled(profile, key));
  const needsCheckCount = opportunities.filter((item) => item.verdict === 'needsCheck').length;

  return (
    <div className="tw-root">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <strong className="text-base font-bold">이 정보가 조건 판정에 이렇게 쓰여요</strong>
          <Badge variant="secondary" className="h-5 px-2 text-[11px] tabular-nums">
            {Math.round(ratio * 100)}% 입력
          </Badge>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${ratio * 100}%` }} />
        </div>

        <ul className="mt-4 space-y-2">
          {PROFILE_FIELDS.map((field) => {
            const filled = isFieldFilled(profile, field.key);
            return (
              <li
                key={field.key}
                className={cn(
                  'rounded-lg border p-3',
                  filled ? 'border-emerald-200 bg-emerald-50/60' : 'bg-muted/30',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {filled ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  )}
                  <strong className="text-sm font-semibold">{field.label}</strong>
                  <span className="text-xs text-muted-foreground">→ {field.conditionLabel}</span>
                  <Badge
                    variant="outline"
                    className={cn('ml-auto h-5 px-2 text-[11px]', !filled && 'border-amber-300 text-amber-800')}
                  >
                    {filled ? '판정에 사용 중' : '미입력'}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {filled ? field.why : field.missing}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-sm text-muted-foreground">
          {missing.length === 0
            ? '필요한 정보가 모두 채워졌어요. 저장한 기회의 조건을 자동으로 확인해 드려요.'
            : `${missing.map((field) => field.label).join(', ')}이 비어 있어 일부 조건은 ‘확인 필요’로 남아요.`}
          {needsCheckCount > 0 && (
            <>
              {' '}
              지금{' '}
              <Link to="/saved" className="font-semibold text-primary hover:underline">
                확인이 필요한 기회 {needsCheckCount}건
              </Link>
              이 있어요.
            </>
          )}
        </p>
      </Card>
    </div>
  );
}
