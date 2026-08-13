import { useCallback, useMemo, useState } from 'react';

import { opportunities } from '@/data';
import { resolveDecision, useDecisions } from '@/lib/decisionStore';
import { formatPlanDate, planFor, startOfDay, usePlanOverrides } from '@/lib/planStore';
import { missingRequired, useStoredProfile } from '@/lib/profileStore';

export type NoticeTone = 'urgent' | 'today' | 'info';

export interface Notice {
  id: string;
  tone: NoticeTone;
  badge: string;
  title: string;
  body: string;
  /** 클릭하면 이동할 화면 */
  to: string;
}

const READ_KEY = 'keep-on-notices-read';

function readSeen(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(READ_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeen(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // 무시
  }
}

const TONE_ORDER: Record<NoticeTone, number> = { urgent: 0, today: 1, info: 2 };

/** 마감 임박 알림은 D-7 / D-3 / D-1 구간에서만 만든다. */
function deadlineBucket(dDay: number): { badge: string; tone: NoticeTone; key: string } | null {
  if (dDay < 0) return null;
  if (dDay <= 1) return { badge: dDay === 0 ? '오늘 마감' : 'D-1', tone: 'urgent', key: 'd1' };
  if (dDay <= 3) return { badge: `D-${dDay}`, tone: 'urgent', key: 'd3' };
  if (dDay <= 7) return { badge: `D-${dDay}`, tone: 'today', key: 'd7' };
  return null;
}

export function useNotifications(now = new Date()) {
  const decisions = useDecisions();
  const overrides = usePlanOverrides();
  const profile = useStoredProfile();
  const [seen, setSeen] = useState<string[]>(readSeen);

  const notices = useMemo<Notice[]>(() => {
    const today = startOfDay(now);
    const result: Notice[] = [];

    for (const item of opportunities) {
      const record = resolveDecision(decisions, item.id, item.initialDecision);
      if (record.state === 'archived') continue;

      const bucket = deadlineBucket(item.dDay);
      if (bucket) {
        result.push({
          id: `deadline:${item.id}:${bucket.key}`,
          tone: bucket.tone,
          badge: bucket.badge,
          title: item.title,
          body: `마감이 ${item.deadline}이에요. 지금 확인하면 준비할 시간이 있어요.`,
          to: `/saved/${item.id}`,
        });
      }

      // 보류 기간이 끝난 기회는 다시 올려 준다.
      if (record.state === 'later' && record.snoozeUntil && new Date(record.snoozeUntil) <= now) {
        result.push({
          id: `snooze:${item.id}:${record.snoozeUntil.slice(0, 10)}`,
          tone: 'today',
          badge: '다시 보기',
          title: item.title,
          body: '나중에 보기로 미뤄 둔 기회예요. 지금 결정해 볼까요?',
          to: `/saved/${item.id}`,
        });
      }

      // 참여하기로 한 기회의 오늘·지난 단계
      if (record.state === 'joined') {
        for (const task of planFor(item, overrides, now)) {
          if (task.done) continue;
          const due = startOfDay(new Date(task.dueAt));
          if (due.getTime() > today.getTime()) continue;
          const overdue = due.getTime() < today.getTime();
          result.push({
            id: `task:${item.id}:${task.id}:${task.dueAt.slice(0, 10)}`,
            tone: overdue ? 'urgent' : 'today',
            badge: overdue ? '지난 단계' : '오늘',
            title: task.title,
            body: overdue
              ? `${formatPlanDate(task.dueAt)}까지였던 단계예요. 일정을 다시 잡아도 좋아요.`
              : `${item.title}의 오늘 할 단계예요.`,
            to: `/plan/${item.id}`,
          });
        }
      }
    }

    // 프로필이 비어 조건 판정이 막혀 있으면 한 번 알려 준다.
    const missing = missingRequired(profile);
    const needsCheck = opportunities.filter((item) => item.verdict === 'needsCheck').length;
    if (missing.length > 0 && needsCheck > 0) {
      result.push({
        id: `profile:${missing.join('-')}`,
        tone: 'info',
        badge: '확인 필요',
        title: '내 정보를 채우면 조건을 자동으로 확인해요',
        body: `${needsCheck}건의 기회에서 조건이 ‘확인 필요’로 남아 있어요.`,
        to: '/profile',
      });
    }

    return result.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  }, [decisions, overrides, profile, now]);

  const unread = notices.filter((notice) => !seen.includes(notice.id));

  const markRead = useCallback((id: string) => {
    setSeen((current) => {
      if (current.includes(id)) return current;
      const next = [...current, id];
      writeSeen(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setSeen((current) => {
      const next = Array.from(new Set([...current, ...notices.map((notice) => notice.id)]));
      writeSeen(next);
      return next;
    });
  }, [notices]);

  return { notices, unreadCount: unread.length, isRead: (id: string) => seen.includes(id), markRead, markAllRead };
}
