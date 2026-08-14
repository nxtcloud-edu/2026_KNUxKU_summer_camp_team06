import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bookmark,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  Check,
  Clock3,
  CheckCircle2,
  Heart,
  ExternalLink,
  Filter,
  MessageCircleQuestion,
  MoreHorizontal,
  Pin,
  Quote,
  Search,
  Send,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { CalendarPage } from './pages/CalendarPage';
import { opportunities, setOpportunities, type Opportunity } from './data';
import { askConversation, createSourceIntake, deleteOpportunity, getIntake, getMyOpportunities, getRecommendations, startExecution, type RecommendationFeed } from './agentApi';
import { useAuth } from './lib/auth';
import { formatDday } from './lib/dday';
import { OrderTracking } from './components/ui/order-tracking';
import { AgentProgressCard } from './components/ui/agent-progress-card';
import { Card, CardContent } from './components/ui/card';
import { CapturedExamplesMarquee } from './components/landing/captured-marquee';
import { demoConditions, demoRawText, demoTasks } from './data/landing';
import {
  allPlans,
  clearPlan,
  formatPlanDate,
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
import { GENERAL_SUGGESTIONS, OPPORTUNITY_SUGGESTIONS } from './lib/chatContext';
import { isOnboardingDone, markOnboardingDone, missingRequired, patchProfile, useStoredProfile } from './lib/profileStore';
import { matchesAnyField } from './lib/koreanSearch';
import { useRecentQueries } from './lib/recentQueries';
import { toggleLikedOpportunity, useLikedOpportunities } from './lib/likedStore';

function HomePage({ loading }: { loading: boolean }) {
  const decisions = useDecisions();
  const likedIds = useLikedOpportunities();
  const likedOpportunityIds = useMemo(
    () => likedIds.filter((id) => opportunities.some((item) => item.id === id)),
    [likedIds],
  );
  const [recommendations, setRecommendations] = useState<RecommendationFeed | null>(null);
  const [recommendationState, setRecommendationState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [recommendationError, setRecommendationError] = useState('');
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
        <h2>저장한 정보를 <em>정리했어요</em></h2>
      </header>

      {loading ? (
        <section className="home-data-state" aria-live="polite">
          <span /><div><strong>저장한 정보를 불러오고 있어요</strong><p>잠시만 기다려 주세요.</p></div>
        </section>
      ) : active.length === 0 ? (
        <section className="home-data-state">
          <Bookmark size={22} />
          <div><strong>아직 저장한 정보가 없어요</strong><p>Instagram 또는 Threads에서 Keep하면 이곳에 정리됩니다.</p></div>
          <Link to="/saved">저장으로 가기 <ArrowRight size={16} /></Link>
        </section>
      ) : <>
      {joined.length > 0 && (
        <DashboardRail title="참여하기로 한 기회" subtitle="결정한 기회의 다음 단계를 이어가세요" items={joined} />
      )}
      <DashboardRail title="오늘 확인할 공고" subtitle="가장 가까운 마감과 다음 행동을 모았어요" items={active} />
      <DashboardRail title="마감이 가까워요" subtitle="이번 주 안에 결정하면 충분한 기회예요" items={active.filter((item) => item.dDay !== null && item.dDay <= 11)} />
      </>}
      <button
        type="button"
        className="ai-recommend-button"
        onClick={async () => {
          if (!likedOpportunityIds.length) {
            setRecommendationError('현재 계정의 저장 공고에서 하트를 눌러 추천을 시작해 주세요.');
            setRecommendationState('error');
            return;
          }
          setRecommendationError('');
          setRecommendationState('loading');
          try { setRecommendations(await getRecommendations(likedOpportunityIds)); setRecommendationState('idle'); }
          catch (error) {
            setRecommendationError(error instanceof Error ? error.message : '추천 결과를 준비하지 못했습니다. 다시 눌러 주세요.');
            setRecommendationState('error');
          }
        }}
      >
        <img src="/ai-recommendation.png" alt="" />
        <span><b>AI 추천</b><small>{likedOpportunityIds.length ? `좋아요 ${likedOpportunityIds.length}개 기준` : '하트를 눌러 시작'}</small></span>
      </button>
      {recommendationState === 'loading' && (
        <AgentProgressCard
          className="ai-recommend-progress"
          title="추천 에이전트가 좋아요한 공고를 분석하고 있어요"
          activeStep={1}
          steps={[
            { label: '좋아요한 공고 확인', detail: '선택한 공고만 모으는 중' },
            { label: '프로필과 공고 비교', detail: '관심사·일정·정보를 분석 중' },
            { label: '추천 순위 정리', detail: '카드로 준비 중' },
          ]}
        />
      )}
      {(recommendations || recommendationState === 'error') && (
        <section className="ai-recommend-panel">
          <div><span className="section-label">AI RECOMMENDATION</span><h3>좋아요한 공고를 Gemini가 평가했어요</h3></div>
          <div className="ai-recommend-cards">
          {recommendations?.recommendations.map((ranking) => {
            const item = opportunities.find((candidate) => candidate.id === ranking.opportunity_id);
            return item ? <Link to={`/saved/${item.id}`} key={item.id} className="ai-recommend-card">
              <div className="ai-recommend-card-head"><span>#{ranking.rank}</span><strong>{ranking.score}점</strong></div>
              <em>{ranking.label}</em><b>{item.title}</b><p>{ranking.rationale}</p>
              {ranking.factors.length > 0 && <small>{ranking.factors.join(' · ')}</small>}
            </Link> : null;
          })}
          </div>
          {recommendations?.follow_up_questions.map((question) => <p key={question} className="ai-recommend-note">{question}</p>)}
          {recommendationState === 'error' && <p className="ai-recommend-note">{recommendationError}</p>}
        </section>
      )}
    </div>
  );
}

function DashboardRail({ title, subtitle, items }: { title: string; subtitle: string; items: Opportunity[] }) {
  if (!items.length) return null;
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
  const liked = useLikedOpportunities().includes(item.id);
  return (
    <Link to={`/saved/${item.id}`} className={`dashboard-opportunity-card accent-${item.accent}`}>
      <button className={`like-button ${liked ? 'is-liked' : ''}`} type="button" aria-label={`${item.title} 좋아요`} onClick={(event) => { event.preventDefault(); toggleLikedOpportunity(item.id); }}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /></button>
      <div className={`opportunity-card-art opportunity-preview-${rank}`} aria-hidden="true">
        {item.thumbnailUrl && item.thumbnailKind === 'pdf'
          ? <iframe src={`${item.thumbnailUrl}#page=1&zoom=page-width`} title="PDF 첫 페이지 미리보기" tabIndex={-1} />
          : item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <><span /><i /><b /><em /></>}
      </div>
      <div className="opportunity-card-copy">
        <div><CategoryTag category={item.category} />{item.dDay !== null && <strong>{formatDday(item.dDay)}</strong>}</div>
        <h4>{item.title}</h4>
        {item.organization && <p>{item.organization}</p>}
        <PlatformLogo platform={item.savedFrom} thumbnailKind={item.thumbnailKind} />
      </div>
    </Link>
  );
}

function categoryTone(category: string) {
  const value = category.trim().toLowerCase();
  if (value === 'competition') return 'competition';
  if (value === 'support') return 'support';
  if (value === 'benefit') return 'benefit';
  return 'other';
}

function CategoryTag({ category }: { category: string }) {
  return <span className={`category-tag category-tag-${categoryTone(category)}`}>{category}</span>;
}

function PlatformLogo({ platform, thumbnailKind }: { platform: string; thumbnailKind: Opportunity['thumbnailKind'] }) {
  const name = platform.trim().toLowerCase();
  const platformLogo = name === 'instagram' || name === 'threads' || name === 'x' || name === 'youtube' ? name : null;
  const logo = platformLogo || (thumbnailKind === 'pdf' ? 'pdf' : thumbnailKind === 'image' ? 'jpg' : null);
  const label = platformLogo ? `${platformLogo}에서 저장` : thumbnailKind === 'pdf' ? 'PDF 파일' : '이미지 파일';
  return logo ? <img className="platform-logo" src={`/logos/${logo}.png`} alt={label} /> : null;
}

function SavedPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('전체');
  const [uploads, setUploads] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [deletedVersion, setDeletedVersion] = useState(0);
  const decisions = useDecisions();
  const recent = useRecentQueries();
  const filters = ['전체', '마감 임박', '확인 필요', '참여 결정', '나중에', '보관'];
  const addFiles = async (files: FileList | File[]) => {
    const added = Array.from(files).map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      status: '업로드 중',
    }));
    if (!added.length) return;
    setUploads((current) => [...added, ...current]);
    for (const [index, file] of Array.from(files).entries()) {
      try {
        const intake = await createSourceIntake(file);
        let status = 'Gemini가 내용을 읽는 중';
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          const current = await getIntake(intake.intake_id);
          status = current.status;
          if (['READY_FOR_REVIEW', 'NEEDS_REVIEW', 'FAILED'].includes(status)) break;
        }
        if (status === 'FAILED') throw new Error('파일 분석에 실패했습니다.');
        const items = await getMyOpportunities();
        setOpportunities(items);
        setUploads((current) => current.map((entry) => entry.id === added[index].id ? { ...entry, status: '정리 완료' } : entry));
      } catch (error) {
        setUploads((current) => current.map((entry) => entry.id === added[index].id ? { ...entry, status: error instanceof Error ? error.message : '분석 실패' } : entry));
      }
    }
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
        || (filter === '마감 임박' && item.dDay !== null && item.dDay <= 7)
        || (filter === '확인 필요' && item.verdict === 'needsCheck')
        || (filter === '참여 결정' && decision === 'joined')
        || (filter === '나중에' && decision === 'later')
      );
    return matchesQuery && matchesFilter;
  }), [decisions, deletedVersion, filter, query]);

  // 첫 사용자(0건)와 필터 결과 0건은 다른 화면이어야 한다.
  const emptyVariant = useMemo<SavedEmptyVariant>(() => {
    if (!opportunities.length) return 'firstRun';
    const visible = opportunities.filter((item) => decisionOf(decisions, item) !== 'archived');
    if (!visible.length) return filter === '보관' ? 'emptyTab' : 'allArchived';
    if (query.trim() || filter === '전체') return 'noResults';
    return 'emptyTab';
  }, [decisions, deletedVersion, filter, query]);

  return (
    <div className="page">
      <section className="page-intro">
        <p className="section-label">저장한 정보가 기회가 되는 곳</p>
        <h2>정보를 기회로 KEEP:ON</h2>
      </section>
      <label className="upload-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}>
        <input type="file" multiple accept="image/*,.pdf,.txt" onChange={(event) => event.target.files && void addFiles(event.target.files)} />
        <span className="upload-icon"><Upload size={20} /></span>
        <span><strong>저장한 파일을 여기로 끌어다 놓으세요</strong><small>이미지, PDF, 텍스트 파일을 추가하면 기회 정보로 정리해드려요.</small></span>
        <span className="upload-action">파일 선택</span>
      </label>
      {uploads.length > 0 && (
        <div className="upload-queue" aria-live="polite">
          {uploads.map((file) => <UploadProgress key={file.id} file={file} />)}
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
        {filtered.map((item) => <OpportunityRow
          key={item.id}
          item={item}
          decision={decisionOf(decisions, item)}
          onDeleted={(id) => {
            setOpportunities(opportunities.filter((candidate) => candidate.id !== id));
            setDeletedVersion((version) => version + 1);
          }}
        />)}
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
    </div>
  );
}

function UploadProgress({ file }: { file: { name: string; status: string } }) {
  const stage = file.status === '업로드 중' || file.status === 'QUEUED' || file.status === 'RECEIVED' || file.status === 'EVENT_PENDING' || file.status === 'EVENT_SENT'
    ? 0
    : file.status === 'EXTRACTING'
      ? 1
      : file.status === 'NORMALIZING' || file.status === 'VALIDATING' || file.status === 'Gemini가 내용을 읽는 중'
        ? 2
        : 3;
  const failed = file.status.includes('실패');
  if (stage === 3) {
    return <span className={failed ? 'upload-queue-error' : ''}><Check size={14} />{file.name}<small>{file.status}</small></span>;
  }
  return (
    <AgentProgressCard
      className="upload-agent-progress"
      title={`${file.name} ${stage === 1 ? '본문을 읽고 있어요' : stage === 2 ? '정보를 정리하고 있어요' : '안전하게 저장하고 있어요'}`}
      activeStep={stage}
      steps={[
        { label: '파일 저장', detail: '내 저장소에 보관해요' },
        { label: '문서 읽기 에이전트', detail: '본문과 날짜를 찾고 있어요' },
        { label: '정보 정리 에이전트', detail: '제목과 내용을 정리해요' },
      ]}
    />
  );
}

function OpportunityRow({ item, decision, onDeleted }: { item: Opportunity; decision: DecisionState; onDeleted: (id: string) => void }) {
  const liked = useLikedOpportunities().includes(item.id);
  const [deleting, setDeleting] = useState(false);
  const remove = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`'${item.title}' 정보를 삭제할까요?`)) return;
    setDeleting(true);
    try {
      await deleteOpportunity(item.id);
      onDeleted(item.id);
    } catch {
      window.alert('삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Link to={`/saved/${item.id}`} className={`opportunity-row accent-${item.accent}`}>
      <button className={`like-button row-like-button ${liked ? 'is-liked' : ''}`} type="button" aria-label={`${item.title} 좋아요`} onClick={(event) => { event.preventDefault(); toggleLikedOpportunity(item.id); }}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /></button>
      <button className="row-delete-button" type="button" aria-label={`${item.title} 삭제`} onClick={remove} disabled={deleting}><Trash2 size={15} /></button>
      <div className="row-main">
        <div className="row-meta">
          <span>{item.category}</span>
          {decision !== 'none' && <span className={`row-decision is-${decision}`}>{DECISION_LABEL[decision]}</span>}
          <span>{item.savedFrom} · {item.savedAt} 저장</span>
        </div>
        <h3>{item.title}</h3>
        {item.organization && <p>{item.organization}</p>}
      </div>
      <div className="row-reason"><span>KEEP:ON 한줄 요약</span><p>{item.reason}</p></div>
      <div className="row-deadline">{item.dDay !== null && <strong>{formatDday(item.dDay)}</strong>}<span>{item.deadline}</span></div>
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
  const liked = useLikedOpportunities().includes(item.id);
  return (
    <div className="page detail-page">
      <Link to="/saved" className="back-link"><ArrowLeft size={17} />저장 목록</Link>
      <section className={`detail-hero accent-${item.accent}`}>
        <div className="detail-top"><CategoryTag category={item.category} /><div><button className={`like-button detail-like-button ${liked ? 'is-liked' : ''}`} type="button" aria-label={`${item.title} 좋아요`} onClick={() => toggleLikedOpportunity(item.id)}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /></button><button type="button" aria-label="더 보기"><MoreHorizontal size={20} /></button></div></div>
        {item.organization && <p className="organization">{item.organization}</p>}
        <h2>{item.title}</h2>
        <div className="detail-deadline">{item.dDay !== null && <strong>{formatDday(item.dDay)}</strong>}<span>{item.dDay === null ? '마감 정보 없음' : `마감 ${item.deadline}`}</span></div>
      </section>

      <section className="reason-panel">
        <div className="reason-icon"><Sparkles size={21} /></div>
        <div><span>KEEP:ON이 이렇게 봤어요</span><p>{item.reason}</p></div>
      </section>

      <div className="detail-columns">
        <div className="detail-main">
          <section className="content-section"><h3>어떤 기회인가요?</h3><p className="opportunity-summary">{item.summary}</p></section>
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
        <DecisionCard item={item} />
      </div>
    </div>
  );
}

function DecisionCard({ item }: { item: Opportunity }) {
  const navigate = useNavigate();
  const decisions = useDecisions();
  const [deleting, setDeleting] = useState(false);
  const record = resolveDecision(decisions, item.id, item.initialDecision);
  const decision = record.state;
  const snoozeLabel = record.snoozeUntil
    ? new Date(record.snoozeUntil).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    : snoozeDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  const canOpenOriginal = /^https?:\/\//i.test(item.sourceUrl) && item.thumbnailKind !== 'pdf' && item.thumbnailKind !== 'image';
  const remove = async () => {
    if (!window.confirm(`'${item.title}' 정보를 삭제할까요?`)) return;
    setDeleting(true);
    try {
      await deleteOpportunity(item.id);
      setOpportunities(opportunities.filter((candidate) => candidate.id !== item.id));
      navigate('/saved');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };

  const copy: Record<DecisionState, { title: string; body: string }> = {
    none: {
      title: '이 기회,\n해볼까요?',
      body: '결정하면 마감일까지 필요한 일을 작은 단계로 나눠드려요.',
    },
    joined: {
      title: '참여하기로\n했어요',
      body: '실행 계획에서 남은 단계를 이어가면 됩니다.',
    },
    planning: {
      title: '계획 초안을\n만들었어요',
      body: '내용을 검토한 뒤 원할 때만 캘린더에 반영하세요.',
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

      {decision === 'joined' || decision === 'planning' ? (
        <button type="button" className="primary-action" onClick={() => navigate(`/plan/${item.id}`)}>
          {decision === 'planning' ? '계획 초안 검토하기' : '실행 계획 보기'} <ArrowRight size={17} />
        </button>
      ) : (
        <StartExecutionButton
          item={item}
          onStarted={() => setDecision(item.id, 'planning')}
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

      <button type="button" className="secondary-action detail-delete-action" onClick={() => void remove()} disabled={deleting}>
        <Trash2 size={15} />{deleting ? '삭제하는 중…' : '삭제'}
      </button>

      {canOpenOriginal && (
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="secondary-action">
          원문 확인 <ExternalLink size={15} />
        </a>
      )}
    </aside>
  );
}

function StartExecutionButton({ item, onStarted }: { item: Opportunity; onStarted?: () => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
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
  const label = state === 'loading' ? '계획 만드는 중…' : '계획 초안 만들기';
  return <>
    <button
      type="button"
      className="primary-action"
      onClick={start}
      disabled={state === 'loading'}
    >
      {label} <ArrowRight size={17} />
    </button>
    {state === 'loading' && (
      <AgentProgressCard
        className="plan-agent-progress"
        title="Planning Agent가 실행 순서를 만들고 있어요"
        activeStep={1}
        steps={[
          { label: '정보 읽기', detail: '저장한 내용과 일정을 확인해요' },
          { label: '계획 설계', detail: '실행 순서를 제안하고 있어요' },
          { label: '초안 준비', detail: '검토할 수 있게 정리해요' },
        ]}
      />
    )}
    {state === 'error' && <small className="execution-error">{message}</small>}
  </>;
}

function PlanPage() {
  const decisions = useDecisions();
  const overrides = usePlanOverrides();
  const plans = useMemo(
    () => allPlans(overrides)
      .filter(({ item }) => ['planning', 'joined'].includes(decisionOf(decisions, item)))
      .sort((a, b) => (a.item.dDay ?? Number.MAX_SAFE_INTEGER) - (b.item.dDay ?? Number.MAX_SAFE_INTEGER)),
    [decisions, overrides],
  );

  return (
    <div className="page">
      <section className="page-intro narrow">
        <p className="section-label">ACTION PLAN</p>
        <h2>생각은 짧게, 실행은 작게</h2>
        <p>계획 초안은 검토 후 캘린더에 반영할 수 있어요.</p>
      </section>
      <div className="plan-stack">
        {plans.map(({ item, tasks }, index) => {
          const done = tasks.filter((task) => task.done).length;
          const progress = tasks.length ? done / tasks.length : 0;
          const next = tasks.find((task) => !task.done);
          return (
            <div key={item.id} className={`plan-row accent-${item.accent}`}>
              <Link to={`/plan/${item.id}`} className="plan-row-link">
              <span className="plan-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="plan-copy">
                <span>{item.category}{item.dDay !== null && ` · ${formatDday(item.dDay)}`}</span>
                <h3>{item.title}</h3>
                <p>{next ? `다음: ${next.title} · ${formatPlanDate(next.dueAt)}` : '모든 단계 완료'}</p>
              </div>
              <div className="mini-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
              <strong>{done}/{tasks.length}</strong>
              <ArrowRight size={18} />
              </Link>
              <button
                type="button"
                className="plan-remove"
                aria-label={`${item.title} 계획에서 삭제`}
                onClick={() => { clearPlan(item.id); setDecision(item.id, 'none'); }}
              >
                <Trash2 size={16} />삭제
              </button>
            </div>
          );
        })}
        {!plans.length && (
          <div className="empty-state">
            <CheckCircle2 size={24} />
            <strong>아직 만든 계획이 없어요</strong>
            <p>저장한 정보를 열어 &lsquo;계획 초안 만들기&rsquo;를 누르면 실행 순서를 제안해 드려요.</p>
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
  const decisions = useDecisions();
  const decision = decisionOf(decisions, item);
  const tasks = useMemo(() => planFor(item, overrides), [item, overrides]);
  const done = tasks.filter((task) => task.done).length;
  const progress = tasks.length ? done / tasks.length : 0;

  return (
    <div className="page plan-detail">
      <Link to="/plan" className="back-link"><ArrowLeft size={17} />계획</Link>
      <div className="plan-detail-head">
        <div>
          <span className="section-label">{item.category}{item.dDay !== null && ` · ${formatDday(item.dDay)}`}</span>
          <h2>{item.title}</h2>
        </div>
        <div className={`progress-ring accent-${item.accent}`} style={{ '--progress': `${progress * 360}deg` } as React.CSSProperties}>
          <div><strong>{Math.round(progress * 100)}%</strong><span>완료</span></div>
        </div>
      </div>
      {decision === 'planning' && (
        <section className="tw-root mb-6 rounded-xl border bg-card p-5">
          <p className="section-label">PLAN REVIEW</p>
          <h3 className="mt-1 text-lg font-bold">이 계획을 캘린더에 반영할까요?</h3>
          <p className="mt-1 text-sm text-muted-foreground">아래 순서를 검토한 뒤 반영하면 캘린더와 알림 대상에 추가됩니다.</p>
          <OrderTracking
            className="mt-5"
            steps={tasks.map((task) => ({
              name: task.title,
              timestamp: formatPlanDate(task.dueAt),
              isCompleted: task.done,
            }))}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="primary-action" onClick={() => setDecision(item.id, 'joined')}>캘린더에 반영하기</button>
            <button type="button" className="secondary-action" onClick={() => setDecision(item.id, 'none')}>초안으로 두지 않기</button>
          </div>
        </section>
      )}
      {decision !== 'planning' && <section className="generated-plan" aria-label={`${item.title} 실행 계획`}>
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
      </section>}
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
  const opportunityId = searchParams.get('opportunity');
  const item = opportunities.find((opportunity) => opportunity.id === opportunityId);
  const suggestions = item ? OPPORTUNITY_SUGGESTIONS : GENERAL_SUGGESTIONS;
  const likedIds = useLikedOpportunities();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ id: number; role: 'assistant' | 'user'; text: string }>>([]);
  const messagesRef = useRef(messages);
  const [usedSuggestions, setUsedSuggestions] = useState<Set<string>>(() => new Set());
  const askedRef = useRef<string | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const send = useCallback(async (text: string, usedSuggestion = false) => {
    const value = text.trim();
    if (!value) return;
    if (usedSuggestion) setUsedSuggestions((current) => new Set(current).add(value));
    const id = Date.now();
    const preparing = likedIds.length && /추천|적합|뭐부터|이번 주|마감/.test(value)
      ? '추천 에이전트와 일정 정보를 확인해 답변을 준비하고 있어요…'
      : '대화 에이전트가 저장한 공고를 확인해 답변을 준비하고 있어요…';
    setMessages((current) => [...current, { id, role: 'user', text: value }, { id: id + 1, role: 'assistant', text: preparing }]);
    setInput('');
    try {
      const conversation = messagesRef.current
        .filter((message) => !message.text.includes('답변을 준비하고 있어요…'))
        .slice(-10)
        .map(({ role, text }) => ({ role, text }));
      const answer = await askConversation(value, item?.id || null, likedIds, conversation);
      setMessages((current) => current.map((message) => message.id === id + 1 ? { ...message, text: answer } : message));
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === id + 1 ? { ...message, text: error instanceof Error ? error.message : 'AI 대화 응답을 받지 못했습니다.' } : message));
    }
  }, [item?.id, likedIds]);

  // 카드에서 '이거 물어보기'로 들어온 질문은 한 번만 자동 전송한다.
  useEffect(() => {
    const question = searchParams.get('q');
    if (!question) return;
    const key = `${opportunityId ?? ''}:${question}`;
    if (askedRef.current === key) return;
    askedRef.current = key;
    void send(question);
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
              <small>{item.organization}{item.dDay !== null && ` · ${formatDday(item.dDay)}`}</small>
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
                  : '어떤 정보를 함께 살펴볼까요?'}
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
          {suggestions.filter((suggestion) => !usedSuggestions.has(suggestion)).map((suggestion) => (
            <button type="button" key={suggestion} onClick={() => void send(suggestion, true)}>
              {suggestion}<ArrowUpRight size={14} />
            </button>
          ))}
        </div>

        <form className="chat-input" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="예: 이번 주에 뭘 먼저 해야 해?" />
          <button type="submit" aria-label="메시지 보내기"><Send size={18} /></button>
        </form>
        <p className="ai-disclaimer">저장한 공고, 프로필, 좋아요한 공고를 근거로 답해요. 중요한 조건은 원문에서 다시 확인해 주세요.</p>
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
        <span className="large-avatar">내</span>
        <div>
          <p className="section-label">MY PROFILE</p>
          <h2>내 프로필</h2>
          <p>{stored.status || '아직 입력한 프로필 정보가 없어요'}</p>
        </div>
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

function LandingPage({ onSignIn }: { onSignIn: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const start = async () => {
    setLoading(true);
    try { await onSignIn(); } catch { setLoading(false); }
  };
  return (
    <div className="tw-root landing-page min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <img className="h-7 w-auto" src="/brand/logo-lockup-horizontal.svg" alt="KEEP:ON" />
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#examples" className="hover:text-foreground">저장 예시</a>
            <a href="#how" className="hover:text-foreground">어떻게 동작하나요</a>
          </nav>
        </div>
      </header>
      <main>
        <section className="mx-auto max-w-5xl px-6 py-24 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">저장은 했는데 실행은 안 하는 청년을 위해</h1>
          <p className="mt-4 text-lg text-muted-foreground">저장한 순간부터 마감까지 끌고 가는 AI 에이전트, KEEP:ON</p>
          <div className="mt-8 flex justify-center gap-3">
            <button type="button" onClick={() => void start()} disabled={loading} className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {loading ? '로그인 화면을 여는 중…' : '시작하기'}
            </button>
            <a href="#examples" className="rounded-md border border-border px-5 py-2.5 text-sm font-medium">저장 예시 보기</a>
          </div>
        </section>

        <section id="examples" className="pb-24">
          <LandingSectionHeading eyebrow="Save from anywhere" title="이런 거 저장해두고 다시 안 보시죠?" description="공모전, 지원사업, 서포터즈부터 정보성 게시물, 마감 있는 이벤트까지 — 어디서 저장했든 KEEP:ON은 저장한 순간 무엇을 해야 하는지 구분합니다." />
          <div className="mt-10"><CapturedExamplesMarquee /></div>
        </section>

        <section id="how" className="mx-auto max-w-5xl px-6 pb-24">
          <LandingSectionHeading eyebrow="How KEEP:ON works" title="저장 하나가 실행 계획이 되기까지" description="실제 공고 하나로 KEEP:ON 파이프라인을 그대로 돌린 결과입니다." />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Card><CardContent className="space-y-3 p-6"><div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Quote className="size-4" />1. 저장한 원문</div><p className="whitespace-pre-line text-sm text-foreground/90">{demoRawText}</p></CardContent></Card>
            <Card><CardContent className="space-y-3 p-6"><div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CheckCircle2 className="size-4" />2. KEEP:ON이 뽑아낸 공고 정보</div><ul className="space-y-2">{demoConditions.map((condition) => <li key={condition.quote} className="rounded-md border border-border bg-muted/50 p-2.5 text-xs"><span className="mr-2 rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">{condition.type}</span>{condition.quote}</li>)}</ul><p className="text-xs text-muted-foreground">원문에 없는 내용은 만들지 않고, 근거가 되는 원문만 사용합니다.</p></CardContent></Card>
            <Card><CardContent className="space-y-3 p-6"><div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CalendarClock className="size-4" />3. 나를 위한 실행 계획</div><ul className="space-y-2">{demoTasks.map((task) => <li key={task.title} className="flex items-start gap-2 text-xs"><ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" /><span className="flex-1">{task.title}</span><span className="shrink-0 text-muted-foreground">{task.due}</span></li>)}</ul><p className="text-xs text-muted-foreground">마감일이 있으면 역산해 계획을 제안하고, 사용자가 선택하면 캘린더에 반영합니다.</p></CardContent></Card>
          </div>
        </section>

        <section className="border-t border-border"><div className="mx-auto max-w-3xl px-6 py-20 text-center"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">다음에 저장할 땐, 저장으로 끝내지 마세요</h2><p className="mt-3 text-muted-foreground">Chrome 확장프로그램으로 지금 바로 시작하세요.</p><button type="button" onClick={() => void start()} disabled={loading} className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60">{loading ? '로그인 화면을 여는 중…' : 'KEEP:ON 시작하기'}</button></div></section>
      </main>
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">KEEP:ON · 2026 강원대x고려대 Summer Agentic AI 심화 몰입 캠프</footer>
    </div>
  );
}

function LandingSectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>{description && <p className="mt-3 text-muted-foreground">{description}</p>}</div>;
}

function App() {
  const { ready, session, signIn } = useAuth();
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!session) {
      setOpportunities([]);
      setLoadingData(false);
      return;
    }
    setLoadingData(true);
    void getMyOpportunities()
      .then((items) => { setOpportunities(items); })
      .catch(() => { setOpportunities([]); })
      .finally(() => setLoadingData(false));
  }, [session]);

  if (!ready) return <main className="page home-page"><p>KEEP:ON을 준비하고 있어요.</p></main>;
  if (!session) return <LandingPage onSignIn={signIn} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage loading={loadingData} />} />
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
