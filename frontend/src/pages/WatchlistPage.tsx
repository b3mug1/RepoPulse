import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Play, Trash2, AlertTriangle, Plus } from 'lucide-react';
import {
  getWatchlist,
  runWatchlistNow,
  subscribeWatchlist,
  unsubscribeWatchlist,
  WatchlistItem,
} from '../api/client';
import { useLocale } from '../i18n';

export default function WatchlistPage() {
  const navigate = useNavigate();
  const { t, dateLocale } = useLocale();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [repoInput, setRepoInput] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('weekly');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    getWatchlist()
      .then(setItems)
      .catch(() => setError(t.watchlistLoadError))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parts = repoInput
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//, '')
      .replace(/\/$/, '')
      .split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setError(t.invalidRepoError);
      return;
    }
    setSubmitting(true);
    try {
      await subscribeWatchlist({
        owner: parts[0],
        name: parts[1],
        cadence,
        webhook_url: webhookUrl.trim() || undefined,
      });
      setRepoInput('');
      setWebhookUrl('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || t.watchlistSubscribeError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      const res = await runWatchlistNow(id);
      navigate(`/analysis/${res.analysis_id}`);
    } catch {
      setError(t.watchlistTriggerError);
    }
  };

  const handleUnsubscribe = async (id: string) => {
    try {
      await unsubscribeWatchlist(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError(t.watchlistRemoveError);
    }
  };

  return (
    <div className="analysis-page">
      <Link to="/" className="analysis-topline"><ArrowLeft size={14} /> {t.backToRepoPulse}</Link>
      <section className="analysis-head">
        <div>
          <span className="analysis-overline">{t.scheduledMonitoring}</span>
          <h1>{t.watchlistTitle}</h1>
          <p>{t.watchlistSubtitle}</p>
        </div>
      </section>

      <form onSubmit={handleSubscribe} className="glass p-5 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <label className="text-xs text-slate-500">
          <span className="block mb-1">{t.repoOwnerNameLabel}</span>
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="vercel/next.js"
            className="glass-sm px-3 py-2 w-full text-slate-700 outline-none"
          />
        </label>
        <label className="text-xs text-slate-500">
          <span className="block mb-1">{t.scheduleLabel}</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as 'daily' | 'weekly')}
            className="glass-sm px-3 py-2 w-full text-slate-700 outline-none"
          >
            <option value="weekly">{t.weekly}</option>
            <option value="daily">{t.daily}</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          <span className="block mb-1">{t.webhookUrlLabel}</span>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/..."
            className="glass-sm px-3 py-2 w-full text-slate-700 outline-none"
          />
        </label>
        <button type="submit" className="report-action justify-center" disabled={submitting}>
          <Plus size={14} /> {submitting ? t.adding : t.watchRepo}
        </button>
      </form>

      {error && <div className="glass p-4 mb-4 text-xs text-rose-500">{error}</div>}

      {loading ? (
        <div className="glass p-8 text-center text-sm text-slate-400">{t.loadingWatchlist}</div>
      ) : items.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-slate-400">
          {t.watchlistEmpty}
        </div>
      ) : (
        <section className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Bell size={14} className="text-indigo-500" />
                  <strong className="text-sm text-slate-700">{item.repository_full_name}</strong>
                  <span className="px-2 py-0.5 glass-sm text-[10px] uppercase text-slate-400">
                    {item.cadence === 'daily' ? t.daily : t.weekly}
                  </span>
                  {item.has_webhook && (
                    <span className="px-2 py-0.5 glass-sm text-[10px] text-emerald-500">Webhook</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t.nextCheck} {new Date(item.next_check_at).toLocaleString(dateLocale)}
                  {item.last_checked_at ? ` · ${t.lastChecked} ${new Date(item.last_checked_at).toLocaleString(dateLocale)}` : ''}
                </p>
                {item.last_alerts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {item.last_alerts.map((alert, idx) => (
                      <p key={idx} className="text-xs text-amber-500 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> <strong>{alert.title}:</strong> {alert.detail}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {item.last_analysis_id && (
                  <Link to={`/analysis/${item.last_analysis_id}`} className="report-action">{t.latestReport}</Link>
                )}
                <button type="button" className="report-action" onClick={() => handleRunNow(item.id)}>
                  <Play size={13} /> {t.runNow}
                </button>
                <button type="button" className="report-action" onClick={() => handleUnsubscribe(item.id)}>
                  <Trash2 size={13} /> {t.remove}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
