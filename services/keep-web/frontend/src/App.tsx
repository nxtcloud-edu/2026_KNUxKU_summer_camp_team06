import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { calendarEvents, opportunities, type Opportunity } from './data';

function HomePage() {
  return (
    <div className="page home-page">
      <header className="home-intro">
        <p className="section-label">8월 13일 목요일</p>
        <h2>수정님을 위해<br />기회를 <em>정리했어요</em></h2>
        <p>저장한 정보 중 지금 확인하면 좋은 기회를 분류해 두었어요.</p>
      </header>

      <DashboardRail title="오늘 확인할 기회" subtitle="가장 가까운 마감과 다음 행동을 모았어요" items={opportunities} />
      <DashboardRail title="마감이 가까워요" subtitle="이번 주 안에 결정하면 충분한 기회예요" items={opportunities.filter((item) => item.dDay <= 11)} />
      <DashboardRail title="수정님의 관심 분야" subtitle="클라우드와 콘텐츠 경험을 이어갈 수 있는 추천이에요" items={[opportunities[1], opportunities[3], opportunities[0]]} />
    </div>
  );
}

function DashboardRail({ title, subtitle, items }: { title: string; subtitle: string; items: Opportunity[] }) {
  return (
    <section className="dashboard-section">
      <div className="dashboard-section-head">
        <div><h3>{title}</h3><p>{subtitle}</p></div>
        <Link to="/saved">전체 보기 <ArrowRight size={16} /></Link>
      </div>
      <div className="opportunity-rail">
        {items.map((item, index) => <DashboardOpportunityCard key={item.id} item={item} rank={index + 1} />)}
      </div>
    </section>
  );
}

function DashboardOpportunityCard({ item, rank }: { item: Opportunity; rank: number }) {
  const nextTask = item.tasks.find((task) => !task.done)?.title || '모든 단계 완료';
  return (
    <Link to={`/saved/${item.id}`} className={`dashboard-opportunity-card accent-${item.accent}`}>
      <span className="opportunity-rank" aria-hidden="true">{rank}</span>
      <div className={`opportunity-card-art opportunity-preview-${rank}`} aria-hidden="true"><span /><i /><b /><em /></div>
      <div className="opportunity-card-copy">
        <div><span>{item.category}</span><strong>D-{item.dDay}</strong></div>
        <h4>{item.title}</h4>
        <p>{item.organization}</p>
        <small>다음: {nextTask}</small>
      </div>
    </Link>
  );
}

function SavedPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('전체');
  const filters = ['전체', '마감 임박', '확인 필요', '참여 결정'];
  const filtered = useMemo(() => opportunities.filter((item) => {
    const matchesQuery = [item.title, item.organization, item.category].join(' ').toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === '전체'
      || (filter === '마감 임박' && item.dDay <= 7)
      || (filter === '확인 필요' && item.id === 'youth-rent')
      || (filter === '참여 결정' && item.id === 'aws-ai-challenge');
    return matchesQuery && matchesFilter;
  }), [filter, query]);

  return (
    <div className="page">
      <section className="page-intro">
        <p className="section-label">MY SAVES</p>
        <h2>저장한 정보가<br />기회가 되는 곳</h2>
        <p>Instagram과 Threads에서 Keep한 정보만 모았어요. 하나씩 열어보고 결정하면 됩니다.</p>
      </section>
      <div className="library-toolbar">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 기관, 분야 검색" /></label>
        <button className="filter-button" type="button"><Filter size={17} />정렬</button>
      </div>
      <div className="filter-tabs" role="tablist" aria-label="저장 정보 필터">
        {filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={filter === item ? 'is-active' : ''}>{item}</button>)}
      </div>
      <div className="library-summary"><strong>{filtered.length}</strong><span>개의 저장 정보</span></div>
      <div className="opportunity-list">
        {filtered.map((item) => <OpportunityRow key={item.id} item={item} />)}
      </div>
      {!filtered.length && <div className="empty-state"><Bookmark size={24} /><strong>조건에 맞는 정보가 없어요</strong><p>다른 검색어나 필터를 선택해 보세요.</p></div>}
    </div>
  );
}

