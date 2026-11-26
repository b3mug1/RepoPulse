import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import anime from 'animejs';
import {
  analyzeRepo,
  cancelAnalysis,
  createShareLink,
  getAnalysis,
  getAnalysisHistory,
  getSharedAnalysis,
  isRepoSaved,
  retryAnalysis,
  toggleSavedRepo,
  AnalysisDetail,
  AnalysisHistoryItem,
} from '../api/client';
import { Loader2, AlertCircle, Download, Clock3, ArrowLeft, Activity, RefreshCw, Bookmark, Share2, GitCompare, Check, Copy } from 'lucide-react';
import LanguagePieChart from '../components/LanguagePieChart';
import ContributorRanking from '../components/ContributorRanking';
import MetricsGrid from '../components/MetricsGrid';
import AIInsightsPanel from '../components/AIInsightsPanel';
import CommitFrequencyChart from '../components/CommitFrequencyChart';
import RepositoryHealthPanel from '../components/RepositoryHealthPanel';
import ExtendedSignalsPanel from '../components/ExtendedSignalsPanel';
import ActivityHeatmap from '../components/ActivityHeatmap';
import HealthTrendChart from '../components/HealthTrendChart';

function estimateProgressPercent(stage: string): number {
  const s = stage.toLowerCase();
  if (s.includes('completed')) return 100;
  if (s.includes('generating ai')) return 90;
  if (s.includes('calculating')) return 80;
  const match = s.match(/\((\d+)\/(\d+)\)/);
  if (match) {
    const done = Number(match[1]);
    const total = Math.max(Number(match[2]), 1);
    return Math.min(75, 30 + Math.round((done / total) * 45));
  }
  if (s.includes('fetching')) return 20;
  if (s.includes('retrying')) return 15;
  return 10;
}

