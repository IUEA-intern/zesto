/**
 * services/storage.js
 * Platform-agnostic storage wrapper for the rider app.
 * Uses expo-secure-store on native platforms (iOS/Android)
 * and falls back to localStorage on web.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

// ── Web storage helpers (localStorage) ─────────────────────────────
const webStorage = {
  async getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('[Storage] Failed to set item:', error);
    }
  },

  async deleteItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

// ── Unified storage API ────────────────────────────────────────────
export async function getItem(key) {
  if (isWeb) {
    return webStorage.getItem(key);
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error('[Storage] Failed to get item:', error);
    return null;
  }
}

export async function setItem(key, value) {
  if (isWeb) {
    return webStorage.setItem(key, value);
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error('[Storage] Failed to set item:', error);
  }
}

export async function deleteItem(key) {
  if (isWeb) {
    return webStorage.deleteItem(key);
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

export async function clearAll(keys) {
  await Promise.all(keys.map(key => deleteItem(key)));
}