from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .config import LoopConfig, ValidationCommand
from .prompts import (
    build_audit_prompt,
    build_challenge_prompt,
    build_execute_prompt,
    build_review_prompt,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def remove_path(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def flatten_lines(value: Any) -> str:
    if isinstance(value, list):
        return " | ".join(str(item) for item in value if str(item).strip())
    return str(value or "")


TRANSIENT_ERROR_MARKERS = (
    "502 bad gateway",
    "503 service unavailable",
    "504 gateway timeout",
    "upstream request failed",
    "reconnecting...",
    "connection reset",
    "connection refused",
    "temporary failure",
    "network error",
    "timed out",
    "timeout",
)


def extract_json_object(raw: str) -> Dict[str, Any]:
    raw = raw.strip()
    if not raw:
        raise ValueError("Empty JSON payload")

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(raw[start : end + 1])


def extract_codex_jsonl_result(raw: str) -> Tuple[Optional[str], str]:
    thread_id: Optional[str] = None
    agent_message = ""

    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue

        item_type = payload.get("type")
        if item_type == "thread.started":
            candidate = payload.get("thread_id")
            if isinstance(candidate, str) and candidate.strip():
                thread_id = candidate.strip()
        elif item_type == "item.completed":
            item = payload.get("item")
            if isinstance(item, dict) and item.get("type") == "agent_message":
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    agent_message = text.strip()

    return thread_id, agent_message


def summarize_context_files(paths: Iterable[Path], max_chars_per_file: int = 6000) -> str:
    blocks: List[str] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        trimmed = text[:max_chars_per_file]
        if len(text) > max_chars_per_file:
            trimmed = f"{trimmed}\n\n[truncated]"
        blocks.append(f"=== {path.name} ===\n{trimmed}")
    return "\n\n".join(blocks)


def list_files_relative(root: Path) -> Dict[str, bytes]:
    items: Dict[str, bytes] = {}
    if not root.exists():
        return items
    if root.is_file():
        items[""] = root.read_bytes()
        return items

    for path in sorted(root.rglob("*")):
        if path.is_file():
            items[str(path.relative_to(root))] = path.read_bytes()
    return items


def copy_path(src: Path, dest: Path) -> None:
    ensure_dir(dest.parent)
    if src.is_dir():
        shutil.copytree(src, dest)
    else:
        shutil.copy2(src, dest)


def restore_path(src: Path, dest: Path) -> None:
    remove_path(dest)
    ensure_dir(dest.parent)
    if src.is_dir():
        shutil.copytree(src, dest)
    else:
        shutil.copy2(src, dest)


@dataclass
class PhaseResult:
    payload: Dict[str, Any]
    stdout_path: Path
    stderr_path: Path
    message_path: Path


class LoopRunner:
    def __init__(self, config: LoopConfig) -> None:
        self.config = config
        self.schema_dir = Path(__file__).resolve().parent / "schemas"
        self.db_path = self.config.run_root_path / "state.db"
        ensure_dir(self.config.run_root_path)
        self._init_db()
        self.context_bundle = summarize_context_files(self.config.context_file_paths())

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deadline_at TEXT NOT NULL,
                    config_json TEXT NOT NULL,
                    baseline_validation_json TEXT NOT NULL,
                    thread_id TEXT NOT NULL DEFAULT '',
                    last_round INTEGER NOT NULL DEFAULT 0,
                    current_round INTEGER NOT NULL DEFAULT 0,
                    current_phase TEXT NOT NULL DEFAULT 'idle',
                    last_error TEXT NOT NULL DEFAULT '',
                    accepted_rounds INTEGER NOT NULL DEFAULT 0,
                    reverted_rounds INTEGER NOT NULL DEFAULT 0,
                    noop_rounds INTEGER NOT NULL DEFAULT 0,
                    stagnation_count INTEGER NOT NULL DEFAULT 0,
                    current_score REAL NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS rounds (
                    run_id TEXT NOT NULL,
                    round_number INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    ended_at TEXT NOT NULL,
                    changed_files_json TEXT NOT NULL,
                    audit_json TEXT NOT NULL,
                    challenge_json TEXT NOT NULL,
                    execute_json TEXT NOT NULL,
                    verification_json TEXT NOT NULL,
                    review_json TEXT NOT NULL,
                    summary_text TEXT NOT NULL,
                    PRIMARY KEY (run_id, round_number)
                );
                """
            )
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(runs)").fetchall()}
            if "thread_id" not in columns:
                conn.execute("ALTER TABLE runs ADD COLUMN thread_id TEXT NOT NULL DEFAULT ''")
            if "current_round" not in columns:
                conn.execute("ALTER TABLE runs ADD COLUMN current_round INTEGER NOT NULL DEFAULT 0")
            if "current_phase" not in columns:
                conn.execute(
                    "ALTER TABLE runs ADD COLUMN current_phase TEXT NOT NULL DEFAULT 'idle'"
                )
            if "last_error" not in columns:
                conn.execute("ALTER TABLE runs ADD COLUMN last_error TEXT NOT NULL DEFAULT ''")

    def doctor(self) -> Dict[str, Any]:
        codex_path = shutil.which("codex")
        return {
            "repo_root": str(self.config.repo_root),
            "agent_root": str(self.config.agent_root_path),
            "run_root": str(self.config.run_root_path),
            "codex_path": codex_path,
            "context_files": [str(path) for path in self.config.context_file_paths()],
            "editable_paths": [str(path) for path in self.config.editable_abs_paths()],
            "focus_paths": [str(path) for path in self.config.focus_abs_paths()],
            "validation_commands": [
                {
                    "name": item.name,
                    "cmd": item.cmd,
                    "cwd": item.cwd,
                    "allow_failure": item.allow_failure,
                }
                for item in self.config.validation_commands
            ],
        }

    def start_run(self, duration_hours: Optional[float] = None) -> str:
        run_id = f"ui-loop-{utc_now().strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
        run_dir = self._run_dir(run_id)
        ensure_dir(run_dir)
        config_snapshot = run_dir / "config.snapshot.json"
        write_json(config_snapshot, self.config.raw)

        baseline = self._run_validation_suite(
            run_dir=run_dir / "baseline-validation",
            baseline=None,
        )
        deadline = utc_now() + timedelta(hours=duration_hours or self.config.duration_hours)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO runs (
                    run_id, status, started_at, updated_at, deadline_at, config_json,
                    baseline_validation_json, thread_id, current_score, current_round, current_phase, last_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    "running",
                    iso_now(),
                    iso_now(),
                    deadline.isoformat(),
                    json.dumps(self.config.raw, ensure_ascii=False),
                    json.dumps(baseline, ensure_ascii=False),
                    "",
                    0.0,
                    0,
                    "idle",
                    "",
                ),
            )

        return run_id

    def resume_run(self, run_id: str, extend_hours: float = 0) -> None:
        run = self._get_run(run_id)
        if extend_hours > 0:
            new_deadline = parse_iso(run["deadline_at"]) + timedelta(hours=extend_hours)
            with self._connect() as conn:
                conn.execute(
                    "UPDATE runs SET deadline_at = ?, updated_at = ? WHERE run_id = ?",
                    (new_deadline.isoformat(), iso_now(), run_id),
                )

        stop_flag = self._run_dir(run_id) / "STOP"
        if stop_flag.exists():
            stop_flag.unlink()

        self._mark_run_status(run_id, "running")

        self.run_loop(run_id)

    def stop_run(self, run_id: str) -> Path:
        run_dir = self._run_dir(run_id)
        ensure_dir(run_dir)
        flag = run_dir / "STOP"
        flag.write_text("stop requested\n", encoding="utf-8")
        return flag

    def report(self, run_id: str) -> Dict[str, Any]:
        run = self._get_run(run_id)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT round_number, status, summary_text, review_json
                FROM rounds
                WHERE run_id = ?
                ORDER BY round_number DESC
                LIMIT 5
                """,
                (run_id,),
            ).fetchall()

        recent = []
        for row in rows:
            review = json.loads(row["review_json"])
            recent.append(
                {
                    "round_number": row["round_number"],
                    "status": row["status"],
                    "score": review.get("score"),
                    "summary": row["summary_text"],
                }
            )

        return {
            "run_id": run["run_id"],
            "status": run["status"],
            "deadline_at": run["deadline_at"],
            "thread_id": run["thread_id"],
            "last_round": run["last_round"],
            "accepted_rounds": run["accepted_rounds"],
            "reverted_rounds": run["reverted_rounds"],
            "noop_rounds": run["noop_rounds"],
            "stagnation_count": run["stagnation_count"],
            "current_score": run["current_score"],
            "current_round": run["current_round"],
            "current_phase": run["current_phase"],
            "last_error": run["last_error"],
            "recent_rounds": recent,
        }

    def run_loop(self, run_id: str) -> None:
        while True:
            run = self._get_run(run_id)
            deadline = parse_iso(run["deadline_at"])
            round_number = int(run["last_round"]) + 1

            if run["status"] not in {"running", "paused"}:
                self._log(f"[{run_id}] stop because status={run['status']}")
                return
            if utc_now() >= deadline:
                self._mark_run_status(run_id, "completed")
                self._log(f"[{run_id}] reached deadline")
                return
            if round_number > self.config.max_rounds:
                self._mark_run_status(run_id, "completed")
                self._log(f"[{run_id}] reached max_rounds={self.config.max_rounds}")
                return
            if self._stop_requested(run_id):
                self._mark_run_status(run_id, "stopped")
                self._log(f"[{run_id}] stop flag detected")
                return
            if int(run["stagnation_count"]) >= self.config.stagnation_limit:
                self._mark_run_status(run_id, "completed")
                self._log(f"[{run_id}] stagnation limit reached")
                return

            self._run_round(run_id, round_number)
            time.sleep(self.config.sleep_seconds)

    def _run_round(self, run_id: str, round_number: int) -> None:
        run = self._get_run(run_id)
        recent_rounds = self._recent_rounds(run_id, limit=3)
        previous_score = float(run["current_score"])
        round_dir = self._run_dir(run_id) / f"round-{round_number:03d}"
        ensure_dir(round_dir)
        self._set_run_progress(run_id, round_number, "audit", "")
        self._log(f"[{run_id}] round {round_number} started")

        started_at = iso_now()
        status = "noop"
        changed_files: List[str] = []
        audit_payload: Dict[str, Any] = {}
        challenge_payload: Dict[str, Any] = {}
        execute_payload: Dict[str, Any] = {}
        verification_payload: Dict[str, Any] = {}
        review_payload: Dict[str, Any] = {}
        summary_text = ""

        try:
            audit_payload = self._run_phase(
                phase_name="audit",
                prompt=build_audit_prompt(
                    config=self.config,
                    context_bundle=self.context_bundle,
                    round_number=round_number,
                    previous_score=previous_score,
                    recent_rounds=recent_rounds,
                ),
                round_dir=round_dir,
                sandbox="read-only",
                schema_name="audit.json",
                run_id=run_id,
                round_number=round_number,
            ).payload

            challenge_payload = self._run_phase(
                phase_name="challenge",
                prompt=build_challenge_prompt(
                    config=self.config,
                    context_bundle=self.context_bundle,
                    audit_payload=audit_payload,
                    recent_rounds=recent_rounds,
                ),
                round_dir=round_dir,
                sandbox="read-only",
                schema_name="challenge.json",
                run_id=run_id,
                round_number=round_number,
            ).payload

            approved_issue_ids = challenge_payload.get("approved_issue_ids") or []
            if not approved_issue_ids:
                status = "noop"
                summary_text = challenge_payload.get("rationale") or "no approved issues"
                review_payload = {
                    "stage": "review",
                    "approved": False,
                    "score": previous_score,
                    "summary": "No approved issues for this round",
                    "blocking_findings": challenge_payload.get("audit_gaps") or [],
                    "wins": [],
                    "should_continue": False,
                    "next_focus": [],
                    "stop_reason": "No high-leverage issues approved",
                }
                self._persist_round(
                    run_id=run_id,
                    round_number=round_number,
                    status=status,
                    started_at=started_at,
                    ended_at=iso_now(),
                    changed_files=changed_files,
                    audit_payload=audit_payload,
                    challenge_payload=challenge_payload,
                    execute_payload=execute_payload,
                    verification_payload=verification_payload,
                    review_payload=review_payload,
                    summary_text=summary_text,
                )
                self._advance_run_after_round(run_id, status, previous_score, previous_score, False)
                self._mark_run_status(run_id, "completed")
                self._set_run_progress(run_id, round_number, "idle", "")
                self._log(f"[{run_id}] round {round_number} ended as noop with no approved issues")
                return

            backup_dir = round_dir / "backup"
            self._backup_editable_paths(backup_dir)

            execute_payload = self._run_phase(
                phase_name="execute",
                prompt=build_execute_prompt(
                    config=self.config,
                    context_bundle=self.context_bundle,
                    audit_payload=audit_payload,
                    challenge_payload=challenge_payload,
                    round_number=round_number,
                    previous_score=previous_score,
                ),
                round_dir=round_dir,
                sandbox="workspace-write",
                schema_name="execute.json",
                run_id=run_id,
                round_number=round_number,
            ).payload

            changed_files = self._detect_changed_files(backup_dir)
            execute_payload["changed_files"] = changed_files

            baseline_payload = json.loads(run["baseline_validation_json"])
            self._set_run_progress(run_id, round_number, "validation", "")
            verification_payload = self._run_validation_suite(
                run_dir=round_dir / "validation",
                baseline=baseline_payload,
            )

            review_payload = self._run_phase(
                phase_name="review",
                prompt=build_review_prompt(
                    config=self.config,
                    context_bundle=self.context_bundle,
                    round_number=round_number,
                    previous_score=previous_score,
                    execute_payload=execute_payload,
                    verification_payload=verification_payload,
                    changed_files=changed_files,
                    recent_rounds=recent_rounds,
                ),
                round_dir=round_dir,
                sandbox="read-only",
                schema_name="review.json",
                run_id=run_id,
                round_number=round_number,
            ).payload

            new_score = float(review_payload.get("score", previous_score) or previous_score)
            summary_text = review_payload.get("summary") or flatten_lines(execute_payload.get("summary"))
            accepted = bool(review_payload.get("approved")) and bool(
                verification_payload.get("passes_gate", True)
            )

            if accepted:
                status = "accepted"
            else:
                status = "reverted"
                self._restore_editable_paths(backup_dir)

            self._persist_round(
                run_id=run_id,
                round_number=round_number,
                status=status,
                started_at=started_at,
                ended_at=iso_now(),
                changed_files=changed_files,
                audit_payload=audit_payload,
                challenge_payload=challenge_payload,
                execute_payload=execute_payload,
                verification_payload=verification_payload,
                review_payload=review_payload,
                summary_text=summary_text,
            )

            if accepted:
                self._advance_run_after_round(
                    run_id=run_id,
                    status=status,
                    previous_score=previous_score,
                    new_score=new_score,
                    continue_requested=bool(review_payload.get("should_continue", True)),
                )
            else:
                self._advance_run_after_round(
                    run_id=run_id,
                    status=status,
                    previous_score=previous_score,
                    new_score=previous_score,
                    continue_requested=True,
                )

            if status == "accepted" and not bool(review_payload.get("should_continue", True)):
                self._mark_run_status(run_id, "completed")
            self._set_run_progress(run_id, round_number, "idle", "")
            self._log(
                f"[{run_id}] round {round_number} finished status={status} score={review_payload.get('score')}"
            )

        except Exception as exc:
            failure_review = {
                "stage": "review",
                "approved": False,
                "score": previous_score,
                "summary": f"Round crashed: {exc}",
                "blocking_findings": [str(exc)],
                "wins": [],
                "should_continue": False,
                "next_focus": [],
                "stop_reason": "Runner exception",
            }
            self._persist_round(
                run_id=run_id,
                round_number=round_number,
                status="failed",
                started_at=started_at,
                ended_at=iso_now(),
                changed_files=changed_files,
                audit_payload=audit_payload,
                challenge_payload=challenge_payload,
                execute_payload=execute_payload,
                verification_payload=verification_payload,
                review_payload=failure_review,
                summary_text=str(exc),
            )
            self._set_run_progress(run_id, round_number, "failed", str(exc))
            self._mark_run_status(run_id, "failed")
            self._log(f"[{run_id}] round {round_number} failed: {exc}")
            return

    def _run_phase(
        self,
        phase_name: str,
        prompt: str,
        round_dir: Path,
        sandbox: str,
        schema_name: str,
        run_id: str,
        round_number: int,
    ) -> PhaseResult:
        message_path = round_dir / f"{phase_name}.message.json"
        stdout_path = round_dir / f"{phase_name}.stdout.log"
        stderr_path = round_dir / f"{phase_name}.stderr.log"

        last_error: Optional[Exception] = None
        total_attempts = self.config.max_phase_retries + self.config.transient_phase_retries
        transient_retries_used = 0
        for attempt in range(1, total_attempts + 1):
            self._set_run_progress(run_id, round_number, phase_name, "")
            current_run = self._get_run(run_id)
            thread_id = str(current_run["thread_id"] or "").strip()
            args = self._build_codex_args(thread_id=thread_id)
            try:
                stdout_text, stderr_text, returncode = self._run_codex_process(
                    args=args,
                    prompt=prompt,
                    stdout_path=stdout_path,
                    stderr_path=stderr_path,
                    run_id=run_id,
                )
            except subprocess.TimeoutExpired:
                timeout_error = (
                    f"{phase_name} phase timed out after {self.config.phase_timeout_seconds}s"
                )
                self._set_run_progress(run_id, round_number, phase_name, timeout_error)
                last_error = RuntimeError(timeout_error)
                if transient_retries_used < self.config.transient_phase_retries:
                    transient_retries_used += 1
                    self._sleep_before_retry(transient_retries_used)
                    continue
                raise last_error
            error_text = self._extract_phase_error_text(stdout_text, stderr_text)
            returned_thread_id, agent_message = extract_codex_jsonl_result(stdout_text)
            if returned_thread_id and returned_thread_id != thread_id:
                self._set_run_thread_id(run_id, returned_thread_id)
                thread_id = returned_thread_id

            if returncode != 0:
                last_error = RuntimeError(
                    f"{phase_name} phase returned code {returncode}. See {stderr_path}"
                )
                if error_text:
                    self._set_run_progress(run_id, round_number, phase_name, error_text)
                if self._is_transient_error(error_text) and transient_retries_used < self.config.transient_phase_retries:
                    transient_retries_used += 1
                    self._sleep_before_retry(transient_retries_used)
                    continue
                time.sleep(1)
                continue

            raw_message = agent_message or stdout_text

            try:
                payload = extract_json_object(raw_message)
                self._validate_phase_payload(phase_name, payload)
                write_json(message_path, payload)
                return PhaseResult(
                    payload=payload,
                    stdout_path=stdout_path,
                    stderr_path=stderr_path,
                    message_path=message_path,
                )
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if error_text:
                    self._set_run_progress(run_id, round_number, phase_name, error_text)
                if self._is_transient_error(error_text) and transient_retries_used < self.config.transient_phase_retries:
                    transient_retries_used += 1
                    self._sleep_before_retry(transient_retries_used)
                    continue
                time.sleep(1)

        raise RuntimeError(f"{phase_name} phase failed after retries: {last_error}")

    def _run_codex_process(
        self,
        args: List[str],
        prompt: str,
        stdout_path: Path,
        stderr_path: Path,
        run_id: str,
    ) -> Tuple[str, str, int]:
        stdout_chunks: List[str] = []
        stderr_chunks: List[str] = []
        stdout_path.parent.mkdir(parents=True, exist_ok=True)
        stderr_path.parent.mkdir(parents=True, exist_ok=True)

        process = subprocess.Popen(
            args,
            cwd=self.config.repo_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        assert process.stdin is not None
        assert process.stdout is not None
        assert process.stderr is not None

        def read_stream(stream, sink_path: Path, chunks: List[str], is_stdout: bool) -> None:
            with sink_path.open("w", encoding="utf-8") as sink:
                for line in iter(stream.readline, ""):
                    chunks.append(line)
                    sink.write(line)
                    sink.flush()
                    if is_stdout:
                        thread_id, _ = extract_codex_jsonl_result(line)
                        if thread_id:
                            self._set_run_thread_id(run_id, thread_id)
                stream.close()

        stdout_thread = threading.Thread(
            target=read_stream,
            args=(process.stdout, stdout_path, stdout_chunks, True),
            daemon=True,
        )
        stderr_thread = threading.Thread(
            target=read_stream,
            args=(process.stderr, stderr_path, stderr_chunks, False),
            daemon=True,
        )
        stdout_thread.start()
        stderr_thread.start()

        try:
            process.stdin.write(prompt)
            process.stdin.close()
            process.wait(timeout=self.config.phase_timeout_seconds)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            stdout_thread.join(timeout=2)
            stderr_thread.join(timeout=2)
            raise

        stdout_thread.join(timeout=2)
        stderr_thread.join(timeout=2)
        return "".join(stdout_chunks), "".join(stderr_chunks), process.returncode

    def _run_validation_suite(
        self,
        run_dir: Path,
        baseline: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        ensure_dir(run_dir)
        results = []
        passes_gate = True
        baseline_map = {}
        if baseline:
            baseline_map = {item["name"]: item for item in baseline.get("commands", [])}

        for index, command in enumerate(self.config.validation_commands, start=1):
            result = self._run_validation_command(command, run_dir, index)
            baseline_entry = baseline_map.get(command.name)
            regressed = False
            if baseline_entry and not command.allow_failure:
                baseline_exit = int(baseline_entry.get("exit_code", 0))
                regressed = baseline_exit == 0 and result["exit_code"] != 0
            elif not baseline_entry and not command.allow_failure:
                regressed = result["exit_code"] != 0

            result["baseline_exit_code"] = None if not baseline_entry else baseline_entry.get("exit_code")
            result["regressed"] = regressed
            results.append(result)

            if regressed:
                passes_gate = False

        payload = {
            "timestamp": iso_now(),
            "passes_gate": passes_gate,
            "commands": results,
        }
        write_json(run_dir / "validation.summary.json", payload)
        return payload

    def _run_validation_command(
        self,
        command: ValidationCommand,
        run_dir: Path,
        index: int,
    ) -> Dict[str, Any]:
        safe_name = command.name.replace(" ", "-")
        stdout_path = run_dir / f"{index:02d}-{safe_name}.stdout.log"
        stderr_path = run_dir / f"{index:02d}-{safe_name}.stderr.log"

        completed = subprocess.run(
            command.cmd,
            cwd=(self.config.agent_root_path / command.cwd).resolve(),
            shell=True,
            capture_output=True,
            text=True,
        )
        stdout_path.write_text(completed.stdout, encoding="utf-8")
        stderr_path.write_text(completed.stderr, encoding="utf-8")
        return {
            "name": command.name,
            "cmd": command.cmd,
            "cwd": command.cwd,
            "allow_failure": command.allow_failure,
            "exit_code": completed.returncode,
            "stdout_log": str(stdout_path),
            "stderr_log": str(stderr_path),
        }

    def _backup_editable_paths(self, backup_dir: Path) -> None:
        remove_path(backup_dir)
        ensure_dir(backup_dir)
        manifest = {"editable_paths": self.config.editable_paths}
        write_json(backup_dir / "manifest.json", manifest)

        for rel_path in self.config.editable_paths:
            src = self.config.agent_root_path / rel_path
            dest = backup_dir / rel_path
            if src.exists():
                copy_path(src, dest)

    def _restore_editable_paths(self, backup_dir: Path) -> None:
        manifest = read_json(backup_dir / "manifest.json")
        for rel_path in manifest.get("editable_paths", []):
            src = backup_dir / rel_path
            dest = self.config.agent_root_path / rel_path
            if src.exists():
                restore_path(src, dest)
            else:
                remove_path(dest)

    def _detect_changed_files(self, backup_dir: Path) -> List[str]:
        changed: List[str] = []
        for rel_path in self.config.editable_paths:
            before_root = backup_dir / rel_path
            after_root = self.config.agent_root_path / rel_path
            before_files = list_files_relative(before_root)
            after_files = list_files_relative(after_root)
            keys = sorted(set(before_files.keys()) | set(after_files.keys()))
            for key in keys:
                if before_files.get(key) != after_files.get(key):
                    if key:
                        changed.append(f"{rel_path}/{key}")
                    else:
                        changed.append(rel_path)
        return sorted(dict.fromkeys(changed))

    def _advance_run_after_round(
        self,
        run_id: str,
        status: str,
        previous_score: float,
        new_score: float,
        continue_requested: bool,
    ) -> None:
        run = self._get_run(run_id)
        accepted_rounds = int(run["accepted_rounds"])
        reverted_rounds = int(run["reverted_rounds"])
        noop_rounds = int(run["noop_rounds"])
        stagnation_count = int(run["stagnation_count"])
        current_score = float(run["current_score"])

        score_delta = new_score - previous_score
        improved = status == "accepted" and score_delta >= self.config.min_score_delta

        if status == "accepted":
            accepted_rounds += 1
            current_score = new_score
        elif status == "reverted":
            reverted_rounds += 1
        else:
            noop_rounds += 1

        stagnation_count = 0 if improved else stagnation_count + 1
        next_status = "running" if continue_requested else "completed"

        with self._connect() as conn:
            conn.execute(
                """
                UPDATE runs
                SET status = ?, updated_at = ?, last_round = last_round + 1,
                    current_round = ?, current_phase = ?, last_error = ?,
                    accepted_rounds = ?, reverted_rounds = ?, noop_rounds = ?,
                    stagnation_count = ?, current_score = ?
                WHERE run_id = ?
                """,
                (
                    next_status,
                    iso_now(),
                    int(run["last_round"]) + 1,
                    "idle",
                    "",
                    accepted_rounds,
                    reverted_rounds,
                    noop_rounds,
                    stagnation_count,
                    current_score,
                    run_id,
                ),
            )

    def _persist_round(
        self,
        run_id: str,
        round_number: int,
        status: str,
        started_at: str,
        ended_at: str,
        changed_files: List[str],
        audit_payload: Dict[str, Any],
        challenge_payload: Dict[str, Any],
        execute_payload: Dict[str, Any],
        verification_payload: Dict[str, Any],
        review_payload: Dict[str, Any],
        summary_text: str,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO rounds (
                    run_id, round_number, status, started_at, ended_at,
                    changed_files_json, audit_json, challenge_json, execute_json,
                    verification_json, review_json, summary_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    round_number,
                    status,
                    started_at,
                    ended_at,
                    json.dumps(changed_files, ensure_ascii=False),
                    json.dumps(audit_payload, ensure_ascii=False),
                    json.dumps(challenge_payload, ensure_ascii=False),
                    json.dumps(execute_payload, ensure_ascii=False),
                    json.dumps(verification_payload, ensure_ascii=False),
                    json.dumps(review_payload, ensure_ascii=False),
                    summary_text,
                ),
            )

        self._write_round_summary(
            run_id=run_id,
            round_number=round_number,
            status=status,
            changed_files=changed_files,
            review_payload=review_payload,
            summary_text=summary_text,
        )

    def _write_round_summary(
        self,
        run_id: str,
        round_number: int,
        status: str,
        changed_files: List[str],
        review_payload: Dict[str, Any],
        summary_text: str,
    ) -> None:
        round_dir = self._run_dir(run_id) / f"round-{round_number:03d}"
        content = "\n".join(
            [
                f"# Round {round_number}",
                "",
                f"- Status: `{status}`",
                f"- Score: `{review_payload.get('score')}`",
                f"- Summary: {summary_text or 'n/a'}",
                f"- Changed files: {', '.join(changed_files) if changed_files else 'none'}",
                f"- Next focus: {flatten_lines(review_payload.get('next_focus')) or 'n/a'}",
            ]
        )
        (round_dir / "summary.md").write_text(content, encoding="utf-8")

    def _recent_rounds(self, run_id: str, limit: int = 3) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT round_number, status, summary_text, review_json
                FROM rounds
                WHERE run_id = ?
                ORDER BY round_number DESC
                LIMIT ?
                """,
                (run_id, limit),
            ).fetchall()

        recent: List[Dict[str, Any]] = []
        for row in rows:
            review = json.loads(row["review_json"])
            recent.append(
                {
                    "round_number": row["round_number"],
                    "status": row["status"],
                    "score": review.get("score"),
                    "summary": row["summary_text"],
                }
            )
        return list(reversed(recent))

    def _mark_run_status(self, run_id: str, status: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE runs SET status = ?, updated_at = ? WHERE run_id = ?",
                (status, iso_now(), run_id),
            )

    def _set_run_progress(
        self,
        run_id: str,
        current_round: int,
        current_phase: str,
        last_error: str,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE runs
                SET current_round = ?, current_phase = ?, last_error = ?, updated_at = ?
                WHERE run_id = ?
                """,
                (current_round, current_phase, last_error, iso_now(), run_id),
            )

    def _set_run_thread_id(self, run_id: str, thread_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE runs SET thread_id = ?, updated_at = ? WHERE run_id = ?",
                (thread_id, iso_now(), run_id),
            )

    def _build_codex_args(self, thread_id: str) -> List[str]:
        if thread_id:
            args = ["codex", "exec", "resume", "--json", thread_id, "-"]
            return args

        args = [
            "codex",
            "exec",
            "--json",
            "-C",
            str(self.config.agent_root_path),
            "-s",
            "workspace-write",
            "-",
        ]
        if self.config.model:
            args[2:2] = ["-m", self.config.model]
        if self.config.dangerously_bypass_sandbox:
            args.insert(2, "--dangerously-bypass-approvals-and-sandbox")
        return args

    def _validate_phase_payload(self, phase_name: str, payload: Dict[str, Any]) -> None:
        required_fields = {
            "audit": [
                "stage",
                "core_goal",
                "core_target",
                "issues",
                "selected_issue_ids",
                "do_not_touch_yet",
                "why_these_now",
                "notes",
            ],
            "challenge": [
                "stage",
                "audit_gaps",
                "priority_changes",
                "approved_issue_ids",
                "deferred_issue_ids",
                "execution_guardrails",
                "rationale",
            ],
            "execute": [
                "stage",
                "applied_issue_ids",
                "changed_files",
                "summary",
                "product_improvements",
                "residual_gaps",
                "self_check",
            ],
            "review": [
                "stage",
                "approved",
                "score",
                "summary",
                "blocking_findings",
                "wins",
                "should_continue",
                "next_focus",
                "stop_reason",
            ],
        }
        expected = required_fields.get(phase_name, [])
        missing = [field for field in expected if field not in payload]
        if missing:
            raise ValueError(f"{phase_name} payload missing fields: {', '.join(missing)}")
        if payload.get("stage") != phase_name:
            raise ValueError(
                f"{phase_name} payload stage mismatch: expected '{phase_name}', got '{payload.get('stage')}'"
            )

    def _extract_phase_error_text(self, stdout: str, stderr: str) -> str:
        combined = "\n".join(part for part in [stderr, stdout] if part)
        lines = [line.strip() for line in combined.splitlines() if line.strip()]
        for line in reversed(lines):
            lowered = line.lower()
            if line.startswith("ERROR:") or any(marker in lowered for marker in TRANSIENT_ERROR_MARKERS):
                return line
        return lines[-1] if lines else ""

    def _is_transient_error(self, error_text: str) -> bool:
        lowered = (error_text or "").lower()
        return any(marker in lowered for marker in TRANSIENT_ERROR_MARKERS)

    def _sleep_before_retry(self, retry_index: int) -> None:
        backoff = min(
            self.config.transient_retry_backoff_seconds * retry_index,
            self.config.transient_retry_backoff_seconds * 6,
        )
        self._log(f"transient failure detected, retrying after {backoff}s")
        time.sleep(backoff)

    def _get_run(self, run_id: str) -> sqlite3.Row:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            raise ValueError(f"Unknown run_id: {run_id}")
        return row

    def _run_dir(self, run_id: str) -> Path:
        return self.config.run_root_path / "runs" / run_id

    def _stop_requested(self, run_id: str) -> bool:
        return (self._run_dir(run_id) / "STOP").exists()

    def _log(self, message: str) -> None:
        print(f"[ui-loop] {message}", flush=True)
