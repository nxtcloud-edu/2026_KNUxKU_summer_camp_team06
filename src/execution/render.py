# OWNER: D (김나연)
# Execution Agent의 결과(웹 캘린더 + 인박스)를 발표용 HTML 한 장으로 렌더링한다.
#
# 실행:  python -m src.execution.render          # demo 실행 후의 저장 상태를 그림
#        python -m src.execution.render --run    # demo를 새로 돌린 뒤 그림
#
# 프론트엔드(E)가 Streamlit에 붙이기 전, D 파트만으로 "캘린더에 실제로 박혔다"를 눈으로
# 보여주기 위한 독립 산출물이다. 외부 의존성 없이 self-contained HTML을 만든다.

from __future__ import annotations

import calendar as _cal
import html
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from .models import Goal, GoalStatus, TaskStatus
from .store import ExecutionStore

_OUT_PATH = Path(__file__).resolve().parents[2] / "data" / "execution" / "execution_view.html"

_STATUS_KO = {
    TaskStatus.TODO: ("예정", "#64748b"),
    TaskStatus.IN_PROGRESS: ("진행중", "#2563eb"),
    TaskStatus.DONE: ("완료", "#16a34a"),
    TaskStatus.OVERDUE: ("지연", "#dc2626"),
    TaskStatus.BLOCKED: ("대기", "#a855f7"),
}
_NOTI_BADGE = {
    "reminder": ("리마인드", "#0ea5e9"),
    "intervention": ("개입", "#dc2626"),
    "info": ("안내", "#64748b"),
    "celebration": ("축하", "#16a34a"),
}


def _esc(s) -> str:
    return html.escape(str(s)) if s is not None else ""


def _month_grid(year: int, month: int) -> list[list[int]]:
    _cal.setfirstweekday(_cal.SUNDAY)
    return _cal.monthcalendar(year, month)


