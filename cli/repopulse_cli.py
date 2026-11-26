#!/usr/bin/env python3
"""
RepoPulse CLI & GitHub Action runner.

Triggers a repository health analysis on a RepoPulse instance, polls until
completion, writes a Markdown report (and optional GitHub Step Summary /
PR comment / GitHub Outputs), and exits non-zero if health_score < min_score.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any

PR_COMMENT_MARKER = "<!-- repopulse-report -->"


def parse_repo(repo: str) -> tuple[str, str]:
    """Parse 'owner/name' into (owner, name) or raise ValueError."""
    cleaned = repo.strip().strip("/")
    parts = cleaned.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError(f"Invalid repository '{repo}'. Expected 'owner/name'.")
    return parts[0], parts[1]


def validate_api_url(api_url: str) -> str:
    """Validate and normalize the RepoPulse API base URL."""
    url = api_url.strip().rstrip("/")
    if not url.startswith(("https://", "http://")):
        raise ValueError(f"Invalid api-url '{api_url}'. Must start with http:// or https://.")
    return url


def _http_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
) -> tuple[int, Any]:
    req_headers = {"Accept": "application/json", "User-Agent": "RepoPulse-CLI/1.0"}
    if headers:
        req_headers.update(headers)
    data: bytes | None = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} calling {url}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error calling {url}: {exc.reason}") from exc


def trigger_analysis(api_url: str, owner: str, name: str) -> str:
    """Trigger analysis via POST /api/v1/analyses/analyze and return analysis_id."""
    _, data = _http_json(
        "POST",
        f"{api_url}/api/v1/analyses/analyze",
        payload={"owner": owner, "name": name},
    )
    analysis_id = data.get("analysis_id")
    if not analysis_id:
        raise RuntimeError(f"Unexpected response from analyze endpoint: {data}")
    return str(analysis_id)


def poll_analysis(
    api_url: str,
    analysis_id: str,
    *,
    timeout_sec: int = 180,
    poll_interval_sec: float = 3.0,
) -> dict[str, Any]:
    """Poll GET /api/v1/analyses/{id} until COMPLETED or FAILED."""
    deadline = time.monotonic() + timeout_sec
    url = f"{api_url}/api/v1/analyses/{analysis_id}"
    while True:
        _, detail = _http_json("GET", url)
        status = str(detail.get("status", "")).upper()
        if status == "COMPLETED":
            return detail
        if status == "FAILED":
            err = detail.get("error_message") or "Unknown analysis failure"
            raise RuntimeError(f"RepoPulse analysis {analysis_id} failed: {err}")
        if time.monotonic() >= deadline:
            raise TimeoutError(
                f"Timed out after {timeout_sec}s waiting for analysis {analysis_id} (last status: {status})"
            )
        time.sleep(poll_interval_sec)


def format_markdown_report(detail: dict[str, Any], api_url: str) -> str:
    """Render a concise Markdown report suitable for PR comments & Job Summaries."""
    repo_name = detail.get("repository_full_name") or (
        f"{detail.get('repository_owner', '')}/{detail.get('repository_name', '')}".strip("/")
    )
    analysis_id = detail.get("id", "")
    health = detail.get("health") or {}
    metrics = detail.get("metrics") or {}
    signals = detail.get("extended_signals") or {}

    score = health.get("score")
    grade = health.get("grade", "?")
    coverage = health.get("coverage", 0)
    confidence = health.get("confidence", "low")
    bus_factor = metrics.get("bus_factor", "?")
    commits_per_month = metrics.get("commits_per_month", 0)

    ci_info = signals.get("ci") or {}
    ci_status = ci_info.get("status") or ("configured" if ci_info.get("has_ci") else "none")
    sec_info = signals.get("security") or {}
    pr_info = signals.get("pull_requests") or {}
    rel_info = signals.get("releases") or {}

    score_text = f"**{score}/100** (Grade `{grade}`)" if score is not None else "N/A"
    report_url = f"{api_url}/analysis/{analysis_id}" if analysis_id else api_url

    lines = [
        PR_COMMENT_MARKER,
        f"## RepoPulse Health Report: `{repo_name}`",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Health Score | {score_text} (coverage {coverage}%, confidence `{confidence}`) |",
        f"| Bus Factor | `{bus_factor}` |",
        f"| Commits / month | `{commits_per_month}` |",
        f"| CI Status | `{ci_status}` |",
    ]

    if sec_info:
        sec_flags = []
        if sec_info.get("has_security_md"):
            sec_flags.append("SECURITY.md")
        if sec_info.get("has_dependabot") or sec_info.get("has_renovate"):
            sec_flags.append("Dependency Bot")
        if sec_info.get("lockfiles"):
            sec_flags.append(f"Lockfiles ({len(sec_info['lockfiles'])})")
        lines.append(f"| Security Hygiene | {', '.join(sec_flags) if sec_flags else 'None detected'} |")

    if pr_info and pr_info.get("sampled_prs"):
        avg_rev = pr_info.get("avg_first_review_hours")
        rev_str = f"{avg_rev:.1f}h" if isinstance(avg_rev, (int, float)) else "N/A"
        lines.append(f"| PR First Review | `{rev_str}` (sampled {pr_info['sampled_prs']} PRs) |")

    if rel_info:
        lines.append(
            f"| Releases & Changelog | `{rel_info.get('total_releases', 0)}` releases, "
            f"CHANGELOG: `{'yes' if rel_info.get('has_changelog') else 'no'}` |"
        )

    findings = health.get("findings") or []
    if findings:
        lines.extend(["", "### Top Findings"])
        for item in findings[:5]:
            sev = str(item.get("severity", "info")).upper()
            title = item.get("title", "")
            lines.append(f"- **[{sev}]** {title}")

    lines.extend(["", f"[View full report on RepoPulse]({report_url})"])
    return "\n".join(lines)


def write_github_outputs(
    detail: dict[str, Any],
    api_url: str,
    *,
    summary_path: str | None = None,
    output_path: str | None = None,
    markdown_report: str = "",
) -> None:
    """Write GITHUB_STEP_SUMMARY and GITHUB_OUTPUT when paths are configured."""
    if summary_path and markdown_report:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write(markdown_report + "\n")

    if output_path:
        health = detail.get("health") or {}
        metrics = detail.get("metrics") or {}
        analysis_id = str(detail.get("id", ""))
        report_url = f"{api_url}/analysis/{analysis_id}" if analysis_id else api_url
        pairs = {
            "health-score": "" if health.get("score") is None else str(health.get("score")),
            "grade": str(health.get("grade", "")),
            "bus-factor": str(metrics.get("bus_factor", "")),
            "analysis-id": analysis_id,
            "report-url": report_url,
        }
        with open(output_path, "a", encoding="utf-8") as fh:
            fh.writelines(f"{key}={val}\n" for key, val in pairs.items())


def _extract_pr_number(event_path: str | None) -> int | None:
    if not event_path or not os.path.exists(event_path):
        return None
    with open(event_path, encoding="utf-8") as fh:
        event = json.load(fh)
    pr = event.get("pull_request")
    if isinstance(pr, dict) and isinstance(pr.get("number"), int):
        return pr["number"]
    issue = event.get("issue")
    if isinstance(issue, dict) and isinstance(issue.get("number"), int) and "pull_request" in issue:
        return issue["number"]
    return None


def post_or_update_pr_comment(
    owner: str,
    name: str,
    pr_number: int,
    token: str,
    body: str,
) -> None:
    """Create or update the RepoPulse PR comment via GitHub REST API."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    comments_url = f"https://api.github.com/repos/{owner}/{name}/issues/{pr_number}/comments?per_page=100"
    _, existing = _http_json("GET", comments_url, headers=headers)
    if isinstance(existing, list):
        for comment in existing:
            if isinstance(comment, dict) and PR_COMMENT_MARKER in str(comment.get("body", "")):
                comment_id = comment.get("id")
                if comment_id:
                    _http_json(
                        "PATCH",
                        f"https://api.github.com/repos/{owner}/{name}/issues/comments/{comment_id}",
                        payload={"body": body},
                        headers=headers,
                    )
                    return

    _http_json(
        "POST",
        f"https://api.github.com/repos/{owner}/{name}/issues/{pr_number}/comments",
        payload={"body": body},
        headers=headers,
    )


