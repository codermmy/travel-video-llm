from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

from ui_loop.config import load_config


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "ui_loop" / "default.mobile.json"
PHASES = ["audit", "challenge", "execute", "review"]


def read_text_tail(path: Path, max_chars: int = 5000) -> str:
    if not path.exists() or path.is_dir():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    return text[-max_chars:]


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


class DashboardStore:
    def __init__(self, config_path: Path) -> None:
        self.config_path = config_path
        self.config = load_config(config_path)
        self.run_root = self.config.run_root_path
        self.db_path = self.run_root / "state.db"

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def list_runs(self) -> List[Dict[str, Any]]:
        if not self.db_path.exists():
            return []
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM runs
                ORDER BY started_at DESC
                """
            ).fetchall()
        return [self._hydrate_run(dict(row)) for row in rows]

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        if not self.db_path.exists():
            return None
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        run = self._hydrate_run(dict(row))
        run["rounds"] = self._get_rounds(run_id)
        return run

    def _get_rounds(self, run_id: str) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM rounds
                WHERE run_id = ?
                ORDER BY round_number DESC
                """,
                (run_id,),
            ).fetchall()

        rounds = []
        for row in rows:
            item = dict(row)
            item["changed_files"] = json.loads(item["changed_files_json"])
            item["audit"] = json.loads(item["audit_json"])
            item["challenge"] = json.loads(item["challenge_json"])
            item["execute"] = json.loads(item["execute_json"])
            item["verification"] = json.loads(item["verification_json"])
            item["review"] = json.loads(item["review_json"])
            rounds.append(item)
        return rounds

    def _hydrate_run(self, run: Dict[str, Any]) -> Dict[str, Any]:
        run_dir = self.run_root / "runs" / run["run_id"]
        current_round, current_phase, phase_logs = self._infer_live_phase(run, run_dir)
        run["current_round"] = int(run.get("current_round", 0) or current_round)
        run["current_phase"] = run.get("current_phase") or current_phase
        if run["current_phase"] in {"", "idle"} and current_phase not in {"", "idle"}:
            run["current_phase"] = current_phase
        run["phase_logs"] = phase_logs
        if not run.get("last_error"):
            run["last_error"] = phase_logs.get("stderr_error", "")
        run["run_dir"] = str(run_dir)
        run["deadline_at_local"] = parse_iso(run["deadline_at"]).astimezone().strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        run["updated_at_local"] = parse_iso(run["updated_at"]).astimezone().strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        run["started_at_local"] = parse_iso(run["started_at"]).astimezone().strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        return run

    def _infer_live_phase(
        self,
        run: Dict[str, Any],
        run_dir: Path,
    ) -> Tuple[int, str, Dict[str, str]]:
        if not run_dir.exists():
            return 0, "idle", {"stderr_tail": "", "stdout_tail": "", "stderr_error": ""}

        current_round = int(run.get("current_round", 0) or 0)
        if current_round <= 0:
            current_round = int(run.get("last_round", 0) or 0) + (1 if run.get("status") == "running" else 0)

        round_dir = run_dir / "round-{0:03d}".format(current_round)
        if not round_dir.exists():
            round_dirs = sorted(run_dir.glob("round-*"))
            if not round_dirs:
                return current_round, "idle", {"stderr_tail": "", "stdout_tail": "", "stderr_error": ""}
            round_dir = round_dirs[-1]
            try:
                current_round = int(round_dir.name.split("-")[1])
            except (IndexError, ValueError):
                pass

        active_phase = "idle"
        active_stderr: Optional[Path] = None
        active_stdout: Optional[Path] = None
        for phase in PHASES:
            message_path = round_dir / f"{phase}.message.json"
            stdout_path = round_dir / f"{phase}.stdout.log"
            stderr_path = round_dir / f"{phase}.stderr.log"
            started = message_path.exists() or stdout_path.exists() or stderr_path.exists()
            completed = message_path.exists()
            if started and not completed:
                active_phase = phase
                active_stderr = stderr_path
                active_stdout = stdout_path
                break
            if completed:
                active_phase = phase
                active_stderr = stderr_path
                active_stdout = stdout_path

        stderr_tail = read_text_tail(active_stderr or Path("/nonexistent"))
        stdout_tail = read_text_tail(active_stdout or Path("/nonexistent"))
        stderr_error = ""
        lines = [line for line in stderr_tail.splitlines() if "ERROR" in line or "Bad Gateway" in line]
        if lines:
            stderr_error = lines[-1]

        return current_round, active_phase, {
            "stderr_tail": stderr_tail,
            "stdout_tail": stdout_tail,
            "stderr_error": stderr_error,
            "round_dir": str(round_dir),
        }


