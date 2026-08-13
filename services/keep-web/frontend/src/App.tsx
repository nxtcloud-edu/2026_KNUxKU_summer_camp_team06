import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  CheckCircle2,
  ExternalLink,
  FileText,
  Filter,
  MessageCircleQuestion,
  MoreHorizontal,
  Pin,
  Search,
  Send,
  Settings2,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { CalendarPage } from './pages/CalendarPage';
import { opportunities, type Opportunity } from './data';
import { startExecution } from './agentApi';
import { EligibilityEvidence } from './components/opportunity/EligibilityEvidence';
import { useEligibility, type EligibilityHandle } from './lib/useEligibility';
import {
  allPlans,
  formatPlanDate,
  parseDeadline,
  planFor,
  setTaskDone,
  usePlanOverrides,
} from './lib/planStore';
import {
  DECISION_LABEL,
  resolveDecision,
  setDecision,
  snoozeDate,
  useDecisions,
  type DecisionState,
} from './lib/decisionStore';
import { decisionOf } from './lib/decisionView';
import { SavedEmptyState, type SavedEmptyVariant } from './components/storage/SavedEmptyState';
import { ProfileImpact } from './components/profile/ProfileImpact';
import { ProfileOnboarding } from './components/profile/ProfileOnboarding';
import { answerFor, GENERAL_SUGGESTIONS, OPPORTUNITY_SUGGESTIONS } from './lib/chatContext';
import { isOnboardingDone, markOnboardingDone, missingRequired, patchProfile, useStoredProfile } from './lib/profileStore';
import { matchesAnyField } from './lib/koreanSearch';
import { useRecentQueries } from './lib/recentQueries';

