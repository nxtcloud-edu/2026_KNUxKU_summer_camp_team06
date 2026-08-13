import { useState } from 'react';
import { Bell, Bookmark, CalendarDays, CheckCircle2, Compass, MessageCircle, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';

import { IntakeProgress } from './storage/IntakeProgress';
import { useIntakeStatus } from '../lib/useIntakeStatus';
import { useNotifications } from '../lib/notifications';

const navigation = [
  { to: '/', label: '오늘', icon: Compass },
  { to: '/saved', label: '저장', icon: Bookmark },
  { to: '/plan', label: '실행', icon: CheckCircle2 },
  { to: '/calendar', label: '일정', icon: CalendarDays },
  { to: '/chat', label: 'AI 대화', icon: MessageCircle },
];

const titles: Record<string, string> = {
  '/': '오늘',
  '/saved': '저장한 정보',
  '/plan': '실행 계획',
  '/calendar': '일정',
  '/chat': 'AI 대화',
  '/profile': '내 정보',
};

export function AppShell() {
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // 확장프로그램은 Keep 직후 /?intake_id=... 로 웹을 연다. 어느 화면에서든 처리 상태를 보여준다.
  const [searchParams, setSearchParams] = useSearchParams();
  const [dismissedIntake, setDismissedIntake] = useState<string | null>(null);
  const intakeParam = searchParams.get('intake_id');
  const intakeId = intakeParam && intakeParam !== dismissedIntake ? intakeParam : null;
  const intake = useIntakeStatus(intakeId);
  const dismissIntake = () => {
    setDismissedIntake(intakeParam);
    const next = new URLSearchParams(searchParams);
    next.delete('intake_id');
    setSearchParams(next, { replace: true });
  };
  const { notices, unreadCount, isRead, markRead, markAllRead } = useNotifications();
  const rootPath = '/' + location.pathname.split('/').filter(Boolean)[0];
  const pageTitle = titles[location.pathname] || titles[rootPath] || 'KEEP:ON';

  return (
    <div className="app-shell">
      <div className="workspace">
        <header className="topbar">
          <NavLink to="/" className="top-brand" aria-label="KEEP:ON 홈"><span className="top-brand-mark">K</span><span>KEEP:ON</span></NavLink>
          <nav className="top-nav-links" aria-label="주요 메뉴">
            {navigation.map(({ to, label }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'is-active' : ''}>{label}</NavLink>)}
          </nav>
          <span className="top-page-title">{pageTitle}</span>
          <div className="topbar-actions">
            <button
              className="icon-button notification-trigger"
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              aria-label={unreadCount > 0 ? `알림 ${unreadCount}건` : '알림'}
            >
              <Bell size={19} />
              {unreadCount > 0 && <span className="unread-dot" />}
            </button>
            <NavLink to="/profile" className="top-avatar" aria-label="내 정보">수</NavLink>
          </div>
          <div className={`notification-popover ${notificationsOpen ? 'is-open' : ''}`}>
            <div className="popover-head">
              <strong>알림{unreadCount > 0 ? ` ${unreadCount}` : ''}</strong>
              <div className="popover-head-actions">
                {unreadCount > 0 && (
                  <button type="button" className="popover-mark-all" onClick={markAllRead}>모두 읽음</button>
                )}
                <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="알림 닫기"><X size={16} /></button>
              </div>
            </div>
            {notices.length === 0 && (
              <p className="notice-empty">지금 확인할 알림이 없어요. 마감 7일·3일·1일 전과 오늘 할 단계를 여기로 알려드려요.</p>
            )}
            {notices.map((notice) => (
              <Link
                key={notice.id}
                to={notice.to}
                className={`notice-item tone-${notice.tone} ${isRead(notice.id) ? 'is-read' : ''}`}
                onClick={() => { markRead(notice.id); setNotificationsOpen(false); }}
              >
                <span>{notice.badge}</span>
                <p><strong>{notice.title}</strong> {notice.body}</p>
              </Link>
            ))}
          </div>
        </header>
        <main className="content">
          <IntakeProgress state={intake.state} onRetry={intake.retry} onDismiss={dismissIntake} />
          <div key={location.pathname} className="page-enter"><Outlet /></div>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="모바일 주요 메뉴">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'is-active' : ''}><Icon size={20} /><span>{label}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}
