# C 파트 — Decision Engine

OWNER: C (엄세연)

## 구현 범위

- `src/eligibility_agent.py`: 조건별 PASS/FAIL/UNKNOWN과 원문 근거
- `src/feasibility_agent.py`: 마감, 가용시간, 예산, 진행 중 활동 평가
- `src/ranking_agent.py`: 관심 적합성, 성장 가치, 실행 가능성 기반 점수와 Top 3
- `src/decision_engine.py`: 위 세 모듈을 순서대로 실행하는 통합 진입점

## 안전 원칙

- B가 `operator/value`로 구조화하지 않은 조건은 `raw_quote`를 재해석하지 않고 UNKNOWN으로 둔다.
- 하나라도 FAIL이면 전체 FAIL, FAIL 없이 UNKNOWN이 있으면 전체 UNKNOWN이다.
- `general_info`와 `time_sensitive_info`는 개인 자격 판정 대상이 아니므로 NOT_APPLICABLE이다.
- 자격 FAIL인 공고는 Ranking에서 제외한다.
- Feasibility의 시간/비용 추정치는 입력된 값만 사용하며 임의 생성하지 않는다.

## A와 확정할 공용 계약

현재 `src/models.py`가 비어 있어 C 내부 임시 모델을 사용한다. A가 아래 필드를 공용 모델에
확정하면 import만 교체한다.

```text
UserProfile
  birth_date, region, status, income_bracket, interests
  major, experiences
  weekly_available_hours, available_budget, active_commitments

EligibilityVerdict
  opportunity_id, content_category, conditions, overall, reason

FeasibilityVerdict
  level, score, reasons, warnings, days_remaining

RankingResult
  opportunity_id, score, recommendation, eligibility, feasibility
  interest_score, growth_score, reasons, rank
```

## 실행

```bash
python -m pytest -q
python -m src.eligibility_agent
```

현재 테스트는 Eligibility, Feasibility, Ranking/Top 3와 B 실제 JSON 연동을 포함한다.
