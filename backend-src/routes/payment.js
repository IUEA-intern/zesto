// routes/payment.js
const express         = require('express');
const { auth }        = require('../middleware/auth');
const paymentService  = require('../services/paymentService');
const router          = express.Router();

// Initiate payment (customer)
router.post('/initiate', auth, async (req, res, next) => {
  try {
    const result = await paymentService.initiate(req.user.id, req.body);
    res.json({ message: 'Payment initiated', ...result });
  } catch (err) { next(err); }
});

/**
 * Webhook from the payment provider (no JWT — server-to-server).
 * IMPORTANT: this route must be mounted BEFORE express.json() in server.js,
 * so req.body here is the raw Buffer and req.parsedBody is the parsed object.
 * See server.js for how this is set up.
 */
router.post('/webhook', async (req, res) => {
  try {
    // req.body = raw Buffer (set up in server.js with express.raw())
    // req.parsedBody = parsed JSON object
    const signature = req.headers['x-signature'] || req.headers['verif-hash'] || '';
    await paymentService.handleWebhook(req.parsedBody, signature, req.body);
    res.sendStatus(200);
  } catch (err) {
    // Always return 200 to the provider so it doesn't keep retrying for expected errors
    res.sendStatus(200);
  }
});

// Poll payment status (customer)
router.get('/status/:order_id', auth, async (req, res, next) => {
  try {
    const result = await paymentService.getStatus(Number(req.params.order_id), req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
