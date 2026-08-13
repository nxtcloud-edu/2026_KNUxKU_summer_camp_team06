import { useState } from 'react';
import { Bell, Bookmark, CalendarDays, CheckCircle2, Compass, MessageCircle, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

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
            <button className="icon-button notification-trigger" type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="알림">
              <Bell size={19} /><span className="unread-dot" />
            </button>
            <NavLink to="/profile" className="top-avatar" aria-label="내 정보">수</NavLink>
          </div>
          <div className={`notification-popover ${notificationsOpen ? 'is-open' : ''}`}>
            <div className="popover-head"><strong>알림</strong><button type="button" onClick={() => setNotificationsOpen(false)} aria-label="알림 닫기"><X size={16} /></button></div>
            <div className="notice-item accent-yellow"><span>D-2</span><p><strong>AWS AI Challenge</strong> 마감이 이틀 남았어요.</p></div>
            <div className="notice-item accent-blue"><span>오늘</span><p>아이디어 한 문장을 정리할 차례예요.</p></div>
          </div>
        </header>
        <main className="content">
          <div key={location.pathname} className="page-enter"><Outlet /></div>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="모바일 주요 메뉴">
        {navigation.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'is-active' : ''}><Icon size={20} /><span>{label}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}
