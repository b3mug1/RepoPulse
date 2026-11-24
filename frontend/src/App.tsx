import { Link, Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import anime from 'animejs';
import { ArrowUpRight, Github } from 'lucide-react';
import HomePage from './pages/HomePage';

const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
import BrandMark from './components/BrandMark';

export default function App() {
  const location = useLocation();

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

  return (
    <div className="app-shell min-h-screen">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand-lockup" aria-label="RepoPulse home">
            <BrandMark />
            <span className="brand-name">repo<span>pulse</span></span>
          </Link>
          <nav className="topbar-nav" aria-label="Main navigation">
            <a href="https://github.com" target="_blank" rel="noreferrer" className="nav-link"><Github size={15} /> Open source <ArrowUpRight size={13} /></a>
            <span className="nav-divider" />
            <span className="status-pill"><i /> Systems operational</span>
          </nav>
        </div>
      </header>
      <main className="page-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analysis/:id" element={<Suspense fallback={<div className="analysis-page loading-copy">Opening report…</div>}><AnalysisPage /></Suspense>} />
        </Routes>
      </main>
      <footer className="site-footer"><span>RepoPulse</span><span>Open source intelligence for the people who build.</span><span>Made for curious teams <b>✳</b></span></footer>
    </div>
  );
}
