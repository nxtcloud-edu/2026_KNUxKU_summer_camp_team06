# C파트: 좋아요 기반 추천 엔진

## 사용자 흐름

1. 사용자가 링크를 보내면 B파트가 공고를 추출·정규화한다.
2. 대시보드는 최근 전송 공고, 많이 본 공고, AI가 찾은 추가 공고를 보여 준다.
3. 사용자가 공고에 좋아요를 누르면 C파트가 좋아요 공고와 유사 공고를 추천 탭용으로 평가한다.
4. 자격 미달 공고는 제외하고, 나머지를 추천도 순으로 Top N개 반환한다.
5. 사용자가 `이거 할래!`를 누르면 선택 공고의 판정 근거를 챗봇으로 전달한다.

## C 공개 진입점

```python
from src.decision_engine import (
    recommend_from_likes,
    create_chatbot_handoff,
)
from src.ranking_agent import build_dashboard_items

# 좋아요 이벤트 뒤 추천 탭 생성 (기본 Top 5)
feed = recommend_from_likes(profile, items, liked_opportunity_ids)

# '이거 할래!' 버튼 클릭 시 챗봇에 전달할 payload 생성
handoff = create_chatbot_handoff(feed, opportunity_id)
```

`items`의 각 원소는 아래처럼 B의 `NormalizationResult`와 화면용·추천용 신호를 함께 받는다.

```python
DecisionInput(
    normalization=normalization_result,
    signals=OpportunitySignals(
        opportunity_id="...",
        title="...",
        keywords=["AI", "교육"],
        categories=["부트캠프"],
        skills_gained=["Python"],
        source_url="https://...",
    ),
    effort=OpportunityEffort(...),
)
```

## 판정 규칙

- 자격 판정은 `PASS / FAIL / UNKNOWN`이다. `FAIL` 공고는 추천 결과에서 제외한다.
- `UNKNOWN`은 추천은 가능하지만 보수적으로 점수화하고, 필요한 프로필 질문을 `follow_up_questions`에 넣는다.
- 좋아요한 공고는 선호도 100점을 받는다. 나머지 공고는 좋아요 공고의 키워드·카테고리·획득 역량과의 유사도로 선호도를 계산한다.
- 추천도는 자격(35%), 실행 가능성(20%), 사용자 관심사(15%), 성장 가치(10%), 좋아요 기반 선호도(20%)를 반영한다.
- 마감·비용·시간처럼 B가 구조화하지 않은 정보는 추측하지 않고 `UNKNOWN` 또는 feasibility 경고로 남긴다.

## A/B 연동 요청

### A / 대시보드·챗봇

- 사용자 프로필: `birth_date`, `region`, `status`, 관심사, 가능 시간·예산을 C에 전달
- 좋아요 이벤트: `liked_opportunity_ids: list[str]` 전달
- 대시보드 이벤트로 정렬된 `recent`, `popular` 목록 전달
- `ChatbotHandoff`를 `이거 할래!` 클릭 시 챗봇 세션의 컨텍스트로 전달

### B / 수집·정규화

- 각 공고에 안정적인 `opportunity_id`, `title`, `source_url` 제공
- 유사 추천에 사용할 `keywords`, `categories`, `skills_gained` 제공
- 자격 조건은 기존처럼 `type`, `operator`, `value`, `raw_quote` 구조를 유지

## 테스트

```bash
python -m pytest -q
```

현재 eligibility, feasibility, 기존 Top 3, 좋아요 기반 추천, 대시보드 중복 제거, 챗봇 handoff를 테스트한다.
