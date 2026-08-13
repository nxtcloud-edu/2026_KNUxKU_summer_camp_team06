# OWNER: D (김나연)
# 마감 역산 스케줄 생성: Quest/Todo 리스트 + 캘린더 등록 페이로드.
#
# 실제 구현은 src/execution 패키지로 이관했다 (Execution Agent 전체 시스템의 일부).
# 이 파일은 ARCHITECTURE.md의 역할↔모듈 매핑과 A(supervisor)의 import 경로를 유지하기
# 위한 얇은 진입점이다. Planner가 Task를 마감 역산으로 배치하고 Calendar Tool로 등록한다.

from src.execution.agent import ExecutionAgent, StartResult
from src.execution.models import ExecutionContext
from src.execution.modules import Planner, parse_deadline

__all__ = ["ExecutionAgent", "StartResult", "ExecutionContext", "Planner", "parse_deadline", "plan_for"]


def plan_for(ctx: ExecutionContext) -> StartResult:
    """Supervisor(A)용 단일 진입점: 확정된 기회(ctx) → Task 분해 + 마감 역산 일정 + 캘린더 등록."""
    return ExecutionAgent().start(ctx)


if __name__ == "__main__":
    from src.execution.demo import run_demo
    run_demo()
