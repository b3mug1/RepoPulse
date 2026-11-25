# Operations, Deployment & Recovery Runbook

## 1. Environments (Dev vs Production)
- **Development (`docker-compose.yml`)**: hot-reload enabled (`--reload`), local ports exposed (`4200`, `8000`, `5432`, `6379`).
- **Production (`docker-compose.prod.yml`)**:
  - Runs `uvicorn` without `--reload` (`--workers 1`), `APP_ENV=production`, `APP_DEBUG=false`.
  - Swagger/OpenAPI docs (`/docs`, `/redoc`, `/openapi.json`) are disabled automatically in production unless `APP_DEBUG=true`.
  - Requires `POSTGRES_PASSWORD` and `APP_SECRET_KEY` (>= 32 chars, non-default).

## 2. Clean Deployment
```bash
cp backend/.env.example .env.prod
# Fill in strong POSTGRES_PASSWORD, APP_SECRET_KEY, GITHUB_TOKEN, TOKENHARBOR_API_KEY, CORS_ORIGINS
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
`migrate` runs `alembic upgrade head` automatically before `api` and `celery_worker` start.

## 3. Database Migrations
- Apply latest: `docker compose -f docker-compose.prod.yml exec api alembic upgrade head`
- Roll back one step: `docker compose -f docker-compose.prod.yml exec api alembic downgrade -1`
- Check current revision: `docker compose -f docker-compose.prod.yml exec api alembic current`

## 4. Health Checks & Monitoring
- **API health**: `GET /api/v1/health` (verifies PostgreSQL, Redis, and Celery worker ping).
- **Operational metrics**: `GET /api/v1/health/metrics` (analysis counts, avg/last duration, GitHub errors, cache hit rate, Celery queue depth).
- **Structured logs**: `structlog` outputs JSON in production with `analysis_id` and `task_id` bound to every background job log line.

## 5. PostgreSQL Backup & Restore
- **Backup**:
  ```bash
  ./scripts/backup_postgres.sh
  ```
- **Restore**:
  ```bash
  gunzip -c backups/repopulse_<timestamp>.sql.gz | \
    docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U "${POSTGRES_USER:-analyzer}" -d "${POSTGRES_DB:-github_analyzer}"
  ```
