import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Api from '../services/api';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [trust, setTrust] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const refreshMe = useCallback(async () => {
    try {
      const { user: userData, trust: trustData } = await Api.get('/api/auth/me');
      setUser(userData);
      setTrust(trustData ? trustData.score : 100);
      return userData;
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        Api.clearToken();
        setUser(null);
        setTrust(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem('deciva_token');
      localStorage.removeItem('token');
    } catch (e) {}

    refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (token, userData) => {
    Api.setToken(token);
    if (userData) {
      setUser(userData);
      setLoading(false);
    }
    try {
      await refreshMe();
    } catch (e) {
    }
  }, [refreshMe]);

  const logout = useCallback(async () => {
    try {
      await Api.post('/api/auth/logout');
    } catch (e) {
    }
    Api.clearToken();
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('deciva_token');
      sessionStorage.clear();
    } catch (e) {}
    setUser(null);
    setTrust(null);
    setLoading(false);
    toast('Signed out securely', 'ok');
  }, [toast]);

  const value = {
    user,
    setUser,
    trust,
    setTrust,
    loading,
    refreshMe,
    login,
    logout,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
