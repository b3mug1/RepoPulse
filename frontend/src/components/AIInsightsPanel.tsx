import { useState } from 'react';
import { AIInsights } from '../api/client';
import { useLocale } from '../i18n';
import { Sparkles, FileText, Layers, Wrench, Link2, ShieldAlert } from 'lucide-react';

interface Props {
  insights: AIInsights;
}

type RoleTab = 'developer' | 'manager' | 'recruiter';

function toBulletPoints(text: string, maxItems = 5): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return lines.slice(0, maxItems);
  }

  // Legacy single-paragraph prose: split into clean sentences
  const sentences = trimmed
    .split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [trimmed];
  }
  return sentences.slice(0, maxItems);
}

function BulletList({ text, fallback }: { text: string | null | undefined; fallback: string }) {
  const items = text ? toBulletPoints(text) : [];
  if (items.length === 0) {
    return <p className="text-slate-400 text-sm">{fallback}</p>;
  }
  if (items.length === 1) {
    return <p className="text-slate-300 text-sm leading-relaxed">{items[0]}</p>;
  }
  return (
    <ul className="space-y-2 text-slate-300 text-xs sm:text-[13px] leading-relaxed">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#cbff60]/80 mt-1.5 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AIInsightsPanel({ insights }: Props) {
  const { t } = useLocale();
  const [role, setRole] = useState<RoleTab>('developer');
  const meta = insights.ai_metadata || {};
  const roleSummaries = meta.role_summaries || {};
  const evidenceRefs = meta.evidence_refs || [];

  const roleLabels: Record<RoleTab, string> = {
    developer: t.roleDeveloper,
    manager: t.roleManager,
    recruiter: t.roleRecruiter,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-slate-200 text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#cbff60]" />
          {t.aiInterpretation}
        </h3>
        {meta.model && (
          <span className="text-[11px] text-slate-400">
            {t.providerLabel} {meta.provider || t.unknown} · {meta.model}
            {meta.prompt_version ? ` · ${t.promptVersionPrefix}${meta.prompt_version}` : ''}
          </span>
        )}
      </div>

      {meta.status === 'unavailable' && (
        <div className="glass p-4 text-xs text-amber-400 flex items-center gap-2">
          <ShieldAlert size={15} className="shrink-0" />
          <span>{t.aiUnavailableBanner}</span>
        </div>
      )}

      {(roleSummaries.developer || roleSummaries.manager || roleSummaries.recruiter) && (
        <div className="glass p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.audienceSummaryTitle}
            </span>
            <div className="flex gap-1.5" role="tablist" aria-label={t.audienceAriaLabel}>
              {(['developer', 'manager', 'recruiter'] as RoleTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={role === tab}
                  onClick={() => setRole(tab)}
                  className={`report-action capitalize ${role === tab ? 'border-[#cbff60]/60 text-[#cbff60]' : ''}`}
                >
                  {roleLabels[tab]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-slate-200 text-sm leading-relaxed">
            {roleSummaries[role] || insights.ai_summary || t.notAvailable}
          </p>
          <p className="text-[10px] text-slate-500 mt-2">
            {t.aiDisclaimer}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass p-5">
          <h4 className="text-slate-400 text-xs font-semibold mb-3 flex items-center gap-2 uppercase tracking-wider">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            {t.summaryTitle}
          </h4>
          <BulletList text={insights.ai_summary} fallback={t.notAvailable} />
        </div>

        <div className="glass p-5">
          <h4 className="text-slate-400 text-xs font-semibold mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            {t.architectureTitle}
          </h4>
          <BulletList text={insights.architecture_analysis} fallback={t.notAvailable} />
        </div>

        <div className="glass p-5">
          <h4 className="text-slate-400 text-xs font-semibold mb-3 uppercase tracking-wider">
            {t.readmeQualityTitle}
          </h4>
          {insights.readme_quality_score !== null && (
            <div className="flex items-center gap-3 mb-3">
              <div className="text-2xl font-bold text-slate-100 tabular-nums">
                {insights.readme_quality_score.toFixed(1)}
              </div>
              <div className="text-slate-400 text-xs font-medium">/10</div>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(insights.readme_quality_score / 10) * 100}%`,
                    background:
                      insights.readme_quality_score >= 7
                        ? 'linear-gradient(90deg, #cbff60, #34d399)'
                        : insights.readme_quality_score >= 4
                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                        : 'linear-gradient(90deg, #ef4444, #f87171)',
                  }}
                />
              </div>
            </div>
          )}
          <BulletList text={insights.readme_quality_feedback} fallback={t.notAvailable} />
        </div>

        <div className="glass p-5">
          <h4 className="text-slate-400 text-xs font-semibold mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Wrench className="w-3.5 h-3.5 text-orange-400" />
            {t.techStackTitle}
          </h4>
          {insights.detected_tech_stack.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {insights.detected_tech_stack.map((tech) => (
                <span
                  key={tech}
                  className="px-3 py-1.5 glass-sm text-slate-200 text-xs font-medium"
                >
                  {tech}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">{t.notAvailable}</p>
          )}
        </div>
      </div>

      {evidenceRefs.length > 0 && (
        <div className="glass p-5">
          <h4 className="text-slate-400 text-xs font-semibold mb-3 flex items-center gap-2 uppercase tracking-wider">
            <Link2 className="w-3.5 h-3.5 text-cyan-400" />
            {t.supportingFilesTitle}
          </h4>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {evidenceRefs.map((ref, idx) => (
              <li key={`${ref.target}-${idx}`} className="flex flex-wrap items-center gap-2">
                <span className="px-1.5 py-0.5 glass-sm text-[10px] uppercase text-[#cbff60]">{ref.source_type}</span>
                <code className="text-slate-100">{ref.target}</code>
                <span className="text-slate-400">— {ref.claim}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meta.data_sent_disclosure && (
        <p className="text-[11px] text-slate-500">{meta.data_sent_disclosure}</p>
      )}
    </div>
  );
}
