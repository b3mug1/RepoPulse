import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Filter, GitCompare, Search } from 'lucide-react';
import { getAllAnalysisHistory, GlobalHistoryItem } from '../api/client';

const PAGE_SIZE = 10;

export default function HistoryPage() {
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
        if (active) setError('Could not load analysis history.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [search, status, sortBy, sortOrder, offset]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="analysis-page">
      <Link to="/" className="analysis-topline"><ArrowLeft size={14} /> BACK TO REPOPULSE</Link>
      <section className="analysis-head">
        <div>
          <span className="analysis-overline">ARCHIVE · {total} ANALYSES</span>
          <h1>Analysis history</h1>
          <p>Filter by repository or status, sort by health or volume, and open or compare reports.</p>
        </div>
        <Link to="/compare" className="report-action"><GitCompare size={14} /> Compare analyses</Link>
      </section>

      <section className="glass p-5 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="flex items-center gap-2 glass-sm px-3 py-2 text-xs text-slate-600">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
            placeholder="Filter owner/repo..."
            className="bg-transparent outline-none w-full"
            aria-label="Filter by repository name"
          />
        </label>

        <label className="flex items-center gap-2 glass-sm px-3 py-2 text-xs text-slate-600">
          <Filter size={14} className="text-slate-400 shrink-0" />
          <select
            value={status}
            onChange={(e) => { setOffset(0); setStatus(e.target.value); }}
            className="bg-transparent outline-none w-full"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In progress</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <select
          value={sortBy}
          onChange={(e) => { setOffset(0); setSortBy(e.target.value as typeof sortBy); }}
          className="glass-sm px-3 py-2 text-xs text-slate-600 outline-none"
          aria-label="Sort by field"
        >
          <option value="created_at">Sort by date</option>
          <option value="health_score">Sort by Health Score</option>
          <option value="total_commits">Sort by sampled commits</option>
        </select>

        <select
          value={sortOrder}
          onChange={(e) => { setOffset(0); setSortOrder(e.target.value as typeof sortOrder); }}
          className="glass-sm px-3 py-2 text-xs text-slate-600 outline-none"
          aria-label="Sort order"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </section>

      {error && <div className="glass p-6 text-sm text-rose-500">{error}</div>}

      {loading ? (
        <div className="glass p-8 text-center text-sm text-slate-400">Loading history…</div>
      ) : items.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-slate-400">No analyses match the current filters.</div>
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
                  <span className="text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <span className="history-status text-slate-400">{item.status}</span>
                <span className="text-xs text-slate-500 tabular-nums">{item.total_commits} commits</span>
                <strong className="text-xs font-mono text-indigo-500 tabular-nums">
                  Health {item.health_score ?? '—'}<small className="text-slate-400"> / 100</small>
                </strong>
                <ArrowUpRight size={14} className="text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/60 text-xs text-slate-500">
            <span>Page {currentPage} of {totalPages} ({total} total)</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="report-action"
                disabled={offset === 0}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="report-action"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
