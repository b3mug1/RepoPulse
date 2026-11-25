import { Metrics } from '../api/client';
import { GitCommit, Clock, Users, TrendingUp, FileDiff, AlertTriangle } from 'lucide-react';

interface Props {
  metrics: Metrics;
}

export default function MetricsGrid({ metrics }: Props) {
  const cards = [
    {
      label: 'Sampled Commits',
      value: metrics.total_commits.toLocaleString(),
      icon: GitCommit,
      color: 'text-indigo-500',
      formula: 'Count of commits in the fetched sample',
      period: 'Latest commits (up to 100 / 5 pages)',
      source: 'GitHub Commits API',
      limitation: 'Does not represent all-time repository commits when history exceeds 100 commits.',
    },
    {
      label: 'Avg Commit Size',
      value: `${metrics.avg_commit_size.toFixed(1)} lines`,
      icon: FileDiff,
      color: 'text-emerald-500',
      formula: 'sum(additions + deletions) / sampled_commits',
      period: 'Sampled commit window',
      source: 'GitHub Commit Detail API',
      limitation: 'Skewed by large refactors, lockfiles, or generated code in the sample.',
    },
    {
      label: 'Commits / Day',
      value: metrics.commits_per_day.toFixed(2),
      icon: TrendingUp,
      color: 'text-violet-500',
      formula: 'sampled_commits / max(observed_span_days, 1) (0 if < 2 commits)',
      period: 'Observed span between first & last sampled commit (UTC)',
      source: 'GitHub Commit timestamps',
      limitation: 'Short bursts (< 1 day) use a 1-day floor; reflects sample window only.',
    },
    {
      label: 'Commits / 30 Days',
      value: metrics.commits_per_month.toFixed(1),
      icon: TrendingUp,
      color: 'text-cyan-500',
      formula: 'sampled_commits * 30 / max(observed_span_days, 30) (0 if < 2 commits)',
      period: 'Normalized 30-day window (UTC)',
      source: 'GitHub Commit timestamps',
      limitation: 'Short histories (< 30 days) use a 30-day floor to avoid inflating bursts.',
    },
    {
      label: 'Avg Between Commits',
      value: `${metrics.avg_time_between_commits_hours.toFixed(1)} hrs`,
      icon: Clock,
      color: 'text-amber-500',
      formula: 'mean(delta_hours between consecutive UTC commits)',
      period: 'Sampled commit window',
      source: 'GitHub Commit timestamps',
      limitation: 'Returns 0.0 hrs when fewer than 2 commits are present.',
    },
    {
      label: 'Bus Factor',
      value: metrics.bus_factor.toString(),
      icon: metrics.bus_factor <= 1 ? AlertTriangle : Users,
      color: metrics.bus_factor <= 1 ? 'text-red-500' : 'text-emerald-500',
      formula: 'Min contributors accounting for >= 80% of sampled commits',
      period: 'Sampled commit window',
      source: 'GitHub author login (fallback: email, name)',
      limitation: 'Continuity signal on sampled commits only; never a measure of developer performance.',
    },
    {
      label: 'Code Churn',
      value: `+${metrics.code_churn_additions.toLocaleString()} / -${metrics.code_churn_deletions.toLocaleString()}`,
      icon: FileDiff,
      color: 'text-orange-500',
      formula: 'sum(additions) / sum(deletions) across sampled commits',
      period: 'Sampled commit window',
      source: 'GitHub Commit Detail API',
      limitation: 'Includes dependency updates, vendored assets, and formatting changes.',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass-sm glass-hover p-4"
          title={`${card.formula} · ${card.period}`}
        >
          <card.icon className={`w-4 h-4 ${card.color} mb-2.5 opacity-60`} />
          <p className="text-slate-800 text-lg font-bold tracking-tight">{card.value}</p>
          <p className="text-slate-400 text-[11px] mt-0.5">{card.label}</p>
          <details className="mt-2 text-[10px] text-slate-400">
            <summary className="cursor-pointer text-indigo-500">Formula &amp; limits</summary>
            <p className="mt-1.5 leading-relaxed"><strong>Formula:</strong> {card.formula}</p>
            <p className="mt-1 leading-relaxed"><strong>Period:</strong> {card.period}</p>
            <p className="mt-1 leading-relaxed"><strong>Source:</strong> {card.source}</p>
            <p className="mt-1 leading-relaxed"><strong>Limit:</strong> {card.limitation}</p>
          </details>
        </div>
      ))}
    </div>
  );
}
