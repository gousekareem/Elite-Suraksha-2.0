import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const reloadUser = useCallback(async () => {
    if (!localStorage.getItem('accessToken')) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await api.get('/auth/me');
      setUser(me);
      return me;
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reloadUser(); }, [reloadUser]);

  const storeSession = (data) => {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    return data.user;
  };

  const value = useMemo(() => ({
    user,
    loading,
    sendOtp: (phone) => api.post('/auth/send-otp', { phone }),
    verifyOtp: async (phone, otp) => storeSession(await api.post('/auth/verify-otp', { phone, otp })),
    demoLogin: async (as) => storeSession(await api.post('/auth/demo-login', { as })),
    logout: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    },
    reloadUser
  }), [user, loading, reloadUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
