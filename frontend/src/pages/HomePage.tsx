import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import anime from 'animejs';
import { analyzeRepo, getAllAnalysisHistory, getSavedRepos, GlobalHistoryItem } from '../api/client';
import { Search, Loader2, ArrowUpRight, BarChart3, Brain, GitFork, ShieldCheck, GitCommitHorizontal, Sparkles, Activity, Command, Bookmark, Clock3 } from 'lucide-react';

const features = [
  { icon: BarChart3, number: '01', title: 'Signal over noise', desc: 'A clear picture of velocity, code churn and the rhythm of a project.' },
  { icon: GitFork, number: '02', title: 'People behind code', desc: 'Understand contribution patterns and spot knowledge bottlenecks.' },
  { icon: Brain, number: '03', title: 'Context, not just charts', desc: 'AI reads the README and repository structure to explain what matters.' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedRepos] = useState<string[]>(() => getSavedRepos());
  const [recentAnalyses, setRecentAnalyses] = useState<GlobalHistoryItem[]>([]);

  useEffect(() => {
    getAllAnalysisHistory({ limit: 4, sort_by: 'created_at', sort_order: 'desc' })
      .then((res) => setRecentAnalyses(res.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = anime.timeline({ easing: 'easeOutExpo' });
    animation
      .add({ targets: '.hero-eyebrow', opacity: [0, 1], translateY: [12, 0], duration: 550 })
      .add({ targets: '.hero-title .word', opacity: [0, 1], translateY: [28, 0], delay: anime.stagger(85), duration: 750 }, '-=320')
      .add({ targets: '.hero-copy, .search-card, .hero-meta', opacity: [0, 1], translateY: [18, 0], delay: anime.stagger(100), duration: 650 }, '-=520')
      .add({ targets: '.preview-card', opacity: [0, 1], translateY: [24, 0], scale: [0.98, 1], duration: 850 }, '-=480')
      .add({ targets: '.feature-card', opacity: [0, 1], translateY: [18, 0], delay: anime.stagger(90), duration: 600 }, '-=600');
    anime({ targets: '.pulse-wave', strokeDashoffset: [anime.setDashoffset, 0], duration: 1800, easing: 'easeInOutSine', direction: 'alternate', loop: true });
    return () => { animation.pause(); anime.remove('.pulse-wave'); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parts = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '').split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1] || parts.some((part) => !/^[\w.-]+$/.test(part))) {
      setError('Enter a GitHub repository as owner/repo.');
      return;
    }
    setLoading(true);
    try {
      const result = await analyzeRepo(parts[0], parts[1]);
      navigate(`/analysis/${result.analysis_id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not start analysis. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <section className="hero-grid">
        <div className="hero-content">
          <div className="hero-eyebrow"><span className="eyebrow-line" /> OPEN-SOURCE INTELLIGENCE <span className="eyebrow-dot">✳</span></div>
          <h1 className="hero-title"><span className="word">See the work.</span><br /><span className="word title-accent">Understand</span><br /><span className="word">the why.</span></h1>
          <p className="hero-copy">A living pulse check for any GitHub project. Explore the code, people, and momentum behind the repositories shaping the future.</p>

          <form onSubmit={handleSubmit} className="search-card">
            <div className="search-label"><span>START WITH A REPOSITORY</span><span className="keyboard-hint"><Command size={11} /> ENTER</span></div>
            <div className="search-row">
              <Search className="search-icon" size={19} />
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="owner / repository" aria-label="GitHub repository" disabled={loading} />
              <button type="submit" disabled={loading} aria-label="Analyze repository">{loading ? <Loader2 size={19} className="spin" /> : <ArrowUpRight size={20} />}</button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="search-foot"><span><i /> PUBLIC REPOSITORIES</span><span>Try <button type="button" onClick={() => setInput('vercel/next.js')}>vercel/next.js</button></span></div>
          </form>
          <div className="hero-meta"><span><ShieldCheck size={14} /> Read-only analysis</span><span className="meta-separator" /><span><Sparkles size={14} /> AI-assisted insights</span></div>
        </div>

        <div className="preview-wrap" aria-label="Preview of RepoPulse analytics dashboard">
          <div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" />
          <div className="preview-card">
            <div className="preview-top"><div className="window-dots"><i /><i /><i /></div><span className="preview-label"><Activity size={12} /> LIVE REPOSITORY SIGNAL</span><span className="preview-menu">···</span></div>
            <div className="repo-heading"><div className="repo-avatar">N</div><div><p className="repo-name">northstar / orbit-ui</p><p className="repo-description">A design system for teams that move fast.</p></div><span className="repo-visibility">PUBLIC</span></div>
            <div className="preview-score-row"><div><span className="tiny-label">PROJECT HEALTH</span><div className="score-wrap"><strong>86</strong><span>/ 100</span><b>↗ 8.4%</b></div></div><div className="score-ring"><svg viewBox="0 0 100 100"><circle className="ring-track" cx="50" cy="50" r="42" /><circle className="ring-value" cx="50" cy="50" r="42" /></svg><span>86</span></div></div>
            <div className="preview-chart-head"><span>Contribution activity</span><span>LAST 30 DAYS <span className="chart-caret">⌄</span></span></div>
            <div className="chart-area"><div className="chart-guides"><i /><i /><i /></div><svg className="activity-chart" viewBox="0 0 470 118" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#cbff60" stopOpacity=".2" /><stop offset="100%" stopColor="#cbff60" stopOpacity="0" /></linearGradient></defs><path d="M0 101 C18 95 23 80 39 87 S61 104 76 81 S99 73 111 83 S133 50 151 59 S177 76 188 51 S211 43 228 59 S251 72 263 42 S282 20 297 39 S314 57 329 34 S348 51 364 26 S383 35 398 21 S418 32 432 12 S455 23 470 5 V118 H0Z" fill="url(#chartFill)"/><path className="pulse-wave" d="M0 101 C18 95 23 80 39 87 S61 104 76 81 S99 73 111 83 S133 50 151 59 S177 76 188 51 S211 43 228 59 S251 72 263 42 S282 20 297 39 S314 57 329 34 S348 51 364 26 S383 35 398 21 S418 32 432 12 S455 23 470 5" fill="none" stroke="#caff57" strokeWidth="2.5" strokeLinecap="round" /></svg><div className="chart-axis"><span>JUN 01</span><span>JUN 08</span><span>JUN 15</span><span>JUN 22</span><span>JUN 30</span></div></div>
            <div className="preview-stats"><div><span>COMMITS</span><strong>1,284</strong><small>+12.8% <i>↗</i></small></div><div><span>CONTRIBUTORS</span><strong>24</strong><small>4 active today</small></div><div><span>BUS FACTOR</span><strong>4 <em>GOOD</em></strong><small>Healthy distribution</small></div></div>
            <div className="preview-languages"><span>TOP LANGUAGES</span><div className="language-bar"><i /><i /><i /><i /><i /></div><div className="language-legend"><span><i className="lang-js" /> TypeScript <b>48%</b></span><span><i className="lang-rs" /> Rust <b>26%</b></span><span><i className="lang-go" /> Go <b>16%</b></span></div></div>
            <div className="preview-bottom"><span><i /> ANALYSIS UPDATED 2 MIN AGO</span><span>VIEW FULL REPORT <ArrowUpRight size={11} /></span></div>
          </div>
          <div className="floating-note"><span className="note-icon"><GitCommitHorizontal size={15} /></span><span><b>Healthy momentum</b><small>Commit frequency is up 12.8%</small></span><span className="note-spark">↗</span></div>
        </div>
      </section>

      <section className="feature-section"><div className="section-kicker"><span>WHAT YOU GET</span><span>01 — 03</span></div><div className="features-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><div className="feature-top"><feature.icon size={18} /><span>{feature.number}</span></div><h2>{feature.title}</h2><p>{feature.desc}</p><div className="feature-rule" /></article>)}</div></section>
      {(savedRepos.length > 0 || recentAnalyses.length > 0) && (
        <section className="feature-section grid grid-cols-1 md:grid-cols-2 gap-4">
          {savedRepos.length > 0 && (
            <div className="glass p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                <Bookmark size={14} /> Saved repositories
              </div>
              <div className="flex flex-wrap gap-2">
                {savedRepos.map((repo) => (
                  <button key={repo} type="button" onClick={() => setInput(repo)} className="report-action">
                    {repo}
                  </button>
                ))}
              </div>
            </div>
          )}
          {recentAnalyses.length > 0 && (
            <div className="glass p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Clock3 size={14} /> Recent analyses
                </span>
                <Link to="/history" className="text-xs text-indigo-500">View all</Link>
              </div>
              <div className="space-y-2">
                {recentAnalyses.map((item) => (
                  <Link key={item.id} to={`/analysis/${item.id}`} className="flex items-center justify-between text-xs p-2 rounded-lg hover:bg-white/50">
                    <span className="font-medium text-slate-700 truncate">{item.repository_full_name}</span>
                    <span className="text-slate-400 shrink-0 ml-2">Health {item.health_score ?? '—'}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <section className="closing-note"><span className="closing-star">✳</span><p>Good software leaves a trail.<br /><span>Let’s read it together.</span></p><span className="closing-caption">BUILT FOR THE CURIOUS</span></section>
    </div>
  );
}
