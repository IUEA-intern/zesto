/**
 * services/CartContext.js — Zesto Customer cart state
 * Backed by the server-side /api/cart endpoints (cart_items table) so the
 * cart survives app restarts and stays in sync with the web frontend.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CartApi } from './api';
import { useAuth } from './AuthContext';
import { on } from './socket';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    try {
      const res = await CartApi.get();
      if (res?.success) setItems(res.data || []);
    } catch {
      // Silently ignore — cart screen shows its own retry affordance
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Keep cart in sync if it changes on another device (web) while app is open
  useEffect(() => on('cart:update', () => refresh()), [refresh]);

  const addItem = useCallback(async (product, qty = 1) => {
    await CartApi.add(product.product_id, qty);
    await refresh();
  }, [refresh]);

  const updateQty = useCallback(async (cartId, qty) => {
    if (qty < 1) return;
    // Optimistic update
    setItems(prev => prev.map(i => (i.cart_id === cartId ? { ...i, qty } : i)));
    try {
      await CartApi.updateQty(cartId, qty);
    } finally {
      refresh();
    }
  }, [refresh]);

  const removeItem = useCallback(async (cartId) => {
    setItems(prev => prev.filter(i => i.cart_id !== cartId));
    try {
      await CartApi.remove(cartId);
    } finally {
      refresh();
    }
  }, [refresh]);

  const clearCart = useCallback(async () => {
    setItems([]);
    try { await CartApi.clear(); } catch {}
  }, []);

  const subtotal = items.reduce((sum, i) => sum + Number(i.price) * Number(i.qty), 0);
  const itemCount = items.reduce((sum, i) => sum + Number(i.qty), 0);

  return (
    <CartContext.Provider value={{
      items, loading, subtotal, itemCount,
      refresh, addItem, updateQty, removeItem, clearCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
