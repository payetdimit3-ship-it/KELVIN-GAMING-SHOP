const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// ⚙️ AZAMPAY CONFIGURATION & CACHE
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
// 🛠️ HELPER FUNCTIONS (JSON & AUTH)
// ═══════════════════════════════════════════════════════════════

function readJson(filename, defaultValue = []) {
  try {
    const filePath = path.join(__dirname, filename);
    if (!fs.existsSync(filePath)) return defaultValue;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err);
    return defaultValue;
  }
}

function writeJson(filename, data) {
  try {
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filename}:`, err);
  }
}

function getUserByToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  const sessions = readJson('sessions.json', []);
  const session = sessions.find(s => s.token === token);
  if (!session) return null;
  const users = readJson('users.json', []);
  return users.find(u => u.email === session.email) || null;
}

function logSecurity(event, details, severity = 'LOW', ip = '127.0.0.1') {
  const logs = readJson('security.json', []);
  logs.push({ event, details, severity, ip, timestamp: new Date().toISOString() });
  writeJson('security.json', logs);
}

function getIP(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
}

// ═══════════════════════════════════════════════════════════════
// 🔐 AZAMPAY TOKEN GENERATOR
// ═══════════════════════════════════════════════════════════════

async function getAzamPayToken() {
  if (azamPayToken && Date.now() < azamPayTokenExpiresAt) {
    return azamPayToken;
  }

  if (!AZAMPAY_APP_NAME || !AZAMPAY_CLIENT_ID || !AZAMPAY_CLIENT_SECRET) {
    throw new Error('AzamPay credentials (APP_NAME, CLIENT_ID, CLIENT_SECRET) hazijawekwa kwenye Render Environment.');
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
    throw new Error(data.message || 'Imeshindikana kupata AzamPay Access Token.');
  }

  azamPayToken = data.data.accessToken;
  const expireSeconds = Number(data.data.expire) || 300;
  azamPayTokenExpiresAt = Date.now() + Math.max(60, expireSeconds - 60) * 1000;

  return azamPayToken;
}

// ═══════════════════════════════════════════════════════════════
// 📱 PHONE & PROVIDER NORMALIZERS
// ═══════════════════════════════════════════════════════════════

function normalizeTanzaniaPhone(phone) {
  let value = String(phone || '').trim().replace(/\s+/g, '').replace(/-/g, '');
  if (!value) return null;
  if (value.startsWith('+255')) value = value.substring(1);
  if (value.startsWith('255')) return value;
  if (value.startsWith('0')) return '255' + value.substring(1);
  if (/^[67]\d{8}$/.test(value)) return '255' + value;
  return null;
}

function normalizeAzamProvider(network, phone) {
  const value = String(network || '').toLowerCase().trim();

  if (value.includes('mpesa') || value.includes('m-pesa') || value.includes('voda')) return 'Mpesa';
  if (value.includes('tigo') || value.includes('mixx')) return 'Tigo';
  if (value.includes('airtel')) return 'Airtel';
  if (value.includes('halo') || value.includes('halopesa')) return 'Halopesa';
  if (value.includes('azam')) return 'Azampesa';

  const p = normalizeTanzaniaPhone(phone);
  if (p) {
    const prefix = p.substring(3, 6);
    if (['740', '741', '742', '743', '744', '745', '746', '747', '748', '749', '750', '751', '752', '753', '754', '755', '756', '757', '758', '759', '760', '761', '762', '763', '764', '765', '766', '767', '768', '769'].includes(prefix)) return 'Mpesa';
    if (['680', '681', '682', '683', '684', '685', '686', '687', '688', '689', '780', '781', '782', '783', '784', '785', '786', '787', '788', '789'].includes(prefix)) return 'Airtel';
    if (['650', '651', '652', '653', '654', '655', '656', '657', '658', '659', '670', '671', '672', '673', '674', '675', '676', '677', '678', '679', '710', '711', '712', '713', '714', '715', '716', '717', '718', '719'].includes(prefix)) return 'Tigo';
    if (['620', '621', '622', '623', '624', '625', '626', '627', '628', '629'].includes(prefix)) return 'Halopesa';
  }
  return null;
}

function createAzamOrderReference() {
  return 'GH-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function validPaymentAmount(amount) {
  const value = Number(amount);
  return Number.isFinite(value) && value >= 100;
}

// ═══════════════════════════════════════════════════════════════
// 🛒 AZAMPAY MNO CHECKOUT PROCESSOR
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

  console.log('AZAMPAY CHECKOUT SENDING:', JSON.stringify(payload));

  const response = await fetch(AZAMPAY_CHECKOUT_URL + '/azampay/mno/checkout', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok || data.success !== true) {
    console.error('AZAMPAY CHECKOUT ERROR:', JSON.stringify(data));
    throw new Error(data.message || 'AzamPay imeshindwa kuanzisha malipo.');
  }

  return data;
}

// ═══════════════════════════════════════════════════════════════
// 💳 MAIN ENDPOINT ROUTER FOR PAYMENTS
// ═══════════════════════════════════════════════════════════════

const handlePaymentRequest = async (req, res) => {
  try {
    let user = null;
    try { user = getUserByToken(req); } catch (e) { user = null; }

    const { amount, email, phone, name, network, items } = req.body;

    const customerEmail = String(email || user?.email || '').trim().toLowerCase();
    const customerName = String(name || user?.name || 'Mteja GameHub').trim();

    if (!validPaymentAmount(amount)) {
      return res.status(400).json({ success: false, error: 'Kiasi cha malipo lazima kianzie TZS 100.' });
    }

    if (!customerEmail) {
      return res.status(400).json({ success: false, error: 'Email inahitajika.' });
    }

    const phoneFull = normalizeTanzaniaPhone(phone);
    if (!phoneFull) {
      return res.status(400).json({ success: false, error: 'Namba ya simu si sahihi (Mfano: 0712345678).' });
    }

    const provider = normalizeAzamProvider(network, phoneFull);
    if (!provider) {
      return res.status(400).json({ success: false, error: 'Mtandao wa simu haujatambulika.' });
    }

    const tx_ref = createAzamOrderReference();
    const orders = readJson('orders.json', []);

    const order = {
      tx_ref,
      transactionId: null,
      customer: customerEmail,
      customerPhone: phoneFull,
      customerName,
      customerEmail,
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

    order.transactionId = azamResponse.transactionId || azamResponse.data?.transactionId || azamResponse.data?.pgReferenceId || null;
    writeJson('orders.json', orders);

    logSecurity('AZAMPAY_PAYMENT_STARTED', `Order: ${tx_ref} | ${provider} | ${amount} TZS`, 'LOW', getIP(req));

    return res.json({
      success: true,
      tx_ref,
      transactionId: order.transactionId,
      provider,
      amount: Number(amount),
      status: 'pending',
      message: azamResponse.message || 'Ombi la malipo limetumwa! Ingiza PIN kwenye simu yako.'
    });

  } catch (err) {
    console.error('AZAMPAY PAYMENT ERROR:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Hitilafu imetokea wakati wa kuwasiliana na AzamPay.'
    });
  }
};

// Endpoints za kutuma malipo (Zote zinafanya kazi)
app.post('/api/pay', handlePaymentRequest);
app.post('/api/azampay/pay', handlePaymentRequest);

// ═══════════════════════════════════════════════════════════════
// 🔔 AZAMPAY CALLBACK (WEBHOOK) & VERIFICATION
// ═══════════════════════════════════════════════════════════════

app.post('/api/azampay/callback', async (req, res) => {
  try {
    const body = req.body || {};
    console.log('AZAMPAY CALLBACK RECEIVED:', JSON.stringify(body));

    const externalReference = body.externalreference || body.externalReference || body.externalId || body.referenceId || null;
    const transactionStatus = String(body.transactionstatus || body.transactionStatus || body.status || '').toLowerCase();

    if (!externalReference) {
      return res.status(400).json({ success: false, error: 'External reference haipo.' });
    }

    const orders = readJson('orders.json', []);
    const order = orders.find(o => o.tx_ref === externalReference);

    if (!order) {
      return res.json({ success: true }); // Acknowledge ili AzamPay wasijaribu tena
    }

    if (order.status === 'successful') return res.json({ success: true });

    const successStatuses = ['successful', 'success', 'completed', 'paid'];
    const failedStatuses = ['failed', 'failure', 'cancelled', 'declined'];

    if (successStatuses.includes(transactionStatus)) {
      order.status = 'successful';
      order.confirmedAt = new Date().toISOString();
      order.azampayTransactionId = body.transid || body.transactionId || null;
      writeJson('orders.json', orders);
      logSecurity('AZAMPAY_SUCCESS', `Order Paid: ${externalReference}`, 'LOW', getIP(req));
    } else if (failedStatuses.includes(transactionStatus)) {
      order.status = 'failed';
      writeJson('orders.json', orders);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('CALLBACK ERROR:', err);
    return res.status(500).json({ error: 'Callback processing error' });
  }
});

app.get('/api/verify', async (req, res) => {
  const tx_ref = String(req.query.tx_ref || '').trim();
  const orders = readJson('orders.json', []);
  const order = orders.find(o => o.tx_ref === tx_ref);

  if (!order) return res.status(404).json({ success: false, error: 'Order haipatikani.' });

  return res.json({
    success: order.status === 'successful',
    status: order.status,
    tx_ref: order.tx_ref,
    amount: order.amount,
    provider: order.provider
  });
});

app.get('/api/admin/azampay-status', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });

  res.json({
    success: true,
    environment: AZAMPAY_ENV,
    configured: !!(AZAMPAY_APP_NAME && AZAMPAY_CLIENT_ID && AZAMPAY_CLIENT_SECRET),
    authUrl: AZAMPAY_AUTH_URL,
    checkoutUrl: AZAMPAY_CHECKOUT_URL
  });
});
