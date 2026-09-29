import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { SEVERITY, CATEGORY_LABEL, titleCase } from '../lib/format';

export const Loading = ({ label = 'Loading…', memory = false }) => (
  <div className="row muted" role="status" style={{ padding: '14px 0' }}>
    <span className={`spinner${memory ? ' memory' : ''}`} /> <span>{label}</span>
  </div>
);

export const Empty = ({ title, children, action }) => (
  <div className="empty"><b>{title}</b><div className="small">{children}</div>{action ? <div className="mt">{action}</div> : null}</div>
);

export const ErrorBox = ({ error, onRetry }) => (error ? (
  <div className="alert err row between" role="alert"><span>{error}</span>{onRetry ? <button className="btn sm" onClick={onRetry}>Retry</button> : null}</div>
) : null);

export const SeverityBadge = ({ severity }) => {
  const s = SEVERITY[severity] || SEVERITY.NORMAL;
  return <span className={`badge ${s.cls}`}><span aria-hidden>{s.icon}</span>{s.label}</span>;
};

export const CategoryBadge = ({ category }) => (
  <span className="badge b-memory">{CATEGORY_LABEL[category] || titleCase(category || 'memory')}</span>
);

export const Stat = ({ label, value, sub, tone }) => (
  <div className="card stat">
    <div className="eyebrow">{label}</div>
    <div className={`v num ${tone || ''}`}>{value}</div>
    {sub ? <div className="s">{sub}</div> : null}
  </div>
);

export const DemoDataBadge = () => <span className="badge b-gray" title="All worker and platform records are synthetic">Demo data · synthetic</span>;

/** Small data-loading hook with reload + error state. */
export const useAsync = (fn, deps = []) => {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const alive = useRef(true);
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (alive.current) setState({ loading: false, error: null, data });
    } catch (err) {
      if (alive.current) setState({ loading: false, error: errorMessage(err), data: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { alive.current = true; run(); return () => { alive.current = false; }; }, [run]);
  return { ...state, reload: run };
};