function HomePage() {
  const decisions = useDecisions();
  // 보관한 기회는 추천에서 빠져야 목록이 정리되는 느낌이 생긴다.
  const active = useMemo(
    () => opportunities.filter((item) => decisionOf(decisions, item) !== 'archived'),
    [decisions],
  );
  const joined = active.filter((item) => decisionOf(decisions, item) === 'joined');

  return (
    <div className="page home-page">
      <header className="home-intro">
        <p className="section-label">
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <h2>수정님을 위해<br />기회를 <em>정리했어요</em></h2>
        <p>저장한 정보 중 지금 확인하면 좋은 기회를 분류해 두었어요.</p>
      </header>

      {joined.length > 0 && (
        <DashboardRail title="참여하기로 한 기회" subtitle="결정한 기회의 다음 단계를 이어가세요" items={joined} />
      )}
      <DashboardRail title="오늘 확인할 기회" subtitle="가장 가까운 마감과 다음 행동을 모았어요" items={active} />
      <DashboardRail title="마감이 가까워요" subtitle="이번 주 안에 결정하면 충분한 기회예요" items={active.filter((item) => item.dDay <= 11)} />
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
  const [uploads, setUploads] = useState<Array<{ id: string; name: string; preview?: string }>>([]);
  const [savedFile, setSavedFile] = useState<{ name: string; preview?: string } | null>(null);
  const decisions = useDecisions();
  const recent = useRecentQueries();
  const filters = ['전체', '마감 임박', '확인 필요', '참여 결정', '나중에', '보관'];
  const addFiles = (files: FileList | File[]) => {
    const added = Array.from(files).map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    if (!added.length) return;
    setUploads((current) => [...added, ...current]);
    setSavedFile(added[0]);
    window.setTimeout(() => setSavedFile(null), 1650);
  };
  const filtered = useMemo(() => opportunities.filter((item) => {
    // 초성('ㅋㄹㄷ')과 붙여쓴 검색어('클라우드캠퍼스')도 찾을 수 있어야 한다.
    const matchesQuery = matchesAnyField(
      [item.title, item.organization, item.category, item.reason, item.summary],
      query,
    );
    const decision = decisionOf(decisions, item);
    // 보관한 항목은 '보관' 탭에서만 보여 목록이 계속 늘어나지 않게 한다.
    const matchesFilter = filter === '보관'
      ? decision === 'archived'
      : decision !== 'archived' && (
        filter === '전체'
        || (filter === '마감 임박' && item.dDay <= 7)
        || (filter === '확인 필요' && item.verdict === 'needsCheck')
        || (filter === '참여 결정' && decision === 'joined')
        || (filter === '나중에' && decision === 'later')
      );
    return matchesQuery && matchesFilter;
  }), [decisions, filter, query]);

  // 첫 사용자(0건)와 필터 결과 0건은 다른 화면이어야 한다.
  const emptyVariant = useMemo<SavedEmptyVariant>(() => {
    if (!opportunities.length) return 'firstRun';
    const visible = opportunities.filter((item) => decisionOf(decisions, item) !== 'archived');
    if (!visible.length) return filter === '보관' ? 'emptyTab' : 'allArchived';
    if (query.trim() || filter === '전체') return 'noResults';
    return 'emptyTab';
  }, [decisions, filter, query]);

  return (
    <div className="page">
      <section className="page-intro">
        <p className="section-label">MY SAVES</p>
        <h2>저장한 정보가<br />기회가 되는 곳</h2>
        <p>Instagram과 Threads에서 Keep한 정보만 모았어요. 하나씩 열어보고 결정하면 됩니다.</p>
      </section>
      <label className="upload-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
        <input type="file" multiple accept="image/*,.pdf,.txt" onChange={(event) => event.target.files && addFiles(event.target.files)} />
        <span className="upload-icon"><Upload size={20} /></span>
        <span><strong>저장한 파일을 여기로 끌어다 놓으세요</strong><small>이미지, PDF, 텍스트 파일을 추가하면 기회 정보로 정리해드려요.</small></span>
        <span className="upload-action">파일 선택</span>
      </label>
      {uploads.length > 0 && (
        <div className="upload-queue" aria-live="polite">
          {uploads.map((file) => (
            <span key={file.id}><Check size={14} />{file.name}<small>이 브라우저에만 저장됨</small></span>
          ))}
          <span className="upload-queue-note">
            처리 단계를 실시간으로 보려면 확장프로그램의 <strong>현재 페이지 Keep</strong>을 사용하세요.
          </span>
        </div>
      )}
      <div className="library-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => recent.remember(query)}
            onKeyDown={(event) => { if (event.key === 'Enter') recent.remember(query); }}
            placeholder="제목, 기관, 분야 검색 (초성도 가능해요)"
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="검색어 지우기">
              <X size={15} />
            </button>
          )}
        </label>
        <button className="filter-button" type="button"><Filter size={17} />정렬</button>
      </div>
      {recent.items.length > 0 && (
        <div className="recent-queries">
          <span>최근 검색</span>
          {recent.items.map((item) => (
            <span key={item} className="recent-chip">
              <button type="button" onClick={() => setQuery(item)}>{item}</button>
              <button type="button" onClick={() => recent.forget(item)} aria-label={`${item} 검색어 삭제`}><X size={12} /></button>
            </span>
          ))}
          <button type="button" className="recent-clear" onClick={recent.clear}>전체 삭제</button>
        </div>
      )}
      <div className="filter-tabs" role="tablist" aria-label="저장 정보 필터">
        {filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={filter === item ? 'is-active' : ''}>{item}</button>)}
      </div>
      <div className="library-summary"><strong>{filtered.length}</strong><span>개의 저장 정보</span></div>
      <div className="opportunity-list">
        {filtered.map((item) => <OpportunityRow key={item.id} item={item} decision={decisionOf(decisions, item)} />)}
      </div>
      {!filtered.length && (
        <SavedEmptyState
          variant={emptyVariant}
          filter={filter}
          query={query}
          hasQuery={query.trim().length > 0}
          onClearQuery={() => setQuery('')}
          onResetFilter={() => { setFilter('전체'); setQuery(''); }}
          onShowArchived={() => setFilter('보관')}
        />
      )}
      {savedFile && <div className="upload-save-overlay" role="status" aria-live="polite"><div className="upload-save-card"><div className="upload-save-thumb">{savedFile.preview ? <img src={savedFile.preview} alt="" /> : <FileText size={28} />}</div><div><span><CheckCircle2 size={16} /> 정리함에 저장했어요</span><strong>{savedFile.name}</strong><small>내용을 읽고 기회 정보로 정리하는 중이에요.</small></div></div></div>}
    </div>
  );
}