def render_html(store: Optional[ExecutionStore] = None, goal: Optional[Goal] = None,
                today: date = date(2026, 8, 13)) -> str:
    store = store or ExecutionStore()
    goals = store.goals()
    if not goals:
        return "<p>표시할 Goal이 없습니다. 먼저 <code>python -m src.execution.demo</code>를 실행하세요.</p>"
    goal = goal or goals[0]

    tasks = store.tasks_for_goal(goal.id)
    events = store.events_for_goal(goal.id)
    user_id = goal.user_id
    inbox = store.inbox(user_id)
    pending = [n for n in store.notifications_for_user(user_id) if not n.delivered]

    done = sum(1 for t in tasks if t.status == TaskStatus.DONE)
    progress = round(done / (len(tasks) or 1) * 100)
    deadline = goal.deadline.date() if goal.deadline else None

    # 날짜별 이벤트 매핑
    by_day: dict[date, list] = {}
    for e in events:
        by_day.setdefault(e.start.date(), []).append(e)

    ym = (deadline or today)
    grid = _month_grid(ym.year, ym.month)
    month_name = f"{ym.year}년 {ym.month}월"

    # --- 캘린더 셀 ---
    weekdays = ["일", "월", "화", "수", "목", "금", "토"]
    head_cells = "".join(f"<div class='dow'>{d}</div>" for d in weekdays)
    body_cells = []
    for week in grid:
        for d in week:
            if d == 0:
                body_cells.append("<div class='cell empty'></div>")
                continue
            cur = date(ym.year, ym.month, d)
            classes = "cell"
            if cur == today:
                classes += " today"
            if deadline and cur == deadline:
                classes += " deadline"
            chips = ""
            for e in by_day.get(cur, []):
                t = store.get_task(e.task_id) if e.task_id else None
                color = _STATUS_KO.get(t.status, ("", "#2563eb"))[1] if t else "#2563eb"
                chips += f"<div class='chip' style='background:{color}'>{_esc(e.title.split('] ')[-1])}</div>"
            tag = "<span class='dl'>마감</span>" if (deadline and cur == deadline) else ""
            body_cells.append(
                f"<div class='{classes}'><div class='dnum'>{d}{tag}</div>{chips}</div>"
            )
    calendar_html = f"""
      <div class='cal'>
        <div class='cal-head'>{head_cells}</div>
        <div class='cal-body'>{''.join(body_cells)}</div>
      </div>"""

    # --- Task 리스트 ---
    task_rows = ""
    for t in tasks:
        label, color = _STATUS_KO.get(t.status, ("", "#64748b"))
        due = t.due_at.strftime("%m/%d") if t.due_at else "-"
        task_rows += f"""
          <li>
            <span class='badge' style='background:{color}'>{label}</span>
            <span class='tdue'>{due}</span>
            <span class='ttitle'>{_esc(t.title)}</span>
            <span class='thours'>{t.estimated_hours}h</span>
          </li>"""

    # --- 인박스 ---
    def _noti_item(n, delivered=True) -> str:
        label, color = _NOTI_BADGE.get(n.type.value, ("", "#64748b"))
        when = (n.deliver_at or n.created_at)
        when_s = when.strftime("%m/%d %H:%M") if when else ""
        cls = "noti" if delivered else "noti pending"
        return f"""
          <div class='{cls}'>
            <div class='noti-top'>
              <span class='badge' style='background:{color}'>{label}</span>
              <span class='ntitle'>{_esc(n.title)}</span>
              <span class='nwhen'>{when_s}{'' if delivered else ' · 예약'}</span>
            </div>
            <div class='nbody'>{_esc(n.body)}</div>
          </div>"""

    inbox_html = "".join(_noti_item(n, True) for n in inbox) or "<p class='muted'>전달된 알림이 아직 없어요.</p>"
    pending_html = "".join(_noti_item(n, False) for n in pending) or "<p class='muted'>예약된 알림이 없어요.</p>"

    # --- 실행 로그 ---
    mem = store.memory_for_user(user_id)
    mem_html = "".join(
        f"<li><b>{_esc(m.event)}</b> · {_esc(m.detail)}</li>" for m in mem
    )

    status_ko = {
        GoalStatus.ACTIVE: "실행 중", GoalStatus.AT_RISK: "정체 위험",
        GoalStatus.COMPLETED: "완료", GoalStatus.ABANDONED: "중단",
    }[goal.status]

    return _TEMPLATE.format(
        title=_esc(goal.title),
        category=_esc(goal.category),
        org=_esc(goal.meta.get("org") or ""),
        deadline=_esc(deadline or "미정"),
        status=status_ko,
        progress=progress,
        done=done,
        total=len(tasks),
        month_name=month_name,
        calendar=calendar_html,
        tasks=task_rows,
        inbox=inbox_html,
        pending=pending_html,
        memory=mem_html,
        n_events=len(events),
        n_inbox=len(inbox),
        n_pending=len(pending),
    )


def write_html(path: Optional[Path] = None, **kw) -> Path:
    path = Path(path) if path else _OUT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_html(**kw), encoding="utf-8")
    return path


