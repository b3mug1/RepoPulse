import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GitCompare, Table2 } from 'lucide-react';
import {
  AnalysisComparison,
  AnalysisDetail,
  benchmarkAnalyses,
  compareAnalyses,
  getAllAnalysisHistory,
  GlobalHistoryItem,
} from '../api/client';
import { useLocale } from '../i18n';

function formatDelta(value: number | null, suffix = '') {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
}

export default function ComparePage() {
  const { t, dateLocale } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<'delta' | 'matrix'>('delta');
  const [options, setOptions] = useState<GlobalHistoryItem[]>([]);
  const [leftId, setLeftId] = useState(searchParams.get('left') || '');
  const [rightId, setRightId] = useState(searchParams.get('right') || '');
  const [comparison, setComparison] = useState<AnalysisComparison | null>(null);
  const [matrixIds, setMatrixIds] = useState<string[]>([]);
  const [matrixRows, setMatrixRows] = useState<AnalysisDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAllAnalysisHistory({ status: 'completed', limit: 50, sort_by: 'created_at', sort_order: 'desc' })
      .then((res) => {
        setOptions(res.items);
        setLeftId((prev) => prev || (res.items.length >= 2 ? res.items[1].id : ''));
        setRightId((prev) => prev || (res.items.length >= 1 ? res.items[0].id : ''));
        setMatrixIds((prev) => (prev.length ? prev : res.items.slice(0, 3).map((item) => item.id)));
      })
      .catch(() => setError(t.compareLoadOptionsError));
  }, [t.compareLoadOptionsError]);

  useEffect(() => {
    if (mode !== 'delta') return;
    if (!leftId || !rightId || leftId === rightId) {
      setComparison(null);
      return;
    }
    setSearchParams({ left: leftId, right: rightId }, { replace: true });
    setLoading(true);
    setError('');
    compareAnalyses(leftId, rightId)
      .then(setComparison)
      .catch(() => setError(t.compareError))
      .finally(() => setLoading(false));
  }, [mode, leftId, rightId, setSearchParams, t.compareError]);

  useEffect(() => {
    if (mode !== 'matrix') return;
    if (matrixIds.length < 2 || matrixIds.length > 5) {
      setMatrixRows([]);
      return;
    }
    setLoading(true);
    setError('');
    benchmarkAnalyses(matrixIds)
      .then(setMatrixRows)
      .catch(() => setError(t.benchmarkError))
      .finally(() => setLoading(false));
  }, [mode, matrixIds, t.benchmarkError]);

  const toggleMatrixId = (id: string) => {
    setMatrixIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="analysis-page">
      <Link to="/" className="analysis-topline"><ArrowLeft size={14} /> {t.backToRepoPulse}</Link>
      <section className="analysis-head">
        <div>
          <span className="analysis-overline">{t.comparisonView}</span>
          <h1>{t.compareTitle}</h1>
          <p>{t.compareSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`report-action ${mode === 'delta' ? 'border-indigo-400 text-indigo-500' : ''}`}
            onClick={() => setMode('delta')}
          >
            <GitCompare size={14} /> {t.twoRepoDelta}
          </button>
          <button
            type="button"
            className={`report-action ${mode === 'matrix' ? 'border-indigo-400 text-indigo-500' : ''}`}
            onClick={() => setMode('matrix')}
          >
            <Table2 size={14} /> {t.benchmarkMatrix}
          </button>
          <Link to="/history" className="report-action">{t.browseHistory}</Link>
        </div>
      </section>

      {mode === 'delta' ? (
        <>
          <section className="glass p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-xs text-slate-500">
              <span className="block mb-1.5 font-medium">{t.baselineLeft}</span>
              <select
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                className="glass-sm px-3 py-2 w-full text-slate-700 outline-none"
              >
                <option value="">{t.selectAnalysis}</option>
                {options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.repository_full_name} · {new Date(item.created_at).toLocaleDateString(dateLocale)} · {t.health} {item.health_score ?? '—'}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-slate-500">
              <span className="block mb-1.5 font-medium">{t.targetRight}</span>
              <select
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                className="glass-sm px-3 py-2 w-full text-slate-700 outline-none"
              >
                <option value="">{t.selectAnalysis}</option>
                {options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.repository_full_name} · {new Date(item.created_at).toLocaleDateString(dateLocale)} · {t.health} {item.health_score ?? '—'}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {leftId && rightId && leftId === rightId && (
            <div className="glass p-6 text-sm text-slate-500">{t.selectTwoDifferent}</div>
          )}
          {error && <div className="glass p-6 text-sm text-rose-500">{error}</div>}
          {loading && <div className="glass p-8 text-center text-sm text-slate-400">{t.comparingMetrics}</div>}

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
                      <th className="py-2.5 pr-4">{t.metricCol}</th>
                      <th className="py-2.5 pr-4">{comparison.left.repository_full_name}</th>
                      <th className="py-2.5 pr-4">{comparison.right.repository_full_name}</th>
                      <th className="py-2.5">{t.deltaCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40 text-slate-700 tabular-nums">
                    <tr>
                      <td className="py-3 pr-4 font-medium">{t.healthScoreLabel}</td>
                      <td className="py-3 pr-4">{comparison.left.health.score ?? '—'} / 100</td>
                      <td className="py-3 pr-4">{comparison.right.health.score ?? '—'} / 100</td>
                      <td className="py-3 font-semibold">{formatDelta(comparison.deltas.health_score)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium">{t.sampledCommitsLabel}</td>
                      <td className="py-3 pr-4">{comparison.left.metrics.total_commits}</td>
                      <td className="py-3 pr-4">{comparison.right.metrics.total_commits}</td>
                      <td className="py-3 font-semibold">{formatDelta(comparison.deltas.total_commits)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium">{t.commitsPer30dLabel}</td>
                      <td className="py-3 pr-4">{comparison.left.metrics.commits_per_month.toFixed(1)}</td>
                      <td className="py-3 pr-4">{comparison.right.metrics.commits_per_month.toFixed(1)}</td>
                      <td className="py-3 font-semibold">{formatDelta(comparison.deltas.commits_per_month)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium">{t.avgCommitSizeLabel}</td>
                      <td className="py-3 pr-4">{comparison.left.metrics.avg_commit_size.toFixed(1)} {t.lines}</td>
                      <td className="py-3 pr-4">{comparison.right.metrics.avg_commit_size.toFixed(1)} {t.lines}</td>
                      <td className="py-3 font-semibold">{formatDelta(comparison.deltas.avg_commit_size, ` ${t.lines}`)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium">{t.busFactorLabel}</td>
                      <td className="py-3 pr-4">{comparison.left.metrics.bus_factor}</td>
                      <td className="py-3 pr-4">{comparison.right.metrics.bus_factor}</td>
                      <td className="py-3 font-semibold">{formatDelta(comparison.deltas.bus_factor)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium">{t.additionsDeletionsLabel}</td>
                      <td className="py-3 pr-4">+{comparison.left.metrics.code_churn_additions} / -{comparison.left.metrics.code_churn_deletions}</td>
                      <td className="py-3 pr-4">+{comparison.right.metrics.code_churn_additions} / -{comparison.right.metrics.code_churn_deletions}</td>
                      <td className="py-3 font-semibold">{formatDelta(comparison.deltas.code_churn_additions)} / {formatDelta(comparison.deltas.code_churn_deletions)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="glass p-5 mb-6">
            <p className="text-xs text-slate-400 mb-3">
              {t.selectMatrixPrompt} ({matrixIds.length}/5 {t.selectedCountSuffix}
            </p>
            <div className="flex flex-wrap gap-2">
              {options.slice(0, 20).map((item) => {
                const selected = matrixIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleMatrixId(item.id)}
                    className={`report-action ${selected ? 'border-indigo-400 text-indigo-500' : ''}`}
                  >
                    {item.repository_full_name} · {item.health_score ?? '—'}
                  </button>
                );
              })}
            </div>
          </section>

          {matrixIds.length < 2 && (
            <div className="glass p-6 text-sm text-slate-500">{t.selectAtLeastTwo}</div>
          )}
          {error && <div className="glass p-6 text-sm text-rose-500">{error}</div>}
          {loading && <div className="glass p-8 text-center text-sm text-slate-400">{t.loadingBenchmarkMatrix}</div>}

          {matrixRows.length >= 2 && !loading && (
            <section className="glass p-6 overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-white/60 text-slate-400">
                    <th className="py-2.5 pr-4">{t.repoCol}</th>
                    <th className="py-2.5 pr-4">{t.health}</th>
                    <th className="py-2.5 pr-4">{t.commitsPer30dLabel}</th>
                    <th className="py-2.5 pr-4">{t.busFactorLabel}</th>
                    <th className="py-2.5 pr-4">{t.prCloseCol}</th>
                    <th className="py-2.5 pr-4">{t.issueResolveCol}</th>
                    <th className="py-2.5 pr-4">{t.releasesCol}</th>
                    <th className="py-2.5 pr-4">{t.ciCol}</th>
                    <th className="py-2.5">{t.licenseCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40 text-slate-700">
                  {matrixRows.map((row) => {
                    const prs = row.extended_signals?.pull_requests;
                    const issues = row.extended_signals?.issues;
                    const rel = row.extended_signals?.releases;
                    const ci = row.extended_signals?.ci;
                    const gov = row.extended_signals?.governance;
                    return (
                      <tr key={row.id}>
                        <td className="py-3 pr-4 font-semibold">
                          <Link to={`/analysis/${row.id}`} className="text-indigo-500 hover:underline">
                            {row.repository_full_name || row.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          {row.health.score ?? '—'} / 100 <span className="text-slate-400">({row.health.coverage}%)</span>
                        </td>
                        <td className="py-3 pr-4">{row.metrics.commits_per_month.toFixed(1)}</td>
                        <td className="py-3 pr-4">{row.metrics.bus_factor}</td>
                        <td className="py-3 pr-4">
                          {prs?.avg_time_to_close_hours != null ? `${prs.avg_time_to_close_hours}${t.hrs}` : '—'}
                        </td>
                        <td className="py-3 pr-4">
                          {issues?.avg_time_to_close_hours != null ? `${issues.avg_time_to_close_hours}${t.hrs}` : '—'}
                        </td>
                        <td className="py-3 pr-4">
                          {rel?.latest_tag || '—'}
                          {rel?.avg_days_between_releases != null ? ` (${rel.avg_days_between_releases}${t.daysUnit})` : ''}
                        </td>
                        <td className="py-3 pr-4">
                          {ci?.providers_detected?.length ? ci.providers_detected.join(', ') : '—'}
                        </td>
                        <td className="py-3">{gov?.license || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