function OpportunityRow({ item, decision }: { item: Opportunity; decision: DecisionState }) {
  return (
    <Link to={`/saved/${item.id}`} className={`opportunity-row accent-${item.accent}`}>
      <div className="row-main">
        <div className="row-meta">
          <span>{item.category}</span>
          {decision !== 'none' && <span className={`row-decision is-${decision}`}>{DECISION_LABEL[decision]}</span>}
          <span>{item.savedFrom} · {item.savedAt} 저장</span>
        </div>
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
  return <OpportunityDetail item={item} />;
}

function OpportunityDetail({ item }: { item: Opportunity }) {
  // 근거 카드와 결정 버튼이 판정 결과를 공유한다. 요청은 한 번만 나간다.
  const eligibility = useEligibility(item.id);
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
          <section className="content-section">
            <h3>참여 조건과 판정 근거</h3>
            <p className="section-note">각 조건을 원문 문장과 함께 보여드려요. 확인이 필요한 항목은 그대로 남겨둡니다.</p>
            <EligibilityEvidence item={item} state={eligibility.state} onRetry={eligibility.retry} />
          </section>
          <section className="content-section">
            <h3>이거 물어보기</h3>
            <p className="section-note">저장한 원문과 일정만 근거로 답해요.</p>
            <div className="ask-chips">
              {OPPORTUNITY_SUGGESTIONS.map((question) => (
                <Link
                  key={question}
                  to={`/chat?opportunity=${encodeURIComponent(item.id)}&q=${encodeURIComponent(question)}`}
                  className="ask-chip"
                >
                  <MessageCircleQuestion size={15} />
                  {question}
                </Link>
              ))}
            </div>
          </section>
        </div>
        <DecisionCard item={item} eligibility={eligibility} />
      </div>
    </div>
  );
}

function DecisionCard({ item, eligibility }: { item: Opportunity; eligibility: EligibilityHandle }) {
  const navigate = useNavigate();
  const decisions = useDecisions();
  const record = resolveDecision(decisions, item.id, item.initialDecision);
  const decision = record.state;
  const snoozeLabel = record.snoozeUntil
    ? new Date(record.snoozeUntil).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    : snoozeDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

  const copy: Record<DecisionState, { title: string; body: string }> = {
    none: {
      title: '이 기회,\n해볼까요?',
      body: '결정하면 마감일까지 필요한 일을 작은 단계로 나눠드려요.',
    },
    joined: {
      title: '참여하기로\n했어요',
      body: '실행 계획에서 남은 단계를 이어가면 됩니다.',
    },
    later: {
      title: '나중에\n볼 기회예요',
      body: `${snoozeLabel}에 다시 알려드릴게요. 그때까지 목록 위로 올리지 않아요.`,
    },
    archived: {
      title: '보관한\n기회예요',
      body: '저장 목록에서는 숨겼어요. 보관 탭에서 다시 꺼낼 수 있어요.',
    },
  };

  return (
    <aside className="decision-card">
      <span className="section-label">YOUR DECISION</span>
      <h3>
        {copy[decision].title.split('\n').map((line, index) => (
          <span key={line}>{index > 0 && <br />}{line}</span>
        ))}
      </h3>
      <p>{copy[decision].body}</p>

      {decision === 'joined' ? (
        <button type="button" className="primary-action" onClick={() => navigate(`/plan/${item.id}`)}>
          실행 계획 보기 <ArrowRight size={17} />
        </button>
      ) : (
        <StartExecutionButton
          item={item}
          eligibility={eligibility}
          onStarted={() => setDecision(item.id, 'joined')}
        />
      )}

      <div className="decision-choices">
        <button
          type="button"
          className={`secondary-action ${decision === 'later' ? 'is-chosen' : ''}`}
          onClick={() => setDecision(item.id, decision === 'later' ? 'none' : 'later')}
        >
          <Clock3 size={15} />{decision === 'later' ? '보류 해제' : '나중에'}
        </button>
        <button
          type="button"
          className={`secondary-action ${decision === 'archived' ? 'is-chosen' : ''}`}
          onClick={() => {
            if (decision === 'archived') {
              setDecision(item.id, 'none');
              return;
            }
            setDecision(item.id, 'archived');
            navigate('/saved');
          }}
        >
          <Archive size={15} />{decision === 'archived' ? '보관 해제' : '안 할래'}
        </button>
      </div>

      <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="secondary-action">
        원문 확인 <ExternalLink size={15} />
      </a>
    </aside>
  );
}

