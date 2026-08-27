const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
// 📁 JSON FILE HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function readJson(fileName, fallback = []) {
  try {
    const filePath = path.join(__dirname, fileName);
    if (!fs.existsSync(filePath)) return fallback;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${fileName}:`, err.message);
    return fallback;
  }
}

function writeJson(fileName, data) {
  try {
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${fileName}:`, err.message);
  }
}

// Simple authentication token retriever (adjust based on your auth logic)
function getUserByToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;
  const users = readJson('users.json', []);
  return users.find(u => u.token === token || u.email === token) || null;
}

// ═══════════════════════════════════════════════════════════════
// 💳 AZAMPAY — CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const AZAMPAY_ENV = String(process.env.AZAMPAY_ENV || 'sandbox').toLowerCase();

const AZAMPAY_APP_NAME = process.env.AZAMPAY_APP_NAME;
const AZAMPAY_CLIENT_ID = process.env.AZAMPAY_CLIENT_ID;
const AZAMPAY_CLIENT_SECRET = process.env.AZAMPAY_CLIENT_SECRET;

const AZAMPAY_AUTH_URL =
  AZAMPAY_ENV === 'production'
    ? 'https://authenticator.azampay.co.tz/AppRegistration/GenerateToken'
    : 'https://authenticator-sandbox.azampay.co.tz/AppRegistration/GenerateToken';

const AZAMPAY_CHECKOUT_URL =
  AZAMPAY_ENV === 'production'
    ? 'https://checkout.azampay.co.tz'
    : 'https://sandbox.azampay.co.tz';

let azamPayToken = null;
let azamPayTokenExpiresAt = 0;

// ═══════════════════════════════════════════════════════════════
// AZAMPAY TOKEN GENERATOR
// ═══════════════════════════════════════════════════════════════

async function getAzamPayToken() {
  if (azamPayToken && Date.now() < azamPayTokenExpiresAt) {
    return azamPayToken;
  }

  if (!AZAMPAY_APP_NAME || !AZAMPAY_CLIENT_ID || !AZAMPAY_CLIENT_SECRET) {
    throw new Error('AzamPay credentials hazijawekwa kwenye Render Environment Variables.');
  }

  const response = await fetch(AZAMPAY_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName: AZAMPAY_APP_NAME,
      clientId: AZAMPAY_CLIENT_ID,
      clientSecret: AZAMPAY_CLIENT_SECRET
    })
  });

  const data = await response.json();

  if (!response.ok || !data.success || !data.data?.accessToken) {
    console.error('AZAMPAY TOKEN ERROR:', JSON.stringify(data));
    throw new Error(data.message || 'Imeshindikana kupata AzamPay Bearer Token.');
  }

  azamPayToken = data.data.accessToken;
  const expireSeconds = Number(data.data.expire) || 300;
  azamPayTokenExpiresAt = Date.now() + Math.max(60, expireSeconds - 60) * 1000;

  return azamPayToken;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR PAYMENTS
// ═══════════════════════════════════════════════════════════════

function normalizeTanzaniaPhone(phone) {
  let value = String(phone || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/-/g, '');

  if (!value) return null;

  if (value.startsWith('+255')) value = value.substring(1);
  if (value.startsWith('255')) return value;
  if (value.startsWith('0')) return '255' + value.substring(1);
  if (/^7\d{8}$/.test(value) || /^6\d{8}$/.test(value)) return '255' + value;

  return null;
}

function normalizeAzamProvider(network, phone) {
  const value = String(network || '').toLowerCase().trim();

  if (value.includes('mpesa') || value.includes('m-pesa') || value.includes('vodacom')) return 'Mpesa';
  if (value.includes('tigo') || value.includes('mixx')) return 'Tigo';
  if (value.includes('airtel')) return 'Airtel';
  if (value.includes('halo') || value.includes('halopesa')) return 'Halopesa';
  if (value.includes('azam')) return 'Azampesa';

  const p = normalizeTanzaniaPhone(phone);
  if (p) {
    const prefix = p.substring(3, 6);
    if (['740', '741', '742', '743', '744', '745', '746', '747', '748', '749'].includes(prefix)) return 'Mpesa';
    if (['680', '681', '682', '683', '684', '685', '686', '687', '688', '689'].includes(prefix)) return 'Airtel';
    if (['650', '651', '652', '653', '654', '655', '656', '657', '658', '659'].includes(prefix)) return 'Tigo';
  }
  return null;
}

function createAzamOrderReference() {
  return 'GH-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function validPaymentAmount(amount) {
  const value = Number(amount);
  return Number.isFinite(value) && value >= 100 && Number.isInteger(value);
}

// ═══════════════════════════════════════════════════════════════
// AZAMPAY MNO CHECKOUT
// ═══════════════════════════════════════════════════════════════

