import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getMeApi, sendOtpApi, verifyOtpApi } from '../api/authApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCurrentUser = async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');

      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      const result = await getMeApi();
      setUser(result.data);
    } catch (error) {
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const sendOtp = async (phone) => {
    return sendOtpApi(phone);
  };

  const verifyOtp = async (phone, otp) => {
    const result = await verifyOtpApi(phone, otp);

    await SecureStore.setItemAsync('accessToken', result.data.accessToken);
    await SecureStore.setItemAsync('refreshToken', result.data.refreshToken);
    setUser(result.data.user);

    return result;
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      sendOtp,
      verifyOtp,
      logout,
      reloadUser: loadCurrentUser
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);