function StartExecutionButton({ item, eligibility, onStarted }: { item: Opportunity; eligibility: EligibilityHandle; onStarted?: () => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const { state: check, retry } = eligibility;
  const overall = check.status === 'ready' ? check.result.eligibility.overall : null;
  const start = async () => {
    setState('loading');
    try {
      const result = await startExecution(item.id, [item.id]);
      sessionStorage.setItem(`keep-on-execution-${item.id}`, JSON.stringify(result));
      onStarted?.();
      navigate(`/plan/${item.id}`);
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : '실행 계획을 만들지 못했어요.');
    }
  };
  const label = check.status === 'loading'
    ? '조건 확인 중…'
    : check.status === 'error'
      ? '조건 다시 확인하기'
      : overall === 'pass'
        ? (state === 'loading' ? '계획 만드는 중…' : '이거 할래!')
        : overall === 'unknown'
          ? '조건 확인이 먼저예요'
          : '지금은 조건이 안 맞아요';
  return <>
    <button
      type="button"
      className="primary-action"
      onClick={check.status === 'error' ? retry : start}
      disabled={state === 'loading' || check.status === 'loading' || (check.status === 'ready' && overall !== 'pass')}
    >
      {label} <ArrowRight size={17} />
    </button>
    {check.status === 'error' && <small className="execution-error">{check.message} 잠시 후 다시 확인해 주세요.</small>}
    {check.status === 'ready' && overall === 'unknown' && <small className="execution-error">위 근거에서 &lsquo;확인 필요&rsquo;로 남은 조건을 채우면 계획을 만들 수 있어요.</small>}
    {check.status === 'ready' && overall === 'fail' && <small className="execution-error">불충족 조건이 있어 실행 계획을 만들지 않아요. 근거를 확인해 보세요.</small>}
    {state === 'error' && <small className="execution-error">{message}</small>}
  </>;
}

