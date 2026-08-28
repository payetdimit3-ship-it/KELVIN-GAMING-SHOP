const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // au folder lako la frontend

// ═══════════════════════════════════════════════════════════════
// ⚙️ AZAMPAY CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const AZAMPAY_ENV = String(process.env.AZAMPAY_ENV || 'sandbox').toLowerCase();
const AZAMPAY_APP_NAME = process.env.AZAMPAY_APP_NAME;
const AZAMPAY_CLIENT_ID = process.env.AZAMPAY_CLIENT_ID;
const AZAMPAY_CLIENT_SECRET = process.env.AZAMPAY_CLIENT_SECRET;

const AZAMPAY_AUTH_URL = AZAMPAY_ENV === 'production'
  ? 'https://authenticator.azampay.co.tz/AppRegistration/GenerateToken'
  : 'https://authenticator-sandbox.azampay.co.tz/AppRegistration/GenerateToken';

const AZAMPAY_CHECKOUT_URL = AZAMPAY_ENV === 'production'
  ? 'https://checkout.azampay.co.tz'
  : 'https://sandbox.azampay.co.tz';

let azamPayToken = null;
let azamPayTokenExpiresAt = 0;

// ═══════════════════════════════════════════════════════════════
// 🛠️ HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function readJson(filename, defaultValue = []) {
  try {
    const filePath = path.join(__dirname, filename);
    if (!fs.existsSync(filePath)) return defaultValue;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return defaultValue;
  }
}

function writeJson(filename, data) {
  try {
    fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(data, null, 2), 'utf8');
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
  if (value.includes('mpesa') || value.includes('voda')) return 'Mpesa';
  if (value.includes('tigo') || value.includes('mixx')) return 'Tigo';
  if (value.includes('airtel')) return 'Airtel';
  if (value.includes('halo')) return 'Halopesa';
  if (value.includes('azam')) return 'Azampesa';

  const p = normalizeTanzaniaPhone(phone);
  if (p) {
    const prefix = p.substring(3, 6);
    if (['740','741','742','743','744','745','746','747','748','749','750','751','752','753','754','755','756','757','758','759','760','761','762','763','764','765','766','767','768','769'].includes(prefix)) return 'Mpesa';
    if (['680','681','682','683','684','685','686','687','688','689','780','781','782','783','784','785','786','787','788','789'].includes(prefix)) return 'Airtel';
    if (['650','651','652','653','654','655','656','657','658','659','670','671','672','673','674','675','676','677','678','679','710','711','712','713','714','715','716','717','718','719'].includes(prefix)) return 'Tigo';
    if (['620','621','622','623','624','625','626','627','628','629'].includes(prefix)) return 'Halopesa';
  }
  return null;
}

async function getAzamPayToken() {
  if (azamPayToken && Date.now() < azamPayTokenExpiresAt) return azamPayToken;

  if (!AZAMPAY_APP_NAME || !AZAMPAY_CLIENT_ID || !AZAMPAY_CLIENT_SECRET) {
    throw new Error('AzamPay Keys hazijawekwa kwenye Render Environment.');
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
    throw new Error(data.message || 'Token generation failed');
  }

  azamPayToken = data.data.accessToken;
  const expireSeconds = Number(data.data.expire) || 300;
  azamPayTokenExpiresAt = Date.now() + Math.max(60, expireSeconds - 60) * 1000;
  return azamPayToken;
}

// ═══════════════════════════════════════════════════════════════
// 💳 PAYMENT ROUTES
// ═══════════════════════════════════════════════════════════════
const handlePaymentRequest = async (req, res) => {
  try {
    let user = null;
    try { user = getUserByToken(req); } catch (e) { user = null; }

    const { amount, email, phone, name, network, items } = req.body;
    const customerEmail = String(email || user?.email || '').trim().toLowerCase();
    const customerName = String(name || user?.name || 'Mteja GameHub').trim();

    if (!amount || Number(amount) < 100) {
      return res.status(400).json({ success: false, error: 'Kiasi lazima kianzie TZS 100.' });
    }

    const phoneFull = normalizeTanzaniaPhone(phone);
    if (!phoneFull) {
      return res.status(400).json({ success: false, error: 'Namba ya simu si sahihi.' });
    }

    const provider = normalizeAzamProvider(network, phoneFull);
    if (!provider) {
      return res.status(400).json({ success: false, error: 'Mtandao haujatambulika.' });
    }

    const tx_ref = 'GH-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
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
      date: new Date().toISOString()
    };

    orders.push(order);
    writeJson('orders.json', orders);

    const token = await getAzamPayToken();
    const azamRes = await fetch(AZAMPAY_CHECKOUT_URL + '/azampay/mno/checkout', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountNumber: phoneFull,
        amount: String(amount),
        currency: 'TZS',
        externalId: tx_ref,
        provider: provider,
        additionalProperties: {}
      })
    });

    const data = await azamRes.json();
    if (!azamRes.ok || data.success !== true) {
      throw new Error(data.message || 'AzamPay checkout failed');
    }

    order.transactionId = data.transactionId || data.data?.transactionId || null;
    writeJson('orders.json', orders);

    return res.json({
      success: true,
      tx_ref,
      amount: Number(amount),
      status: 'pending',
      message: 'Ombi limetumwa! Ingiza PIN kwenye simu yako.'
    });

  } catch (err) {
    console.error('PAYMENT ERROR:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
};

app.post('/api/pay', handlePaymentRequest);
app.post('/api/azampay/pay', handlePaymentRequest);

app.post('/api/azampay/callback', (req, res) => {
  const body = req.body || {};
  const externalRef = body.externalreference || body.externalId;
  const status = String(body.transactionstatus || body.status || '').toLowerCase();

  if (externalRef) {
    const orders = readJson('orders.json', []);
    const order = orders.find(o => o.tx_ref === externalRef);
    if (order) {
      if (['successful', 'success', 'paid'].includes(status)) {
        order.status = 'successful';
        order.confirmedAt = new Date().toISOString();
      } else if (['failed', 'cancelled'].includes(status)) {
        order.status = 'failed';
      }
      writeJson('orders.json', orders);
    }
  }
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// 🚀 START SERVER
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🎮 GameHub server iko live kwenye port ${PORT}`);
});
