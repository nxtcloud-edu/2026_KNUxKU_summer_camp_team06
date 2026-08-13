import {
  Archive,
  Bookmark,
  Puzzle,
  Clock3,
  FileQuestion,
  MousePointerClick,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type SavedEmptyVariant = 'firstRun' | 'noResults' | 'emptyTab' | 'allArchived';

const TAB_COPY: Record<string, { title: string; body: string; icon: typeof Bookmark }> = {
  '마감 임박': {
    title: '이번 주에 급한 기회는 없어요',
    body: '7일 안에 마감되는 기회가 생기면 여기에 모아 드려요.',
    icon: Clock3,
  },
  '확인 필요': {
    title: '확인이 필요한 조건이 없어요',
    body: '조건 판정에서 확인 필요가 남은 기회가 여기에 표시돼요.',
    icon: FileQuestion,
  },
  '참여 결정': {
    title: '아직 참여를 결정한 기회가 없어요',
    body: '기회를 열어 ‘이거 할래!’를 누르면 여기와 실행 계획에 함께 쌓여요.',
    icon: Sparkles,
  },
  '나중에': {
    title: '보류한 기회가 없어요',
    body: '지금 결정하기 어려운 기회는 ‘나중에’로 미뤄 두면 3일 뒤 다시 알려드려요.',
    icon: Clock3,
  },
  '보관': {
    title: '보관한 기회가 없어요',
    body: '‘안 할래’를 누른 기회는 목록에서 숨기고 여기에 보관해요.',
    icon: Archive,
  },
};

/** 첫 사용자에게는 유도, 필터 결과가 없을 때는 되돌리기를 보여준다. */
export function SavedEmptyState({
  variant,
  filter,
  query,
  hasQuery,
  onClearQuery,
  onResetFilter,
  onShowArchived,
}: {
  variant: SavedEmptyVariant;
  filter: string;
  query: string;
  hasQuery: boolean;
  onClearQuery: () => void;
  onResetFilter: () => void;
  onShowArchived: () => void;
}) {
  if (variant === 'firstRun') {
    return (
      <div className="tw-root">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary" />
            <strong className="text-lg font-bold">아직 저장한 기회가 없어요</strong>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Instagram이나 Threads에서 마음에 드는 공고를 발견했을 때 Keep 한 번만 누르면, 조건과 마감을 정리해
            카드로 만들어 드려요.
          </p>

          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Puzzle, step: '1', title: '확장프로그램 열기', body: '브라우저 도구 모음에서 KEEP:ON 아이콘을 눌러요.' },
              { icon: MousePointerClick, step: '2', title: '현재 페이지 Keep', body: '보고 있는 게시물에서 Keep 버튼을 눌러요.' },
              { icon: Sparkles, step: '3', title: '카드로 확인', body: '정리가 끝나면 이 목록에 카드가 생겨요.' },
            ].map(({ icon: Icon, step, title, body }) => (
              <li key={step} className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">STEP {step}</span>
                </div>
                <strong className="mt-2 block text-sm font-semibold">{title}</strong>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link to="/profile">내 정보 먼저 채우기</Link>
            </Button>
            <span className="text-xs text-muted-foreground">
              생년월일과 지역을 채우면 나이·지역 조건을 자동으로 확인해 드려요.
            </span>
          </div>
        </Card>
      </div>
    );
  }

  if (variant === 'allArchived') {
    return (
      <div className="tw-root">
        <Card className="p-6 text-center">
          <Archive className="mx-auto h-6 w-6 text-muted-foreground" />
          <strong className="mt-3 block text-base font-bold">모든 기회를 정리했어요</strong>
          <p className="mt-1.5 text-sm text-muted-foreground">
            보관한 기회는 보관 탭에서 다시 꺼낼 수 있어요.
          </p>
          <Button variant="outline" className="mt-4 bg-transparent" onClick={onShowArchived}>
            보관함 보기
          </Button>
        </Card>
      </div>
    );
  }

  if (variant === 'noResults') {
    return (
      <div className="tw-root">
        <Card className="p-6 text-center">
          <Search className="mx-auto h-6 w-6 text-muted-foreground" />
          <strong className="mt-3 block text-base font-bold">
            {hasQuery ? `‘${query}’ 검색 결과가 없어요` : '조건에 맞는 기회가 없어요'}
          </strong>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {hasQuery
              ? '초성으로도 찾을 수 있어요. 검색어를 줄이거나 필터를 풀어 보세요.'
              : '필터를 풀면 저장한 기회를 모두 볼 수 있어요.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {hasQuery && (
              <Button variant="outline" className="gap-1.5 bg-transparent" onClick={onClearQuery}>
                <RotateCcw className="h-4 w-4" />
                검색어 지우기
              </Button>
            )}
            {filter !== '전체' && (
              <Button variant="outline" className="gap-1.5 bg-transparent" onClick={onResetFilter}>
                <RotateCcw className="h-4 w-4" />
                필터 초기화
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const copy = TAB_COPY[filter] ?? {
    title: '표시할 기회가 없어요',
    body: '다른 탭을 확인해 보세요.',
    icon: Bookmark,
  };
  const Icon = copy.icon;

  return (
    <div className="tw-root">
      <Card className="p-6 text-center">
        <Icon className="mx-auto h-6 w-6 text-muted-foreground" />
        <strong className="mt-3 block text-base font-bold">{copy.title}</strong>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
        <Button variant="outline" className="mt-4 gap-1.5 bg-transparent" onClick={onResetFilter}>
          <RotateCcw className="h-4 w-4" />
          전체 보기
        </Button>
      </Card>
    </div>
  );
}
