import { ShieldCheck, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { AnalysisDetail } from '../api/client';

const labels: Record<string, string> = {
  activity: 'Activity',
  collaboration: 'Collaboration',
  documentation: 'Documentation',
  testing: 'Testing signals',
  automation: 'CI automation',
};

interface Props {
  health: AnalysisDetail['health'];
}

export default function RepositoryHealthPanel({ health }: Props) {
  const scoreColor = health.score >= 75 ? 'text-emerald-600' : health.score >= 50 ? 'text-amber-600' : 'text-rose-600';
  return (
    <section className="glass p-6 md:p-8" aria-labelledby="health-title">
      <div className="flex flex-col md:flex-row md:items-start gap-7">
        <div className="flex items-center gap-4 md:w-64 shrink-0">
          <div className={`w-20 h-20 rounded-2xl glass-sm flex flex-col items-center justify-center ${scoreColor}`}>
            <span className="text-3xl font-bold tabular-nums">{health.score}</span>
            <span className="text-[10px] text-slate-400">/ 100</span>
          </div>
          <div>
            <h3 id="health-title" className="text-slate-700 font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-500" /> Repository health
            </h3>
            <p className={`text-sm font-medium mt-1 ${scoreColor}`}>{health.grade}</p>
            <p className="text-[11px] text-slate-400 mt-1">Based on sampled GitHub signals</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-1">
          {Object.entries(health.breakdown).map(([key, value]) => (
            <div key={key} className="glass-sm p-3">
              <div className="flex justify-between items-center gap-2 mb-2">
                <span className="text-[11px] text-slate-500">{labels[key] || key}</span>
                <span className="text-xs font-semibold text-slate-700">{value}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 border-t border-white/60 pt-5">
        <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">What to improve</h4>
        <div className="grid md:grid-cols-2 gap-2">
          {health.findings.map((finding, index) => {
            const Icon = finding.severity === 'high' ? AlertTriangle : finding.severity === 'low' ? Info : CheckCircle2;
            return (
              <div key={`${finding.title}-${index}`} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/35">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${finding.severity === 'high' ? 'text-rose-500' : 'text-amber-500'}`} />
                <div><p className="text-xs font-medium text-slate-600">{finding.title}</p><p className="text-[11px] leading-relaxed text-slate-400 mt-0.5">{finding.detail}</p></div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-4">Heuristic score for portfolio review; it is not a security audit or a measure of developer performance.</p>
    </section>
  );
}