export default function AnalysisPage() {
  const { id, token } = useParams<{ id?: string; token?: string }>();
  const navigate = useNavigate();
  const isSharedMode = Boolean(token);
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareHours, setShareHours] = useState(72);
  const [shareAi, setShareAi] = useState(true);
  const [shareContributors, setShareContributors] = useState(true);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [badgeCopied, setBadgeCopied] = useState(false);

  useEffect(() => {
    if (!id && !token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const data = token ? await getSharedAnalysis(token) : await getAnalysis(id!);
        if (!active) return;
        setAnalysis(data);
        if (data.repository_full_name) {
          setSaved(isRepoSaved(data.repository_full_name));
        }
        if (!token && data.status === 'completed') {
          const items = await getAnalysisHistory(data.repository_id);
          if (active) setHistory(items);
        }
        if (!token && (data.status === 'pending' || data.status === 'in_progress')) {
          timer = setTimeout(poll, 2500);
        } else {
          setLoading(false);
        }
      } catch (err: any) {
        if (!active) return;
        setError(err.response?.data?.detail || err.response?.data?.error || 'Could not load this analysis.');
        setLoading(false);
      }
    };
    setAnalysis(null);
    setHistory([]);
    setShareUrl('');
    setShareOpen(false);
    setLoading(true);
    setError('');
    poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [id, token]);

  const analysisId = analysis?.id;
  const analysisStatus = analysis?.status;
  const repoTitle = analysis?.repository_full_name;
  useEffect(() => {
    if (repoTitle) {
      document.title = `${repoTitle} — RepoPulse`;
    }
    return () => {
      document.title = 'RepoPulse — Open-source intelligence';
    };
  }, [repoTitle]);

  useEffect(() => {
    if (!analysisId || analysisStatus !== 'completed' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    anime({ targets: '.analysis-section', opacity: [0, 1], translateY: [16, 0], delay: anime.stagger(85), duration: 650, easing: 'easeOutCubic' });
  }, [analysisId, analysisStatus]);

  const handleCancel = async () => {
    if (!analysis) return;
    try {
      await cancelAnalysis(analysis.id);
      setAnalysis({ ...analysis, status: 'cancelled', error_message: 'Analysis cancelled by the user', progress_stage: 'Cancelled' });
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not cancel this analysis.');
    }
  };

  const handleRetry = async () => {
    if (!analysis) return;
    try {
      const result = await retryAnalysis(analysis.id);
      window.location.assign(`/analysis/${result.analysis_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not retry this analysis.');
    }
  };

  const handleReanalyze = async () => {
    if (!analysis?.repository_owner || !analysis?.repository_name) return;
    setReanalyzing(true);
    try {
      const result = await analyzeRepo(analysis.repository_owner, analysis.repository_name);
      navigate(`/analysis/${result.analysis_id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not start re-analysis.');
    } finally {
      setReanalyzing(false);
    }
  };

  const handleToggleSave = () => {
    if (!analysis?.repository_full_name) return;
    toggleSavedRepo(analysis.repository_full_name);
    setSaved(isRepoSaved(analysis.repository_full_name));
  };

  const handleCreateShare = async () => {
    if (!analysis) return;
    try {
      const res = await createShareLink(analysis.id, {
        expires_in_hours: shareHours,
        include_ai_insights: shareAi,
        include_contributors: shareContributors,
      });
      setShareUrl(`${window.location.origin}/shared/${res.token}`);
      setCopied(false);
    } catch {
      setError('Could not create share link.');
    }
  };

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> BACK TO REPOPULSE</Link><div className="glass p-8 text-center max-w-lg mx-auto"><AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" /><h1 className="analysis-section-title justify-center">Analysis unavailable</h1><p className="text-sm mt-3">{error}</p></div></div>;

  if (!analysis || loading) {
    const progressPercent = estimateProgressPercent(analysis?.progress_stage || 'queued');
    return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> REPOPULSE / NEW ANALYSIS</Link><div className="glass p-8 md:p-12 max-w-2xl mx-auto text-center"><div className="loading-orbit"><Activity size={23} /></div><span className="analysis-overline">REPOSITORY SCAN IN PROGRESS · {progressPercent}%</span><h1 className="loading-title">Reading the signals.</h1><p className="loading-copy">{analysis?.progress_stage || 'Connecting to GitHub and collecting repository data…'}</p><div className="w-full max-w-sm mx-auto h-1.5 bg-slate-100 rounded-full overflow-hidden mt-5"><div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} /></div><p className="loading-foot mt-3">This usually takes less than a minute</p><Loader2 size={15} className="loading-spinner" />{analysis && !isSharedMode && <button type="button" className="report-action mt-5" onClick={handleCancel}>Cancel analysis</button>}</div></div>;
  }

  if (analysis.status === 'failed' || analysis.status === 'cancelled') return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> BACK TO REPOPULSE</Link><div className="glass p-8 text-center max-w-lg mx-auto"><AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" /><span className="analysis-overline">{analysis.status === 'cancelled' ? 'SCAN CANCELLED' : 'SCAN INTERRUPTED'}</span><h1 className="loading-title">{analysis.status === 'cancelled' ? 'Analysis stopped.' : 'We hit a snag.'}</h1><p className="text-sm mt-2">{analysis.error_message || 'The repository could not be analyzed.'}</p>{!isSharedMode && (analysis.status === 'failed' || analysis.status === 'cancelled') && <button type="button" className="report-action mt-5" onClick={handleRetry}>Retry analysis</button>}</div></div>;

  const previousCompleted = history.find((item) => item.id !== analysis.id && item.status === 'completed');

  return <div className="analysis-page">
    <Link to="/" className="analysis-topline"><ArrowLeft size={14} /> REPOPULSE <span>/</span> {isSharedMode ? 'SHARED REPORT' : 'REPOSITORY REPORT'}</Link>
    <section className="analysis-head analysis-section">
      <div>
        <span className="analysis-overline">PROJECT INTELLIGENCE · {analysis.id.slice(0, 8).toUpperCase()}</span>
        <h1>{analysis.repository_full_name || 'Repository report'}</h1>
        <p>
          {analysis.sample_scope.sampled_commits.toLocaleString()} sampled commits
          {analysis.sample_scope.is_truncated ? ` (capped at latest ${analysis.sample_scope.max_commits_limit} / ${analysis.sample_scope.max_pages_limit} pages)` : ''}
          {analysis.sample_scope.window_start_at && analysis.sample_scope.window_end_at
            ? ` · ${new Date(analysis.sample_scope.window_start_at).toLocaleDateString()} – ${new Date(analysis.sample_scope.window_end_at).toLocaleDateString()} (${analysis.sample_scope.timezone})`
            : ''}
          <span className="report-sep">·</span>
          {analysis.completed_at ? new Date(analysis.completed_at).toLocaleString() : 'Just now'}
        </p>
      </div>
      {!isSharedMode && (
        <div className="analysis-actions flex-wrap">
          {analysis.repository_owner && analysis.repository_name && (
            <button type="button" className="report-action" onClick={handleReanalyze} disabled={reanalyzing}>
              <RefreshCw size={14} className={reanalyzing ? 'spin' : ''} /> Re-analyze
            </button>
          )}
          {previousCompleted && (
            <Link to={`/compare?left=${previousCompleted.id}&right=${analysis.id}`} className="report-action">
              <GitCompare size={14} /> Compare previous
            </Link>
          )}
          {analysis.repository_full_name && (
            <button type="button" className="report-action" onClick={handleToggleSave}>
              <Bookmark size={14} /> {saved ? 'Saved' : 'Save repo'}
            </button>
          )}
          <button type="button" className="report-action" onClick={() => setShareOpen((v) => !v)}>
            <Share2 size={14} /> Share
          </button>
          {analysis.repository_owner && analysis.repository_name && (
            <button type="button" className="report-action" onClick={() => setBadgeOpen((v) => !v)}>
              Badge
            </button>
          )}
          <a href={`${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}/analyses/${analysis.id}/export.csv`} className="report-action" download><Download size={14} /> Export CSV</a>
          <button type="button" className="report-action" onClick={() => window.print()}><Activity size={14} /> PDF / Print</button>
        </div>
      )}
    </section>

    {shareOpen && !isSharedMode && (
      <section className="glass p-5 mb-6 analysis-actions-panel">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Public share link</h3>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <label className="flex items-center gap-2">
            <span>Expires in</span>
            <select value={shareHours} onChange={(e) => setShareHours(Number(e.target.value))} className="glass-sm px-2 py-1">
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
              <option value={720}>30 days</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={shareAi} onChange={(e) => setShareAi(e.target.checked)} />
            <span>Include AI insights</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={shareContributors} onChange={(e) => setShareContributors(e.target.checked)} />
            <span>Include contributors</span>
          </label>
          <button type="button" className="report-action" onClick={handleCreateShare}>Generate link</button>
        </div>
        {shareUrl && (
          <div className="mt-3 flex items-center gap-2">
            <input readOnly value={shareUrl} aria-label="Generated public share URL" className="glass-sm px-3 py-1.5 text-xs w-full text-slate-700" />
            <button type="button" className="report-action shrink-0" onClick={handleCopyShare}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <span className="sr-only" role="status" aria-live="polite">{copied ? 'Share link copied to clipboard' : ''}</span>
          </div>
        )}
      </section>
    )}
    {badgeOpen && !isSharedMode && analysis.repository_owner && analysis.repository_name && (() => {
      const apiBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/api/v1`).replace(/\/$/, '');
      const badgeUrl = `${apiBase}/repos/${analysis.repository_owner}/${analysis.repository_name}/badge.svg`;
      const markdown = `[![RepoPulse](${badgeUrl})](${window.location.origin}/analysis/${analysis.id})`;
      return (
        <section className="glass p-5 mb-6 analysis-actions-panel">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">README Health Badge</h3>
            <img src={badgeUrl} alt={`RepoPulse Health badge for ${analysis.repository_full_name}`} className="h-5" />
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={markdown} aria-label="Markdown badge snippet" className="glass-sm px-3 py-1.5 text-xs w-full text-slate-700 font-mono" />
            <button
              type="button"
              className="report-action shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(markdown);
                setBadgeCopied(true);
                setTimeout(() => setBadgeCopied(false), 2000);
              }}
            >
              {badgeCopied ? <Check size={14} /> : <Copy size={14} />} {badgeCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </section>
      );
    })()}
    {analysis.health.coverage < 100 && (
      <div className="glass p-4 mb-5 text-xs text-slate-400" role="status">
        Partial result: {analysis.health.coverage}% of weighted Health Score signals were measured. Unavailable signals are excluded rather than scored as zero.
      </div>
    )}
    <div className="analysis-section"><RepositoryHealthPanel health={analysis.health} /></div>
    <section className="analysis-section report-block"><div className="report-block-heading"><span className="section-index">01</span><div><span className="analysis-overline">PROJECT PULSE</span><h2>Engineering signals</h2></div></div><MetricsGrid metrics={analysis.metrics} /></section>
    <div className="analysis-section mt-4"><ExtendedSignalsPanel signals={analysis.extended_signals} /></div>
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 analysis-section"><LanguagePieChart distribution={analysis.metrics.language_distribution} /><CommitFrequencyChart data={analysis.metrics.commits_per_date} /></section>
    <div className="analysis-section mt-4"><ActivityHeatmap data={analysis.metrics.commits_per_date} referenceDate={analysis.sample_scope.window_end_at} /></div>
    <section className="analysis-section">
      <div className="report-block-heading"><span className="section-index">02</span><div><span className="analysis-overline">THE PEOPLE</span><h2>Contribution map</h2></div></div>
      {analysis.contributors.length > 0 ? (
        <ContributorRanking contributors={analysis.contributors} />
      ) : (
        <div className="glass p-6 text-sm text-slate-400">No contributor activity found in this commit sample.</div>
      )}
    </section>
    {(analysis.ai_insights.ai_summary || analysis.ai_insights.detected_tech_stack.length > 0 || analysis.ai_insights.ai_metadata?.status === 'unavailable') && (
      <section className="analysis-section"><div className="report-block-heading"><span className="section-index">03</span><div><span className="analysis-overline">MACHINE-ASSISTED CONTEXT</span><h2>Project understanding</h2></div></div><AIInsightsPanel insights={analysis.ai_insights} /></section>
    )}
    {!isSharedMode && history.length > 1 && <section className="glass p-6 analysis-section"><div className="report-block-heading"><span className="section-index"><Clock3 size={16} /></span><div><span className="analysis-overline">LONGITUDINAL VIEW</span><h2>Analysis history</h2></div></div><HealthTrendChart history={history} /><div className="history-list">{history.map((item) => <Link key={item.id} to={`/analysis/${item.id}`} className={`history-row ${item.id === analysis.id ? 'history-current' : ''}`}><span>{new Date(item.created_at).toLocaleString()}</span><span className="history-status">{item.status}</span><strong>Health {item.health_score ?? '—'}<small> / 100</small></strong></Link>)}</div></section>}
    <footer className="mt-8 text-[11px] text-slate-400 border-t border-white/40 pt-4">
      Limitations: Metrics are computed from up to {analysis.sample_scope.max_commits_limit} sampled commits ({analysis.sample_scope.timezone}) and GitHub metadata. RepoPulse does not measure individual developer productivity.
    </footer>
  </div>;
}
