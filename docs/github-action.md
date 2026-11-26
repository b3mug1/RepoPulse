# RepoPulse GitHub Action & CLI

Run RepoPulse repository health checks directly inside GitHub Actions or from your terminal—no browser required.

## 1. GitHub Action Usage

Create `.github/workflows/repopulse.yml` in any GitHub repository:

```yaml
name: RepoPulse Health Check

on:
  pull_request:
  schedule:
    - cron: "0 9 * * 1" # Every Monday at 09:00 UTC

permissions:
  contents: read
  pull-requests: write # Needed only if comment-on-pr is true

jobs:
  health:
    runs-on: ubuntu-latest
    steps:
      - name: Run RepoPulse
        id: repopulse
        uses: b3mug1/RepoPulse@master
        with:
          api-url: https://your-repopulse-instance.example.com
          min-score: "70"
          comment-on-pr: "true"
```

### Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api-url` | Yes | — | Base URL of your RepoPulse server |
| `repository` | No | `${{ github.repository }}` | Repository in `owner/name` format |
| `min-score` | No | `""` | Fail the check if `health_score < min-score` |
| `timeout` | No | `"180"` | Max wait time in seconds |
| `comment-on-pr` | No | `"false"` | Post/update a summary comment on PRs |
| `github-token` | No | `${{ github.token }}` | Token for PR comments |

### Outputs

- `health-score` — Numeric Health Score (`0–100`)
- `grade` — Grade (`A–F`)
- `bus-factor` — Bus factor
- `analysis-id` — RepoPulse analysis UUID
- `report-url` — Link to the full report

## 2. Standalone CLI Usage

`cli/repopulse_cli.py` uses only the Python 3.11+ standard library (zero pip dependencies):

```bash
python cli/repopulse_cli.py \
  --repo facebook/react \
  --api-url https://your-repopulse-instance.example.com \
  --min-score 70
```

Add `--format json` to print raw JSON instead of Markdown.
