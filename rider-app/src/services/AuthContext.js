/**
 * services/AuthContext.js — Zesto Rider auth state
 * Fixes: logout clears state properly, supports registration flow
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthApi, RiderApi, getToken, clearToken, getSavedUser, saveToken, saveUser } from './api';
import { connectSocket, disconnectSocket } from './socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null);
  const [riderProfile,  setRiderProfile]  = useState(null);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => { restoreSession(); }, []);

  async function restoreSession() {
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }

      const savedUser = await getSavedUser();
      if (!savedUser || savedUser.role !== 'rider') {
        await clearToken();
        setLoading(false);
        return;
      }

      setUser(savedUser);

      try {
        const profileRes = await RiderApi.getProfile();
        if (profileRes?.success && profileRes.data) {
          setRiderProfile(profileRes.data);
          connectSocket({
            riderId:     profileRes.data.rider_id,
            userId:      savedUser.user_id,
            isAvailable: !!profileRes.data.is_available,
          });
        }
      } catch {
        // Profile fetch failed but token valid — keep user logged in
      }
    } catch {
      await clearToken();
    } finally {
      setLoading(false);
    }
  }

  const login = useCallback(async (email, password) => {
    // Get mobile token first
    const tokenData = await AuthApi.getMobileToken(email, password);
    await saveToken(tokenData.token);
    await saveUser(tokenData.user);
    setUser(tokenData.user);

    // Fetch rider profile
    try {
      const profileRes = await RiderApi.getProfile();
      if (profileRes?.success && profileRes.data) {
        setRiderProfile(profileRes.data);
        connectSocket({
          riderId:     profileRes.data.rider_id,
          userId:      tokenData.user.user_id,
          isAvailable: !!profileRes.data.is_available,
        });
      }
    } catch {}

    return tokenData.user;
  }, []);

  // Called after OTP registration completes
  const loginWithToken = useCallback(async (token, user) => {
    await saveToken(token);
    await saveUser(user);
    setUser(user);
    // Profile will be pending, no socket yet
    try {
      const profileRes = await RiderApi.getProfile();
      if (profileRes?.success && profileRes.data) {
        setRiderProfile(profileRes.data);
      }
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    // 1. Go offline first, while we still have a valid token — this is
    //    what actually flips is_available so the rider stops showing up
    //    as "available" / stops receiving new delivery offers.
    //    (The /auth/logout call below also does this server-side as a
    //    fallback, but doing it explicitly here gives an immediate,
    //    reliable result and a matching socket update to admins.)
    try {
      if (riderProfile?.is_available) {
        await RiderApi.setAvailability(false);
      }
    } catch {}
    // 2. Disconnect socket
    disconnectSocket();
    // 3. Clear persisted token/user
    await clearToken();
    // 4. Tell backend to clear cookie (best-effort)
    try { await AuthApi.logout(); } catch {}
    // 5. Reset ALL local state — this triggers the navigator to show Login
    setUser(null);
    setRiderProfile(null);
  }, [riderProfile]);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await RiderApi.getProfile();
      if (res?.success && res.data) setRiderProfile(res.data);
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{
      user, riderProfile, loading,
      isApproved:  riderProfile?.status === 'approved',
      isAvailable: !!riderProfile?.is_available,
      login, loginWithToken, logout, refreshProfile, setRiderProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
