/**
 * services/socket.js — Zesto Customer real-time client
 * Reuses the existing backend Socket.IO implementation (events/socketManager.js).
 * Listens on the user's personal room for order + payment updates.
 */
import { io } from 'socket.io-client';
import { API_BASE_URL } from './api';
export const SOCKET_URL = API_BASE_URL;
// import { SERVER_HOST, SERVER_PORT } from './api';

// export const SOCKET_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

let socket = null;
let _userId = null;

const listeners = new Map();

function dispatch(event, data) {
  (listeners.get(event) || new Set()).forEach(cb => { try { cb(data); } catch {} });
}

export function connectSocket(userId) {
  _userId = userId;

  if (socket?.connected) {
    if (userId) socket.emit('user:join', userId);
    return;
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    reconnectionAttempts: Infinity,
    timeout: 20000,
    forceNew: false,
  });

  socket.on('connect', () => {
    if (_userId) socket.emit('user:join', _userId);
    dispatch('connect', {});
  });

  socket.on('disconnect', reason => dispatch('disconnect', { reason }));

  socket.on('reconnect', () => {
    if (_userId) socket.emit('user:join', _userId);
    dispatch('reconnect', {});
  });

  socket.on('reconnect_attempt', n => dispatch('reconnecting', { attempt: n }));

  // Personal user-room events emitted by socketManager.js
  socket.on('order:created', ({ data }) => dispatch('order:created', data));
  socket.on('payment:status', ({ data }) => dispatch('payment:status', data));
  socket.on('notification:toast', ({ data }) => dispatch('notification:toast', data));
  socket.on('cart:update', ({ data }) => dispatch('cart:update', data));
  // Order status changes emitted from admin/rider flows (order:new is admin/kitchen only,
  // but the order-status route also emits order:status directly to the user room)
  socket.on('order:status', data => dispatch('order:status', data));
  socket.on('order:update', ({ data }) => dispatch('order:update', data));
}

export function disconnectSocket() {
  if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }
  _userId = null;
}

export function trackOrder(orderId) {
  if (socket?.connected && orderId) socket.emit('order:track', orderId);
}

export function untrackOrder(orderId) {
  if (socket?.connected && orderId) socket.emit('order:untrack', orderId);
}

export function on(event, cb) {
  if (!cb) return () => {};
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event)?.delete(cb);
}

export function isConnected() { return socket?.connected ?? false; }