function PlanPage() {
  const decisions = useDecisions();
  const overrides = usePlanOverrides();
  const plans = useMemo(
    () => allPlans(overrides)
      .filter(({ item }) => decisionOf(decisions, item) === 'joined')
      .sort((a, b) => a.item.dDay - b.item.dDay),
    [decisions, overrides],
  );

  return (
    <div className="page">
      <section className="page-intro narrow">
        <p className="section-label">ACTION PLAN</p>
        <h2>생각은 짧게,<br />실행은 작게</h2>
        <p>참여하기로 정한 기회를 마감 순서대로 보여드려요.</p>
      </section>
      <div className="plan-stack">
        {plans.map(({ item, tasks }, index) => {
          const done = tasks.filter((task) => task.done).length;
          const progress = tasks.length ? done / tasks.length : 0;
          const next = tasks.find((task) => !task.done);
          return (
            <Link to={`/plan/${item.id}`} key={item.id} className={`plan-row accent-${item.accent}`}>
              <span className="plan-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="plan-copy">
                <span>{item.category} · D-{item.dDay}</span>
                <h3>{item.title}</h3>
                <p>{next ? `다음: ${next.title} · ${formatPlanDate(next.dueAt)}` : '모든 단계 완료'}</p>
              </div>
              <div className="mini-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
              <strong>{done}/{tasks.length}</strong>
              <ArrowRight size={18} />
            </Link>
          );
        })}
        {!plans.length && (
          <div className="empty-state">
            <CheckCircle2 size={24} />
            <strong>아직 참여를 결정한 기회가 없어요</strong>
            <p>저장한 기회를 열어 &lsquo;이거 할래!&rsquo;를 누르면 마감까지의 단계가 여기에 생겨요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanDetailPage() {
  const { id } = useParams();
  const item = opportunities.find((opportunity) => opportunity.id === id);
  if (!item) return <Navigate to="/plan" replace />;
  return <PlanDetail item={item} />;
}

function PlanDetail({ item }: { item: Opportunity }) {
  const overrides = usePlanOverrides();
  const tasks = useMemo(() => planFor(item, overrides), [item, overrides]);
  const done = tasks.filter((task) => task.done).length;
  const progress = tasks.length ? done / tasks.length : 0;
  const deadlineLabel = parseDeadline(item.deadline);

  return (
    <div className="page plan-detail">
      <Link to="/plan" className="back-link"><ArrowLeft size={17} />실행 계획</Link>
      <div className="plan-detail-head">
        <div>
          <span className="section-label">{item.category} · D-{item.dDay}</span>
          <h2>{item.title}</h2>
          <p>
            마감 {deadlineLabel ? deadlineLabel.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : item.deadline}에서 거꾸로 계산한 일정이에요.{' '}
            <Link to="/calendar" className="inline-link">캘린더에서 보기</Link>
          </p>
        </div>
        <div className={`progress-ring accent-${item.accent}`} style={{ '--progress': `${progress * 360}deg` } as React.CSSProperties}>
          <div><strong>{Math.round(progress * 100)}%</strong><span>완료</span></div>
        </div>
      </div>
      <section className="generated-plan" aria-label={`${item.title} 실행 계획`}>
        <div className="generated-plan-head">
          <div><span className="section-label">PLANNING AGENT</span><h3>이렇게 시작해 볼까요?</h3></div>
          <span>{done}/{tasks.length} 완료</span>
        </div>
        <div className="plan-path">
          {tasks.map((task, index) => (
            <button
              type="button"
              key={task.id}
              aria-pressed={task.done}
              onClick={() => setTaskDone(item.id, task.id, !task.done)}
              className={`plan-node plan-tone-${index % 3} ${task.done ? 'is-done' : ''}`}
            >
              <span className="plan-node-pin"><Pin size={25} fill="currentColor" /></span>
              <span className="plan-node-card">
                <span className="plan-node-number">{String(index + 1).padStart(2, '0')}</span>
                <strong>{task.title}</strong>
                <small>{task.note}</small>
                <em>{task.done ? '완료됨' : formatPlanDate(task.dueAt)}</em>
              </span>
            </button>
          ))}
        </div>
      </section>
      {tasks.length > 0 && done === tasks.length && (
        <div className="completion-toast">
          <CheckCircle2 size={19} />
          <span><strong>멋져요!</strong> 이 기회의 준비를 모두 마쳤어요.</span>
        </div>
      )}
    </div>
  );
}

function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const overrides = usePlanOverrides();
  const opportunityId = searchParams.get('opportunity');
  const item = opportunities.find((opportunity) => opportunity.id === opportunityId);
  const tasks = useMemo(() => (item ? planFor(item, overrides) : []), [item, overrides]);
  const suggestions = item ? OPPORTUNITY_SUGGESTIONS : GENERAL_SUGGESTIONS;

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ id: number; role: 'assistant' | 'user'; text: string }>>([]);
  const askedRef = useRef<string | null>(null);

  const send = useCallback((text: string) => {
    const value = text.trim();
    if (!value) return;
    const answer = answerFor(value, { item, tasks, planOverrides: overrides });
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: 'user', text: value },
      { id: Date.now() + 1, role: 'assistant', text: answer },
    ]);
    setInput('');
  }, [item, tasks, overrides]);

  // 카드에서 '이거 물어보기'로 들어온 질문은 한 번만 자동 전송한다.
  useEffect(() => {
    const question = searchParams.get('q');
    if (!question) return;
    const key = `${opportunityId ?? ''}:${question}`;
    if (askedRef.current === key) return;
    askedRef.current = key;
    send(question);
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
  }, [opportunityId, searchParams, send, setSearchParams]);

  const clearContext = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('opportunity');
    next.delete('q');
    setSearchParams(next, { replace: true });
    setMessages([]);
    askedRef.current = null;
  };

  return (
    <div className="page chat-page">
      <section className="chat-shell">
        <div className="chat-intro">
          <span className="assistant-orb"><Sparkles size={22} /></span>
          <p className="section-label">KEEP:ON ASSISTANT</p>
          <h2>저장한 정보에 대해<br />무엇이든 물어보세요</h2>
        </div>

        {item && (
          <div className="chat-context">
            <div>
              <span>이 기회에 대해 이야기 중</span>
              <Link to={`/saved/${item.id}`}>{item.title}</Link>
              <small>{item.organization} · D-{item.dDay}</small>
            </div>
            <button type="button" onClick={clearContext} aria-label="맥락 지우기"><X size={16} /></button>
          </div>
        )}

        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="message assistant">
              <span className="mini-orb">K</span>
              <p>
                {item
                  ? `‘${item.title}’에 대해 저장한 정보와 일정을 기준으로 답해 드려요.`
                  : '수정님, 어떤 기회를 함께 살펴볼까요?'}
              </p>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              {message.role === 'assistant' && <span className="mini-orb">K</span>}
              <p>{message.text}</p>
            </div>
          ))}
        </div>

        <div className="suggestions">
          {suggestions.map((suggestion) => (
            <button type="button" key={suggestion} onClick={() => send(suggestion)}>
              {suggestion}<ArrowUpRight size={14} />
            </button>
          ))}
        </div>

        <form className="chat-input" onSubmit={(event) => { event.preventDefault(); send(input); }}>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="예: 이번 주에 뭘 먼저 해야 해?" />
          <button type="submit" aria-label="메시지 보내기"><Send size={18} /></button>
        </form>
        <p className="ai-disclaimer">저장한 원문과 일정만 근거로 답해요. 중요한 조건은 원문에서 다시 확인해 주세요.</p>
      </section>
    </div>
  );
}

