// services/orderService.js
const db        = require('../db');
const AppError  = require('../utils/AppError');
const cartRepo  = require('../repos/cartRepo');
const orderRepo = require('../repos/orderRepo');
const userRepo  = require('../repos/userRepo');

/**
 * Valid status transitions.
 * A status can only move forward; cancellation is a special side-path.
 */
const TRANSITIONS = {
  pending:           ['paid', 'cancelled'],
  paid:              ['confirmed', 'cancelled'],
  confirmed:         ['preparing'],
  preparing:         ['out_for_delivery'],
  out_for_delivery:  ['delivered'],
  delivered:         [],
  cancelled:         [],
};

async function createFromCart(userId, { delivery_address, notes }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Load cart
    const [carts] = await conn.query(
      'SELECT id, restaurant_id FROM carts WHERE user_id = ?',
      [userId]
    );
    if (!carts.length) throw new AppError('Your cart is empty');
    const cart = carts[0];

    // Load cart items with current prices
    const [cartItems] = await conn.query(
      `SELECT ci.quantity, mi.id AS menu_item_id, mi.name, mi.price, mi.is_available
       FROM cart_items ci
       JOIN menu_items mi ON mi.id = ci.menu_item_id
       WHERE ci.cart_id = ?`,
      [cart.id]
    );
    if (!cartItems.length) throw new AppError('Your cart is empty');

    // Validate item availability
    const unavailable = cartItems.filter(i => !i.is_available).map(i => i.name);
    if (unavailable.length) {
      throw new AppError(`These items are no longer available: ${unavailable.join(', ')}`);
    }

    // Load restaurant
    const [rests] = await conn.query(
      'SELECT id, delivery_fee, min_order_amount, is_open FROM restaurants WHERE id = ?',
      [cart.restaurant_id]
    );
    const restaurant = rests[0];
    if (!restaurant.is_open) throw new AppError('Restaurant is currently closed');

    // Integer arithmetic — prices are stored as integers
    const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (subtotal < restaurant.min_order_amount) {
      throw new AppError(
        `Minimum order is ${restaurant.min_order_amount} UGX. Your subtotal: ${subtotal} UGX`
      );
    }

    const deliveryFee  = restaurant.delivery_fee;
    const totalAmount  = subtotal + deliveryFee;

    // Resolve delivery address: request body → user profile
    let resolvedAddress = delivery_address;
    if (!resolvedAddress) {
      const user = await userRepo.findById(userId);
      resolvedAddress = user?.delivery_address;
    }
    if (!resolvedAddress) throw new AppError('delivery_address is required');

    const orderId = await orderRepo.createWithItems(conn, {
      userId,
      restaurantId:    cart.restaurant_id,
      deliveryAddress: resolvedAddress,
      subtotal,
      deliveryFee,
      totalAmount,
      notes,
      items: cartItems,
    });

    // Clear the cart inside the same transaction
    await conn.query('DELETE FROM carts WHERE id = ?', [cart.id]);

    await conn.commit();

    return { order_id: orderId, subtotal, delivery_fee: deliveryFee, total_amount: totalAmount, status: 'pending' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function cancelOrder(orderId, userId) {
  const order = await orderRepo.findByIdAndUser(orderId, userId);
  if (!order) throw new AppError('Order not found', 404);

  const allowed = TRANSITIONS[order.status];
  if (!allowed || !allowed.includes('cancelled')) {
    throw new AppError(`Cannot cancel an order with status: ${order.status}`);
  }

  await orderRepo.updateStatus(orderId, 'cancelled');
}

/**
 * Admin: advance an order to the next status.
 */
async function advanceStatus(orderId, newStatus) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);

  const allowed = TRANSITIONS[order.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new AppError(`Cannot transition from '${order.status}' to '${newStatus}'`);
  }

  await orderRepo.updateStatus(orderId, newStatus);
  return orderRepo.findById(orderId);
}

module.exports = { createFromCart, cancelOrder, advanceStatus, TRANSITIONS };