async function azamPayMnoCheckout({ accountNumber, amount, provider, externalId }) {
  const token = await getAzamPayToken();

  const payload = {
    accountNumber: accountNumber,
    amount: String(amount),
    currency: 'TZS',
    externalId: externalId,
    provider: provider,
    additionalProperties: {}
  };

  const response = await fetch(
    AZAMPAY_CHECKOUT_URL + '/azampay/mno/checkout',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!response.ok || data.success !== true) {
    console.error('AZAMPAY CHECKOUT ERROR:', JSON.stringify(data));
    throw new Error(data.message || 'AzamPay imeshindwa kuanzisha malipo.');
  }

  return data;
}

// ═══════════════════════════════════════════════════════════════
// 💳 MAIN API ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.post('/api/pay', async (req, res) => {
  try {
    const user = getUserByToken(req);
    if (!user) return res.status(401).json({ error: 'Ingia kwanza kulipa.' });

    const { amount, email, phone, name, network, items } = req.body;

    if (!validPaymentAmount(amount)) return res.status(400).json({ error: 'Kiasi cha malipo si sahihi.' });
    if (!email) return res.status(400).json({ error: 'Email inahitajika.' });

    const phoneFull = normalizeTanzaniaPhone(phone);
    if (!phoneFull) return res.status(400).json({ error: 'Namba ya simu si sahihi.' });

    const provider = normalizeAzamProvider(network, phoneFull);
    if (!provider) return res.status(400).json({ error: 'Chagua mtandao sahihi wa malipo.' });

    const tx_ref = createAzamOrderReference();

    const orders = readJson('orders.json', []);
    const order = {
      tx_ref,
      transactionId: null,
      customer: user.email,
      customerPhone: phoneFull,
      customerName: String(name || user.name || '').trim(),
      customerEmail: String(email).trim().toLowerCase(),
      amount: Number(amount),
      currency: 'TZS',
      provider,
      items: Array.isArray(items) ? items : [],
      status: 'pending',
      paymentMethod: 'AzamPay',
      date: new Date().toISOString(),
      confirmedAt: null
    };

    orders.push(order);
    writeJson('orders.json', orders);

    const azamResponse = await azamPayMnoCheckout({
      accountNumber: phoneFull,
      amount: Number(amount),
      provider,
      externalId: tx_ref
    });

    order.transactionId = azamResponse.transactionId || azamResponse.data?.transactionId || null;
    writeJson('orders.json', orders);

    return res.json({
      success: true,
      tx_ref,
      transactionId: order.transactionId,
      provider,
      amount: Number(amount),
      status: 'pending',
      message: 'Ombi la malipo limetumwa. Angalia simu yako na ingiza PIN kuthibitisha.'
    });
  } catch (err) {
    console.error('AZAMPAY PAYMENT ERROR:', err);
    return res.status(500).json({ error: err.message || 'Imeshindikana kuanzisha malipo ya AzamPay.' });
  }
});

app.post('/api/azampay/callback', async (req, res) => {
  try {
    const body = req.body || {};
    const externalReference = body.externalreference || body.externalReference || body.externalId || null;
    const transactionStatus = String(body.transactionstatus || body.transactionStatus || body.status || '').toLowerCase();

    if (!externalReference) return res.status(400).json({ success: false, error: 'External reference haipo.' });

    const orders = readJson('orders.json', []);
    const order = orders.find(o => o.tx_ref === externalReference);

    if (!order) return res.json({ success: true });
    if (order.status === 'successful') return res.json({ success: true });

    const successStatuses = ['successful', 'success', 'completed', 'paid'];
    const failedStatuses = ['failed', 'cancelled', 'rejected', 'declined'];

    if (successStatuses.includes(transactionStatus)) {
      order.status = 'successful';
      order.confirmedAt = new Date().toISOString();
      order.azampayTransactionId = body.transid || body.transactionId || null;
      writeJson('orders.json', orders);
      return res.json({ success: true });
    }

    if (failedStatuses.includes(transactionStatus)) {
      order.status = 'failed';
      writeJson('orders.json', orders);
      return res.json({ success: true });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('AZAMPAY CALLBACK ERROR:', err);
    return res.status(500).json({ error: 'Callback error' });
  }
});

app.get('/api/verify', async (req, res) => {
  try {
    const user = getUserByToken(req);
    if (!user) return res.status(401).json({ error: 'Ingia kwanza.' });

    const tx_ref = String(req.query.tx_ref || '').trim();
    if (!tx_ref) return res.status(400).json({ error: 'Transaction reference haipo.' });

    const orders = readJson('orders.json', []);
    const order = orders.find(o => o.tx_ref === tx_ref && o.customer === user.email);

    if (!order) return res.status(404).json({ error: 'Order haipatikani.' });

    return res.json({
      success: order.status === 'successful',
      status: order.status,
      tx_ref: order.tx_ref,
      amount: order.amount,
      provider: order.provider
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🚀 START SERVER (PORT CONFIGURATION FOR RENDER)
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server ina-run kwenye port ${PORT}`);
});
