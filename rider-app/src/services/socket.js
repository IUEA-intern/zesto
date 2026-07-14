/**
 * services/socket.js — Zesto Rider real-time client
 * Reuses the existing backend Socket.IO implementation.
 */
import { io } from 'socket.io-client';
import { SERVER_HOST } from './api';

export const SOCKET_URL = `http://${SERVER_HOST}:3000`;

let socket = null;
let _riderId = null;
let _userId  = null;
let _isAvailable = false;

const listeners = new Map();

function dispatch(event, data) {
  (listeners.get(event) || new Set()).forEach(cb => { try { cb(data); } catch {} });
}

export function connectSocket({ riderId, userId, isAvailable = false }) {
  _riderId     = riderId;
  _userId      = userId;
  _isAvailable = isAvailable;

  if (socket?.connected) {
    // Already connected — just update rooms
    if (isAvailable && riderId) socket.emit('rider:join', { riderId, userId });
    return;
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],  // polling fallback for restricted networks
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    reconnectionAttempts: Infinity,
    timeout: 20000,
    forceNew: false,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected', socket.id);
    if (_userId) socket.emit('user:join', _userId);
    if (_isAvailable && _riderId) socket.emit('rider:join', { riderId: _riderId, userId: _userId });
    dispatch('connect', {});
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    dispatch('disconnect', { reason });
  });

  socket.on('reconnect', () => {
    console.log('[Socket] Reconnected');
    if (_userId)  socket.emit('user:join', _userId);
    if (_isAvailable && _riderId) socket.emit('rider:join', { riderId: _riderId, userId: _userId });
    dispatch('reconnect', {});
  });

  socket.on('reconnect_attempt', n => dispatch('reconnecting', { attempt: n }));

  // Pool events
  socket.on('order:available', ({ data }) => dispatch('order:available', data));
  socket.on('order:claimed',   ({ data }) => dispatch('order:claimed',   data));
  socket.on('delivery:update', ({ data }) => dispatch('delivery:update', data));
  socket.on('order:update',    ({ data }) => dispatch('order:update',    data));
  socket.on('notification:toast', ({ data }) => dispatch('notification:toast', data));
}

export function disconnectSocket() {
  if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }
  _riderId = null; _userId = null; _isAvailable = false;
}

export function joinRiderPool(riderId, userId) {
  _riderId = riderId; _userId = userId; _isAvailable = true;
  if (socket?.connected) socket.emit('rider:join', { riderId, userId });
}

export function leaveRiderPool() {
  _isAvailable = false;
  if (socket?.connected) socket.emit('rider:leave');
}

export function on(event, cb) {
  if (!cb) return () => {};
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event)?.delete(cb);
}

export function isConnected() { return socket?.connected ?? false; }
