import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../api/client';

const STEPS = [
  ['Worker data', 'Sessions, trips, incentives and deductions in PostgreSQL'],
  ['Hindsight recall', 'The agent remembers patterns, past anomalies and investigation outcomes'],
  ['Evidence-based answer', 'Facts, inferences and unknowns — never invented numbers'],
  ['Outcome retained', 'Every resolved case makes the next investigation better']
];

const LoginPage = () => {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, demoLogin } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [stage, setStage] = useState('phone');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const go = (user) => navigate(user.role === 'ADMIN' ? '/admin' : user.workerProfile ? (user.workerProfile.isSynthetic ? '/demo' : '/dashboard') : '/onboarding');

  const run = async (key, fn) => {
    setBusy(key); setError('');
    try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', background: 'var(--bg)' }} className="login-grid">
      <style>{'@media (max-width:860px){.login-grid{grid-template-columns:1fr!important}}'}</style>
      <section style={{ padding: '48px clamp(16px,5vw,64px)', background: 'var(--brand)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        <div className="row" style={{ gap: 10 }}><img src="/shield.svg" width="36" height="36" alt="" style={{ background: '#fff', borderRadius: 8, padding: 3 }} /><b style={{ fontSize: 18 }}>EliteSuraksha 2.0</b></div>
        <h1 style={{ fontSize: 'clamp(26px,3.4vw,38px)', lineHeight: 1.15, letterSpacing: '-.5px', maxWidth: 620 }}>An AI agent that remembers a gig worker’s history — and uses it to investigate new earnings problems.</h1>
        <p style={{ opacity: 0.9, fontSize: 16, maxWidth: 560 }}>Your work history should not disappear every time you start a new conversation. EliteSuraksha investigates today’s problem using yesterday’s experience, with persistent memory powered by Hindsight.</p>
        <ol style={{ listStyle: 'none', display: 'grid', gap: 10, maxWidth: 560 }}>
          {STEPS.map(([t, d], i) => (
            <li key={t} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: i === 1 || i === 3 ? '#b9a6ff' : 'rgba(255,255,255,.18)', color: i === 1 || i === 3 ? '#231a55' : '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, flex: 'none' }}>{i + 1}</span>
              <div><b>{t}</b><div style={{ opacity: 0.85, fontSize: 13 }}>{d}</div></div>
            </li>
          ))}
        </ol>
      </section>
      <section style={{ padding: '48px clamp(16px,5vw,56px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, maxWidth: 520, width: '100%', margin: '0 auto' }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="eyebrow">Judge demo · one click</div>
          <h2 style={{ fontSize: 18, margin: '4px 0 6px' }}>See the memory loop end to end</h2>
          <p className="dim small">Sign in as <b>Rahul Kumar</b>, a synthetic delivery worker in Hyderabad, and follow the guided scenario. All data is synthetic.</p>
          <div className="stack mt">
            <button className="btn primary lg" onClick={() => run('demo', async () => go(await demoLogin('worker')))} disabled={!!busy}>{busy === 'demo' ? 'Signing in…' : 'Enter Judge Demo as Rahul →'}</button>
            <button className="btn" onClick={() => run('admin', async () => go(await demoLogin('admin')))} disabled={!!busy}>{busy === 'admin' ? 'Signing in…' : 'Open Investigator Console (admin)'}</button>
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div className="eyebrow">Sign in with mobile number</div>
          <div className="stack mt">
            <label className="field">Mobile number<input className="input" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} /></label>
            {stage === 'otp' ? <label className="field">One-time password<input className="input" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} /></label> : null}
            {devOtp ? <div className="alert info small">Development OTP: <b className="mono">{devOtp}</b></div> : null}
            {stage === 'phone'
              ? <button className="btn" onClick={() => run('otp', async () => { const r = await sendOtp(phone); setDevOtp(r.devOtp || ''); setStage('otp'); })} disabled={!!busy || phone.length !== 10}>{busy === 'otp' ? 'Sending…' : 'Send OTP'}</button>
              : <button className="btn primary" onClick={() => run('verify', async () => go(await verifyOtp(phone, otp)))} disabled={!!busy || otp.length !== 6}>{busy === 'verify' ? 'Verifying…' : 'Verify & continue'}</button>}
          </div>
        </div>
        {error ? <div className="alert err" role="alert">{error}</div> : null}
      </section>
    </div>
  );
};

export default LoginPage;
