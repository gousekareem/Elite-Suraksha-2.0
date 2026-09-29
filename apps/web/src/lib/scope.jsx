import { createContext, useContext } from 'react';

// Which worker's data the pages show:
//   worker  → api '/me',                   links '/...'
//   admin   → api '/admin/workers/:id',    links '/admin/workers/:id/...'
const ScopeContext = createContext({ api: '/me', link: '', isAdminView: false, workerId: null });

export const ScopeProvider = ScopeContext.Provider;
export const useScope = () => useContext(ScopeContext);