function OpportunityRow({ item }: { item: Opportunity }) {
  return (
    <Link to={`/saved/${item.id}`} className={`opportunity-row accent-${item.accent}`}>
      <div className="row-main">
        <div className="row-meta"><span>{item.category}</span><span>{item.savedFrom} · {item.savedAt} 저장</span></div>
        <h3>{item.title}</h3>
        <p>{item.organization}</p>
      </div>
      <div className="row-reason"><span>KEEP:ON 한줄 요약</span><p>{item.reason}</p></div>
      <div className="row-deadline"><strong>D-{item.dDay}</strong><span>{item.deadline}</span></div>
      <ArrowRight className="row-arrow" size={19} />
    </Link>
  );
}

function OpportunityDetailPage() {
  const { id } = useParams();
  const item = opportunities.find((opportunity) => opportunity.id === id);
  if (!item) return <Navigate to="/saved" replace />;
  return (
    <div className="page detail-page">
      <Link to="/saved" className="back-link"><ArrowLeft size={17} />저장 목록</Link>
      <section className={`detail-hero accent-${item.accent}`}>
        <div className="detail-top"><span>{item.category}</span><button type="button" aria-label="더 보기"><MoreHorizontal size={20} /></button></div>
        <p className="organization">{item.organization}</p>
        <h2>{item.title}</h2>
        <div className="detail-deadline"><strong>D-{item.dDay}</strong><span>마감 {item.deadline}</span></div>
      </section>

      <section className="reason-panel">
        <div className="reason-icon"><Sparkles size={21} /></div>
        <div><span>KEEP:ON이 이렇게 봤어요</span><p>{item.reason}</p></div>
      </section>

      <div className="detail-columns">
        <div className="detail-main">
          <section className="content-section"><h3>어떤 기회인가요?</h3><p>{item.summary}</p></section>
          <section className="content-section"><h3>참여 조건</h3><ul className="check-list">{item.eligibility.map((condition) => <li key={condition}><Check size={16} />{condition}</li>)}</ul></section>
        </div>
        <aside className="decision-card">
          <span className="section-label">YOUR DECISION</span>
          <h3>이 기회,<br />해볼까요?</h3>
          <p>결정하면 마감일까지 필요한 일을 작은 단계로 나눠드려요.</p>
          <Link to={`/plan/${item.id}`} className="primary-action">이거 할래! <ArrowRight size={17} /></Link>
          <a href="https://example.com" target="_blank" rel="noreferrer" className="secondary-action">원문 확인 <ExternalLink size={15} /></a>
        </aside>
      </div>
    </div>
  );
}

