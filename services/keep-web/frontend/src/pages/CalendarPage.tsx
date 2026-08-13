import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import {
  EventManager,
  type Event,
  type EventColor,
  type EventManagerLabels,
} from '@/components/ui/event-manager';
import { opportunities } from '@/data';
import { decisionOf } from '@/lib/decisionView';
import { useDecisions } from '@/lib/decisionStore';
import { matchesKorean } from '@/lib/koreanSearch';
import { allPlans, parseDeadline, setTaskDue, usePlanOverrides } from '@/lib/planStore';

const CATEGORIES = ['준비 단계', '마감', '내 일정'];

const COLORS: EventColor[] = [
  { name: '준비 단계', value: 'blue', bg: 'bg-blue-500', text: 'text-blue-700' },
  { name: '마감', value: 'red', bg: 'bg-red-500', text: 'text-red-700' },
  { name: '내 일정', value: 'purple', bg: 'bg-purple-500', text: 'text-purple-700' },
  { name: '학습', value: 'green', bg: 'bg-green-500', text: 'text-green-700' },
  { name: '미팅', value: 'orange', bg: 'bg-orange-500', text: 'text-orange-700' },
  { name: '개인', value: 'pink', bg: 'bg-pink-500', text: 'text-pink-700' },
];

const AVAILABLE_TAGS = ['중요', '급함', '공모전', '지원 정책', '교육', '대외활동'];

const TAGS_BY_CATEGORY: Record<string, string[]> = {
  공모전: ['공모전'],
  '교육·훈련': ['교육'],
  '지원 정책': ['지원 정책'],
  대외활동: ['대외활동'],
};

const LABELS: Partial<EventManagerLabels> = {
  monthView: '월 단위',
  weekView: '주 단위',
  dayView: '하루',
  listView: '목록',
  month: '월',
  week: '주',
  day: '일',
  list: '목록',
  weekOf: (date) => `${date} 주간`,
  allEvents: '전체 일정',
  today: '오늘',
  newEvent: '일정 추가',
  searchPlaceholder: '일정 검색',
  clearSearch: '검색어 지우기',
  colors: '색상',
  tags: '태그',
  categories: '분류',
  filterByColor: '색상으로 필터',
  filterByTag: '태그로 필터',
  filterByCategory: '분류로 필터',
  clear: '초기화',
  clearFilters: '필터 초기화',
  activeFilters: '적용한 필터:',
  createTitle: '일정 추가',
  createDescription: '캘린더에 새 일정을 등록해요.',
  detailTitle: '일정 상세',
  detailDescription: '일정을 확인하고 수정할 수 있어요.',
  titleField: '일정 이름',
  titlePlaceholder: '예: 지원서 초안 작성',
  descriptionField: '메모',
  descriptionPlaceholder: '준비할 내용을 적어두세요.',
  startTimeField: '시작',
  endTimeField: '종료',
  categoryField: '분류',
  selectCategory: '분류 선택',
  colorField: '색상',
  selectColor: '색상 선택',
  tagsField: '태그',
  delete: '삭제',
  cancel: '취소',
  create: '추가',
  save: '저장',
  weekdays: ['일', '월', '화', '수', '목', '금', '토'],
  timeColumn: '시간',
  more: (count) => `+${count}개 더`,
  noEvents: '조건에 맞는 일정이 없어요.',
  hourSuffix: '시간',
  minuteSuffix: '분',
  selectedDayLabel: '선택한 날',
  noEventsForDay: '이날은 정해진 일정이 없어요.',
  eventCount: (count) => `일정 ${count}개`,
  showAllHours: '하루 전체',
  showCoreHours: '주요 시간대',
  outsideRange: '이 시간대 밖의 일정',
  previousPeriod: '이전',
  nextPeriod: '다음',
};

export const PLAN_EVENT_PREFIX = 'plan:';
export const DEADLINE_EVENT_PREFIX = 'deadline:';

export function CalendarPage() {
  const decisions = useDecisions();
  const overrides = usePlanOverrides();

  const events = useMemo<Event[]>(() => {
    const plans = allPlans(overrides);
    const result: Event[] = [];

    for (const { item, tasks } of plans) {
      const decision = decisionOf(decisions, item);
      if (decision === 'archived') continue;
      const tags = TAGS_BY_CATEGORY[item.category] ?? [];

      // 마감은 사실이므로 옮길 수 없다.
      const deadline = parseDeadline(item.deadline);
      if (deadline) {
        const end = new Date(deadline);
        end.setHours(end.getHours() + 1);
        result.push({
          id: `${DEADLINE_EVENT_PREFIX}${item.id}`,
          title: `${item.title} 마감`,
          description: item.dDay === null ? item.organization : `${item.organization} · D-${item.dDay}`,
          startTime: deadline,
          endTime: end,
          color: 'red',
          category: '마감',
          tags: [...tags, '중요'],
          locked: true,
        });
      }

      // 준비 단계는 참여하기로 한 기회에만 채운다.
      if (decision !== 'joined') continue;
      for (const task of tasks) {
        const start = new Date(task.dueAt);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);
        result.push({
          id: `${PLAN_EVENT_PREFIX}${item.id}:${task.id}`,
          title: task.done ? `✓ ${task.title}` : task.title,
          description: `${item.title} · ${task.note}`,
          startTime: start,
          endTime: end,
          color: 'blue',
          category: '준비 단계',
          tags,
        });
      }
    }

    return result;
  }, [decisions, overrides]);

  // 캘린더에서 단계를 옮기면 실행 계획의 날짜도 함께 바뀐다.
  const handleUpdate = useCallback((id: string, patch: Partial<Event>) => {
    if (!id.startsWith(PLAN_EVENT_PREFIX) || !patch.startTime) return;
    const [opportunityId, taskId] = id.slice(PLAN_EVENT_PREFIX.length).split(':');
    if (!opportunityId || !taskId) return;
    setTaskDue(opportunityId, taskId, patch.startTime);
  }, []);

  const joinedCount = opportunities.filter((item) => decisionOf(decisions, item) === 'joined').length;

  return (
    <div className="page">
      <section className="page-intro">
        <p className="section-label">DEADLINE MAP</p>
        <h2>
          마감에서 거꾸로
          <br />
          계산한 일정이에요
        </h2>
        <p>
          {joinedCount > 0
            ? '참여하기로 한 기회의 준비 단계와 마감을 함께 보여드려요. 단계를 끌어 옮기면 실행 계획도 같이 바뀝니다.'
            : '지금은 마감만 표시돼요. 기회를 열어 ‘이거 할래!’를 누르면 준비 단계가 여기에 채워집니다.'}{' '}
          <Link to="/plan" className="inline-link">실행 계획 보기</Link>
        </p>
      </section>

      <EventManager
        events={events}
        categories={CATEGORIES}
        colors={COLORS}
        availableTags={AVAILABLE_TAGS}
        defaultView="month"
        locale="ko-KR"
        labels={LABELS}
        showAgenda
        hourRange={[8, 22]}
        matchQuery={matchesKorean}
        onEventUpdate={handleUpdate}
      />
    </div>
  );
}

export default CalendarPage;
