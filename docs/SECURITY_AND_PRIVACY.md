# Security & Privacy Policy (RepoPulse)

## 1. Data Scope & Retention
- **Public repositories only**: RepoPulse currently analyzes only public GitHub repositories via read-only REST API calls.
- **Stored data**: Repository metadata, sampled commit metadata (up to 100 commits per analysis), aggregated contributor counts, Health Score breakdown, extended GitHub signals, and AI insights are stored in PostgreSQL.
- **Retention & deletion**:
  - Redis cache entries expire automatically by volatility TTL (`15m`–`24h`).
  - Public share links (`share_links`) expire automatically (`24h`–`30d`, max `720h`) and can be revoked at any time via `DELETE /api/v1/analyses/{id}/share/{token}`.
  - Deleting a repository record cascades to its analyses, commit stats, contributors, and share links.

## 2. AI Provider Data Disclosure
- Only repository name, description, top 10 languages, up to 120 file paths, and a README excerpt (up to 2,500 characters) are transmitted to the configured AI provider.
- Commit diffs, secrets, and contributor emails are never sent to the AI provider.

## 3. Access Control & Future OAuth Plan
- **Current (pre-OAuth)**: Reports are tied to public repositories; shared access is controlled via time-limited, revocable tokens with granular visibility toggles (`include_ai_insights`, `include_contributors`).
- **Planned OAuth**:
  - Request minimal read-only scopes (`read:user` for identity; `public_repo` only if user-attributed public quota is needed).
  - Private repository access is explicitly deferred to a separate phase with per-user ownership checks, encrypted token storage, and one-click token revocation.
