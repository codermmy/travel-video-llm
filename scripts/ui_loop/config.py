from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class ValidationCommand:
    name: str
    cmd: str
    cwd: str = "."
    allow_failure: bool = False


@dataclass
class LoopConfig:
    repo_root: Path
    agent_root: str
    run_root: str
    engine: str
    model: Optional[str]
    goal: str
    target_description: str
    context_files: List[str]
    editable_paths: List[str]
    focus_paths: List[str]
    guardrails: List[str]
    duration_hours: float
    max_rounds: int
    max_phase_retries: int
    transient_phase_retries: int
    transient_retry_backoff_seconds: int
    phase_timeout_seconds: int
    stagnation_limit: int
    target_score: float
    min_score_delta: float
    max_issues_per_round: int
    sleep_seconds: int
    dangerously_bypass_sandbox: bool
    validation_commands: List[ValidationCommand] = field(default_factory=list)
    raw: Dict[str, Any] = field(default_factory=dict)

    @property
    def run_root_path(self) -> Path:
        return (self.repo_root / self.run_root).resolve()

    @property
    def agent_root_path(self) -> Path:
        return (self.repo_root / self.agent_root).resolve()

    def context_file_paths(self) -> List[Path]:
        return [(self.repo_root / item).resolve() for item in self.context_files]

    def editable_abs_paths(self) -> List[Path]:
        return [(self.agent_root_path / item).resolve() for item in self.editable_paths]

    def focus_abs_paths(self) -> List[Path]:
        return [(self.agent_root_path / item).resolve() for item in self.focus_paths]


def _require_list(raw: Dict[str, Any], key: str) -> List[Any]:
    value = raw.get(key, [])
    if not isinstance(value, list) or not value:
        raise ValueError(f"Config key '{key}' must be a non-empty list")
    return value


def load_config(config_path: Path) -> LoopConfig:
    raw = json.loads(config_path.read_text(encoding="utf-8"))

    repo_root = Path(raw.get("repo_root", DEFAULT_REPO_ROOT)).resolve()
    validation_entries = raw.get("validation_commands", [])
    if not isinstance(validation_entries, list):
        raise ValueError("Config key 'validation_commands' must be a list")

    validation_commands = [
        ValidationCommand(
            name=str(item["name"]),
            cmd=str(item["cmd"]),
            cwd=str(item.get("cwd", ".")),
            allow_failure=bool(item.get("allow_failure", False)),
        )
        for item in validation_entries
    ]

    config = LoopConfig(
        repo_root=repo_root,
        agent_root=str(raw.get("agent_root", "mobile")),
        run_root=str(raw.get("run_root", ".codex/ui-loop")),
        engine=str(raw.get("engine", "codex")),
        model=raw.get("model"),
        goal=str(raw["goal"]),
        target_description=str(raw["target_description"]),
        context_files=[str(item) for item in _require_list(raw, "context_files")],
        editable_paths=[str(item) for item in _require_list(raw, "editable_paths")],
        focus_paths=[str(item) for item in _require_list(raw, "focus_paths")],
        guardrails=[str(item) for item in raw.get("guardrails", [])],
        duration_hours=float(raw.get("duration_hours", 12)),
        max_rounds=int(raw.get("max_rounds", 24)),
        max_phase_retries=int(raw.get("max_phase_retries", 2)),
        transient_phase_retries=int(raw.get("transient_phase_retries", 4)),
        transient_retry_backoff_seconds=int(raw.get("transient_retry_backoff_seconds", 20)),
        phase_timeout_seconds=int(raw.get("phase_timeout_seconds", 2400)),
        stagnation_limit=int(raw.get("stagnation_limit", 3)),
        target_score=float(raw.get("target_score", 8.8)),
        min_score_delta=float(raw.get("min_score_delta", 0.15)),
        max_issues_per_round=int(raw.get("max_issues_per_round", 3)),
        sleep_seconds=int(raw.get("sleep_seconds", 10)),
        dangerously_bypass_sandbox=bool(raw.get("dangerously_bypass_sandbox", False)),
        validation_commands=validation_commands,
        raw=raw,
    )

    if config.engine != "codex":
        raise ValueError("Only 'codex' engine is supported in this runner")
    if config.max_rounds <= 0:
        raise ValueError("max_rounds must be > 0")
    if config.max_phase_retries <= 0:
        raise ValueError("max_phase_retries must be > 0")
    if config.transient_phase_retries < 0:
        raise ValueError("transient_phase_retries must be >= 0")
    if config.transient_retry_backoff_seconds <= 0:
        raise ValueError("transient_retry_backoff_seconds must be > 0")
    if config.phase_timeout_seconds <= 0:
        raise ValueError("phase_timeout_seconds must be > 0")
    if config.max_issues_per_round <= 0:
        raise ValueError("max_issues_per_round must be > 0")

    missing_context = [str(path) for path in config.context_file_paths() if not path.exists()]
    if missing_context:
        raise ValueError(f"Missing context files: {', '.join(missing_context)}")

    missing_focus = [str(path) for path in config.focus_abs_paths() if not path.exists()]
    if missing_focus:
        raise ValueError(f"Missing focus paths: {', '.join(missing_focus)}")

    missing_editable = [str(path) for path in config.editable_abs_paths() if not path.exists()]
    if missing_editable:
        raise ValueError(f"Missing editable paths: {', '.join(missing_editable)}")

    return config
