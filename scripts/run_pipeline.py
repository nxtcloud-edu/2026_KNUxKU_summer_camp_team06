"""
OWNER: B (신민서)

data/opportunities.json의 각 항목에 대해:
1) extract_from_link(url)로 실제 크롤링이 되는지 확인 (정보 제공용, 통계만 출력)
2) normalize(id, raw_text)로 정규화 실행 (핵심 검증 대상 — raw_text는 수집 시
   원문 그대로 넣어둔 값을 그대로 사용, extraction 결과로 덮어쓰지 않는다)

실행: (.venv 활성화 후, 레포 루트에서)
    python -m scripts.run_pipeline
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from src.extraction_agent import extract_from_link  # noqa: E402
from src.normalization_agent import normalize  # noqa: E402

DATA_PATH = REPO_ROOT / "data" / "opportunities.json"
OUTPUT_PATH = REPO_ROOT / "data" / "normalization_results.json"


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    opportunities = data["opportunities"]

    extraction_status = Counter()
    normalization_status = Counter()
    condition_type_counts = Counter()
    results = []

    for opp in opportunities:
        # 1) 실제 링크 크롤링 확인 (정보 제공용 — 실패해도 raw_text는 이미 수집돼 있으므로
        #    normalization은 계속 진행한다)
        link_result = extract_from_link(opp["url"])
        extraction_status[link_result.status.value] += 1
        if link_result.status.value != "ok":
            print(f"[extract:{link_result.status.value}] {opp['id']} — {link_result.error_reason}")

        # 2) 정규화 (핵심) — 수집 시 넣어둔 raw_text 원문을 그대로 사용
        norm_result = normalize(opp["id"], opp["raw_text"])
        normalization_status[norm_result.status] += 1
        for cond in norm_result.conditions:
            condition_type_counts[cond.type.value] += 1

        if norm_result.status != "ok":
            print(f"[normalize:{norm_result.status}] {opp['id']} — {norm_result.notes}")

        results.append(json.loads(norm_result.model_dump_json(exclude_none=True)))

    OUTPUT_PATH.write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("\n=== 요약 ===")
    print(f"총 공고 수: {len(opportunities)}")
    print(f"extraction (링크 실제 크롤링) 상태: {dict(extraction_status)}")
    print(f"normalization 상태: {dict(normalization_status)}")
    print("조건 타입별 등장 횟수 (8종 커버리지 확인):")
    for cond_type in [
        "age", "region", "status", "income",
        "duplicate", "military", "period", "etc",
    ]:
        print(f"  {cond_type}: {condition_type_counts.get(cond_type, 0)}")
    print(f"\n결과 저장: {OUTPUT_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
