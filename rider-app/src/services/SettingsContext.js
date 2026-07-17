/**
 * services/SettingsContext.js — Zesto Rider
 *
 * Fetches the public platform settings (support email/phone, etc.) once
 * on app start and makes them available anywhere via useSettings().
 * These used to be hard-coded in several screens — now they reflect
 * whatever the super admin has set in Platform Settings.
 *
 * Falls back to sensible defaults if the fetch fails (e.g. offline on
 * launch) so the UI never shows a blank contact field.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { SettingsApi } from './api';

const DEFAULTS = {
  platform_name:  'Zesto',
  support_email:  'support@zesto.ug',
  support_phone:  '+256700000000',
  currency:       'UGX',
};

const SettingsContext = createContext({
  settings: DEFAULTS,
  loading: true,
  refresh: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading]   = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await SettingsApi.getPublic();
      if (res?.success && res.data) {
        // Merge over defaults so a missing/empty key never blanks out
        // a previously-working contact value.
        setSettings(prev => {
          const merged = { ...prev };
          Object.entries(res.data).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') merged[k] = v;
          });
          return merged;
        });
      }
    } catch {
      // Keep defaults/last-known values — never block the app on this.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
