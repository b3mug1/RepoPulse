import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GitCompare } from 'lucide-react';
import {
  AnalysisComparison,
  compareAnalyses,
  getAllAnalysisHistory,
  GlobalHistoryItem,
} from '../api/client';

function formatDelta(value: number | null, suffix = '') {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
}

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<GlobalHistoryItem[]>([]);
  const [leftId, setLeftId] = useState(searchParams.get('left') || '');
  const [rightId, setRightId] = useState(searchParams.get('right') || '');
  const [comparison, setComparison] = useState<AnalysisComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAllAnalysisHistory({ status: 'completed', limit: 50, sort_by: 'created_at', sort_order: 'desc' })
      .then((res) => {
        setOptions(res.items);
        if (!leftId && res.items.length >= 2) setLeftId(res.items[1].id);
        if (!rightId && res.items.length >= 1) setRightId(res.items[0].id);
      })
      .catch(() => setError('Could not load completed analyses for comparison.'));
  }, []);

  useEffect(() => {
    if (!leftId || !rightId || leftId === rightId) {
      setComparison(null);
      return;
    }
    setSearchParams({ left: leftId, right: rightId }, { replace: true });
    setLoading(true);
    setError('');
    compareAnalyses(leftId, rightId)
      .then(setComparison)
      .catch(() => setError('Could not compare the selected analyses.'))
      .finally(() => setLoading(false));
  }, [leftId, rightId]);

  return (
    <div className="analysis-page">
      <Link to="/" className="analysis-topline"><ArrowLeft size={14} /> BACK TO REPOPULSE</Link>
      <section className="analysis-head">
        <div>
          <span className="analysis-overline">COMPARISON VIEW</span>
          <h1>Compare analyses</h1>
          <p>Compare a repository against its previous scan or compare two different repositories side by side.</p>
        </div>
        <Link to="/history" className="report-action">Browse history</Link>
      </section>

      <section className="glass p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs text-slate-500">
          <span className="block mb-1.5 font-medium">Baseline (Left)</span>
          <select
            value={leftId}
            onChange={(e) => setLeftId(e.target.value)}
            className="glass-sm px-3 py-2 w-full text-slate-700 outline-none"
          >
            <option value="">Select analysis...</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.repository_full_name} · {new Date(item.created_at).toLocaleDateString()} · Health {item.health_score ?? '—'}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1.5 font-medium">Target (Right)</span>
          <select
            value={rightId}
            onChange={(e) => setRightId(e.target.value)}
            className="glass-sm px-3 py-2 w-full text-slate-700 outline-none"
          >
            <option value="">Select analysis...</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.repository_full_name} · {new Date(item.created_at).toLocaleDateString()} · Health {item.health_score ?? '—'}
              </option>
            ))}
          </select>
        </label>
      </section>

      {leftId && rightId && leftId === rightId && (
        <div className="glass p-6 text-sm text-slate-500">Select two different analyses to compare.</div>
      )}
      {error && <div className="glass p-6 text-sm text-rose-500">{error}</div>}
      {loading && <div className="glass p-8 text-center text-sm text-slate-400">Comparing metrics…</div>}

      {comparison && !loading && (
        <section className="glass p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
            <GitCompare size={15} />
            <span>{comparison.left.repository_full_name} vs {comparison.right.repository_full_name}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/60 text-slate-400">
                  <th className="py-2.5 pr-4">Metric</th>
                  <th className="py-2.5 pr-4">{comparison.left.repository_full_name}</th>
                  <th className="py-2.5 pr-4">{comparison.right.repository_full_name}</th>
                  <th className="py-2.5">Delta (Right - Left)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40 text-slate-700 tabular-nums">
                <tr>
                  <td className="py-3 pr-4 font-medium">Health Score</td>
                  <td className="py-3 pr-4">{comparison.left.health.score ?? '—'} / 100</td>
                  <td className="py-3 pr-4">{comparison.right.health.score ?? '—'} / 100</td>
                  <td className="py-3 font-semibold">{formatDelta(comparison.deltas.health_score)}</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Sampled Commits</td>
                  <td className="py-3 pr-4">{comparison.left.metrics.total_commits}</td>
                  <td className="py-3 pr-4">{comparison.right.metrics.total_commits}</td>
                  <td className="py-3 font-semibold">{formatDelta(comparison.deltas.total_commits)}</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Commits / 30 Days</td>
                  <td className="py-3 pr-4">{comparison.left.metrics.commits_per_month.toFixed(1)}</td>
                  <td className="py-3 pr-4">{comparison.right.metrics.commits_per_month.toFixed(1)}</td>
                  <td className="py-3 font-semibold">{formatDelta(comparison.deltas.commits_per_month)}</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Avg Commit Size</td>
                  <td className="py-3 pr-4">{comparison.left.metrics.avg_commit_size.toFixed(1)} lines</td>
                  <td className="py-3 pr-4">{comparison.right.metrics.avg_commit_size.toFixed(1)} lines</td>
                  <td className="py-3 font-semibold">{formatDelta(comparison.deltas.avg_commit_size, ' lines')}</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Bus Factor</td>
                  <td className="py-3 pr-4">{comparison.left.metrics.bus_factor}</td>
                  <td className="py-3 pr-4">{comparison.right.metrics.bus_factor}</td>
                  <td className="py-3 font-semibold">{formatDelta(comparison.deltas.bus_factor)}</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Additions / Deletions</td>
                  <td className="py-3 pr-4">+{comparison.left.metrics.code_churn_additions} / -{comparison.left.metrics.code_churn_deletions}</td>
                  <td className="py-3 pr-4">+{comparison.right.metrics.code_churn_additions} / -{comparison.right.metrics.code_churn_deletions}</td>
                  <td className="py-3 font-semibold">{formatDelta(comparison.deltas.code_churn_additions)} / {formatDelta(comparison.deltas.code_churn_deletions)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
