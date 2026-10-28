import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Moon, Sun, X } from 'lucide-react';
import { api } from './pilot-lib.js';
import DirectoryPage from './DirectoryPage.jsx';
import JoinPage from './JoinPage.jsx';
import PortalPage from './PortalPage.jsx';
import AdminPage from './AdminPage.jsx';

function readRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

function PilotNav({ route }) {
  const links = [
    ['/', 'Directory'],
    ['/join', 'For pharmacies'],
    ['/portal', 'My workspace'],
  ];
  return links.map(([path, label]) => (
    <a key={path} href={`#${path}`} className={route.path === path ? 'active' : ''}>{label}</a>
  ));
}

export default function PilotApp() {
  const [route, setRoute] = useState(readRoute);
  const [session, setSession] = useState({ loading: true, role: null, pharmacy: null });
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    api('/api/pilot/session')
      .then(data => {
        if (alive) setSession({ loading: false, role: data.role || null, pharmacy: data.pharmacy || null });
      })
      .catch(() => {
        if (alive) setSession({ loading: false, role: null, pharmacy: null });
      });
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => { alive = false; window.removeEventListener('hashchange', onHash); };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const navigate = path => {
    if (location.hash === `#${path}`) window.scrollTo({ top: 0, behavior: 'smooth' });
    else location.hash = path;
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('medstock-theme', next); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0f1714' : '#0c6b52');
    setTheme(next);
  };

  const pageProps = { session, setSession, navigate, showToast: setToast, route };
  let page;
  if (route.path === '/join') page = <JoinPage {...pageProps} />;
  else if (route.path === '/portal') page = <PortalPage {...pageProps} />;
  else if (route.path === '/admin') page = <AdminPage {...pageProps} />;
  else page = <DirectoryPage {...pageProps} />;

  return (
    <div className="pilot-shell">
      <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <aside className="demo-bar pilot-bar" aria-label="Pilot notice">
        <span className="demo-dot" />
        <strong>LIVE PILOT · LAGOS &amp; IBADAN</strong>
        <span className="demo-bar-divider" />
        <span className="pilot-bar-note">Stock is reported by participating pharmacies</span>
        <a className="pilot-demo-link" href="/">View the demo <ArrowUpRight size={12} /></a>
      </aside>
      <header className="pilot-header">
        <div className="header-inner">
          <a className="logo pilot-logo" href="#/" aria-label="Medstock pilot home">
            <span className="logo-mark"><svg viewBox="0 0 32 32"><path d="M5 18V9l11 7 11-7v14M5 18l11 7 11-7" /></svg></span>
            medstock<span className="logo-dot">.</span>
          </a>
          <nav className="pilot-nav" aria-label="Pilot navigation">
            <PilotNav route={route} />
            {session.role === 'admin' && <a href="#/admin" className={route.path === '/admin' ? 'active' : ''}>Admin</a>}
          </nav>
          <div className="header-right">
            <button className="icon-btn theme-toggle" onClick={toggleTheme} aria-pressed={theme === 'dark'} aria-label="Dark mode" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <a className="pilot-header-cta" href="#/join">Get a pharmacy link <ArrowRight size={14} /></a>
          </div>
        </div>
        <nav className="pilot-mobile-nav" aria-label="Pilot navigation">
          <PilotNav route={route} />
          {session.role === 'admin' && <a href="#/admin" className={route.path === '/admin' ? 'active' : ''}>Admin</a>}
        </nav>
      </header>
      <main id="main" className="pilot-main" tabIndex={-1}>{page}</main>
      <footer className="pilot-footer">
        <div className="pilot-wrap pilot-footer-inner">
          <div>
            <strong>Medstock pilot</strong>
            <p>An independent transparency pilot for Lagos and Ibadan. Licence checks are manual, not a NAFDAC or PCN verification. Confirm stock and price directly with the pharmacy before travelling. No payments, reservations or prescriptions are processed here.</p>
          </div>
          <div className="pilot-footer-links">
            <a href="#/">Directory</a>
            <a href="#/join">For pharmacies</a>
            <a href="#/portal">Workspace</a>
            <a href="/">Demo</a>
          </div>
        </div>
        <div className="pilot-wrap pilot-footer-bottom">
          <span>© {new Date().getFullYear()} Medstock</span>
          <span>Built for Lagos &amp; Ibadan</span>
        </div>
      </footer>
      {toast && (
        <div className="pilot-toast" role="status" aria-live="polite">
          <Check size={17} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