_TEMPLATE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Execution Agent · {title}</title>
<style>
  :root {{
    --bg:#f6f7f9; --card:#ffffff; --ink:#0f172a; --muted:#64748b; --line:#e5e7eb;
    --accent:#4f46e5;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#0b1020; --card:#151a2c; --ink:#e6e9f2; --muted:#94a3b8; --line:#26304a; --accent:#818cf8; }}
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
    font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif; }}
  .wrap {{ max-width:1080px; margin:0 auto; padding:24px 18px 60px; }}
  h1 {{ font-size:20px; margin:0 0 4px; }}
  .sub {{ color:var(--muted); font-size:13px; margin-bottom:18px; }}
  .grid {{ display:grid; grid-template-columns:1.5fr 1fr; gap:18px; }}
  @media (max-width:860px) {{ .grid {{ grid-template-columns:1fr; }} }}
  .card {{ background:var(--card); border:1px solid var(--line); border-radius:14px;
    padding:16px; margin-bottom:18px; }}
  .card h2 {{ font-size:14px; margin:0 0 12px; letter-spacing:.02em; }}
  .pill {{ display:inline-block; padding:3px 10px; border-radius:999px; font-size:12px;
    background:var(--accent); color:#fff; margin-right:6px; }}
  .kpis {{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:6px; }}
  .kpi {{ flex:1; min-width:110px; background:var(--card); border:1px solid var(--line);
    border-radius:12px; padding:12px 14px; }}
  .kpi .n {{ font-size:22px; font-weight:700; }}
  .kpi .l {{ font-size:11px; color:var(--muted); }}
  .bar {{ height:8px; background:var(--line); border-radius:999px; overflow:hidden; margin-top:8px; }}
  .bar > i {{ display:block; height:100%; background:var(--accent); }}
  /* calendar */
  .cal-head, .cal-body {{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }}
  .dow {{ text-align:center; font-size:11px; color:var(--muted); padding-bottom:4px; }}
  .cell {{ min-height:78px; border:1px solid var(--line); border-radius:10px; padding:5px; }}
  .cell.empty {{ border:none; background:transparent; }}
  .cell.today {{ outline:2px solid var(--accent); }}
  .cell.deadline {{ background:rgba(220,38,38,.10); border-color:#dc2626; }}
  .dnum {{ font-size:12px; color:var(--muted); margin-bottom:4px; display:flex; justify-content:space-between; }}
  .dl {{ color:#dc2626; font-weight:700; font-size:10px; }}
  .chip {{ color:#fff; font-size:10px; line-height:1.25; padding:2px 5px; border-radius:6px;
    margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
  /* tasks */
  ul.tasks {{ list-style:none; margin:0; padding:0; }}
  ul.tasks li {{ display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13px; }}
  ul.tasks li:last-child {{ border-bottom:none; }}
  .badge {{ color:#fff; font-size:10px; padding:2px 7px; border-radius:999px; }}
  .tdue {{ color:var(--muted); font-size:12px; width:42px; }}
  .ttitle {{ flex:1; }}
  .thours {{ color:var(--muted); font-size:11px; }}
  /* inbox */
  .noti {{ border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-bottom:8px; }}
  .noti.pending {{ border-style:dashed; opacity:.85; }}
  .noti-top {{ display:flex; align-items:center; gap:8px; font-size:13px; }}
  .ntitle {{ font-weight:600; flex:1; }}
  .nwhen {{ color:var(--muted); font-size:11px; }}
  .nbody {{ color:var(--muted); font-size:12px; margin-top:4px; }}
  .muted {{ color:var(--muted); font-size:12px; }}
  ul.mem {{ list-style:none; margin:0; padding:0; font-size:12px; color:var(--muted); }}
  ul.mem li {{ padding:4px 0; border-bottom:1px dashed var(--line); }}
  ul.mem b {{ color:var(--ink); }}
</style></head>
<body><div class="wrap">
  <h1>🎯 {title}</h1>
  <div class="sub"><span class="pill">{category}</span>{org} · 마감 {deadline} · 상태: {status}</div>

  <div class="kpis">
    <div class="kpi"><div class="n">{progress}%</div><div class="l">진행률</div>
      <div class="bar"><i style="width:{progress}%"></i></div></div>
    <div class="kpi"><div class="n">{done}/{total}</div><div class="l">완료 Task</div></div>
    <div class="kpi"><div class="n">{n_events}</div><div class="l">캘린더 등록</div></div>
    <div class="kpi"><div class="n">{n_inbox}</div><div class="l">받은 알림</div></div>
    <div class="kpi"><div class="n">{n_pending}</div><div class="l">예약 알림</div></div>
  </div>

  <div class="grid">
    <div>
      <div class="card"><h2>🗓 웹 캘린더 · {month_name} <span class="muted">(Calendar Tool)</span></h2>{calendar}</div>
      <div class="card"><h2>📋 Task & 마감 역산 일정</h2><ul class="tasks">{tasks}</ul></div>
    </div>
    <div>
      <div class="card"><h2>📬 인박스 · 받은 알림 <span class="muted">(Notification Tool)</span></h2>{inbox}</div>
      <div class="card"><h2>⏳ 예약된 알림</h2>{pending}</div>
      <div class="card"><h2>🧠 실행 로그 (Execution Memory)</h2><ul class="mem">{memory}</ul></div>
    </div>
  </div>
</div></body></html>"""


if __name__ == "__main__":
    if "--run" in sys.argv:
        from .demo import run_demo
        run_demo(ExecutionStore())
    out = write_html()
    print(f"✅ 캘린더/인박스 뷰 생성: {out}")