def evaluate_min_score(detail: dict[str, Any], min_score: int | None) -> bool:
    """Return True if min_score is unset or health.score >= min_score."""
    if min_score is None:
        return True
    score = (detail.get("health") or {}).get("score")
    if score is None:
        return False
    return int(score) >= min_score


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run RepoPulse repository health analysis.")
    parser.add_argument(
        "--repo",
        default=os.environ.get("GITHUB_REPOSITORY", ""),
        help="GitHub repository in 'owner/name' format (defaults to GITHUB_REPOSITORY).",
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("REPOPULSE_API_URL", ""),
        required=not bool(os.environ.get("REPOPULSE_API_URL")),
        help="Base URL of the RepoPulse API server (e.g. https://repopulse.example.com).",
    )
    parser.add_argument(
        "--min-score",
        type=int,
        default=None,
        help="Fail with exit code 1 if health_score is below this threshold (0-100).",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Timeout in seconds to wait for analysis completion (default: 180).",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=3.0,
        help="Polling interval in seconds (default: 3.0).",
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "json"),
        default="markdown",
        help="Output format printed to stdout (default: markdown).",
    )
    parser.add_argument(
        "--pr-comment",
        action="store_true",
        help="Post or update a PR comment when running in a GitHub pull_request workflow.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        owner, name = parse_repo(args.repo)
        api_url = validate_api_url(args.api_url)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2

    try:
        analysis_id = trigger_analysis(api_url, owner, name)
        detail = poll_analysis(
            api_url,
            analysis_id,
            timeout_sec=args.timeout,
            poll_interval_sec=args.poll_interval,
        )
    except (RuntimeError, TimeoutError, OSError) as exc:
        print(f"RepoPulse error: {exc}", file=sys.stderr)
        return 1

    markdown = format_markdown_report(detail, api_url)
    write_github_outputs(
        detail,
        api_url,
        summary_path=os.environ.get("GITHUB_STEP_SUMMARY"),
        output_path=os.environ.get("GITHUB_OUTPUT"),
        markdown_report=markdown,
    )

    if args.pr_comment:
        token = os.environ.get("GITHUB_TOKEN", "")
        pr_number = _extract_pr_number(os.environ.get("GITHUB_EVENT_PATH"))
        if token and pr_number:
            post_or_update_pr_comment(owner, name, pr_number, token, markdown)

    if args.format == "json":
        print(json.dumps(detail, indent=2))
    else:
        print(markdown)

    if not evaluate_min_score(detail, args.min_score):
        score = (detail.get("health") or {}).get("score")
        print(
            f"Health score {score} is below required minimum {args.min_score}.",
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
