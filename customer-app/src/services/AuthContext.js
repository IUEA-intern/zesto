/**
 * services/AuthContext.js — Zesto Customer auth state
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthApi, getToken, clearToken, getSavedUser, saveToken, saveUser } from './api';
import { connectSocket, disconnectSocket } from './socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { restoreSession(); }, []);

  async function restoreSession() {
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }

      const savedUser = await getSavedUser();
      if (!savedUser || savedUser.role !== 'customer') {
        await clearToken();
        setLoading(false);
        return;
      }

      setUser(savedUser);
      connectSocket(savedUser.user_id);
    } catch {
      await clearToken();
    } finally {
      setLoading(false);
    }
  }

  const login = useCallback(async (email, password) => {
    const tokenData = await AuthApi.getMobileToken(email, password);
    await saveToken(tokenData.token);
    await saveUser(tokenData.user);
    setUser(tokenData.user);
    connectSocket(tokenData.user.user_id);
    return tokenData.user;
  }, []);

  const register = useCallback(async ({ name, email, phone, password }) => {
    // Registration sets an httpOnly cookie, not a bearer token, so
    // immediately follow up with a mobile-token login for the app.
    await AuthApi.register({ name, email, phone, password });
    return login(email, password);
  }, [login]);

  const updateProfile = useCallback(async ({ name, phone }) => {
    const res = await AuthApi.updateProfile({ name, phone });
    // Server issues a fresh token reflecting the new name — keep the
    // mobile client's stored token/user in sync with it.
    if (res.token) await saveToken(res.token);
    await saveUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    return AuthApi.changePassword({ currentPassword, newPassword });
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    disconnectSocket();
    await clearToken();
    try { await AuthApi.logout(); } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
