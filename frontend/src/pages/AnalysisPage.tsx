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
  subscribeWatchlist,
  toggleSavedRepo,
  AnalysisDetail,
  AnalysisHistoryItem,
} from '../api/client';
import { useLocale } from '../i18n';
import { Loader2, AlertCircle, Download, Clock3, ArrowLeft, Activity, RefreshCw, Bookmark, Share2, GitCompare, Check, Copy, Bell, Info } from 'lucide-react';
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
  const { t, dateLocale } = useLocale();
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
  const [watched, setWatched] = useState(false);

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
        setError(err.response?.data?.detail || err.response?.data?.error || t.analysisLoadError);
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
  }, [id, token, t.analysisLoadError]);

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
      setAnalysis({ ...analysis, status: 'cancelled', error_message: t.analysisCancelledByUser, progress_stage: t.statusCancelled });
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || t.analysisCancelError);
    }
  };

  const handleRetry = async () => {
    if (!analysis) return;
    try {
      const result = await retryAnalysis(analysis.id);
      window.location.assign(`/analysis/${result.analysis_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || t.analysisRetryError);
    }
  };

  const handleReanalyze = async () => {
    if (!analysis?.repository_owner || !analysis?.repository_name) return;
    setReanalyzing(true);
    try {
      const result = await analyzeRepo(analysis.repository_owner, analysis.repository_name);
      navigate(`/analysis/${result.analysis_id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || t.analysisReanalyzeError);
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
      setError(t.shareCreateError);
    }
  };

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusLabel = (s: string) => {
    if (s === 'completed') return t.statusCompleted;
    if (s === 'in_progress') return t.statusInProgress;
    if (s === 'pending') return t.statusPending;
    if (s === 'failed') return t.statusFailed;
    if (s === 'cancelled') return t.statusCancelled;
    return s;
  };

  if (error) return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> {t.backToRepoPulse}</Link><div className="glass p-8 text-center max-w-lg mx-auto"><AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" /><h1 className="analysis-section-title justify-center">{t.analysisUnavailable}</h1><p className="text-sm mt-3">{error}</p></div></div>;

  if (!analysis || loading) {
    const progressPercent = estimateProgressPercent(analysis?.progress_stage || 'queued');
    return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> {t.newAnalysisTopline}</Link><div className="glass p-8 md:p-12 max-w-2xl mx-auto text-center"><div className="loading-orbit"><Activity size={23} /></div><span className="analysis-overline">{t.scanInProgress} · {progressPercent}%</span><h1 className="loading-title">{t.readingSignals}</h1><p className="loading-copy">{analysis?.progress_stage || t.connectingGitHub}</p><div className="w-full max-w-sm mx-auto h-1.5 bg-slate-100 rounded-full overflow-hidden mt-5"><div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} /></div><p className="loading-foot mt-3">{t.takesLessMinute}</p><Loader2 size={15} className="loading-spinner" />{analysis && !isSharedMode && <button type="button" className="report-action mt-5" onClick={handleCancel}>{t.cancelAnalysis}</button>}</div></div>;
  }

  if (analysis.status === 'failed' || analysis.status === 'cancelled') return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> {t.backToRepoPulse}</Link><div className="glass p-8 text-center max-w-lg mx-auto"><AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" /><span className="analysis-overline">{analysis.status === 'cancelled' ? t.scanCancelled : t.scanInterrupted}</span><h1 className="loading-title">{analysis.status === 'cancelled' ? t.analysisStopped : t.weHitSnag}</h1><p className="text-sm mt-2">{analysis.error_message || t.repoCouldNotAnalyze}</p>{!isSharedMode && (analysis.status === 'failed' || analysis.status === 'cancelled') && <button type="button" className="report-action mt-5" onClick={handleRetry}>{t.retryAnalysis}</button>}</div></div>;

  const previousCompleted = history.find((item) => item.id !== analysis.id && item.status === 'completed');

  return <div className="analysis-page">
    <Link to="/" className="analysis-topline"><ArrowLeft size={14} /> REPOPULSE <span>/</span> {isSharedMode ? t.sharedReport : t.repositoryReport}</Link>
    <section className="analysis-head analysis-section">
      <div>
        <span className="analysis-overline">{t.projectIntelligence} · {analysis.id.slice(0, 8).toUpperCase()}</span>
        <h1>{analysis.repository_full_name || t.repositoryReportTitle}</h1>
        <p>
          {analysis.sample_scope.sampled_commits.toLocaleString(dateLocale)} {t.sampledCommitsText}
          {analysis.sample_scope.is_truncated ? ` (${t.cappedAtLatest} ${analysis.sample_scope.max_commits_limit} / ${analysis.sample_scope.max_pages_limit} ${t.pagesWord})` : ''}
          {analysis.sample_scope.window_start_at && analysis.sample_scope.window_end_at
            ? ` · ${new Date(analysis.sample_scope.window_start_at).toLocaleDateString(dateLocale)} – ${new Date(analysis.sample_scope.window_end_at).toLocaleDateString(dateLocale)} (${analysis.sample_scope.timezone})`
            : ''}
          <span className="report-sep">·</span>
          {analysis.completed_at ? new Date(analysis.completed_at).toLocaleString(dateLocale) : t.justNow}
        </p>
      </div>
      {!isSharedMode && (
        <div className="analysis-actions flex-wrap justify-end">
          {analysis.repository_owner && analysis.repository_name && (
            <button
              type="button"
              className="report-action border-[#cbff60]/40 bg-[#cbff60]/10 text-[#cbff60] hover:bg-[#cbff60]/15"
              onClick={handleReanalyze}
              disabled={reanalyzing}
            >
              <RefreshCw size={14} className={reanalyzing ? 'spin' : ''} /> {t.reAnalyze}
            </button>
          )}
          {previousCompleted && (
            <Link to={`/compare?left=${previousCompleted.id}&right=${analysis.id}`} className="report-action">
              <GitCompare size={14} /> {t.comparePrevious}
            </Link>
          )}
          {analysis.repository_full_name && (
            <button type="button" className="report-action" onClick={handleToggleSave}>
              <Bookmark size={14} /> {saved ? t.savedLabel : t.saveRepo}
            </button>
          )}
          {analysis.repository_owner && analysis.repository_name && (
            <button
              type="button"
              className="report-action"
              onClick={async () => {
                try {
                  await subscribeWatchlist({
                    owner: analysis.repository_owner,
                    name: analysis.repository_name,
                    cadence: 'weekly',
                  });
                  setWatched(true);
                } catch {
                  setError(t.watchlistAddError);
                }
              }}
            >
              <Bell size={14} /> {watched ? t.watchingLabel : t.watchLabel}
            </button>
          )}
          <button type="button" className="report-action" onClick={() => setShareOpen((v) => !v)}>
            <Share2 size={14} /> {t.shareLabel}
          </button>
          {analysis.repository_owner && analysis.repository_name && (
            <button type="button" className="report-action" onClick={() => setBadgeOpen((v) => !v)}>
              {t.badgeLabel}
            </button>
          )}
          <a href={`${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}/analyses/${analysis.id}/export.csv`} className="report-action" download><Download size={14} /> {t.exportCsv}</a>
          <button type="button" className="report-action" onClick={() => window.print()}><Activity size={14} /> {t.pdfPrint}</button>
        </div>
      )}
    </section>

    {shareOpen && !isSharedMode && (
      <section className="glass p-5 mb-6 analysis-actions-panel">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{t.publicShareLink}</h3>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <label className="flex items-center gap-2">
            <span>{t.expiresIn}</span>
            <select value={shareHours} onChange={(e) => setShareHours(Number(e.target.value))} className="glass-sm px-2 py-1">
              <option value={24}>{t.hours24}</option>
              <option value={72}>{t.days3}</option>
              <option value={168}>{t.days7}</option>
              <option value={720}>{t.days30}</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={shareAi} onChange={(e) => setShareAi(e.target.checked)} />
            <span>{t.includeAiInsights}</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={shareContributors} onChange={(e) => setShareContributors(e.target.checked)} />
            <span>{t.includeContributors}</span>
          </label>
          <button type="button" className="report-action" onClick={handleCreateShare}>{t.generateLink}</button>
        </div>
        {shareUrl && (
          <div className="mt-3 flex items-center gap-2">
            <input readOnly value={shareUrl} aria-label={t.shareUrlAria} className="glass-sm px-3 py-1.5 text-xs w-full text-slate-700" />
            <button type="button" className="report-action shrink-0" onClick={handleCopyShare}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t.copied : t.copy}
            </button>
            <span className="sr-only" role="status" aria-live="polite">{copied ? t.shareCopiedAnnouncement : ''}</span>
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.readmeHealthBadge}</h3>
            <img src={badgeUrl} alt={`${t.badgeAltPrefix} ${analysis.repository_full_name}`} className="h-5" />
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={markdown} aria-label={t.badgeSnippetAria} className="glass-sm px-3 py-1.5 text-xs w-full text-slate-700 font-mono" />
            <button
              type="button"
              className="report-action shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(markdown);
                setBadgeCopied(true);
                setTimeout(() => setBadgeCopied(false), 2000);
              }}
            >
              {badgeCopied ? <Check size={14} /> : <Copy size={14} />} {badgeCopied ? t.copied : t.copy}
            </button>
          </div>
        </section>
      );
    })()}
    {analysis.health.coverage < 100 && (
      <div className="flex items-center gap-2.5 px-4 py-2.5 mb-5 rounded-xl border border-amber-400/20 bg-amber-400/5 text-xs text-amber-200/80" role="status">
        <Info size={14} className="text-amber-400 shrink-0" />
        <span>{t.partialResultPrefix} {analysis.health.coverage}% {t.partialResultSuffix}</span>
      </div>
    )}
    <div className="analysis-section"><RepositoryHealthPanel health={analysis.health} /></div>
    <section className="analysis-section report-block"><div className="report-block-heading"><span className="section-index">01</span><div><span className="analysis-overline">{t.projectPulse}</span><h2>{t.engineeringSignals}</h2></div></div><MetricsGrid metrics={analysis.metrics} /></section>
    <div className="analysis-section mt-4"><ExtendedSignalsPanel signals={analysis.extended_signals} /></div>
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 analysis-section"><LanguagePieChart distribution={analysis.metrics.language_distribution} /><CommitFrequencyChart data={analysis.metrics.commits_per_date} /></section>
    <div className="analysis-section mt-4"><ActivityHeatmap data={analysis.metrics.commits_per_date} referenceDate={analysis.sample_scope.window_end_at} /></div>
    <section className="analysis-section">
      <div className="report-block-heading"><span className="section-index">02</span><div><span className="analysis-overline">{t.thePeople}</span><h2>{t.contributionMap}</h2></div></div>
      {analysis.contributors.length > 0 ? (
        <ContributorRanking contributors={analysis.contributors} />
      ) : (
        <div className="glass p-6 text-sm text-slate-400">{t.noContributorActivity}</div>
      )}
    </section>
    {(analysis.ai_insights.ai_summary || analysis.ai_insights.detected_tech_stack.length > 0 || analysis.ai_insights.ai_metadata?.status === 'unavailable') && (
      <section className="analysis-section"><div className="report-block-heading"><span className="section-index">03</span><div><span className="analysis-overline">{t.machineAssistedContext}</span><h2>{t.projectUnderstanding}</h2></div></div><AIInsightsPanel insights={analysis.ai_insights} /></section>
    )}
    {!isSharedMode && history.length > 1 && <section className="glass p-6 analysis-section"><div className="report-block-heading"><span className="section-index"><Clock3 size={16} /></span><div><span className="analysis-overline">{t.longitudinalView}</span><h2>{t.analysisHistoryHeading}</h2></div></div><HealthTrendChart history={history} /><div className="history-list">{history.map((item) => <Link key={item.id} to={`/analysis/${item.id}`} className={`history-row ${item.id === analysis.id ? 'history-current' : ''}`}><span>{new Date(item.created_at).toLocaleString(dateLocale)}</span><span className="history-status">{statusLabel(item.status)}</span><strong>{t.health} {item.health_score ?? '—'}<small> / 100</small></strong></Link>)}</div></section>}
    <footer className="mt-8 text-[11px] text-slate-400 border-t border-white/40 pt-4">
      {t.limitationsFooterPrefix} {analysis.sample_scope.max_commits_limit} ({analysis.sample_scope.timezone}) {t.limitationsFooterSuffix}
    </footer>
  </div>;
}
