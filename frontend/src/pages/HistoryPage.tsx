import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Filter, GitCompare, Search } from 'lucide-react';
import { getAllAnalysisHistory, GlobalHistoryItem } from '../api/client';
import { useLocale } from '../i18n';

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const { t, dateLocale } = useLocale();
  const [items, setItems] = useState<GlobalHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'health_score' | 'total_commits'>('created_at');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getAllAnalysisHistory({
      search: search.trim() || undefined,
      status: status || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
      limit: PAGE_SIZE,
      offset,
    })
      .then((res) => {
        if (!active) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (active) setError(t.historyLoadError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [search, status, sortBy, sortOrder, offset, t.historyLoadError]);

  const statusLabel = (s: string) => {
    if (s === 'completed') return t.statusCompleted;
    if (s === 'in_progress') return t.statusInProgress;
    if (s === 'pending') return t.statusPending;
    if (s === 'failed') return t.statusFailed;
    if (s === 'cancelled') return t.statusCancelled;
    return s;
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="analysis-page">
      <Link to="/" className="analysis-topline"><ArrowLeft size={14} /> {t.backToRepoPulse}</Link>
      <section className="analysis-head">
        <div>
          <span className="analysis-overline">{t.archiveLabel} · {total} {t.analysesCount}</span>
          <h1>{t.historyTitle}</h1>
          <p>{t.historySubtitle}</p>
        </div>
        <Link to="/compare" className="report-action"><GitCompare size={14} /> {t.compareAnalyses}</Link>
      </section>

      <section className="glass p-5 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="flex items-center gap-2 glass-sm px-3 py-2 text-xs text-slate-600">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
            placeholder={t.filterPlaceholder}
            className="bg-transparent outline-none w-full"
            aria-label={t.filterByRepoAria}
          />
        </label>

        <label className="flex items-center gap-2 glass-sm px-3 py-2 text-xs text-slate-600">
          <Filter size={14} className="text-slate-400 shrink-0" />
          <select
            value={status}
            onChange={(e) => { setOffset(0); setStatus(e.target.value); }}
            className="bg-transparent outline-none w-full"
            aria-label={t.filterByStatusAria}
          >
            <option value="">{t.allStatuses}</option>
            <option value="completed">{t.statusCompleted}</option>
            <option value="in_progress">{t.statusInProgress}</option>
            <option value="pending">{t.statusPending}</option>
            <option value="failed">{t.statusFailed}</option>
            <option value="cancelled">{t.statusCancelled}</option>
          </select>
        </label>

        <select
          value={sortBy}
          onChange={(e) => { setOffset(0); setSortBy(e.target.value as typeof sortBy); }}
          className="glass-sm px-3 py-2 text-xs text-slate-600 outline-none"
          aria-label={t.sortByFieldAria}
        >
          <option value="created_at">{t.sortByDate}</option>
          <option value="health_score">{t.sortByHealth}</option>
          <option value="total_commits">{t.sortByCommits}</option>
        </select>

        <select
          value={sortOrder}
          onChange={(e) => { setOffset(0); setSortOrder(e.target.value as typeof sortOrder); }}
          className="glass-sm px-3 py-2 text-xs text-slate-600 outline-none"
          aria-label={t.sortOrderAria}
        >
          <option value="desc">{t.descending}</option>
          <option value="asc">{t.ascending}</option>
        </select>
      </section>

      {error && <div className="glass p-6 text-sm text-rose-500">{error}</div>}

      {loading ? (
        <div className="glass p-8 text-center text-sm text-slate-400">{t.loadingHistory}</div>
      ) : items.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-slate-400">{t.historyEmpty}</div>
      ) : (
        <section className="glass p-6">
          <div className="divide-y divide-white/40">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/analysis/${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 px-2 rounded-lg hover:bg-white/30 transition"
              >
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm text-slate-700 truncate">{item.repository_full_name}</strong>
                  <span className="text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString(dateLocale)}</span>
                </div>
                <span className="history-status text-slate-400">{statusLabel(item.status)}</span>
                <span className="text-xs text-slate-500 tabular-nums">{item.total_commits} {t.commits}</span>
                <strong className="text-xs font-mono text-indigo-500 tabular-nums">
                  {t.health} {item.health_score ?? '—'}<small className="text-slate-400"> / 100</small>
                </strong>
                <ArrowUpRight size={14} className="text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/60 text-xs text-slate-500">
            <span>{t.pageOf} {currentPage} {t.ofWord} {totalPages} ({total} {t.totalWord})</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="report-action"
                disabled={offset === 0}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              >
                {t.previous}
              </button>
              <button
                type="button"
                className="report-action"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              >
                {t.next}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