def render_dashboard() -> str:
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UI 循环监控台</title>
  <style>
    :root {
      --bg: #0c1117;
      --panel: rgba(20, 27, 36, 0.88);
      --panel-2: rgba(16, 22, 30, 0.92);
      --line: rgba(255,255,255,0.08);
      --muted: #8ca0b5;
      --text: #edf3f9;
      --accent: #f7b955;
      --accent-2: #7fd6ff;
      --good: #7af2b0;
      --bad: #ff8f8f;
      --warn: #ffd36f;
      --shadow: 0 22px 60px rgba(0,0,0,0.38);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(247,185,85,0.16), transparent 36%),
        radial-gradient(circle at bottom right, rgba(127,214,255,0.14), transparent 34%),
        linear-gradient(180deg, #0b1016 0%, #111827 100%);
      font-family: "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
    }
    .shell {
      display: grid;
      grid-template-columns: 320px 1fr;
      min-height: 100vh;
    }
    .rail {
      border-right: 1px solid var(--line);
      background: rgba(7, 11, 15, 0.74);
      backdrop-filter: blur(14px);
      padding: 28px 18px;
    }
    .title {
      font-family: "Iowan Old Style", "Palatino Linotype", serif;
      font-size: 28px;
      line-height: 1.05;
      margin: 0 0 8px;
      letter-spacing: 0.02em;
    }
    .subtitle {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 24px;
    }
    .run-list {
      display: grid;
      gap: 10px;
    }
    .run-item {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 14px;
      background: var(--panel);
      cursor: pointer;
      transition: transform .14s ease, border-color .14s ease, background .14s ease;
    }
    .run-item:hover, .run-item.active {
      transform: translateY(-1px);
      border-color: rgba(247,185,85,0.45);
      background: rgba(27, 36, 47, 0.96);
    }
    .run-item .id {
      font-size: 12px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .run-item .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      margin-top: 10px;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--warn);
      box-shadow: 0 0 0 6px rgba(255,211,111,0.10);
    }
    .dot.running { background: var(--accent); box-shadow: 0 0 0 6px rgba(247,185,85,0.11); }
    .dot.completed { background: var(--good); box-shadow: 0 0 0 6px rgba(122,242,176,0.09); }
    .dot.failed, .dot.reverted, .dot.stopped { background: var(--bad); box-shadow: 0 0 0 6px rgba(255,143,143,0.10); }
    .main {
      padding: 28px;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
    }
    .hero h2 {
      font-family: "Iowan Old Style", "Palatino Linotype", serif;
      font-size: 36px;
      margin: 0 0 8px;
      letter-spacing: 0.015em;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      max-width: 720px;
      line-height: 1.6;
    }
    .refresh {
      font-size: 13px;
      color: var(--muted);
      text-align: right;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .card {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 22px;
      box-shadow: var(--shadow);
      padding: 18px 18px 16px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.09em;
    }
    .metric-value {
      margin-top: 12px;
      font-size: 32px;
      font-weight: 700;
      line-height: 1;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.1fr .9fr;
      gap: 16px;
    }
    .stack {
      display: grid;
      gap: 16px;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .section-head h3 {
      margin: 0;
      font-size: 16px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .pill {
      border: 1px solid rgba(247,185,85,0.22);
      color: var(--accent);
      background: rgba(247,185,85,0.08);
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border-top: 1px solid var(--line);
      padding: 12px 0;
      text-align: left;
      font-size: 14px;
      vertical-align: top;
    }
    th {
      border-top: none;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      padding-top: 0;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: "SF Mono", "Menlo", monospace;
      font-size: 12px;
      line-height: 1.55;
      color: #d8e6f5;
    }
    .meta {
      display: grid;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
    }
    .error-box {
      margin-top: 12px;
      border: 1px solid rgba(255,143,143,0.25);
      background: rgba(255,143,143,0.08);
      border-radius: 16px;
      padding: 14px;
      color: #ffd9d9;
    }
    .empty {
      color: var(--muted);
      font-size: 14px;
      padding: 24px 0;
    }
    .footer-note {
      margin-top: 16px;
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 1100px) {
      .shell { grid-template-columns: 1fr; }
      .rail { border-right: none; border-bottom: 1px solid var(--line); }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="rail">
      <h1 class="title">UI 循环<br/>监控台</h1>
      <div class="subtitle">自治产品与界面迭代看板</div>
      <div id="runList" class="run-list"></div>
    </aside>
    <main class="main">
      <div class="hero">
        <div>
          <h2 id="runTitle">正在加载 run…</h2>
          <p id="runSubtitle">正在连接本地运行数据。</p>
        </div>
        <div class="refresh" id="refreshMeta">每 8 秒自动刷新</div>
      </div>

      <section class="metrics" id="metrics"></section>

      <section class="grid">
        <div class="stack">
          <div class="card">
            <div class="section-head">
              <h3>当前循环</h3>
              <div class="pill" id="phasePill">阶段：--</div>
            </div>
            <div class="meta" id="metaPanel"></div>
            <div id="errorPanel"></div>
          </div>

          <div class="card">
            <div class="section-head">
              <h3>最近轮次</h3>
              <div class="pill" id="scorePill">评分：--</div>
            </div>
            <div id="roundsPanel"></div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="section-head">
              <h3>实时错误日志</h3>
              <div class="pill" id="stderrPhasePill">--</div>
            </div>
            <pre id="stderrTail">暂时没有日志。</pre>
          </div>
          <div class="card">
            <div class="section-head">
              <h3>实时输出日志</h3>
              <div class="pill">输出</div>
            </div>
            <pre id="stdoutTail">暂时没有日志。</pre>
            <div class="footer-note">这里展示当前选中 run 的最近阶段日志。</div>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    const state = { runs: [], selectedRunId: null };
    const STATUS_LABELS = {
      running: "运行中",
      completed: "已完成",
      failed: "失败",
      stopped: "已停止",
      paused: "已暂停",
      accepted: "已通过",
      reverted: "已回滚",
      noop: "无动作",
      idle: "空闲"
    };
    const PHASE_LABELS = {
      audit: "审查",
      challenge: "自我挑战",
      execute: "执行修改",
      validation: "校验",
      review: "复审",
      failed: "失败",
      idle: "空闲"
    };

    function statusDot(status) {
      return `<span class="dot ${status}"></span>`;
    }

    function labelStatus(status) {
      return STATUS_LABELS[status] || status || "--";
    }

    function labelPhase(phase) {
      return PHASE_LABELS[phase] || phase || "空闲";
    }

    function escapeHtml(text) {
      return (text ?? "")
        .toString()
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }

    async function fetchJson(path) {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }

    async function loadRuns() {
      const runs = await fetchJson("/api/runs");
      state.runs = runs;
      if (!state.selectedRunId || !runs.find(run => run.run_id === state.selectedRunId)) {
        state.selectedRunId = location.hash.replace(/^#/, "") || (runs[0] && runs[0].run_id) || null;
      }
      renderRunList();
      if (state.selectedRunId) {
        await loadRun(state.selectedRunId);
      } else {
        renderEmpty();
      }
    }

    function renderRunList() {
      const root = document.getElementById("runList");
      if (!state.runs.length) {
        root.innerHTML = `<div class="empty">当前配置的运行目录下还没有 run。</div>`;
        return;
      }
      root.innerHTML = state.runs.map(run => `
        <div class="run-item ${run.run_id === state.selectedRunId ? "active" : ""}" data-run-id="${run.run_id}">
          <div class="id">${escapeHtml(run.run_id)}</div>
          <div class="status">${statusDot(run.status)}<strong>${escapeHtml(labelStatus(run.status))}</strong></div>
          <div class="id">第 ${run.current_round || run.last_round} 轮 · ${escapeHtml(labelPhase(run.current_phase || "idle"))}</div>
        </div>
      `).join("");
      root.querySelectorAll(".run-item").forEach(node => {
        node.addEventListener("click", async () => {
          state.selectedRunId = node.dataset.runId;
          location.hash = state.selectedRunId;
          renderRunList();
          await loadRun(state.selectedRunId);
        });
      });
    }

    function renderEmpty() {
      document.getElementById("runTitle").textContent = "当前没有 run";
      document.getElementById("runSubtitle").textContent = "先启动自治循环，再打开这个看板。";
      document.getElementById("metrics").innerHTML = "";
      document.getElementById("metaPanel").innerHTML = "";
      document.getElementById("errorPanel").innerHTML = "";
      document.getElementById("roundsPanel").innerHTML = `<div class="empty">暂时没有轮次数据。</div>`;
      document.getElementById("stderrTail").textContent = "暂时没有日志。";
      document.getElementById("stdoutTail").textContent = "暂时没有日志。";
    }

    async function loadRun(runId) {
      const run = await fetchJson(`/api/runs/${encodeURIComponent(runId)}`);
      document.getElementById("runTitle").textContent = run.run_id;
      document.getElementById("runSubtitle").textContent = `${labelStatus(run.status)} · 当前第 ${run.current_round} 轮 · 最近更新 ${run.updated_at_local}`;
      document.getElementById("refreshMeta").textContent = `每 8 秒自动刷新 · 截止时间 ${run.deadline_at_local}`;
      document.getElementById("phasePill").textContent = `阶段：${labelPhase(run.current_phase || "idle")}`;
      document.getElementById("scorePill").textContent = `评分：${run.current_score}`;
      document.getElementById("stderrPhasePill").textContent = labelPhase(run.current_phase || "idle");

      document.getElementById("metrics").innerHTML = [
        ["通过轮次", run.accepted_rounds],
        ["回滚轮次", run.reverted_rounds],
        ["无动作轮次", run.noop_rounds],
        ["停滞计数", run.stagnation_count]
      ].map(([label, value]) => `
        <div class="card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </div>
      `).join("");

      document.getElementById("metaPanel").innerHTML = `
        <div><strong>状态：</strong>${escapeHtml(labelStatus(run.status))}</div>
        <div><strong>当前轮次：</strong>${escapeHtml(run.current_round)}</div>
        <div><strong>当前阶段：</strong>${escapeHtml(labelPhase(run.current_phase || "idle"))}</div>
        <div><strong>Codex 会话：</strong>${escapeHtml(run.thread_id || "尚未创建")}</div>
        <div><strong>启动时间：</strong>${escapeHtml(run.started_at_local)}</div>
        <div><strong>运行目录：</strong>${escapeHtml(run.run_dir)}</div>
      `;

      document.getElementById("errorPanel").innerHTML = run.last_error
        ? `<div class="error-box"><strong>最近错误：</strong><br/>${escapeHtml(run.last_error)}</div>`
        : "";

      if (run.rounds.length) {
        document.getElementById("roundsPanel").innerHTML = `
          <table>
            <thead>
              <tr><th>轮次</th><th>状态</th><th>评分</th><th>摘要</th></tr>
            </thead>
            <tbody>
              ${run.rounds.slice(0, 8).map(round => `
                <tr>
                  <td>#${round.round_number}</td>
                  <td>${escapeHtml(labelStatus(round.status))}</td>
                  <td>${escapeHtml(round.review.score ?? "--")}</td>
                  <td>${escapeHtml(round.summary_text)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `;
      } else {
        document.getElementById("roundsPanel").innerHTML = `<div class="empty">还没有完成的轮次。</div>`;
      }

      document.getElementById("stderrTail").textContent = run.phase_logs.stderr_tail || "暂时没有错误输出。";
      document.getElementById("stdoutTail").textContent = run.phase_logs.stdout_tail || "暂时没有标准输出。";
    }

    async function refresh() {
      try {
        await loadRuns();
      } catch (error) {
        document.getElementById("runTitle").textContent = "看板加载失败";
        document.getElementById("runSubtitle").textContent = error.message;
      }
    }

    window.addEventListener("hashchange", () => {
      state.selectedRunId = location.hash.replace(/^#/, "") || state.selectedRunId;
      renderRunList();
      if (state.selectedRunId) loadRun(state.selectedRunId);
    });

    refresh();
    setInterval(refresh, 8000);
  </script>
</body>
</html>
"""


class DashboardHandler(BaseHTTPRequestHandler):
    store: DashboardStore

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._send_html(render_dashboard())
            return

        if parsed.path == "/api/runs":
            self._send_json(self.store.list_runs())
            return

        if parsed.path.startswith("/api/runs/"):
            run_id = parsed.path.split("/api/runs/", 1)[1].strip("/")
            run = self.store.get_run(run_id)
            if run is None:
                self._send_json({"error": "run not found"}, status=404)
                return
            self._send_json(run)
            return

        self._send_json({"error": "not found"}, status=404)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def _send_html(self, payload: str, status: int = 200) -> None:
        body = payload.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Serve a local UI loop dashboard")
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG_PATH),
        help="Path to runner JSON config",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    store = DashboardStore(Path(args.config).resolve())
    DashboardHandler.store = store
    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(
        f"UI loop dashboard running at http://{args.host}:{args.port} "
        f"(run_root={store.run_root})"
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
