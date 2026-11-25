import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import anime from 'animejs';
import { getAnalysis, getAnalysisHistory, cancelAnalysis, retryAnalysis, AnalysisDetail, AnalysisHistoryItem } from '../api/client';
import { Loader2, AlertCircle, Download, Clock3, ArrowLeft, Activity } from 'lucide-react';
import LanguagePieChart from '../components/LanguagePieChart';
import ContributorRanking from '../components/ContributorRanking';
import MetricsGrid from '../components/MetricsGrid';
import AIInsightsPanel from '../components/AIInsightsPanel';
import CommitFrequencyChart from '../components/CommitFrequencyChart';
import RepositoryHealthPanel from '../components/RepositoryHealthPanel';

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const data = await getAnalysis(id);
        if (!active) return;
        setAnalysis(data);
        if (data.status === 'completed') {
          const items = await getAnalysisHistory(data.repository_id);
          if (active) setHistory(items);
        }
        if (data.status === 'pending' || data.status === 'in_progress') timer = setTimeout(poll, 2500);
        else setLoading(false);
      } catch (err: any) {
        if (!active) return;
        setError(err.response?.data?.error || 'Could not load this analysis.');
        setLoading(false);
      }
    };
    setAnalysis(null);
    setHistory([]);
    setLoading(true);
    setError('');
    poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [id]);

  useEffect(() => {
    if (!analysis || analysis.status !== 'completed' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    anime({ targets: '.analysis-section', opacity: [0, 1], translateY: [16, 0], delay: anime.stagger(85), duration: 650, easing: 'easeOutCubic' });
  }, [analysis?.id, analysis?.status]);

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

  if (error) return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> BACK TO REPOPULSE</Link><div className="glass p-8 text-center max-w-lg mx-auto"><AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" /><h1 className="analysis-section-title justify-center">Analysis unavailable</h1><p className="text-sm mt-3">{error}</p></div></div>;

  if (!analysis || loading) return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> REPOPULSE / NEW ANALYSIS</Link><div className="glass p-8 md:p-12 max-w-2xl mx-auto text-center"><div className="loading-orbit"><Activity size={23} /></div><span className="analysis-overline">REPOSITORY SCAN IN PROGRESS</span><h1 className="loading-title">Reading the signals.</h1><p className="loading-copy">{analysis?.progress_stage || 'Connecting to GitHub and collecting repository data…'}</p><div className="loading-track"><i /></div><p className="loading-foot">This usually takes less than a minute</p><Loader2 size={15} className="loading-spinner" />{analysis && <button type="button" className="report-action mt-5" onClick={handleCancel}>Cancel analysis</button>}</div></div>;

  if (analysis.status === 'failed' || analysis.status === 'cancelled') return <div className="analysis-page"><Link to="/" className="analysis-topline"><ArrowLeft size={14} /> BACK TO REPOPULSE</Link><div className="glass p-8 text-center max-w-lg mx-auto"><AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" /><span className="analysis-overline">{analysis.status === 'cancelled' ? 'SCAN CANCELLED' : 'SCAN INTERRUPTED'}</span><h1 className="loading-title">{analysis.status === 'cancelled' ? 'Analysis stopped.' : 'We hit a snag.'}</h1><p className="text-sm mt-2">{analysis.error_message || 'The repository could not be analyzed.'}</p>{analysis.status === 'failed' && <button type="button" className="report-action mt-5" onClick={handleRetry}>Retry analysis</button>}</div></div>;

  return <div className="analysis-page">
    <Link to="/" className="analysis-topline"><ArrowLeft size={14} /> REPOPULSE <span>/</span> REPOSITORY REPORT</Link>
    <section className="analysis-head analysis-section">
      <div><span className="analysis-overline">PROJECT INTELLIGENCE · {analysis.id.slice(0, 8).toUpperCase()}</span><h1>Repository report</h1><p>{analysis.commits_count.toLocaleString()} commits analyzed <span className="report-sep">·</span> {analysis.completed_at ? new Date(analysis.completed_at).toLocaleString() : 'Just now'}</p></div>
      <div className="analysis-actions"><a href={`${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}/analyses/${analysis.id}/export.csv`} className="report-action" download><Download size={14} /> Export CSV</a><button className="report-action" onClick={() => window.print()}><Activity size={14} /> Save report</button></div>
    </section>
    <div className="analysis-section"><RepositoryHealthPanel health={analysis.health} /></div>
    <section className="analysis-section report-block"><div className="report-block-heading"><span className="section-index">01</span><div><span className="analysis-overline">PROJECT PULSE</span><h2>Engineering signals</h2></div></div><MetricsGrid metrics={analysis.metrics} /></section>
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 analysis-section"><LanguagePieChart distribution={analysis.metrics.language_distribution} /><CommitFrequencyChart data={analysis.metrics.commits_per_date} /></section>
    <section className="analysis-section"><div className="report-block-heading"><span className="section-index">02</span><div><span className="analysis-overline">THE PEOPLE</span><h2>Contribution map</h2></div></div><ContributorRanking contributors={analysis.contributors} /></section>
    <section className="analysis-section"><div className="report-block-heading"><span className="section-index">03</span><div><span className="analysis-overline">MACHINE-ASSISTED CONTEXT</span><h2>Project understanding</h2></div></div><AIInsightsPanel insights={analysis.ai_insights} /></section>
    {history.length > 1 && <section className="glass p-6 analysis-section"><div className="report-block-heading"><span className="section-index"><Clock3 size={16} /></span><div><span className="analysis-overline">LONGITUDINAL VIEW</span><h2>Analysis history</h2></div></div><div className="history-list">{history.map((item) => <Link key={item.id} to={`/analysis/${item.id}`} className={`history-row ${item.id === analysis.id ? 'history-current' : ''}`}><span>{new Date(item.created_at).toLocaleString()}</span><span className="history-status">{item.status}</span><strong>Health {item.health_score}<small> / 100</small></strong></Link>)}</div></section>}
  </div>;
}
