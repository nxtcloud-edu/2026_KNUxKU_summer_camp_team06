"""Contract test for the KEEP:ON recommendation cards served to the frontend."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


BRIDGE_PATH = Path(__file__).parents[1] / "services" / "keep-web" / "server" / "agent-bridge.py"
SPEC = spec_from_file_location("keep_web_agent_bridge", BRIDGE_PATH)
assert SPEC and SPEC.loader
BRIDGE = module_from_spec(SPEC)
SPEC.loader.exec_module(BRIDGE)


def test_like_recommendation_returns_frontend_card_contract():
    result = BRIDGE.run({
        "command": "recommend",
        "profile": {"birth_date": "2002-01-01", "status": "student", "interests": ["AI"]},
        "liked_opportunity_ids": ["liked-ai"],
        "opportunities": [
            {"id": "liked-ai", "title": "AI 교육", "category": "AI", "org": "KEEP"},
            {"id": "related-ai", "title": "AI 공모전", "category": "AI", "org": "KEEP"},
        ],
        "normalizations": [
            {"opportunity_id": "liked-ai", "content_category": "opportunity", "conditions": [], "status": "ok"},
            {"opportunity_id": "related-ai", "content_category": "opportunity", "conditions": [], "status": "ok"},
        ],
    })

    assert result["liked_opportunity_ids"] == ["liked-ai"]
    assert [item["opportunity_id"] for item in result["recommendations"]] == ["liked-ai", "related-ai"]
    assert result["recommendations"][0]["rank"] == 1
    assert result["recommendations"][0]["label"] in {"추천", "검토 필요", "지금 확인"}
    assert result["recommendations"][0]["rationale"]
    assert result["recommendations"][0]["factors"]
