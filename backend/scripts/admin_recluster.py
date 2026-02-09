#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# Make `import app.*` work when running as a script.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.session import SessionLocal
from app.services.admin_recluster_service import list_recluster_target_user_ids, recluster_users


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Admin utility: reset and recompute clustering for one or many users.",
    )
    parser.add_argument("--user-id", help="Recluster a single user id")
    parser.add_argument(
        "--all-users",
        action="store_true",
        help="Recluster all users",
    )
    parser.add_argument(
        "--limit-users",
        type=int,
        default=None,
        help="Only process first N users when --all-users is enabled",
    )
    parser.add_argument(
        "--run-geocoding",
        action="store_true",
        help="Also refresh location names for newly created events",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print target users, do not modify data",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print structured JSON output",
    )
    return parser


def to_output(run_result: Any) -> dict[str, Any]:
    return {
        "startedAt": run_result.started_at.isoformat(),
        "finishedAt": run_result.finished_at.isoformat(),
        "durationMs": int((run_result.finished_at - run_result.started_at).total_seconds() * 1000),
        "userCount": run_result.user_count,
        "totalCreatedEvents": run_result.total_created_events,
        "totalPreviousEvents": run_result.total_previous_events,
        "totalResetPhotos": run_result.total_reset_photos,
        "totalNoisePhotos": run_result.total_noise_photos,
        "results": [
            {
                "userId": item.user_id,
                "totalPhotos": item.total_photos,
                "previousEvents": item.previous_events,
                "resetPhotos": item.reset_photos,
                "createdEvents": item.created_events,
                "noisePhotos": item.noise_photos,
                "uploadedPhotos": item.uploaded_photos,
                "geocodedEvents": item.geocoded_events,
            }
            for item in run_result.results
        ],
    }


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if bool(args.user_id) == bool(args.all_users):
        parser.error("must choose exactly one mode: --user-id or --all-users")

    db = SessionLocal()
    try:
        user_ids = list_recluster_target_user_ids(
            db,
            user_id=args.user_id,
            all_users=args.all_users,
            limit_users=args.limit_users,
        )

        if args.dry_run:
            payload = {
                "dryRun": True,
                "userCount": len(user_ids),
                "userIds": user_ids,
            }
            if args.json:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            else:
                print(f"Dry run: {len(user_ids)} users")
                for item in user_ids:
                    print(f"- {item}")
            return 0

        run_result = recluster_users(
            db,
            target_user_ids=user_ids,
            run_geocoding=args.run_geocoding,
        )
        payload = to_output(run_result)

        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0

        print(
            "Recluster done: "
            f"users={payload['userCount']} "
            f"created_events={payload['totalCreatedEvents']} "
            f"reset_photos={payload['totalResetPhotos']} "
            f"noise_photos={payload['totalNoisePhotos']}"
        )
        for item in payload["results"]:
            print(
                f"- {item['userId']}: photos={item['totalPhotos']} "
                f"prev_events={item['previousEvents']} created_events={item['createdEvents']} "
                f"noise={item['noisePhotos']}"
            )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
