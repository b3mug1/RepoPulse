import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import anime from 'animejs';
import { analyzeRepo, ExploreRepo, getAllAnalysisHistory, getExploreRepos, getSavedRepos, getStoredAuthToken, getUserGitHubRepos, GlobalHistoryItem, UserGitHubRepo } from '../api/client';
import { useLocale } from '../i18n';
import { Search, Loader2, ArrowUpRight, BarChart3, Brain, GitFork, ShieldCheck, GitCommitHorizontal, Sparkles, Activity, Command, Bookmark, Clock3, Compass, Star, Lock } from 'lucide-react';

function formatStars(stars: number): string {
  if (stars >= 1000) return `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k`;
  return String(stars);
}

function healthTone(score: number | null): string {
  if (score === null) return 'text-slate-500 bg-slate-100';
  if (score >= 80) return 'text-emerald-700 bg-emerald-100';
  if (score >= 50) return 'text-amber-700 bg-amber-100';
  return 'text-rose-700 bg-rose-100';
}

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedRepos] = useState<string[]>(() => getSavedRepos());
  const [recentAnalyses, setRecentAnalyses] = useState<GlobalHistoryItem[]>([]);
  const [exploreRepos, setExploreRepos] = useState<ExploreRepo[]>([]);
  const [userRepos, setUserRepos] = useState<UserGitHubRepo[]>([]);

  const curatedRepos = [
    { full_name: 'vercel/next.js', language: 'TypeScript', desc: t.curatedNextDesc },
    { full_name: 'facebook/react', language: 'JavaScript', desc: t.curatedReactDesc },
    { full_name: 'fastapi/fastapi', language: 'Python', desc: t.curatedFastapiDesc },
    { full_name: 'vitejs/vite', language: 'TypeScript', desc: t.curatedViteDesc },
    { full_name: 'astral-sh/ruff', language: 'Rust', desc: t.curatedRuffDesc },
    { full_name: 'tailwindlabs/tailwindcss', language: 'TypeScript', desc: t.curatedTailwindDesc },
  ];

  const features = [
    { icon: BarChart3, number: '01', title: t.feature1Title, desc: t.feature1Desc },
    { icon: GitFork, number: '02', title: t.feature2Title, desc: t.feature2Desc },
    { icon: Brain, number: '03', title: t.feature3Title, desc: t.feature3Desc },
  ];

  useEffect(() => {
    getAllAnalysisHistory({ limit: 4, sort_by: 'created_at', sort_order: 'desc' })
      .then((res) => setRecentAnalyses(res.items))
      .catch(() => {});
    getExploreRepos(6)
      .then(setExploreRepos)
      .catch(() => {});
    if (getStoredAuthToken()) {
      getUserGitHubRepos()
        .then((repos) => setUserRepos(repos.slice(0, 6)))
        .catch(() => {});
    }
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
      setError(t.invalidRepoError);
      return;
    }
    setLoading(true);
    try {
      const result = await analyzeRepo(parts[0], parts[1]);
      navigate(`/analysis/${result.analysis_id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || t.analyzeStartError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <section className="hero-grid">
        <div className="hero-content">
          <div className="hero-eyebrow"><span className="eyebrow-line" /> {t.heroEyebrow} <span className="eyebrow-dot">✳</span></div>
          <h1 className="hero-title"><span className="word">{t.heroTitle1}</span><br /><span className="word title-accent">{t.heroTitle2}</span><br /><span className="word">{t.heroTitle3}</span></h1>
          <p className="hero-copy">{t.heroCopy}</p>

          <form onSubmit={handleSubmit} className="search-card">
            <div className="search-label"><span>{t.startWithRepo}</span><span className="keyboard-hint"><Command size={11} /> {t.enterKey}</span></div>
            <div className="search-row">
              <Search className="search-icon" size={19} />
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.repoPlaceholder} aria-label={t.repoAriaLabel} disabled={loading} />
              <button type="submit" disabled={loading} aria-label={t.analyzeRepoAriaLabel}>{loading ? <Loader2 size={19} className="spin" /> : <ArrowUpRight size={20} />}</button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="search-foot"><span><i /> {t.publicRepositories}</span><span>{t.tryExample} <button type="button" onClick={() => setInput('vercel/next.js')}>vercel/next.js</button></span></div>
          </form>
          <div className="hero-meta"><span><ShieldCheck size={14} /> {t.readOnlyAnalysis}</span><span className="meta-separator" /><span><Sparkles size={14} /> {t.aiAssistedInsights}</span></div>
        </div>

        <div className="preview-wrap" aria-label={t.previewAriaLabel}>
          <div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" />
          <div className="preview-card">
            <div className="preview-top"><div className="window-dots"><i /><i /><i /></div><span className="preview-label"><Activity size={12} /> {t.previewLiveSignal}</span><span className="preview-menu">···</span></div>
            <div className="repo-heading"><div className="repo-avatar">N</div><div><p className="repo-name">northstar / orbit-ui</p><p className="repo-description">{t.previewRepoDesc}</p></div><span className="repo-visibility">{t.previewPublic}</span></div>
            <div className="preview-score-row"><div><span className="tiny-label">{t.previewProjectHealth}</span><div className="score-wrap"><strong>86</strong><span>/ 100</span><b>↗ 8.4%</b></div></div><div className="score-ring"><svg viewBox="0 0 100 100"><circle className="ring-track" cx="50" cy="50" r="42" /><circle className="ring-value" cx="50" cy="50" r="42" /></svg><span>86</span></div></div>
            <div className="preview-chart-head"><span>{t.previewContributionActivity}</span><span>{t.previewLast30Days} <span className="chart-caret">⌄</span></span></div>
            <div className="chart-area"><div className="chart-guides"><i /><i /><i /></div><svg className="activity-chart" viewBox="0 0 470 118" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#cbff60" stopOpacity=".2" /><stop offset="100%" stopColor="#cbff60" stopOpacity="0" /></linearGradient></defs><path d="M0 101 C18 95 23 80 39 87 S61 104 76 81 S99 73 111 83 S133 50 151 59 S177 76 188 51 S211 43 228 59 S251 72 263 42 S282 20 297 39 S314 57 329 34 S348 51 364 26 S383 35 398 21 S418 32 432 12 S455 23 470 5 V118 H0Z" fill="url(#chartFill)"/><path className="pulse-wave" d="M0 101 C18 95 23 80 39 87 S61 104 76 81 S99 73 111 83 S133 50 151 59 S177 76 188 51 S211 43 228 59 S251 72 263 42 S282 20 297 39 S314 57 329 34 S348 51 364 26 S383 35 398 21 S418 32 432 12 S455 23 470 5" fill="none" stroke="#caff57" strokeWidth="2.5" strokeLinecap="round" /></svg><div className="chart-axis"><span>JUN 01</span><span>JUN 08</span><span>JUN 15</span><span>JUN 22</span><span>JUN 30</span></div></div>
            <div className="preview-stats"><div><span>{t.previewCommits}</span><strong>1,284</strong><small>+12.8% <i>↗</i></small></div><div><span>{t.previewContributors}</span><strong>24</strong><small>{t.previewActiveToday}</small></div><div><span>{t.previewBusFactor}</span><strong>4 <em>{t.previewGood}</em></strong><small>{t.previewHealthyDist}</small></div></div>
            <div className="preview-languages"><span>{t.previewTopLanguages}</span><div className="language-bar"><i /><i /><i /><i /><i /></div><div className="language-legend"><span><i className="lang-js" /> TypeScript <b>48%</b></span><span><i className="lang-rs" /> Rust <b>26%</b></span><span><i className="lang-go" /> Go <b>16%</b></span></div></div>
            <div className="preview-bottom"><span><i /> {t.previewUpdatedAgo}</span><span>{t.previewViewReport} <ArrowUpRight size={11} /></span></div>
          </div>
          <div className="floating-note"><span className="note-icon"><GitCommitHorizontal size={15} /></span><span><b>{t.previewFloatingTitle}</b><small>{t.previewFloatingSub}</small></span><span className="note-spark">↗</span></div>
        </div>
      </section>

      <section className="feature-section"><div className="section-kicker"><span>{t.whatYouGet}</span><span>01 — 03</span></div><div className="features-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><div className="feature-top"><feature.icon size={18} /><span>{feature.number}</span></div><h2>{feature.title}</h2><p>{feature.desc}</p><div className="feature-rule" /></article>)}</div></section>

      <section className="feature-section" aria-label={t.exploreAriaLabel}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Compass size={14} /> {t.exploreTitle}
          </div>
          <Link to="/compare" className="text-xs text-indigo-500 hover:underline">
            {t.compareBenchmark}
          </Link>
        </div>

        {exploreRepos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exploreRepos.map((repo) => (
              <Link
                key={repo.analysis_id}
                to={`/analysis/${repo.analysis_id}`}
                className="glass p-5 flex flex-col justify-between gap-3 hover:border-indigo-300/60 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-800 truncate">{repo.full_name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${healthTone(repo.health_score)}`}>
                      {repo.health_score !== null ? `${repo.health_score}/100` : '—'}
                    </span>
                  </div>
                  {repo.description && (
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{repo.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-2 border-t border-slate-200/60">
                  <span className="inline-flex items-center gap-1"><Star size={12} /> {formatStars(repo.stars)}</span>
                  {repo.language && <span>{repo.language}</span>}
                  <span>{t.busFactorLabel} {repo.bus_factor}</span>
                  <span>{repo.commits_per_month.toFixed(0)} {t.commitsPerMo}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {curatedRepos.map((repo) => (
              <button
                key={repo.full_name}
                type="button"
                onClick={() => {
                  setInput(repo.full_name);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="glass p-5 text-left flex flex-col justify-between gap-2 hover:border-indigo-300/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-slate-800">{repo.full_name}</span>
                  <span className="text-[11px] text-slate-500">{repo.language}</span>
                </div>
                <p className="text-xs text-slate-500">{repo.desc}</p>
                <span className="text-[11px] text-indigo-500 font-medium inline-flex items-center gap-1">
                  {t.analyzeNow} <ArrowUpRight size={12} />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {userRepos.length > 0 && (
        <section className="feature-section" aria-label={t.yourGitHubReposAriaLabel}>
          <div className="glass p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Lock size={14} /> {t.yourGitHubRepos}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {userRepos.map((repo) => (
                <button
                  key={repo.full_name}
                  type="button"
                  onClick={() => {
                    setInput(repo.full_name);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="report-action inline-flex items-center gap-1.5"
                >
                  {repo.private && <Lock size={11} className="text-amber-600" />}
                  {repo.full_name}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {(savedRepos.length > 0 || recentAnalyses.length > 0) && (
        <section className="feature-section grid grid-cols-1 md:grid-cols-2 gap-4">
          {savedRepos.length > 0 && (
            <div className="glass p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                <Bookmark size={14} /> {t.savedRepositories}
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
                  <Clock3 size={14} /> {t.recentAnalyses}
                </span>
                <Link to="/history" className="text-xs text-indigo-500">{t.viewAll}</Link>
              </div>
              <div className="space-y-2">
                {recentAnalyses.map((item) => (
                  <Link key={item.id} to={`/analysis/${item.id}`} className="flex items-center justify-between text-xs p-2 rounded-lg hover:bg-white/50">
                    <span className="font-medium text-slate-700 truncate">{item.repository_full_name}</span>
                    <span className="text-slate-400 shrink-0 ml-2">{t.health} {item.health_score ?? '—'}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <section className="closing-note"><span className="closing-star">✳</span><p>{t.closingLine1}<br /><span>{t.closingLine2}</span></p><span className="closing-caption">{t.closingCaption}</span></section>
    </div>
  );
}
