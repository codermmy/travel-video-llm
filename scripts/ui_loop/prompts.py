from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List

from .config import LoopConfig


def _json_block(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _recent_rounds_block(recent_rounds: Iterable[Dict[str, Any]]) -> str:
    items = list(recent_rounds)
    if not items:
        return "- none"

    lines: List[str] = []
    for item in items:
        number = item.get("round_number", "?")
        status = item.get("status", "unknown")
        score = item.get("score")
        summary = item.get("summary") or "no summary"
        lines.append(f"- round {number}: status={status}, score={score}, summary={summary}")
    return "\n".join(lines)


def _guardrails_block(config: LoopConfig) -> str:
    if not config.guardrails:
        return "- none"
    return "\n".join(f"- {item}" for item in config.guardrails)


def _editable_block(config: LoopConfig) -> str:
    return "\n".join(f"- {item}" for item in config.editable_paths)


def _focus_block(config: LoopConfig) -> str:
    return "\n".join(f"- {item}" for item in config.focus_paths)


def build_audit_prompt(
    config: LoopConfig,
    context_bundle: str,
    round_number: int,
    previous_score: float,
    recent_rounds: Iterable[Dict[str, Any]],
) -> str:
    return f"""You are running inside an autonomous UI/UX/product optimization loop for Travel Video LLM.

This is the AUDIT phase. You must inspect the current mobile codebase and decide the highest-leverage issues for the next round.

Project goal:
{config.goal}

Target area:
{config.target_description}

Current round:
- round_number: {round_number}
- previous_score: {previous_score}

Editable scope for later execute phase:
{_editable_block(config)}

Priority focus paths:
{_focus_block(config)}

Guardrails:
{_guardrails_block(config)}

Recent rounds:
{_recent_rounds_block(recent_rounds)}

Project design context:
{context_bundle}

Hard rules:
- Read the mobile code directly before judging.
- Existing uncommitted changes are baseline. Do not frame them as your own work and do not plan to revert unrelated changes.
- Focus on product clarity, task completion, information architecture, state truthfulness, CTA clarity, visual rhythm, mobile ergonomics, accessibility, and trust.
- Do not optimize for visual novelty alone.
- Prefer 1 to {config.max_issues_per_round} high-leverage issue clusters for this round.
- Do not propose backend or infrastructure changes unless the UI is blocked without them.
- Output raw JSON only. No markdown fences. No prose outside JSON.

Return a JSON object with this exact shape:
{{
  "stage": "audit",
  "core_goal": "string",
  "core_target": "string",
  "issues": [
    {{
      "id": "P0-1",
      "priority": "P0",
      "title": "string",
      "impact": "string",
      "evidence": ["string"],
      "suggested_changes": ["string"],
      "target_files": ["string"]
    }}
  ],
  "selected_issue_ids": ["P0-1"],
  "do_not_touch_yet": ["string"],
  "why_these_now": ["string"],
  "notes": "string"
}}
"""


def build_challenge_prompt(
    config: LoopConfig,
    context_bundle: str,
    audit_payload: Dict[str, Any],
    recent_rounds: Iterable[Dict[str, Any]],
) -> str:
    return f"""You are the CHALLENGE phase in the same autonomous UI loop.

Your job is to aggressively review the audit plan before execution. Attack shallow priorities, visual-only fixes, false urgency, and anything that does not materially improve the Travel Video LLM mobile experience.

Project goal:
{config.goal}

Editable scope:
{_editable_block(config)}

Recent rounds:
{_recent_rounds_block(recent_rounds)}

Project design context:
{context_bundle}

Audit payload:
{_json_block(audit_payload)}

Rules:
- Reprioritize if the audit missed the real bottleneck.
- Reject fake polish and low-leverage work.
- Keep the round narrow: at most {config.max_issues_per_round} issue clusters.
- Do not ask the user for review. This system is self-running.
- Output raw JSON only.

Return a JSON object with this exact shape:
{{
  "stage": "challenge",
  "audit_gaps": ["string"],
  "priority_changes": ["string"],
  "approved_issue_ids": ["P0-1"],
  "deferred_issue_ids": ["P1-3"],
  "execution_guardrails": ["string"],
  "rationale": "string"
}}
"""


def build_execute_prompt(
    config: LoopConfig,
    context_bundle: str,
    audit_payload: Dict[str, Any],
    challenge_payload: Dict[str, Any],
    round_number: int,
    previous_score: float,
) -> str:
    return f"""You are in the EXECUTE phase of an autonomous UI optimization loop.

You must directly modify the code inside the allowed scope to implement the approved issues for round {round_number}.

Project goal:
{config.goal}

Current score before this round:
{previous_score}

Editable scope:
{_editable_block(config)}

Priority focus paths:
{_focus_block(config)}

Guardrails:
{_guardrails_block(config)}

Project design context:
{context_bundle}

Audit payload:
{_json_block(audit_payload)}

Challenge payload:
{_json_block(challenge_payload)}

Execution rules:
- Only edit files inside the editable scope.
- Do not revert unrelated existing changes.
- Implement only the approved issue ids from the challenge payload.
- Keep the round focused. No broad rewrites.
- If you need to inspect additional files in the mobile workspace, do so.
- After editing, return a concrete summary of what changed and what still needs work.
- Output raw JSON only.

Return a JSON object with this exact shape:
{{
  "stage": "execute",
  "applied_issue_ids": ["P0-1"],
  "changed_files": ["app/(tabs)/index.tsx"],
  "summary": ["string"],
  "product_improvements": ["string"],
  "residual_gaps": ["string"],
  "self_check": {{
    "regressions_risk": ["string"],
    "follow_up_focus": ["string"]
  }}
}}
"""


def build_review_prompt(
    config: LoopConfig,
    context_bundle: str,
    round_number: int,
    previous_score: float,
    execute_payload: Dict[str, Any],
    verification_payload: Dict[str, Any],
    changed_files: List[str],
    recent_rounds: Iterable[Dict[str, Any]],
) -> str:
    return f"""You are in the POST-REVIEW phase of an autonomous UI loop.

You are a harsh reviewer. Inspect the current diff and code after execution. Decide whether this round genuinely improved the mobile product enough to keep or should be reverted.

Project goal:
{config.goal}

Round number:
{round_number}

Previous score:
{previous_score}

Changed files reported by the runner:
{_json_block(changed_files)}

Recent rounds:
{_recent_rounds_block(recent_rounds)}

Project design context:
{context_bundle}

Execute payload:
{_json_block(execute_payload)}

Verification payload:
{_json_block(verification_payload)}

Review rules:
- Read the current changed code before scoring.
- Be strict about real task clarity, real state truthfulness, UI hierarchy, information density, CTA clarity, mobile usability, and consistency with the design context.
- Reject rounds that only add visual noise or move problems around.
- If verification regressed relative to baseline, the round should not be approved.
- Score from 0.0 to 10.0.
- Output raw JSON only.

Return a JSON object with this exact shape:
{{
  "stage": "review",
  "approved": true,
  "score": 8.1,
  "summary": "string",
  "blocking_findings": ["string"],
  "wins": ["string"],
  "should_continue": true,
  "next_focus": ["string"],
  "stop_reason": "string"
}}
"""
