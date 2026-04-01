from app.tasks.celery_app import celery_app


def test_event_enhancement_cleanup_is_scheduled() -> None:
    beat_schedule = celery_app.conf.beat_schedule
    assert "cleanup-expired-event-enhancements-daily" in beat_schedule
    assert (
        beat_schedule["cleanup-expired-event-enhancements-daily"]["task"]
        == "cleanup_expired_event_enhancements_task"
    )