function ProfilePage() {
  const [reminders, setReminders] = useState(true);
  const stored = useStoredProfile();
  const [showOnboarding, setShowOnboarding] = useState(
    () => missingRequired(stored).length > 0 && !isOnboardingDone(),
  );
  const interests = stored.interests ?? [];
  const weeklyHours = String(stored.weekly_available_hours ?? '');

  return (
    <div className="page profile-page">
      <section className="profile-hero">
        <span className="large-avatar">수</span>
        <div><p className="section-label">MY PROFILE</p><h2>김수정</h2><p>대학생 · 컴퓨터공학 · 3학년</p></div>
      </section>

      {showOnboarding ? (
        <ProfileOnboarding
          profile={stored}
          onFinish={() => setShowOnboarding(false)}
          onSkip={() => { markOnboardingDone(); setShowOnboarding(false); }}
        />
      ) : (
        missingRequired(stored).length > 0 && (
          <div className="profile-resume">
            <span>아직 채우지 않은 정보가 있어요. 조건 판정을 위해 3단계만 입력하면 됩니다.</span>
            <button type="button" className="secondary-action" onClick={() => setShowOnboarding(true)}>
              3단계로 채우기 <ArrowRight size={15} />
            </button>
          </div>
        )
      )}

      <div className="profile-impact-slot">
        <ProfileImpact profile={stored} />
      </div>

      <div className="profile-grid">
        <section className="profile-card profile-basics">
          <div className="card-title"><Target size={19} /><h3>조건 판단을 위한 기본 정보</h3></div>
          <p>나이 조건은 생년월일 전체를 기준으로 정확하게 확인해요. 비워 두면 해당 조건은 ‘확인 필요’로 남습니다.</p>
          <div className="profile-form">
            <label>생년월일
              <input
                type="date"
                value={stored.birth_date ?? ''}
                onChange={(event) => patchProfile({ birth_date: event.target.value || undefined })}
              />
            </label>
            <label>거주 지역
              <input
                value={stored.region ?? ''}
                placeholder="예: 서울 관악구"
                onChange={(event) => patchProfile({ region: event.target.value || undefined })}
              />
            </label>
            <label>현재 상태
              <input
                value={stored.status ?? ''}
                placeholder="예: 대학생"
                onChange={(event) => patchProfile({ status: event.target.value || undefined })}
              />
            </label>
          </div>
        </section>

        <section className="profile-card">
          <div className="card-title"><Target size={19} /><h3>관심 분야</h3></div>
          <div className="interest-tags">
            {interests.length > 0
              ? interests.map((interest) => <span key={interest}>{interest}</span>)
              : <span className="is-empty">아직 없음</span>}
            <button type="button" onClick={() => setShowOnboarding(true)}>+ 추가</button>
          </div>
        </section>

        <section className="profile-card">
          <div className="card-title"><CalendarDays size={19} /><h3>활동 가능 시간</h3></div>
          <strong className="big-value">주 <input
            className="inline-hours"
            type="number"
            min="0"
            value={weeklyHours}
            placeholder="8"
            onChange={(event) => patchProfile({ weekly_available_hours: Number(event.target.value) || undefined })}
          />시간</strong>
          <p>준비 여유(feasibility) 판정에 사용해요.</p>
        </section>

        <section className="profile-card settings-card">
          <div className="card-title"><Settings2 size={19} /><h3>알림 설정</h3></div>
          <button className="setting-row" type="button" onClick={() => setReminders((value) => !value)}>
            <span><strong>마감 리마인드</strong><small>7일, 3일, 하루 전에 알려드려요</small></span>
            <i className={reminders ? 'is-on' : ''}><b /></i>
          </button>
        </section>
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
