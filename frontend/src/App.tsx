import { Link, Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import anime from 'animejs';
import { ArrowUpRight, Github } from 'lucide-react';
import HomePage from './pages/HomePage';

const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
import BrandMark from './components/BrandMark';
import { useLocale } from './i18n';

export default function App() {
  const location = useLocation();
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'ok' | 'degraded'>('checking');
  const { locale, toggleLocale, t } = useLocale();

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    anime({
      targets: '.page-shell',
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 500,
      easing: 'easeOutCubic',
    });
  }, [location.pathname]);

  useEffect(() => {
    const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
    fetch(`${base}/health`)
      .then(async (response) => {
        const data = await response.json();
        setServiceStatus(response.ok && data.status === 'ok' ? 'ok' : 'degraded');
      })
      .catch(() => setServiceStatus('degraded'));
  }, []);

  return (
    <div className="app-shell min-h-screen">
      <a href="#main-content" className="skip-link">{t.skipToContent}</a>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand-lockup" aria-label="RepoPulse home">
            <BrandMark />
            <span className="brand-name">repo<span>pulse</span></span>
          </Link>
          <nav className="topbar-nav" aria-label="Main navigation">
            <Link to="/history" className="nav-link">{t.history}</Link>
            <Link to="/compare" className="nav-link">{t.compare}</Link>
            <Link to="/watchlist" className="nav-link">{t.watchlist}</Link>
            <Link to="/watchlist" className="nav-link">Watchlist</Link>
            <a href="https://github.com/b3mug1/github_repo_analyzer" target="_blank" rel="noreferrer" className="nav-link"><Github size={15} /> {t.openSource} <ArrowUpRight size={13} /></a>
            <button type="button" onClick={toggleLocale} className="nav-link" aria-label="Switch interface language">
              {locale.toUpperCase()}
            </button>
            <span className="nav-divider" />
            <span className={`status-pill ${serviceStatus}`} role="status" aria-live="polite"><i /> {serviceStatus === 'ok' ? t.systemsOk : serviceStatus === 'degraded' ? t.systemsDegraded : t.systemsChecking}</span>
          </nav>
        </div>
      </header>
      <main id="main-content" className="page-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<Suspense fallback={<div className="analysis-page loading-copy">Loading history…</div>}><HistoryPage /></Suspense>} />
          <Route path="/compare" element={<Suspense fallback={<div className="analysis-page loading-copy">Loading comparison…</div>}><ComparePage /></Suspense>} />
          <Route path="/watchlist" element={<Suspense fallback={<div className="analysis-page loading-copy">Loading watchlist…</div>}><WatchlistPage /></Suspense>} />
          <Route path="/watchlist" element={<Suspense fallback={<div className="analysis-page loading-copy">Loading watchlist…</div>}><WatchlistPage /></Suspense>} />
          <Route path="/analysis/:id" element={<Suspense fallback={<div className="analysis-page loading-copy">Opening report…</div>}><AnalysisPage /></Suspense>} />
          <Route path="/shared/:token" element={<Suspense fallback={<div className="analysis-page loading-copy">Opening shared report…</div>}><AnalysisPage /></Suspense>} />
        </Routes>
      </main>
      <footer className="site-footer"><span>RepoPulse</span><span>Open source intelligence for the people who build.</span><span>Made for curious teams <b>✳</b></span></footer>
    </div>
  );
}
