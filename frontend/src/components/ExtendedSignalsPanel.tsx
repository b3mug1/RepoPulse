import { GitPullRequest, CircleDot, Tag, Workflow, Shield, Calendar, Lock } from 'lucide-react';
import { AnalysisDetail } from '../api/client';
import { useLocale } from '../i18n';

interface Props {
  signals?: AnalysisDetail['extended_signals'];
}

export default function ExtendedSignalsPanel({ signals }: Props) {
  const { t, dateLocale } = useLocale();
  if (!signals || Object.keys(signals).length === 0) return null;

  const prs = signals.pull_requests;
  const issues = signals.issues;
  const releases = signals.releases;
  const ci = signals.ci;
  const gov = signals.governance;
  const sec = signals.security_hygiene;
  const win = signals.activity_windows;

  return (
    <section className="glass p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <h3 className="text-slate-700 text-sm font-semibold">{t.ecosystemSignalsTitle}</h3>
        {signals.data_refreshed_at && (
          <span className="text-[11px] text-slate-400">
            {t.githubDataRefreshed} {new Date(signals.data_refreshed_at).toLocaleString(dateLocale)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {prs && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <GitPullRequest size={14} className="text-indigo-500" /> {t.pullRequestsTitle} ({t.samplePrefix} {prs.sampled_count})
            </div>
            <p className="text-slate-500">{t.openLabel} {prs.open_count} · {t.mergedLabel} {prs.merged_count} · {t.closedLabel} {prs.closed_count}</p>
            <p className="text-slate-400 mt-1">
              {t.openShareLabel} {prs.open_ratio !== null ? `${Math.round(prs.open_ratio * 100)}%` : '—'} · {t.avgCloseLabel} {prs.avg_time_to_close_hours !== null ? `${prs.avg_time_to_close_hours}${t.hrs}` : '—'}
            </p>
            {(prs.size_distribution || prs.avg_time_to_first_review_hours != null) && (
              <p className="text-slate-400 mt-1">
                {prs.size_distribution ? `${t.sizesLabel} S:${prs.size_distribution.S} M:${prs.size_distribution.M} L:${prs.size_distribution.L} XL:${prs.size_distribution.XL}` : ''}
                {prs.avg_time_to_first_review_hours != null ? ` · ${t.firstReviewLabel} ${prs.avg_time_to_first_review_hours}${t.hrs}` : ''}
                {prs.unreviewed_merged_ratio != null ? ` · ${t.unreviewedMergedLabel} ${Math.round(prs.unreviewed_merged_ratio * 100)}%` : ''}
              </p>
            )}
          </div>
        )}

        {issues && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <CircleDot size={14} className="text-emerald-500" /> {t.issuesTitle} ({t.samplePrefix} {issues.sampled_count})
            </div>
            <p className="text-slate-500">{t.openLabel} {issues.open_count} · {t.closedLabel} {issues.closed_count}</p>
            <p className="text-slate-400 mt-1">
              {t.avgOpenAgeLabel} {issues.avg_open_age_hours !== null ? `${issues.avg_open_age_hours}${t.hrs}` : '—'} · {t.avgResolveLabel} {issues.avg_time_to_close_hours !== null ? `${issues.avg_time_to_close_hours}${t.hrs}` : '—'}
            </p>
          </div>
        )}

        {releases && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <Tag size={14} className="text-violet-500" /> {t.releasesTitle} ({releases.sampled_count})
            </div>
            <p className="text-slate-500">{t.latestTagLabel} {releases.latest_tag || t.noneDetected}</p>
            <p className="text-slate-400 mt-1">
              {t.avgIntervalLabel} {releases.avg_days_between_releases !== null ? `${releases.avg_days_between_releases} ${t.daysUnit}` : '—'}
              {releases.semver_compliant_ratio != null ? ` · SemVer: ${Math.round(releases.semver_compliant_ratio * 100)}%` : ''}
            </p>
            {releases.has_changelog != null && (
              <p className="text-slate-400 mt-1">CHANGELOG: {releases.has_changelog ? t.present : t.notDetected}</p>
            )}
          </div>
        )}

        {ci && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <Workflow size={14} className="text-amber-500" /> {t.ciActionsTitle}
            </div>
            <p className="text-slate-500">
              {t.providersLabel} {ci.providers_detected.length ? ci.providers_detected.join(', ') : t.noneDetected}
            </p>
            <p className="text-slate-400 mt-1">
              {t.actionsSuccessLabel} {ci.actions_success_rate !== null ? `${ci.actions_success_rate}%` : '—'} · {t.latestRunLabel} {ci.latest_run_conclusion || '—'}
            </p>
          </div>
        )}

        {gov && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <Shield size={14} className="text-cyan-500" /> {t.governanceTitle}
            </div>
            <p className="text-slate-500">{t.licenseLabel} {gov.license || t.notDetected} · {t.branchLabel} ({gov.default_branch}): {gov.branch_protection}</p>
            <p className="text-slate-400 mt-1">
              CODEOWNERS: {gov.has_codeowners === null ? t.unknown : gov.has_codeowners ? t.present : t.notDetected}
            </p>
          </div>
        )}

        {sec && (
          <div className="glass-sm p-4">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-2">
              <Lock size={14} className="text-rose-400" /> {t.securityDepsTitle}
            </div>
            <p className="text-slate-500">
              SECURITY.md: {sec.has_security_policy === null ? t.unknown : sec.has_security_policy ? t.present : t.notDetected}
              {sec.dependency_automation.length > 0 ? ` · ${sec.dependency_automation.join(', ')}` : ''}
            </p>
            <p className="text-slate-400 mt-1">
              {t.lockfilesLabel} {sec.lockfiles_detected.length ? sec.lockfiles_detected.join(', ') : t.noneDetected}
            </p>
          </div>
        )}

        {win && (
          <div className="glass-sm p-4 md:col-span-2 lg:col-span-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <Calendar size={14} className="text-orange-400" /> {t.activityWindowsTitle}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-slate-300 tabular-nums">
              <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06]">7d: <strong className="text-slate-100">{win.last_7_days}</strong></span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06]">30d: <strong className="text-slate-100">{win.last_30_days}</strong></span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06]">90d: <strong className="text-slate-100">{win.last_90_days}</strong></span>
              <span className="text-slate-400">{t.trend30dLabel} <strong className="text-slate-200">{win.trend_30d}</strong></span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
