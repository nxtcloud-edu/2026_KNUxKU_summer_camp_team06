# OWNER: D (김나연)
# Execution Agent 전용 데모용 Streamlit 앱 (E의 메인 streamlit_app.py와 별개).
#
# 실행:  streamlit run app/execution_demo_app.py
#
# 목적: 발표에서 "선택 → Task/Plan 생성 → 캘린더 등록 → 대화 → 리마인드 → 재계획"을
#       클릭/입력으로 실제 조작하며 보여준다. AWS 없이 로컬 모드로 동작한다.

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import streamlit as st

# 리포지토리 루트를 import 경로에 추가 (streamlit run 실행 위치 대응)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.execution.agent import ExecutionAgent
from src.execution.chat import ExecutionChat
from src.execution.models import EligibilityDecision, ExecutionContext, Opportunity, UserProfile
from src.execution.render import render_html
from src.execution.store import ExecutionStore

st.set_page_config(page_title="Execution Agent 데모", page_icon="🎯", layout="wide")

OPP_PATH = ROOT / "data" / "opportunities.json"


@st.cache_data
def load_opps() -> list[dict]:
    data = json.loads(OPP_PATH.read_text(encoding="utf-8"))
    return data["opportunities"]


def demo_user() -> UserProfile:
    return UserProfile(
        user_id="user-001", name="김서연", region="서울 관악구",
        birth_year=2002, status="대학 4학년(재학)",
        interests=["디자인", "공모전"], default_reminder_lead_days=3,
    )


def init_session():
    if "store" not in st.session_state:
        # 세션마다 격리된 임시 저장소 (autosave off, 메모리 상태로만)
        tmp = ROOT / "data" / "execution" / "_streamlit_session.json"
        store = ExecutionStore(db_path=tmp, autosave=False)
        store.reset()
        st.session_state.store = store
        st.session_state.agent = ExecutionAgent(store=store)
        st.session_state.now = datetime(2026, 8, 13, 9, 0)
        st.session_state.goal = None
        st.session_state.chat_log = []


init_session()
agent: ExecutionAgent = st.session_state.agent
store: ExecutionStore = st.session_state.store
user = demo_user()

st.title("🎯 Execution Agent — 실행 에이전트 데모")
st.caption("저장만 하고 실행 못 하는 청년을 위해, 확정한 순간부터 마감까지 끌고 가는 에이전트 · "
           f"실행 모드: `{agent.provider}` · 기준일: {st.session_state.now.date()}")

# --- 사이드바: 공고 선택 + 실행 시작 ----------------------------------------
with st.sidebar:
    st.header("1) 실행할 기회 선택")
    opps = load_opps()
    labels = [f"{o['title']} [{o['category']}]" for o in opps]
    default_idx = next((i for i, o in enumerate(opps) if o["id"] == "opp-contest-02"), 0)
    idx = st.selectbox("공고", range(len(opps)), format_func=lambda i: labels[i], index=default_idx)
    opp = opps[idx]
    st.markdown(f"**주관**: {opp.get('org','-')}")
    st.markdown(f"**마감(원문)**: {opp.get('deadline_text','-')}")

    st.divider()
    st.header("2) 사용자 / 판정")
    st.markdown(f"**{user.name}** · {user.region} · {user.status}")
    st.success("판정: 지원 가능 (C 에이전트 결과 확정 가정)")

    if st.button("✅ 이거 할래 — 실행 시작", type="primary", use_container_width=True):
        store.reset()
        ctx = ExecutionContext(
            user=user,
            opportunity=Opportunity(**opp),
            decision=EligibilityDecision(opportunity_id=opp["id"], user_id=user.user_id,
                                         eligible=True, reason="자격조건 충족(데모 가정)"),
            now=st.session_state.now,
        )
        result = agent.start(ctx)
        st.session_state.goal = result.goal
        st.session_state.chat_log = []
        st.rerun()

goal = st.session_state.goal

if goal is None:
    st.info("👈 왼쪽에서 공고를 고르고 **‘이거 할래 — 실행 시작’**을 누르면, "
            "에이전트가 Task를 분해하고 마감 역산으로 캘린더에 등록합니다.")
    st.stop()

# --- 본문: 캘린더/인박스 뷰 + 대화 ------------------------------------------
left, right = st.columns([1.5, 1])

with left:
    st.subheader("🗓 웹 캘린더 · 📋 Task · 📬 인박스")
    html_view = render_html(store=store, goal=goal, today=st.session_state.now.date())
    st.components.v1.html(html_view, height=760, scrolling=True)

with right:
    st.subheader("💬 실행 챗 (Notification/Calendar Tool 조작)")

    # 시간 진행 (Scheduler 시연)
    with st.container(border=True):
        st.markdown("**⏰ 시간 진행 → 예약 알림 전달(Scheduler)**")
        c1, c2, c3 = st.columns(3)
        for label, days, col in [("+3일", 3, c1), ("마감 3일 전", None, c2), ("마감일", "deadline", c3)]:
            if col.button(label, use_container_width=True):
                if days == "deadline" and goal.deadline:
                    st.session_state.now = goal.deadline
                elif days is None and goal.deadline:
                    st.session_state.now = goal.deadline - timedelta(days=3)
                else:
                    st.session_state.now = st.session_state.now + timedelta(days=days or 0)
                fired = agent.run_scheduler(st.session_state.now)
                diag = agent.check_and_intervene(goal, st.session_state.now)
                msg = f"⏰ {st.session_state.now.date()}로 이동 · 전달된 알림 {len(fired)}건"
                if diag:
                    msg += f" · ⚠️ 정체 감지: {diag}"
                st.session_state.chat_log.append(("system", msg))
                st.rerun()

    # 대화 입력
    st.markdown("**예시**: `마감 3일 전에 알려줘` · `1번 끝냈어` · `다시 계획해줘` · `진행률`")
    if prompt := st.chat_input("에이전트에게 말하기..."):
        chat = ExecutionChat(agent, user, goal, now=st.session_state.now)
        reply = chat.handle(prompt)
        st.session_state.chat_log.append(("user", prompt))
        st.session_state.chat_log.append(("agent", reply))
        st.session_state.goal = store.get_goal(goal.id)  # 상태 갱신
        st.rerun()

    for role, text in reversed(st.session_state.chat_log[-12:]):
        if role == "user":
            st.chat_message("user").write(text)
        elif role == "agent":
            st.chat_message("assistant").write(text)
        else:
            st.info(text)
