-- normalized_opportunities에 opportunity_id 컬럼 추가
--
-- 배경: normalized_opportunities.id는 Supabase가 insert 시점에 발급하는 uuid라
-- "DB 안 몇 번째 행인가"만 나타낸다. 반면 eligibility_agent.py/ranking_agent.py/
-- decision_engine.py/src/execution/models.py 등 파이프라인 전체는
-- NormalizationResult.opportunity_id(예: "opp-contest-02", B의 data/opportunities.json
-- 원본 ID)로 "어떤 공고인가"를 추적한다. 지금까지는 이 값이 Supabase insert 시
-- 어디에도 전달되지 않아서, 한번 적재되면 원본 공고와의 연결이 끊겼다.
--
-- saved_items가 아니라 normalized_opportunities에 두는 이유: saved_items는
-- "누가 이걸 저장한 한 번의 행위"라 실제 서비스에선 opportunity_id가 없는
-- 임의 링크도 저장된다. opportunity_id는 정규화 파이프라인 산출물에서만
-- 의미가 있으므로 normalized_opportunities 쪽이 자연스럽다.
--
-- saved_items.id(uuid)는 그대로 PK로 유지한다 — 여러 사용자가 같은 공고를
-- 각자 저장하면 saved_items 행이 여러 개 생기는 게 정상 동작이라, opportunity_id를
-- PK로 쓰면 그 경우 충돌한다.

alter table normalized_opportunities add column if not exists opportunity_id text;

create index if not exists idx_normalized_opportunities_opportunity_id
  on normalized_opportunities (opportunity_id);
