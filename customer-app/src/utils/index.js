/**
 * utils/index.js — Zesto Customer utilities
 */
export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return `UGX ${n.toLocaleString('en-UG')}`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
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

export const ORDER_STATUS_LABELS = {
  pending: 'Order Placed',
  processing: 'Confirmed',
  preparing: 'Being Prepared',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_STEPS = [
  'pending', 'processing', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered',
];

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

export function isValidUgPhone(phone) {
  return /^(\+?256|0)7\d{8}$/.test(String(phone || '').trim().replace(/\s/g, ''));
}
