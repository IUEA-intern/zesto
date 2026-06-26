'use strict';

const https = require('https');

const DEFAULT_BASE_URL = 'https://pay.pesapal.com/v3';

function getBaseUrl() {
  return (process.env.PESAPAL_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function requestJson(method, url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const req = https.request(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data = {};
        if (raw) {
          try { data = JSON.parse(raw); }
          catch { return reject(new Error('Invalid JSON from Pesapal')); }
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = data.error?.message || data.message || data.error || `Pesapal request failed (${res.statusCode})`;
          const err = new Error(message);
          err.statusCode = res.statusCode;
          err.data = data;
          return reject(err);
        }

        resolve(data);
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Pesapal request timed out'));
    });

    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error('Pesapal credentials are not configured.');
  }

  const response = await requestJson('POST', `${getBaseUrl()}/api/Auth/RequestToken`, {
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
  });

  if (!response.token) {
    throw new Error('Failed to get Pesapal token.');
  }

  return response.token;
}

async function submitOrderRequest(order) {
  const token = await getToken();
  return requestJson('POST', `${getBaseUrl()}/api/Transactions/SubmitOrderRequest`, order, {
    Authorization: `Bearer ${token}`,
  });
}

async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();
  const url = `${getBaseUrl()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`;
  return requestJson('GET', url, null, {
    Authorization: `Bearer ${token}`,
  });
}

async function registerIpn(url, notificationType = 'POST') {
  const token = await getToken();
  return requestJson('POST', `${getBaseUrl()}/api/URLSetup/RegisterIPN`, {
    url,
    ipn_notification_type: notificationType,
  }, {
    Authorization: `Bearer ${token}`,
  });
}

module.exports = {
  getToken,
  submitOrderRequest,
  getTransactionStatus,
  registerIpn,
};
