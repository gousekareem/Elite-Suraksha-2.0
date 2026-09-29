import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useScope } from '../lib/scope';
import { dLong } from '../lib/format';
import Icon from './Icon';
import { DemoDataBadge } from './ui';

const WorkerCtx = createContext({ profile: null, reload: () => {}, system: null });
export const useWorker = () => useContext(WorkerCtx);

/** Live status: reflects an actual Hindsight version call made by the API. */
export const MemoryStatus = ({ system }) => {
  if (!system) return <span className="badge b-gray"><span className="spinner" style={{ width: 10, height: 10 }} />Checking memory…</span>;
  const h = system.hindsight;
  if (!h.configured) return <span className="badge b-gray" title={h.detail}><span className="dot" style={{ background: 'var(--text-3)' }} />Hindsight disabled</span>;
  return h.connected
    ? <span className="badge b-memory" title={`Hindsight API ${h.version} at ${h.endpoint}`}><span className="dot" style={{ background: 'var(--memory)' }} />Hindsight Memory · Connected</span>
    : <span className="badge b-critical" title={h.detail}><span className="dot" style={{ background: 'var(--critical)' }} />Hindsight Memory · Unavailable</span>;
};

const WORKER_NAV = [
  { group: 'Workspace', items: [
    { to: '/dashboard', label: 'Dashboard', icon: 'home' },
    { to: '/ask', label: 'Ask the Agent', icon: 'chat' },
    { to: '/earnings', label: 'Earnings', icon: 'chart' }
  ] },
  { group: 'Memory', items: [
    { to: '/memory', label: 'Memory Journey', icon: 'brain', memory: true, end: true },
    { to: '/memory/inspector', label: 'Memory Inspector', icon: 'search', memory: true },
    { to: '/compare', label: 'Without vs With Memory', icon: 'compare', memory: true }
  ] },
  { group: 'Accountability', items: [
    { to: '/investigations', label: 'Investigations & Reports', icon: 'folder' }
  ] }
];

const Layout = () => {
  const { user, logout } = useAuth();
  const scope = useScope();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [system, setSystem] = useState(null);

  const reload = useCallback(async () => {
    if (user?.role !== 'ADMIN' || scope.isAdminView) {
      try { setProfile(await api.get(`${scope.api}/profile`)); } catch { setProfile(null); }
    } else setProfile(null);
    try { setSystem(await api.get('/health/system')); } catch { setSystem(null); }
  }, [scope.api, scope.isAdminView, user?.role]);

  useEffect(() => { reload(); const t = setInterval(() => api.get('/health/system').then(setSystem).catch(() => {}), 30000); return () => clearInterval(t); }, [reload]);

  const isDemoUser = user?.role === 'ADMIN' || profile?.isSynthetic;
  const adminHome = user?.role === 'ADMIN' && !scope.isAdminView;
  const nav = [...(adminHome ? [] : WORKER_NAV), ...(isDemoUser ? [{ group: 'Demo', items: [{ to: '/demo', label: 'Judge Demo', icon: 'play' }, { to: '/architecture', label: 'How it works', icon: 'spark' }] }] : [])];
  const links = nav.flatMap((g) => g.items);

  return (
    <WorkerCtx.Provider value={{ profile, reload, system }}>
      <div className="app">
        <aside className="sidebar" aria-label="Main navigation">
          <div className="brand" style={{ padding: '8px 0' }}>
            <img src="/elitesuraksha-logo.svg" width="220" alt="EliteSuraksha 2.0" style={{ display: 'block', maxWidth: '100%', height: 'auto' }} />
          </div>
          {user?.role === 'ADMIN' ? (
            <nav className="nav"><NavLink to="/admin" end><Icon name="shield" />Investigation Console</NavLink></nav>
          ) : null}
          {scope.isAdminView ? <div className="nav-group" style={{ color: 'var(--brand-ink)' }}>Viewing {profile?.fullName || 'worker'}</div> : null}
          {nav.map((g) => (
            <nav className="nav" key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map((it) => {
                const to = ['/demo', '/architecture'].includes(it.to) ? it.to : `${scope.link}${it.to}`;
                return <NavLink key={it.to} to={to} end={it.end} className={it.memory ? 'memory' : undefined}><Icon name={it.icon} />{it.label}</NavLink>;
              })}
            </nav>
          ))}
          <div style={{ flex: 1 }} />
          <div className="card small" style={{ padding: 12 }}>
            <div className="eyebrow">Signed in</div>
            <div style={{ fontWeight: 650 }}>{user?.role === 'ADMIN' ? 'Investigator (admin)' : profile?.fullName || user?.phone}</div>
            <button className="btn sm ghost" style={{ paddingLeft: 0 }} onClick={() => { logout(); navigate('/login'); }}><Icon name="logout" size={15} />Sign out</button>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="row" style={{ gap: 10 }}>
              <b>{profile ? `${profile.fullName} · ${profile.city} ${profile.zone}` : 'EliteSuraksha 2.0'}</b>
              {profile?.isSynthetic ? <span className="hide-sm"><DemoDataBadge /></span> : null}
              {profile?.asOfDate ? <span className="badge b-brand" title="The demo clock: analytics treat this date as today">Demo clock: {dLong(profile.asOfDate)}</span> : null}
            </div>
            <div className="row">
              <MemoryStatus system={system} />
              {system ? <span className="badge b-gray hide-sm" title="How answers are composed">{system.reasoning.engine === 'llm' ? `LLM: ${system.reasoning.model}` : 'Deterministic reasoning'}</span> : null}
            </div>
          </header>
          <nav className="mobile-nav" aria-label="Sections">
            {links.map((it) => <NavLink key={it.to} to={['/demo', '/architecture'].includes(it.to) ? it.to : `${scope.link}${it.to}`} end={it.end}>{it.label}</NavLink>)}
          </nav>
          <main className="content"><Outlet /></main>
        </div>
      </div>
    </WorkerCtx.Provider>
  );
};

export default Layout;
