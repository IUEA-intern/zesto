/**
 * hooks/useSocket.js — Zesto Rider
 */
import { useState, useEffect, useCallback } from 'react';
import { on, isConnected } from '../services/socket';

export function useSocket(event, handler) {
  useEffect(() => {
    if (!event || !handler) return;
    return on(event, handler);
  }, [event, handler]);
}

export function useConnectionStatus() {
  const [connected,    setConnected]    = useState(isConnected());
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const u1 = on('connect',      () => { setConnected(true);  setReconnecting(false); });
    const u2 = on('disconnect',   () => setConnected(false));
    const u3 = on('reconnecting', () => setReconnecting(true));
    const u4 = on('reconnect',    () => { setConnected(true);  setReconnecting(false); });
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  return { connected, reconnecting };
}

export function useOrderPool(isAvailable) {
  const [orders,  setOrders]  = useState([]);

  const onAvailable = useCallback((data) => {
    if (!data?.order_id) return;
    setOrders(prev => prev.find(o => o.order_id === data.order_id) ? prev : [data, ...prev]);
  }, []);

  const onClaimed = useCallback((data) => {
    const id = data?.orderId || data?.order_id;
    if (id) setOrders(prev => prev.filter(o => o.order_id !== id));
  }, []);

  const onUpdate = useCallback((data) => {
    if (data?.status === 'cancelled') {
      const id = data?.orderId || data?.order_id;
      if (id) setOrders(prev => prev.filter(o => o.order_id !== id));
    }
  }, []);

  useSocket(isAvailable ? 'order:available' : null, onAvailable);
  useSocket('order:claimed', onClaimed);
  useSocket('order:update',  onUpdate);

  return { orders, setOrders };
}
