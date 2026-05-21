// services/paymentService.js
const crypto      = require('crypto');
const AppError    = require('../utils/AppError');
const orderRepo   = require('../repos/orderRepo');
const paymentRepo = require('../repos/paymentRepo');
const logger      = require('../utils/logger');

// ── Provider adapter ─────────────────────────────────────────────────────────
// Swap initiate() and verifyWebhook() for your real MTN MoMo / Flutterwave SDK calls.

class PaymentProvider {
  constructor() {
    this.name        = process.env.PAYMENT_PROVIDER  || 'mtn_momo';
    this.apiKey      = process.env.PAYMENT_API_KEY;
    this.secret      = process.env.PAYMENT_SECRET;
    this.baseUrl     = process.env.PAYMENT_BASE_URL;
    this.callbackUrl = process.env.PAYMENT_CALLBACK_URL;
    this.currency    = process.env.PAYMENT_CURRENCY  || 'UGX';
  }

  async initiate({ orderId, amount, phone, description }) {
    const referenceId = crypto.randomUUID();

    // ── MTN MoMo Collections API ─────────────────────────────────────────
    // const token = await this.#getAccessToken();
    // const res = await fetch(`${this.baseUrl}/collection/v1_0/requesttopay`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization':             `Bearer ${token}`,
    //     'X-Reference-Id':            referenceId,
    //     'X-Target-Environment':      'sandbox',
    //     'Content-Type':              'application/json',
    //     'Ocp-Apim-Subscription-Key': this.apiKey,
    //   },
    //   body: JSON.stringify({
    //     amount:       String(amount),
    //     currency:     this.currency,
    //     externalId:   String(orderId),
    //     payer:        { partyIdType: 'MSISDN', partyId: phone },
    //     payerMessage: description,
    //     payeeNote:    `Order #${orderId}`,
    //   }),
    // });
    // if (!res.ok) throw new Error(`MoMo error: ${res.status}`);
    // return { providerTxId: referenceId, instructions: 'Enter PIN on your phone' };

    // ── SIMULATION (delete in production) ────────────────────────────────
    logger.info('Payment simulated', { orderId, amount, currency: this.currency });
    return {
      providerTxId:  referenceId,
      instructions: 'A USSD prompt has been sent to your phone. Enter your PIN to confirm.',
    };
  }

  /**
   * Verifies a webhook callback from the provider.
   * rawBody must be the original request bytes (Buffer or string), NOT re-stringified JSON.
   */
  verifyWebhook(payload, signature, rawBody) {
    // ── Flutterwave ───────────────────────────────────────────────────────
    // const hash = crypto.createHmac('sha256', this.secret).update(rawBody).digest('hex');
    // if (hash !== signature) return { success: false, providerTxId: null };
    // return { success: payload.status === 'successful', providerTxId: String(payload.data?.id) };

    // ── MTN MoMo (poll-based, no signature) ──────────────────────────────
    // return { success: payload.status === 'SUCCESSFUL', providerTxId: payload.referenceId };

    // ── SIMULATION ────────────────────────────────────────────────────────
    return { success: payload.status === 'SUCCESSFUL', providerTxId: payload.referenceId };
  }
}

const provider = new PaymentProvider();

async function initiate(userId, { order_id, phone }) {
  if (!order_id || !phone) throw new AppError('order_id and phone are required');

  const order = await orderRepo.findByIdAndUser(order_id, userId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.payment_status === 'paid') throw new AppError('Order is already paid');
  if (order.status === 'cancelled')    throw new AppError('Cannot pay for a cancelled order');

  const { providerTxId, redirectUrl, instructions } = await provider.initiate({
    orderId:     order.id,
    amount:      order.total_amount,
    phone,
    description: `Food order #${order.id}`,
  });

  await paymentRepo.create({
    orderId:      order.id,
    provider:     provider.name,
    providerTxId,
    amount:       order.total_amount,
    currency:     provider.currency,
  });

  return { provider_tx_id: providerTxId, redirect_url: redirectUrl || null, instructions: instructions || null };
}

/**
 * Handles the payment provider's webhook.
 * rawBody: Buffer or string — the un-parsed original request body.
 */
async function handleWebhook(body, signature, rawBody) {
  const { success, providerTxId } = provider.verifyWebhook(body, signature, rawBody);

  if (!providerTxId) throw new AppError('Missing provider transaction id');

  const payment = await paymentRepo.findByProviderTxId(providerTxId);
  if (!payment) throw new AppError('Payment record not found', 404);

  const newStatus = success ? 'success' : 'failed';
  await paymentRepo.updateStatus(payment.id, newStatus, body);

  if (success) {
    await orderRepo.updatePayment(payment.order_id, {
      paymentStatus:    'paid',
      paymentReference: providerTxId,
      paymentMethod:    provider.name,
      status:           'paid',
    });
    logger.info('Order marked as paid', { orderId: payment.order_id });
  } else {
    logger.warn('Payment failed', { orderId: payment.order_id, providerTxId });
  }
}

async function getStatus(orderId, userId) {
  const order = await orderRepo.findByIdAndUser(orderId, userId);
  if (!order) throw new AppError('Order not found', 404);

  const lastPayment = await paymentRepo.latestByOrder(orderId);

  return {
    order_id:       orderId,
    order_status:   order.status,
    payment_status: order.payment_status,
    last_payment:   lastPayment || null,
  };
}

module.exports = { initiate, handleWebhook, getStatus };
