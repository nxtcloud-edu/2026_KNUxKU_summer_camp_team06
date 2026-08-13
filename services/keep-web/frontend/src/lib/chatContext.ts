import { opportunities, type Opportunity } from '@/data';
import { formatPlanDate, planFor, type PlanTask } from '@/lib/planStore';

/** 챗 시작 화면의 추천 질문 3개 (맥락 없음) */
export const GENERAL_SUGGESTIONS = [
  '이번 주에 마감되는 기회 알려줘',
  '지금 뭐부터 하면 돼?',
  '확인이 필요한 조건이 뭐야?',
] as const;

/** 특정 기회를 들고 왔을 때의 추천 질문 3개 */
export const OPPORTUNITY_SUGGESTIONS = [
  '내 조건에 맞아?',
  '뭐부터 준비하면 돼?',
  '마감까지 일정이 어떻게 돼?',
] as const;

export interface AnswerContext {
  item?: Opportunity;
  tasks?: PlanTask[];
  planOverrides?: Parameters<typeof planFor>[1];
}

const dDayLabel = (item: Opportunity) => item.dDay === null ? '마감 정보가 없어요' : `D-${item.dDay} (마감 ${item.deadline})`;

function conditionAnswer(item: Opportunity) {
  const lines = item.eligibility.map((condition) => `· ${condition}`).join('\n');
  const tail =
    item.verdict === 'needsCheck'
      ? '\n\n소득·지역처럼 원문만으로 판단할 수 없는 조건이 남아 있어요. 내 정보를 채우면 자동으로 다시 확인해 드려요.'
      : '\n\n지금 프로필 기준으로는 걸리는 조건이 보이지 않아요. 상세 화면의 판정 근거에서 원문 문장도 확인할 수 있어요.';
  return `‘${item.title}’의 참여 조건은 이렇게 적혀 있어요.\n\n${lines}${tail}`;
}

function prepareAnswer(item: Opportunity, tasks: PlanTask[]) {
  const remaining = tasks.filter((task) => !task.done);
  if (!remaining.length) {
    return `‘${item.title}’은 준비 단계를 모두 마쳤어요. 제출물만 마지막으로 확인하면 됩니다.`;
  }
  const [next, ...rest] = remaining;
  const restLines = rest.map((task) => `· ${formatPlanDate(task.dueAt)} — ${task.title}`).join('\n');
  return [
    `가장 먼저 할 일은 ${formatPlanDate(next.dueAt)}까지 ‘${next.title}’이에요.`,
    rest.length ? `그다음은 이렇게 이어져요.\n${restLines}` : '',
    `마감은 ${dDayLabel(item)}이에요.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function scheduleAnswer(item: Opportunity, tasks: PlanTask[]) {
  const lines = tasks
    .map((task) => `· ${formatPlanDate(task.dueAt)} — ${task.title}${task.done ? ' (완료)' : ''}`)
    .join('\n');
  return `‘${item.title}’은 ${dDayLabel(item)}이고, 마감에서 거꾸로 계산한 일정은 이래요.\n\n${lines}\n\n캘린더에서 단계를 끌어 옮기면 이 일정도 함께 바뀝니다.`;
}

function weeklyAnswer(overrides: AnswerContext['planOverrides']) {
  const soon = opportunities.filter((item) => item.dDay !== null && item.dDay <= 7);
  if (!soon.length) return '이번 주에 마감되는 기회는 없어요. 다음 주 마감은 실행 계획 화면에서 확인할 수 있어요.';
  const lines = soon
    .map((item) => {
      const tasks = overrides ? planFor(item, overrides) : [];
      const next = tasks.find((task) => !task.done);
      return `· ${dDayLabel(item)} — ${item.title}${next ? ` / 다음: ${next.title}` : ''}`;
    })
    .join('\n');
  return `7일 안에 마감되는 기회는 ${soon.length}건이에요.\n\n${lines}`;
}

function needsCheckAnswer() {
  const items = opportunities.filter((item) => item.verdict === 'needsCheck');
  if (!items.length) return '지금은 확인이 필요한 조건이 남은 기회가 없어요.';
  const lines = items.map((item) => `· ${item.title} — ${item.reason}`).join('\n');
  return `조건을 더 확인해야 하는 기회는 ${items.length}건이에요.\n\n${lines}\n\n내 정보의 생년월일·지역·소득 항목을 채우면 자동으로 다시 판정해요.`;
}

function overviewAnswer(item: Opportunity, tasks: PlanTask[]) {
  const next = tasks.find((task) => !task.done);
  return [
    `‘${item.title}’은 ${item.organization}에서 진행하는 ${item.category}이고, ${dDayLabel(item)}이에요.`,
    item.summary,
    next ? `다음 할 일은 ${formatPlanDate(next.dueAt)}까지 ‘${next.title}’이에요.` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 저장한 데이터만으로 답을 구성한다. 모델 호출이 아니라 규칙 기반 요약이므로
 * 원문에 없는 내용은 만들지 않는다.
 */
export function answerFor(question: string, context: AnswerContext): string {
  const q = question.replace(/\s/g, '');
  const { item, tasks = [], planOverrides } = context;

  if (/이번주|이번\s*주|금주/.test(q) || (/마감/.test(q) && !item)) {
    return weeklyAnswer(planOverrides);
  }
  if (/확인.*필요|조건.*확인|자격/.test(q) && !item) {
    return needsCheckAnswer();
  }

  if (!item) {
    return '어떤 기회에 대해 물어볼지 카드에서 ‘이거 물어보기’를 눌러 주세요. 저장한 정보와 일정만 근거로 답해 드려요.';
  }

  if (/조건|자격|맞아|가능해/.test(q)) return conditionAnswer(item);
  if (/뭐부터|먼저|준비|시작/.test(q)) return prepareAnswer(item, tasks);
  if (/마감|일정|언제|스케줄/.test(q)) return scheduleAnswer(item, tasks);
  return overviewAnswer(item, tasks);
}
