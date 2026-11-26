import { Metrics } from '../api/client';
import { useLocale } from '../i18n';
import { GitCommit, Clock, Users, TrendingUp, FileDiff, AlertTriangle } from 'lucide-react';

interface Props {
  metrics: Metrics;
}

export default function MetricsGrid({ metrics }: Props) {
  const { t, dateLocale } = useLocale();
  const cards = [
    {
      label: t.metricSampledCommits,
      value: metrics.total_commits.toLocaleString(dateLocale),
      icon: GitCommit,
      color: 'text-indigo-400',
      formula: t.metricSampledCommitsFormula,
      period: t.metricSampledCommitsPeriod,
      source: t.metricSampledCommitsSource,
      limitation: t.metricSampledCommitsLimit,
    },
    {
      label: t.metricAvgCommitSize,
      value: `${metrics.avg_commit_size.toFixed(1)} ${t.lines}`,
      icon: FileDiff,
      color: 'text-emerald-400',
      formula: t.metricAvgCommitSizeFormula,
      period: t.metricAvgCommitSizePeriod,
      source: t.metricAvgCommitSizeSource,
      limitation: t.metricAvgCommitSizeLimit,
    },
    {
      label: t.metricCommitsPerDay,
      value: metrics.commits_per_day.toFixed(2),
      icon: TrendingUp,
      color: 'text-violet-400',
      formula: t.metricCommitsPerDayFormula,
      period: t.metricCommitsPerDayPeriod,
      source: t.metricCommitsPerDaySource,
      limitation: t.metricCommitsPerDayLimit,
    },
    {
      label: t.metricCommitsPerMonth,
      value: metrics.commits_per_month.toFixed(1),
      icon: TrendingUp,
      color: 'text-cyan-400',
      formula: t.metricCommitsPerMonthFormula,
      period: t.metricCommitsPerMonthPeriod,
      source: t.metricCommitsPerMonthSource,
      limitation: t.metricCommitsPerMonthLimit,
    },
    {
      label: t.metricAvgBetweenCommits,
      value: `${metrics.avg_time_between_commits_hours.toFixed(1)} ${t.hrs}`,
      icon: Clock,
      color: 'text-amber-400',
      formula: t.metricAvgBetweenCommitsFormula,
      period: t.metricAvgBetweenCommitsPeriod,
      source: t.metricAvgBetweenCommitsSource,
      limitation: t.metricAvgBetweenCommitsLimit,
    },
    {
      label: t.metricBusFactor,
      value: metrics.bus_factor.toString(),
      icon: metrics.bus_factor <= 1 ? AlertTriangle : Users,
      color: metrics.bus_factor <= 1 ? 'text-rose-400' : 'text-emerald-400',
      formula: t.metricBusFactorFormula,
      period: t.metricBusFactorPeriod,
      source: t.metricBusFactorSource,
      limitation: t.metricBusFactorLimit,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass-sm glass-hover p-4 flex flex-col justify-between"
          title={`${card.formula} · ${card.period}`}
        >
          <div>
            <card.icon className={`w-4 h-4 ${card.color} mb-2.5 opacity-80`} />
            <p className="text-slate-100 text-xl font-bold tracking-tight tabular-nums">{card.value}</p>
            <p className="text-slate-400 text-[11px] mt-0.5">{card.label}</p>
          </div>
          <details className="mt-2.5 text-[10px] text-slate-400">
            <summary className="cursor-pointer text-slate-400 hover:text-[#cbff60] transition-colors">{t.formulaAndLimits}</summary>
            <p className="mt-1.5 leading-relaxed"><strong>{t.formulaLabel}</strong> {card.formula}</p>
            <p className="mt-1 leading-relaxed"><strong>{t.periodLabel}</strong> {card.period}</p>
            <p className="mt-1 leading-relaxed"><strong>{t.sourceLabel}</strong> {card.source}</p>
            <p className="mt-1 leading-relaxed"><strong>{t.limitLabel}</strong> {card.limitation}</p>
          </details>
        </div>
      ))}

      <div
        className="glass-sm glass-hover p-4 col-span-2 flex flex-col justify-between"
        title={`${t.metricCodeChurnFormula} · ${t.metricCodeChurnPeriod}`}
      >
        <div>
          <FileDiff className="w-4 h-4 text-orange-400 mb-2.5 opacity-80" />
          <p className="text-xl font-bold tracking-tight tabular-nums">
            <span className="text-emerald-400">+{metrics.code_churn_additions.toLocaleString(dateLocale)}</span>
            <span className="text-slate-500 mx-1.5">/</span>
            <span className="text-rose-400">-{metrics.code_churn_deletions.toLocaleString(dateLocale)}</span>
          </p>
          <p className="text-slate-400 text-[11px] mt-0.5">{t.metricCodeChurn}</p>
        </div>
        <details className="mt-2.5 text-[10px] text-slate-400">
          <summary className="cursor-pointer text-slate-400 hover:text-[#cbff60] transition-colors">{t.formulaAndLimits}</summary>
          <p className="mt-1.5 leading-relaxed"><strong>{t.formulaLabel}</strong> {t.metricCodeChurnFormula}</p>
          <p className="mt-1 leading-relaxed"><strong>{t.periodLabel}</strong> {t.metricCodeChurnPeriod}</p>
          <p className="mt-1 leading-relaxed"><strong>{t.sourceLabel}</strong> {t.metricCodeChurnSource}</p>
          <p className="mt-1 leading-relaxed"><strong>{t.limitLabel}</strong> {t.metricCodeChurnLimit}</p>
        </details>
      </div>
    </div>
  );
}
