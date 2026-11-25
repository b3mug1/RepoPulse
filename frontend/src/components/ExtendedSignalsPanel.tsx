import { GitPullRequest, CircleDot, Tag, Workflow, Shield, Calendar } from 'lucide-react';
import { AnalysisDetail } from '../api/client';

interface Props {
  signals?: AnalysisDetail['extended_signals'];
}

export default function ExtendedSignalsPanel({ signals }: Props) {
  if (!signals || Object.keys(signals).length === 0) return null;

  const prs = signals.pull_requests;
  const issues = signals.issues;
  const releases = signals.releases;
  const ci = signals.ci;
  const gov = signals.governance;
  const win = signals.activity_windows;

  return (
    <section className="glass p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <h3 className="text-slate-700 text-sm font-semibold">Ecosystem &amp; Delivery Signals</h3>
        {signals.data_refreshed_at && (
          <span className="text-[11px] text-slate-400">
            GitHub data refreshed: {new Date(signals.data_refreshed_at).toLocaleString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {prs && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <GitPullRequest size={14} className="text-indigo-500" /> Pull Requests (sample: {prs.sampled_count})
            </div>
            <p className="text-slate-500">Open: {prs.open_count} · Merged: {prs.merged_count} · Closed: {prs.closed_count}</p>
            <p className="text-slate-400 mt-1">
              Open share: {prs.open_ratio !== null ? `${Math.round(prs.open_ratio * 100)}%` : '—'} · Avg close: {prs.avg_time_to_close_hours !== null ? `${prs.avg_time_to_close_hours}h` : '—'}
            </p>
          </div>
        )}

        {issues && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <CircleDot size={14} className="text-emerald-500" /> Issues (sample: {issues.sampled_count})
            </div>
            <p className="text-slate-500">Open: {issues.open_count} · Closed: {issues.closed_count}</p>
            <p className="text-slate-400 mt-1">
              Avg open age: {issues.avg_open_age_hours !== null ? `${issues.avg_open_age_hours}h` : '—'} · Avg resolve: {issues.avg_time_to_close_hours !== null ? `${issues.avg_time_to_close_hours}h` : '—'}
            </p>
          </div>
        )}

        {releases && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <Tag size={14} className="text-violet-500" /> Releases ({releases.sampled_count})
            </div>
            <p className="text-slate-500">Latest tag: {releases.latest_tag || 'None detected'}</p>
            <p className="text-slate-400 mt-1">
              Avg interval: {releases.avg_days_between_releases !== null ? `${releases.avg_days_between_releases} days` : '—'}
            </p>
          </div>
        )}

        {ci && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <Workflow size={14} className="text-amber-500" /> CI &amp; Actions
            </div>
            <p className="text-slate-500">
              Providers: {ci.providers_detected.length ? ci.providers_detected.join(', ') : 'None detected'}
            </p>
            <p className="text-slate-400 mt-1">
              Actions success: {ci.actions_success_rate !== null ? `${ci.actions_success_rate}%` : '—'} · Latest: {ci.latest_run_conclusion || '—'}
            </p>
          </div>
        )}

        {gov && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <Shield size={14} className="text-cyan-500" /> Governance
            </div>
            <p className="text-slate-500">License: {gov.license || 'Not detected'} · Branch ({gov.default_branch}): {gov.branch_protection}</p>
            <p className="text-slate-400 mt-1">
              CODEOWNERS: {gov.has_codeowners === null ? 'Unknown' : gov.has_codeowners ? 'Present' : 'Not detected'}
            </p>
          </div>
        )}

        {win && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <Calendar size={14} className="text-orange-500" /> Activity Windows (UTC)
            </div>
            <p className="text-slate-500">7d: {win.last_7_days} · 30d: {win.last_30_days} · 90d: {win.last_90_days}</p>
            <p className="text-slate-400 mt-1">30d trend vs prior 30d: {win.trend_30d}</p>
          </div>
        )}
      </div>
    </section>
  );
}
