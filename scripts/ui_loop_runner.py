from __future__ import annotations

import argparse
import json
from pathlib import Path

from ui_loop.config import load_config
from ui_loop.runner import LoopRunner


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "ui_loop" / "default.mobile.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Autonomous UI loop runner for Travel Video LLM")
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG_PATH),
        help="Path to runner JSON config",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    start = subparsers.add_parser("start", help="Start a new autonomous run")
    start.add_argument("--duration-hours", type=float, default=None, help="Override config duration")

    resume = subparsers.add_parser("resume", help="Resume an existing run")
    resume.add_argument("--run-id", required=True, help="Run identifier")
    resume.add_argument("--extend-hours", type=float, default=0, help="Extend deadline")

    stop = subparsers.add_parser("stop", help="Gracefully stop a run")
    stop.add_argument("--run-id", required=True, help="Run identifier")

    report = subparsers.add_parser("report", help="Print a run summary")
    report.add_argument("--run-id", required=True, help="Run identifier")

    subparsers.add_parser("doctor", help="Validate config and local prerequisites")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    config = load_config(Path(args.config).resolve())
    runner = LoopRunner(config)

    if args.command == "doctor":
        print(json.dumps(runner.doctor(), ensure_ascii=False, indent=2))
        return

    if args.command == "start":
        run_id = runner.start_run(duration_hours=args.duration_hours)
        print(run_id)
        runner.run_loop(run_id)
        return

    if args.command == "resume":
        runner.resume_run(run_id=args.run_id, extend_hours=args.extend_hours)
        return

    if args.command == "stop":
        flag = runner.stop_run(args.run_id)
        print(flag)
        return

    if args.command == "report":
        print(json.dumps(runner.report(args.run_id), ensure_ascii=False, indent=2))
        return

    parser.error(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    main()
