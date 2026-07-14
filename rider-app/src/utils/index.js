/**
 * utils/index.js — Zesto Rider utilities
 */
import { Linking, Platform } from 'react-native';

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return `UGX ${n.toLocaleString('en-UG')}`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-UG', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function isValidCode(code) {
  return /^\d{6}$/.test(String(code || '').trim());
}

export function openGoogleMaps(lat, lng, address) {
  let url;
  if (lat && lng) {
    if (Platform.OS === 'ios') {
      const gUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
      Linking.canOpenURL(gUrl).then(ok => {
        Linking.openURL(ok ? gUrl : `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`);
      });
      return;
    }
    const navUrl = `google.navigation:q=${lat},${lng}&mode=d`;
    Linking.canOpenURL(navUrl).then(ok => {
      Linking.openURL(ok ? navUrl : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
    });
  } else if (address) {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
  }
}
