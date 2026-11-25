"""Lightweight operational metrics collector for analyses, GitHub errors, and cache hit rate."""

from __future__ import annotations

from threading import Lock


class OperationalMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self.analyses_completed = 0
        self.analyses_failed = 0
        self.analysis_duration_total_seconds = 0.0
        self.last_analysis_duration_seconds: float | None = None
        self.github_errors_total = 0
        self.cache_hits = 0
        self.cache_misses = 0

    def record_analysis(self, *, duration_seconds: float, success: bool) -> None:
        with self._lock:
            if success:
                self.analyses_completed += 1
            else:
                self.analyses_failed += 1
            self.analysis_duration_total_seconds += max(duration_seconds, 0.0)
            self.last_analysis_duration_seconds = round(max(duration_seconds, 0.0), 3)

    def record_github_error(self) -> None:
        with self._lock:
            self.github_errors_total += 1

    def record_cache_hit(self) -> None:
        with self._lock:
            self.cache_hits += 1

    def record_cache_miss(self) -> None:
        with self._lock:
            self.cache_misses += 1

    def snapshot(self, *, celery_queue_depth: int | None = None) -> dict:
        with self._lock:
            finished = self.analyses_completed + self.analyses_failed
            avg_duration = (
                round(self.analysis_duration_total_seconds / finished, 3) if finished else None
            )
            cache_total = self.cache_hits + self.cache_misses
            hit_rate = round(self.cache_hits / cache_total, 4) if cache_total else None
            return {
                "analyses_completed": self.analyses_completed,
                "analyses_failed": self.analyses_failed,
                "avg_analysis_duration_seconds": avg_duration,
                "last_analysis_duration_seconds": self.last_analysis_duration_seconds,
                "github_errors_total": self.github_errors_total,
                "cache_hits": self.cache_hits,
                "cache_misses": self.cache_misses,
                "cache_hit_rate": hit_rate,
                "celery_queue_depth": celery_queue_depth,
            }


metrics = OperationalMetrics()
