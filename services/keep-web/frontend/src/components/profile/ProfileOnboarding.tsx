import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { markOnboardingDone, patchProfile, type StoredProfile } from '@/lib/profileStore';

const REGION_PRESETS = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '그 외'];
const STATUS_PRESETS = ['대학생', '대학원생', '취업준비생', '재직자', '프리랜서'];
const INTEREST_PRESETS = ['AI', '클라우드', '콘텐츠', '창업', '디자인', '데이터', '해외', '봉사'];

const STEPS = [
  { key: 'birth', title: '생년월일', because: '만 나이로 나이 조건을 정확히 확인해요.' },
  { key: 'region', title: '거주 지역', because: '지역 제한이 있는 공고를 걸러 내요.' },
  { key: 'interests', title: '관심 분야', because: '비슷한 기회를 먼저 보여드려요.' },
] as const;

/**
 * 3스텝 온보딩.
 * 각 단계마다 "이 값이 어디에 쓰이는지"를 함께 보여줘서
 * 입력을 건너뛰면 왜 조건이 '확인 필요'로 남는지 알 수 있게 한다.
 */
export function ProfileOnboarding({
  profile,
  onFinish,
  onSkip,
}: {
  profile: StoredProfile;
  onFinish: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? '');
  const [region, setRegion] = useState(profile.region ?? '');
  const [status, setStatus] = useState(profile.status ?? '');
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);

  const current = STEPS[step];
  const canGoNext =
    step === 0 ? birthDate.length > 0 : step === 1 ? region.trim().length > 0 && status.length > 0 : true;

  const save = () => {
    patchProfile({
      birth_date: birthDate || undefined,
      region: region.trim() || undefined,
      status: status || undefined,
      interests,
    });
    markOnboardingDone();
    onFinish();
  };

  return (
    <div className="tw-root mb-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <strong className="text-lg font-bold">조건 판정에 쓸 정보만 받아요</strong>
          <Badge variant="secondary" className="h-5 px-2 text-[11px]">
            {step + 1} / {STEPS.length}
          </Badge>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onSkip}>
            나중에 하기
          </Button>
        </div>

        <ol className="mt-4 flex gap-2">
          {STEPS.map((item, index) => (
            <li
              key={item.key}
              className={cn(
                'flex-1 rounded-full border px-3 py-1.5 text-center text-xs font-semibold',
                index < step && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                index === step && 'border-primary/40 bg-primary/5 text-foreground',
                index > step && 'bg-muted/40 text-muted-foreground',
              )}
            >
              {index < step ? <Check className="mx-auto h-3.5 w-3.5" /> : item.title}
            </li>
          ))}
        </ol>

        <p className="mt-4 text-sm text-muted-foreground">{current.because}</p>

        <div className="mt-3 space-y-4">
          {step === 0 && (
            <div className="space-y-2">
              <Label htmlFor="onboarding-birth">생년월일</Label>
              <Input
                id="onboarding-birth"
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                연도만 있으면 만 나이가 하루 차이로 어긋날 수 있어 전체 날짜를 받아요.
              </p>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>거주 지역</Label>
                <div className="flex flex-wrap gap-2">
                  {REGION_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant={region === preset ? 'default' : 'outline'}
                      size="sm"
                      className={region === preset ? '' : 'bg-transparent'}
                      onClick={() => setRegion(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
                <Input
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  placeholder="예: 서울 관악구"
                  className="max-w-xs"
                />
              </div>

              <div className="space-y-2">
                <Label>현재 상태</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant={status === preset ? 'default' : 'outline'}
                      size="sm"
                      className={status === preset ? '' : 'bg-transparent'}
                      onClick={() => setStatus(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label>관심 분야 (여러 개 선택 가능)</Label>
              <div className="flex flex-wrap gap-2">
                {INTEREST_PRESETS.map((preset) => {
                  const selected = interests.includes(preset);
                  return (
                    <Button
                      key={preset}
                      type="button"
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      className={selected ? '' : 'bg-transparent'}
                      onClick={() =>
                        setInterests((current2) =>
                          current2.includes(preset)
                            ? current2.filter((item) => item !== preset)
                            : [...current2, preset],
                        )
                      }
                    >
                      {preset}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2">
          {step > 0 && (
            <Button variant="outline" className="gap-1.5 bg-transparent" onClick={() => setStep((value) => value - 1)}>
              <ArrowLeft className="h-4 w-4" />
              이전
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button className="gap-1.5" disabled={!canGoNext} onClick={() => setStep((value) => value + 1)}>
              다음
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="gap-1.5" onClick={save}>
              저장하고 조건 다시 확인
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {!canGoNext && (
            <span className="text-xs text-muted-foreground">
              이 값을 비우면 해당 조건은 ‘확인 필요’로 남아요.
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
