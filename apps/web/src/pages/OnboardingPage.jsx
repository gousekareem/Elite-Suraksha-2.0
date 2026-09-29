import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox } from '../components/ui';

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { reloadUser } = useAuth();
  const [platforms, setPlatforms] = useState([]);
  const [form, setForm] = useState({ fullName: '', city: '', zone: '', platformCode: 'GENERIC_DELIVERY', explanationStyle: 'chronological evidence timeline' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/onboarding/platforms').then(setPlatforms).catch(() => {});
    api.get('/onboarding/profile').then((p) => p && setForm((f) => ({ ...f, fullName: p.fullName, city: p.city, zone: p.zone, platformCode: p.platformCode, explanationStyle: p.preferences?.explanationStyle || f.explanationStyle }))).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.put('/onboarding/profile', { fullName: form.fullName, city: form.city, zone: form.zone, platformCode: form.platformCode, preferences: { explanationStyle: form.explanationStyle } });
      await reloadUser();
      navigate('/dashboard');
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div className="content" style={{ maxWidth: 560, margin: '40px auto' }}>
      <div className="card" style={{ padding: 24 }}>
        <div className="eyebrow">EliteSuraksha 2.0</div>
        <h1 style={{ fontSize: 20, margin: '4px 0 6px' }}>Set up your worker profile</h1>
        <p className="dim small">Your profile scopes your own private memory. Nobody else’s data is ever mixed with yours.</p>
        <form className="stack mt" onSubmit={save}>
          <label className="field">Full name<input className="input" value={form.fullName} onChange={set('fullName')} required /></label>
          <div className="grid g2">
            <label className="field">City<input className="input" value={form.city} onChange={set('city')} required /></label>
            <label className="field">Usual zone<input className="input" value={form.zone} onChange={set('zone')} placeholder="e.g. Zone A" required /></label>
          </div>
          <label className="field">Platform type<select className="select" value={form.platformCode} onChange={set('platformCode')}>{platforms.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
          <label className="field">How should the agent explain investigations?<select className="select" value={form.explanationStyle} onChange={set('explanationStyle')}><option>chronological evidence timeline</option><option>short summary</option><option>detailed breakdown by factor</option></select></label>
          <ErrorBox error={error} />
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        </form>
      </div>
    </div>
  );
};

export default OnboardingPage;