function PlanPage() {
  return (
    <div className="page">
      <section className="page-intro narrow">
        <p className="section-label">ACTION PLAN</p>
        <h2>생각은 짧게,<br />실행은 작게</h2>
        <p>참여하기로 정한 기회를 마감 순서대로 보여드려요.</p>
      </section>
      <div className="plan-stack">
        {opportunities.slice(0, 3).map((item, index) => {
          const done = item.tasks.filter((task) => task.done).length;
          const progress = done / item.tasks.length;
          return (
            <Link to={`/plan/${item.id}`} key={item.id} className={`plan-row accent-${item.accent}`}>
              <span className="plan-number">0{index + 1}</span>
              <div className="plan-copy"><span>{item.category} · D-{item.dDay}</span><h3>{item.title}</h3><p>다음: {item.tasks.find((task) => !task.done)?.title || '모든 단계 완료'}</p></div>
              <div className="mini-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
              <strong>{done}/{item.tasks.length}</strong>
              <ArrowRight size={18} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PlanDetailPage() {
  const { id } = useParams();
  const item = opportunities.find((opportunity) => opportunity.id === id);
  const [doneIds, setDoneIds] = useState(() => new Set(item?.tasks.filter((task) => task.done).map((task) => task.id)));
  if (!item) return <Navigate to="/plan" replace />;
  const done = doneIds.size;
  const progress = done / item.tasks.length;
  const toggle = (taskId: string) => setDoneIds((current) => {
    const next = new Set(current);
    if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
    return next;
  });
  const planNotes = [
    '조건과 일정에서 꼭 확인할 정보만 먼저 골라요.',
    '아이디어와 필요한 자료를 한 문장으로 정리해요.',
    '결정에 필요한 사람과 정보를 빠르게 연결해요.',
    '마감 전에 제출물을 마지막으로 점검해요.',
    '다음 기회를 위해 결과와 배운 점을 남겨요.',
  ];

  return (
    <div className="page plan-detail">
      <Link to="/plan" className="back-link"><ArrowLeft size={17} />실행 계획</Link>
      <div className="plan-detail-head">
        <div><span className="section-label">{item.category} · D-{item.dDay}</span><h2>{item.title}</h2><p>오늘 할 수 있는 것부터 하나씩 완료해 보세요.</p></div>
        <div className={`progress-ring accent-${item.accent}`} style={{ '--progress': `${progress * 360}deg` } as React.CSSProperties}><div><strong>{Math.round(progress * 100)}%</strong><span>완료</span></div></div>
      </div>
      <section className="generated-plan" aria-label={`${item.title} 실행 계획`}>
        <div className="generated-plan-head"><div><span className="section-label">PLANNING AGENT</span><h3>이렇게 시작해 볼까요?</h3></div><span>{done}/{item.tasks.length} 완료</span></div>
        <div className="plan-path">
          {item.tasks.map((task, index) => {
            const isDone = doneIds.has(task.id);
            return <button type="button" key={task.id} aria-pressed={isDone} onClick={() => toggle(task.id)} className={`plan-node plan-tone-${index % 3} ${isDone ? 'is-done' : ''}`}>
              <span className="plan-node-pin"><Pin size={25} fill="currentColor" /></span>
              <span className="plan-node-card"><span className="plan-node-number">{String(index + 1).padStart(2, '0')}</span><strong>{task.title}</strong><small>{planNotes[index] || planNotes[planNotes.length - 1]}</small><em>{isDone ? '완료됨' : task.due}</em></span>
            </button>;
          })}
        </div>
      </section>
      {done === item.tasks.length && <div className="completion-toast"><CheckCircle2 size={19} /><span><strong>멋져요!</strong> 이 기회의 준비를 모두 마쳤어요.</span></div>}
    </div>
  );
}

function CalendarPage() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(13);
  const [view, setView] = useState<'month' | 'week' | 'day' | 'list'>('month');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('해야 할 일');
  const [customEvents, setCustomEvents] = useState<Array<{ day: number; title: string; tone: 'blue' | 'yellow' | 'pink'; category: string }>>([]);
  const baseMonth = 7 + monthOffset;
  const date = new Date(2026, baseMonth, 1);
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const events = monthOffset === 0 ? [...calendarEvents, ...customEvents] : [];
  const categories = ['전체', '해야 할 일', '마감', '준비'];
  const filteredEvents = events.filter((event) => {
    const matchesCategory = category === '전체' || event.category === category;
    return matchesCategory && event.title.toLowerCase().includes(query.toLowerCase());
  });
  const selectedEvents = filteredEvents.filter((event) => event.day === selectedDay);
  const selectedDate = new Date(year, month, selectedDay);
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, index) => new Date(year, month, weekStart.getDate() + index));
  const goToday = () => { setMonthOffset(0); setSelectedDay(13); };
  const addEvent = () => {
    const title = newTitle.trim();
    if (!title) return;
    const tones: Record<string, 'blue' | 'yellow' | 'pink'> = { '해야 할 일': 'blue', 마감: 'yellow', 준비: 'pink' };
    setCustomEvents((current) => [...current, { day: selectedDay, title, category: newCategory, tone: tones[newCategory] }]);
    setNewTitle('');
    setNewCategory('해야 할 일');
    setIsComposerOpen(false);
  };

  return (
    <div className="page calendar-page">
      <section className="calendar-intro"><div><p className="section-label">DEADLINE MAP</p><h2>일정을 한눈에<br />정리해요</h2><p>해야 할 일, 준비할 일, 마감을 색으로 구분해 두었어요.</p></div><div className="calendar-legend" aria-label="일정 분류"><span className="calendar-tone-blue"><i />해야 할 일</span><span className="calendar-tone-yellow"><i />마감</span><span className="calendar-tone-pink"><i />준비</span></div></section>
      <div className="calendar-toolbar">
        <label className="calendar-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="일정 검색" /></label>
        <div className="calendar-view-toggle" aria-label="캘린더 보기 방식"><button type="button" className={view === 'month' ? 'is-active' : ''} onClick={() => setView('month')}><LayoutGrid size={16} />월</button><button type="button" className={view === 'week' ? 'is-active' : ''} onClick={() => setView('week')}><CalendarDays size={16} />주</button><button type="button" className={view === 'day' ? 'is-active' : ''} onClick={() => setView('day')}><CalendarDays size={16} />일</button><button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}><List size={16} />목록</button></div><button type="button" className="calendar-add" onClick={() => setIsComposerOpen(true)}><Plus size={16} />일정 추가</button>
      </div>
      <div className="calendar-filters" role="tablist" aria-label="일정 분류 필터">{categories.map((item) => <button key={item} type="button" className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="calendar-layout">
        <section className="calendar-card">
          <div className="calendar-head">
            <button type="button" onClick={() => setMonthOffset((value) => value - 1)} aria-label="이전 달"><ChevronLeft size={19} /></button>
            <div><h3>{view === 'week' ? `${month + 1}월 ${weekDays[0].getDate()}일 주` : view === 'day' ? `${month + 1}월 ${selectedDay}일` : `${year}년 ${month + 1}월`}</h3><button type="button" className="calendar-today" onClick={goToday}>오늘</button></div>
            <button type="button" onClick={() => setMonthOffset((value) => value + 1)} aria-label="다음 달"><ChevronRight size={19} /></button>
          </div>
          {view === 'month' ? <><div className="weekdays">{['일', '월', '화', '수', '목', '금', '토'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">
            {cells.map((day, index) => {
              const dayEvents = day ? filteredEvents.filter((event) => event.day === day) : [];
              return day ? <div key={day} className={`calendar-day ${selectedDay === day && monthOffset === 0 ? 'is-selected' : ''}`}><button type="button" onClick={() => setSelectedDay(day)} aria-label={`${month + 1}월 ${day}일 선택`}><span>{day}</span></button><div className="calendar-day-events">{dayEvents.slice(0, 2).map((event) => <button type="button" key={event.title} className={`calendar-event-pill calendar-tone-${event.tone}`} onClick={() => setSelectedDay(day)}>{event.title}</button>)}</div></div> : <span key={`empty-${index}`} className="calendar-day is-empty" />;
            })}
          </div></> : view === 'week' ? <div className="calendar-week-view">{weekDays.map((day) => { const dayEvents = filteredEvents.filter((event) => event.day === day.getDate()); return <button type="button" key={day.toISOString()} className={`calendar-week-column ${selectedDay === day.getDate() ? 'is-selected' : ''}`} onClick={() => setSelectedDay(day.getDate())}><span>{day.toLocaleDateString('ko-KR', { weekday: 'short' })}</span><strong>{day.getDate()}</strong><div>{dayEvents.map((event) => <i key={event.title} className={`calendar-tone-${event.tone}`}>{event.title}</i>)}</div></button>; })}</div> : view === 'day' ? <div className="calendar-day-view"><span>{selectedDate.toLocaleDateString('ko-KR', { weekday: 'long', month: 'long', day: 'numeric' })}</span>{selectedEvents.map((event) => <button key={event.title} type="button" className={`calendar-day-detail calendar-tone-${event.tone}`}><i /><div><strong>{event.title}</strong><small>{event.category}</small></div></button>)}{!selectedEvents.length && <p className="calendar-empty">이날은 정해진 일정이 없어요.</p>}</div> : <div className="calendar-list-view">{filteredEvents.map((event) => <button type="button" key={event.title} className={`calendar-list-item calendar-tone-${event.tone}`} onClick={() => { setSelectedDay(event.day); setView('month'); }}><span>{month + 1}/{event.day}</span><i /><strong>{event.title}</strong><small>{event.category}</small></button>)}{!filteredEvents.length && <p className="calendar-empty">조건에 맞는 일정이 없어요.</p>}</div>}
        </section>
        <aside className="day-agenda">
          <p className="section-label">SELECTED DAY</p>
          <div className="selected-date"><strong>{selectedDay}</strong><span>{month + 1}월<br />{selectedDate.toLocaleDateString('ko-KR', { weekday: 'long' })}</span></div>
          <div className="agenda-list">
            {selectedEvents.map((event) => <div key={event.title} className={`agenda-item calendar-tone-${event.tone}`}><i /><div><span>{event.category}</span><p>{event.title}</p></div></div>)}
            {!selectedEvents.length && <p className="agenda-empty">이날은 정해진 일정이 없어요.</p>}
          </div>
        </aside>
      </div>
      {isComposerOpen && <div className="calendar-dialog-backdrop" role="presentation" onMouseDown={() => setIsComposerOpen(false)}><form className="calendar-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); addEvent(); }}><button type="button" className="calendar-dialog-close" onClick={() => setIsComposerOpen(false)} aria-label="닫기"><X size={18} /></button><p className="section-label">NEW EVENT</p><h3>{month + 1}월 {selectedDay}일에 일정 추가</h3><label>일정 이름<input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="예: 지원서 초안 작성" /></label><label>분류<select value={newCategory} onChange={(event) => setNewCategory(event.target.value)}><option>해야 할 일</option><option>마감</option><option>준비</option></select></label><button type="submit" className="primary-action">일정 추가 <Plus size={16} /></button></form></div>}
    </div>
  );
}

function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', text: '수정님, 어떤 기회를 함께 살펴볼까요?' },
  ]);
  const suggestions = ['이번 주 마감만 보여줘', 'AWS 공모전 자격 확인해줘', '지원 계획을 더 작게 나눠줘'];
  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text: value }, { id: Date.now() + 1, role: 'assistant', text: '좋아요. 저장한 정보와 현재 일정을 기준으로 가장 현실적인 다음 행동을 정리해볼게요.' }]);
    setInput('');
  };
  return (
    <div className="page chat-page">
      <section className="chat-shell">
        <div className="chat-intro"><span className="assistant-orb"><Sparkles size={22} /></span><p className="section-label">KEEP:ON ASSISTANT</p><h2>저장한 정보에 대해<br />무엇이든 물어보세요</h2></div>
        <div className="messages" aria-live="polite">
          {messages.map((message) => <div key={message.id} className={`message ${message.role}`}>{message.role === 'assistant' && <span className="mini-orb">K</span>}<p>{message.text}</p></div>)}
        </div>
        {messages.length === 1 && <div className="suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => send(suggestion)}>{suggestion}<ArrowUpRight size={14} /></button>)}</div>}
        <form className="chat-input" onSubmit={(event) => { event.preventDefault(); send(input); }}>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="예: 이번 주에 뭘 먼저 해야 해?" />
          <button type="submit" aria-label="메시지 보내기"><Send size={18} /></button>
        </form>
        <p className="ai-disclaimer">AI 답변은 저장한 원문을 기준으로 하며, 중요한 조건은 원문에서 다시 확인해 주세요.</p>
      </section>
    </div>
  );
}

function ProfilePage() {
  const [reminders, setReminders] = useState(true);
  return (
    <div className="page profile-page">
      <section className="profile-hero"><span className="large-avatar">수</span><div><p className="section-label">MY PROFILE</p><h2>김수정</h2><p>대학생 · 컴퓨터공학 · 3학년</p></div></section>
      <div className="profile-grid">
        <section className="profile-card"><div className="card-title"><Target size={19} /><h3>관심 분야</h3></div><div className="interest-tags"><span>AI</span><span>클라우드</span><span>공모전</span><button type="button">+ 추가</button></div></section>
        <section className="profile-card"><div className="card-title"><CalendarDays size={19} /><h3>활동 가능 시간</h3></div><strong className="big-value">주 8시간</strong><p>평일 저녁과 토요일에 활동할 수 있어요.</p></section>
        <section className="profile-card settings-card"><div className="card-title"><Settings2 size={19} /><h3>알림 설정</h3></div><button className="setting-row" type="button" onClick={() => setReminders((value) => !value)}><span><strong>마감 리마인드</strong><small>7일, 3일, 하루 전에 알려드려요</small></span><i className={reminders ? 'is-on' : ''}><b /></i></button></section>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/saved/:id" element={<OpportunityDetailPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/plan/:id" element={<PlanDetailPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
