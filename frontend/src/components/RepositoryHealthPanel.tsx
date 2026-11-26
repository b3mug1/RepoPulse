import { ShieldCheck, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { AnalysisDetail } from '../api/client';
import { useLocale } from '../i18n';

interface Props {
  health: AnalysisDetail['health'];
}

export default function RepositoryHealthPanel({ health }: Props) {
  const { t } = useLocale();
  const labels: Record<string, string> = {
    activity: t.healthActivity,
    collaboration: t.healthCollaboration,
    documentation: t.healthDocumentation,
    testing: t.healthTesting,
    automation: t.healthAutomation,
  };

  const confidenceLabel = (c: string) => {
    if (c === 'high') return t.confidenceHigh;
    if (c === 'medium') return t.confidenceMedium;
    if (c === 'low') return t.confidenceLow;
    return c;
  };

  const scoreColor =
    health.score === null
      ? 'text-slate-400'
      : health.score >= 75
        ? 'text-emerald-400'
        : health.score >= 50
          ? 'text-amber-400'
          : 'text-rose-400';

  const ringStroke =
    health.score === null
      ? '#475569'
      : health.score >= 75
        ? '#cbff60'
        : health.score >= 50
          ? '#fbbf24'
          : '#fb7185';

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const progress = health.score !== null ? Math.max(0, Math.min(100, health.score)) : 0;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <section className="glass p-6 md:p-8" aria-labelledby="health-title">
      <div className="flex flex-col lg:flex-row lg:items-start gap-7">
        <div className="flex items-center gap-5 lg:w-64 shrink-0">
          <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 92 92" aria-hidden="true">
              <circle
                cx="46"
                cy="46"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="6"
              />
              {health.score !== null && (
                <circle
                  cx="46"
                  cy="46"
                  r={radius}
                  fill="none"
                  stroke={ringStroke}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold tabular-nums leading-none ${scoreColor}`}>
                {health.score ?? '—'}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">/ 100</span>
            </div>
          </div>
          <div>
            <h3 id="health-title" className="text-slate-100 font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#cbff60]" /> {t.repoHealthTitle}
            </h3>
            <p className={`text-sm font-medium mt-1 ${scoreColor}`}>{health.grade}</p>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              {health.coverage}% {t.healthSignalsMeasured}{' '}
              <span className="capitalize font-medium text-slate-200">{confidenceLabel(health.confidence)}</span>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 flex-1">
          {Object.entries(health.breakdown).map(([key, component]) => (
            <div key={key} className="glass-sm p-3.5 flex flex-col justify-between" title={`${component.explanation} ${component.evidence}`}>
              <div>
                <div className="flex justify-between items-center gap-2 mb-2">
                  <span className="text-[11px] text-slate-300 font-medium">{labels[key] || component.label || key}</span>
                  <span className="text-xs font-semibold text-slate-100 tabular-nums">{component.score ?? '—'}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  {component.score !== null && (
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#cbff60] to-emerald-400"
                      style={{ width: `${component.score}%` }}
                    />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  {t.weightLabel} {component.weight}% · {component.weighted_points !== null ? `+${component.weighted_points.toFixed(1)} ${t.ptsLabel}` : t.notCounted}
                </p>
              </div>
              <details className="mt-2.5 text-[10px] text-slate-400">
                <summary className="cursor-pointer text-slate-400 hover:text-[#cbff60] transition-colors">{t.howMeasured}</summary>
                <p className="mt-2 leading-relaxed text-slate-300">{component.explanation}</p>
                <p className="mt-1 leading-relaxed"><strong>{t.evidenceLabel}</strong> {component.evidence}</p>
              </details>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 border-t border-white/10 pt-5">
        <h4 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-3">{t.whatToImprove}</h4>
        <div className="grid md:grid-cols-2 gap-2.5">
          {health.findings.map((finding, index) => {
            const Icon = finding.severity === 'high' ? AlertTriangle : finding.severity === 'low' ? Info : CheckCircle2;
            const iconColor =
              finding.severity === 'high'
                ? 'text-rose-400'
                : finding.severity === 'medium'
                  ? 'text-amber-400'
                  : 'text-sky-400';
            return (
              <div key={`${finding.title}-${index}`} className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                <div>
                  <p className="text-xs font-medium text-slate-200">{finding.title}</p>
                  <p className="text-[11px] leading-relaxed text-slate-400 mt-0.5">{finding.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-4">{t.healthDisclaimerPrefix}{health.formula_version} {t.healthDisclaimerSuffix}</p>
    </section>
  );
}
