// services/cartService.js
const db       = require('../db');
const AppError = require('../utils/AppError');
const cartRepo = require('../repos/cartRepo');

/**
 * Builds the full cart response object for a user.
 * Returns null if the user has no cart.
 */
async function getCart(userId) {
  const cart = await cartRepo.findByUser(userId);
  if (!cart) return null;

  const items = await cartRepo.getItems(cart.id);

  // Integer arithmetic — no float precision issues
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return {
    id:               cart.id,
    restaurant_id:    cart.restaurant_id,
    restaurant_name:  cart.restaurant_name,
    delivery_fee:     cart.delivery_fee,
    min_order_amount: cart.min_order_amount,
    items,
    subtotal,
    total: subtotal + cart.delivery_fee,
  };
}

async function addOrUpdateItem(userId, { menu_item_id, quantity }) {
  if (!menu_item_id) throw new AppError('menu_item_id required');
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 0) throw new AppError('quantity must be >= 0');

  // Fetch the menu item (confirm it exists and get its restaurant)
  const [items] = await db.query(
    'SELECT id, restaurant_id, is_available FROM menu_items WHERE id = ?',
    [menu_item_id]
  );
  if (!items.length) throw new AppError('Menu item not found', 404);
  const item = items[0];
  if (!item.is_available) throw new AppError('This item is currently unavailable');

  let cart = await cartRepo.findByUser(userId);

  if (!cart) {
    if (qty === 0) throw new AppError('Cannot add 0 items');
    const cartId = await cartRepo.createCart(userId, item.restaurant_id);
    cart = { id: cartId, restaurant_id: item.restaurant_id };
  } else {
    // Enforce single-restaurant rule
    if (cart.restaurant_id !== item.restaurant_id) {
      throw new AppError(
        'Your cart contains items from a different restaurant. Clear your cart first.',
        409
      );
    }
  }

  if (qty === 0) {
    await cartRepo.removeItem(cart.id, menu_item_id);
  } else {
    await cartRepo.upsertItem(cart.id, menu_item_id, qty);
  }

  // Auto-delete empty cart
  const remaining = await cartRepo.itemCount(cart.id);
  if (remaining === 0) {
    await cartRepo.deleteCart(cart.id);
  }

  return getCart(userId);
}

async function clearCart(userId) {
  await cartRepo.deleteCartByUser(userId);
}

module.exports = { getCart, addOrUpdateItem, clearCart };
