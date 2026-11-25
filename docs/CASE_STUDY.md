# RepoPulse — Engineering Case Study

## 1. Problem
Evaluating an unfamiliar open-source repository quickly usually means manually clicking through GitHub tabs (commits, contributors, PR backlog, issues, releases, CI workflows, license, README). Existing tools either dump raw numbers without context, misrepresent a small sample as full-repo truth, or treat missing signals as zeros.

## 2. Solution
**RepoPulse** provides a fast, read-only repository health and engineering-signal report:
- Asynchronous GitHub data collection (commits, PRs, issues, releases, Actions runs, branch protection, tree, README, languages).
- Transparent, versioned **Health Score (`v1.1`)** that normalizes over measured signals and separates `unknown` from `0`.
- Verifiable AI summaries (`Token Harbor glm-5.3-flash` / Gemini) with Pydantic schema validation, file/signal citations, role-tailored views (`Developer`, `Manager`, `Recruiter`), and a deterministic **Demo Mode** when no AI key is configured.

## 3. Honest Boundaries (AI, Heuristics & Sampling)
- **Bounded sample:** GitHub commit detail calls are capped at **100 commits (5 pages)** per analysis to stay responsive and respect rate limits. The UI surfaces `sample_scope` (`sampled_commits`, UTC date window, truncation flag).
- **Heuristics are not audits:** Detecting `tests/` or `.github/workflows/` confirms configuration presence, not test coverage or passing builds. Absence of standard test paths is marked `unknown`, not `0`.
- **Facts vs. AI interpretation:** Raw GitHub API facts (`evidence_refs`, metrics) are visually separated from LLM text, and prompts explicitly forbid evaluating individual developers or candidates.

## 4. Three Key Engineering Decisions & Trade-offs

### Decision 1: Bounded REST Sampling + Conditional `ETag` Caching vs. Full `git clone`
- **Choice:** Fetch up to 100 commit details via GitHub REST API with Redis caching, volatility-based TTLs (`15m` for PRs/issues/runs up to `24h` for immutable commit details), and `If-None-Match` (`ETag`) revalidation.
- **Trade-off:** Avoids disk-heavy `git clone` and multi-minute cold starts, and preserves GitHub rate limits via `304 Not Modified` responses. The cost is that historical metrics reflect the recent 100-commit window rather than all-time history—mitigated by displaying `sample_scope` everywhere.

### Decision 2: Async FastAPI + Sync Celery Workers Bridged via `asyncio.run()`
- **Choice:** Keep the API non-blocking (`asyncpg`, `redis.asyncio`, `httpx`), while running heavy fan-out jobs in Celery workers that bridge to async `GitHubClient`/`AIClient` via `asyncio.run()` and replace `commits_stats`/`contributors` idempotently on retry.
- **Trade-off:** Avoids maintaining two separate HTTP/cache client implementations (sync + async) while isolating long-running I/O from API request workers. Requires careful event-loop hygiene (`asyncio.gather` without shadowed imports, explicit client `.close()` in `finally`).

### Decision 3: Normalized Health Score (`unknown != 0`) + Pydantic-Validated AI with Demo Fallback
- **Choice:** Health Score `v1.1` computes `weighted_points` only over measured components and divides by `available_weight`, reporting `coverage` and `confidence`. AI output is validated by Pydantic (`_AIResponsePayload`), non-fatal on failure, and backed by `_demo_analysis` when no API key is set.
- **Trade-off:** Slightly more complex scoring math and schema migrations (`003`–`006`), but guarantees that an unavailable AI key or uninspected repo tree never artificially tanks a repository's score or breaks the report.

## 5. Results
- End-to-end async pipeline with real dependency health checks (`/api/v1/health`), operational metrics (`/api/v1/health/metrics`), and structured JSON logging (`analysis_id`, `task_id`).
- Automated CI + PR Checks (`Ruff`, `Pytest` unit/API/integration + Alembic migration chain verification, `tsc`, `ESLint`, `Vitest`, `Vite build`).
- Production-ready Docker Compose separation (`docker-compose.yml` vs `docker-compose.prod.yml`) with hardened secrets, CORS, proxy-safe rate limiting, and PostgreSQL backup/restore runbook.
