// ═══════════════════════════════════════════════════════════════
// 💳 AZAMPAY — AUTOMATIC TANZANIA MOBILE MONEY PAYMENTS
// ═══════════════════════════════════════════════════════════════
//
// Supported:
//   M-Pesa       -> Mpesa
//   Tigo Pesa    -> Tigo
//   Airtel Money -> Airtel
//   HaloPesa     -> Halopesa
//   AzamPesa     -> Azampesa
//
// Flow:
//
// Customer
//    ↓
// /api/pay
//    ↓
// Save pending order
//    ↓
// AzamPay MNO Checkout
//    ↓
// USSD PUSH kwenye simu ya mteja
//    ↓
// Customer anaingiza PIN
//    ↓
// AzamPay Callback
//    ↓
// /api/azampay/callback
//    ↓
// Order = successful
//    ↓
// My Orders
//
// ═══════════════════════════════════════════════════════════════

const AZAMPAY_ENV = String(process.env.AZAMPAY_ENV || 'sandbox').toLowerCase();

const AZAMPAY_APP_NAME = process.env.AZAMPAY_APP_NAME;
const AZAMPAY_CLIENT_ID = process.env.AZAMPAY_CLIENT_ID;
const AZAMPAY_CLIENT_SECRET = process.env.AZAMPAY_CLIENT_SECRET;

// Sandbox / Production URLs
const AZAMPAY_AUTH_URL =
  AZAMPAY_ENV === 'production'
    ? 'https://authenticator.azampay.co.tz/AppRegistration/GenerateToken'
    : 'https://authenticator-sandbox.azampay.co.tz/AppRegistration/GenerateToken';

const AZAMPAY_CHECKOUT_URL =
  AZAMPAY_ENV === 'production'
    ? 'https://checkout.azampay.co.tz'
    : 'https://sandbox.azampay.co.tz';

// Token cache
let azamPayToken = null;
let azamPayTokenExpiresAt = 0;


// ═══════════════════════════════════════════════════════════════
// AZAMPAY TOKEN
// ═══════════════════════════════════════════════════════════════

async function getAzamPayToken() {

  if (
    azamPayToken &&
    Date.now() < azamPayTokenExpiresAt
  ) {
    return azamPayToken;
  }

  if (
    !AZAMPAY_APP_NAME ||
    !AZAMPAY_CLIENT_ID ||
    !AZAMPAY_CLIENT_SECRET
  ) {
    throw new Error(
      'AzamPay credentials hazijawekwa kwenye Render Environment Variables.'
    );
  }

  const response = await fetch(AZAMPAY_AUTH_URL, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json'
    },

    body: JSON.stringify({
      appName: AZAMPAY_APP_NAME,
      clientId: AZAMPAY_CLIENT_ID,
      clientSecret: AZAMPAY_CLIENT_SECRET
    })
  });

  const data = await response.json();

  if (!response.ok || !data.success || !data.data?.accessToken) {

    console.error(
      'AZAMPAY TOKEN ERROR:',
      JSON.stringify(data)
    );

    throw new Error(
      data.message ||
      'Imeshindikana kupata AzamPay Bearer Token.'
    );
  }

  azamPayToken = data.data.accessToken;

  // Token inaweza kuwa na expire information.
  // Tunai-cache kwa dakika chache kwa usalama.
  const expireSeconds =
    Number(data.data.expire) ||
    300;

  azamPayTokenExpiresAt =
    Date.now() +
    Math.max(60, expireSeconds - 60) * 1000;

  return azamPayToken;
}


// ═══════════════════════════════════════════════════════════════
// PHONE NUMBER CLEANER
// ═══════════════════════════════════════════════════════════════

function normalizeTanzaniaPhone(phone) {

  let value = String(phone || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/-/g, '');

  if (!value) return null;

  // +255712345678
  if (value.startsWith('+255')) {
    value = value.substring(1);
  }

  // 255712345678
  if (value.startsWith('255')) {
    return value;
  }

  // 0712345678
  if (value.startsWith('0')) {
    return '255' + value.substring(1);
  }

  // 712345678
  if (/^7\d{8}$/.test(value)) {
    return '255' + value;
  }

  // 6xxxxxxxx
  if (/^6\d{8}$/.test(value)) {
    return '255' + value;
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════
// NETWORK → AZAMPAY PROVIDER
// ═══════════════════════════════════════════════════════════════

function normalizeAzamProvider(network, phone) {

  const value = String(network || '')
    .toLowerCase()
    .trim();

  if (
    value.includes('mpesa') ||
    value.includes('m-pesa') ||
    value.includes('vodacom')
  ) {
    return 'Mpesa';
  }

  if (
    value.includes('tigo') ||
    value.includes('mixx')
  ) {
    return 'Tigo';
  }

  if (
    value.includes('airtel')
  ) {
    return 'Airtel';
  }

  if (
    value.includes('halo') ||
    value.includes('halopesa')
  ) {
    return 'Halopesa';
  }

  if (
    value.includes('azam')
  ) {
    return 'Azampesa';
  }

  // Kama frontend haikutuma network,
  // jaribu kutambua kwa prefix ya simu.
  const p = normalizeTanzaniaPhone(phone);

  if (p) {

    const prefix = p.substring(3, 6);

    // Vodacom
    if (
      ['740', '741', '742', '743', '744',
       '745', '746', '747', '748', '749'].includes(prefix)
    ) {
      return 'Mpesa';
    }

    // Airtel
    if (
      ['680', '681', '682', '683',
       '684', '685', '686', '687',
       '688', '689'].includes(prefix)
    ) {
      return 'Airtel';
    }

    // Tigo
    if (
      ['650', '651', '652', '653',
       '654', '655', '656', '657',
       '658', '659'].includes(prefix)
    ) {
      return 'Tigo';
    }
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════
// UNIQUE ORDER REFERENCE
// ═══════════════════════════════════════════════════════════════

function createAzamOrderReference() {

  return (
    'GH-' +
    Date.now().toString(36).toUpperCase() +
    '-' +
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
}


// ═══════════════════════════════════════════════════════════════
// CHECK AMOUNT
// ═══════════════════════════════════════════════════════════════

function validPaymentAmount(amount) {

  const value = Number(amount);

  if (!Number.isFinite(value)) return false;
  if (value <= 0) return false;
  if (!Number.isInteger(value)) return false;

  // TZS
  return value >= 100;
}


// ═══════════════════════════════════════════════════════════════
// AZAMPAY MNO CHECKOUT
// ═══════════════════════════════════════════════════════════════

async function azamPayMnoCheckout({
  accountNumber,
  amount,
  provider,
  externalId
}) {

  const token = await getAzamPayToken();

  const payload = {
    accountNumber: accountNumber,
    amount: String(amount),
    currency: 'TZS',
    externalId: externalId,
    provider: provider,
    additionalProperties: {}
  };

  console.log(
    'AZAMPAY CHECKOUT:',
    JSON.stringify({
      amount,
      provider,
      externalId
    })
  );

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

    console.error(
      'AZAMPAY CHECKOUT ERROR:',
      JSON.stringify(data)
    );

    throw new Error(
      data.message ||
      'AzamPay imeshindwa kuanzisha malipo.'
    );
  }

  return data;
}


// ═══════════════════════════════════════════════════════════════
// 💳 MAIN PAYMENT ENDPOINT
//
// Frontend yako ya zamani inaweza kuendelea kutumia:
// POST /api/pay
//
// Hivyo hutahitaji kubadilisha frontend kama tayari inaita /api/pay.
// ═══════════════════════════════════════════════════════════════

app.post('/api/pay', async (req, res) => {

  try {

    const user = getUserByToken(req);

    if (!user) {
      return res.status(401).json({
        error: 'Ingia kwanza kulipa.'
      });
    }

    const {
      amount,
      email,
      phone,
      name,
      network,
      items
    } = req.body;


    // ─────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────

    if (!validPaymentAmount(amount)) {

      return res.status(400).json({
        error: 'Kiasi cha malipo si sahihi.'
      });
    }

    if (!email) {

      return res.status(400).json({
        error: 'Email inahitajika.'
      });
    }

    const phoneFull =
      normalizeTanzaniaPhone(phone);

    if (!phoneFull) {

      return res.status(400).json({
        error:
          'Namba ya simu si sahihi. Tumia mfano 0712345678 au 255712345678.'
      });
    }


    const provider =
      normalizeAzamProvider(network, phoneFull);

    if (!provider) {

      return res.status(400).json({
        error:
          'Chagua mtandao sahihi: M-Pesa, Tigo Pesa, Airtel Money, HaloPesa au AzamPesa.'
      });
    }


    // ─────────────────────────────────────
    // ORDER REFERENCE
    // ─────────────────────────────────────

    const tx_ref =
      createAzamOrderReference();


    // ─────────────────────────────────────
    // HIFADHI ORDER KWANZA
    // ─────────────────────────────────────

    const orders =
      readJson('orders.json', []);

    const order = {

      tx_ref,

      // AzamPay transaction ID
      transactionId: null,

      customer: user.email,

      customerPhone: phoneFull,

      customerName:
        String(name || user.name || '').trim(),

      customerEmail:
        String(email).trim().toLowerCase(),

      amount: Number(amount),

      currency: 'TZS',

      provider,

      items: Array.isArray(items)
        ? items
        : [],

      status: 'pending',

      paymentMethod: 'AzamPay',

      date: new Date().toISOString(),

      confirmedAt: null

    };

    orders.push(order);

    writeJson(
      'orders.json',
      orders
    );


    // ─────────────────────────────────────
    // SEND PAYMENT TO AZAMPAY
    // ─────────────────────────────────────

    const azamResponse =
      await azamPayMnoCheckout({

        accountNumber: phoneFull,

        amount: Number(amount),

        provider,

        externalId: tx_ref

      });


    // ─────────────────────────────────────
    // SAVE AZAMPAY TRANSACTION ID
    // ─────────────────────────────────────

    const transactionId =
      azamResponse.transactionId ||
      azamResponse.data?.transactionId ||
      azamResponse.data?.pgReferenceId ||
      null;

    order.transactionId =
      transactionId;


    // AzamPay amesema request imepokelewa.
    order.status = 'pending';

    writeJson(
      'orders.json',
      orders
    );


    // Security log
    logSecurity(
      'AZAMPAY_PAYMENT_STARTED',

      'Malipo yameanzishwa: ' +
      tx_ref +
      ' | ' +
      provider +
      ' | ' +
      amount +
      ' TZS',

      'LOW',

      getIP(req)
    );


    return res.json({

      success: true,

      tx_ref,

      transactionId,

      provider,

      amount: Number(amount),

      status: 'pending',

      message:
        azamResponse.message ||
        'Ombi la malipo limetumwa. Angalia simu yako na ingiza PIN kuthibitisha.'

    });

  } catch (err) {

    console.error(
      'AZAMPAY PAYMENT ERROR:',
      err
    );

    return res.status(500).json({

      error:
        err.message ||
        'Imeshindikana kuanzisha malipo ya AzamPay.'

    });

  }

});


// ═══════════════════════════════════════════════════════════════
// 🔔 AZAMPAY CALLBACK / WEBHOOK
//
// AzamPay itatuma taarifa hapa baada ya transaction.
// URL:
// https://YOUR-DOMAIN.onrender.com/api/azampay/callback
//
// Callback fields zinazotumika kwenye AzamPay v1:
// transactionstatus
// transid
// utilityref
// operator
// externalreference
// msisdn
// mnoreference
// amount
// signature
// ═══════════════════════════════════════════════════════════════

app.post('/api/azampay/callback', async (req, res) => {

  try {

    const body = req.body || {};

    console.log(
      'AZAMPAY CALLBACK:',
      JSON.stringify(body)
    );


    const externalReference =
      body.externalreference ||
      body.externalReference ||
      body.externalId ||
      body.referenceId ||
      body.orderReference ||
      null;

    const transactionStatus =
      String(
        body.transactionstatus ||
        body.transactionStatus ||
        body.status ||
        ''
      ).toLowerCase();


    if (!externalReference) {

      logSecurity(
        'AZAMPAY_CALLBACK_INVALID',
        'Callback imefika bila external reference.',
        'MEDIUM',
        getIP(req)
      );

      return res.status(400).json({
        success: false,
        error: 'External reference haipo.'
      });
    }


    const orders =
      readJson('orders.json', []);

    const order =
      orders.find(
        o => o.tx_ref === externalReference
      );


    if (!order) {

      logSecurity(
        'AZAMPAY_UNKNOWN_ORDER',
        'AzamPay callback ya order isiyojulikana: ' +
        externalReference,
        'HIGH',
        getIP(req)
      );

      // Callback ipakubaliwe ili AzamPay
      // isijaribu tena bila sababu.
      return res.json({
        success: true
      });
    }


    // ─────────────────────────────────────
    // ALREADY SUCCESSFUL
    // ─────────────────────────────────────

    if (order.status === 'successful') {

      return res.json({
        success: true
      });
    }


    // ─────────────────────────────────────
    // AMOUNT CHECK
    // ─────────────────────────────────────

    const callbackAmount =
      Number(
        body.amount ||
        body.collectedAmount ||
        body.paidAmount ||
        0
      );


    if (
      callbackAmount > 0 &&
      callbackAmount < Number(order.amount)
    ) {

      order.status =
        'amount_mismatch';

      order.callback =
        body;

      writeJson(
        'orders.json',
        orders
      );

      logSecurity(
        'AZAMPAY_AMOUNT_MISMATCH',

        'Kiasi cha AzamPay (' +
        callbackAmount +
        ') hakilingani na order (' +
        order.amount +
        ') ' +
        externalReference,

        'HIGH',

        getIP(req)
      );

      return res.json({
        success: false
      });
    }


    // ─────────────────────────────────────
    // SUCCESS STATUSES
    // ─────────────────────────────────────

    const successStatuses = [
      'successful',
      'success',
      'completed',
      'complete',
      'settled',
      'paid',
      'successfulpayment'
    ];


    const failedStatuses = [
      'failed',
      'failure',
      'cancelled',
      'canceled',
      'rejected',
      'declined',
      'expired'
    ];


    if (
      successStatuses.includes(transactionStatus)
    ) {

      order.status =
        'successful';

      order.confirmedAt =
        new Date().toISOString();

      order.azampayTransactionId =
        body.transid ||
        body.transactionId ||
        body.utilityref ||
        order.transactionId ||
        null;

      order.mnoreference =
        body.mnoreference ||
        null;

      order.callback =
        body;


      writeJson(
        'orders.json',
        orders
      );


      logSecurity(
        'AZAMPAY_PAYMENT_SUCCESS',

        'Malipo ya AzamPay yamethibitishwa: ' +
        externalReference +
        ' | ' +
        order.amount +
        ' TZS',

        'LOW',

        getIP(req)
      );


      return res.json({
        success: true
      });
    }


    if (
      failedStatuses.includes(transactionStatus)
    ) {

      order.status =
        'failed';

      order.callback =
        body;

      writeJson(
        'orders.json',
        orders
      );


      logSecurity(
        'AZAMPAY_PAYMENT_FAILED',

        'Malipo ya AzamPay yameshindwa: ' +
        externalReference,

        'MEDIUM',

        getIP(req)
      );


      return res.json({
        success: true
      });
    }


    // Bado pending / processing
    order.status =
      'pending';

    order.callback =
      body;

    writeJson(
      'orders.json',
      orders
    );


    return res.json({
      success: true
    });

  } catch (err) {

    console.error(
      'AZAMPAY CALLBACK ERROR:',
      err
    );

    return res.status(500).json({
      error: 'Callback processing error'
    });

  }

});


// ═══════════════════════════════════════════════════════════════
// 🔎 CHECK PAYMENT
//
// Frontend yako ya zamani inaweza kuendelea kutumia:
// GET /api/verify?tx_ref=XXXX
//
// Hii sasa haisemi Flutterwave.
// Inasoma status ya AzamPay order yetu.
// ═══════════════════════════════════════════════════════════════

app.get('/api/verify', async (req, res) => {

  try {

    const user =
      getUserByToken(req);

    if (!user) {

      return res.status(401).json({
        error: 'Ingia kwanza.'
      });
    }


    const tx_ref =
      String(req.query.tx_ref || '').trim();

    if (!tx_ref) {

      return res.status(400).json({
        error: 'Transaction reference haipo.'
      });
    }


    const orders =
      readJson('orders.json', []);

    const order =
      orders.find(
        o =>
          o.tx_ref === tx_ref &&
          o.customer === user.email
      );


    if (!order) {

      return res.status(404).json({
        error: 'Order haipatikani.'
      });
    }


    return res.json({

      success:
        order.status === 'successful',

      status:
        order.status,

      tx_ref:
        order.tx_ref,

      transactionId:
        order.transactionId ||
        order.azampayTransactionId ||
        null,

      amount:
        order.amount,

      provider:
        order.provider

    });

  } catch (err) {

    console.error(
      'AZAMPAY VERIFY ERROR:',
      err
    );

    res.status(500).json({
      error: 'Server error'
    });
  }

});


// ═══════════════════════════════════════════════════════════════
// 📱 AZAMPAY STATUS FOR FRONTEND
// ═══════════════════════════════════════════════════════════════

app.get('/api/azampay/status/:ref', (req, res) => {

  const user =
    getUserByToken(req);

  if (!user) {

    return res.status(401).json({
      error: 'Ingia kwanza.'
    });
  }


  const orders =
    readJson('orders.json', []);

  const order =
    orders.find(
      o =>
        o.tx_ref === req.params.ref &&
        o.customer === user.email
    );


  if (!order) {

    return res.status(404).json({
      error: 'Order haipatikani.'
    });
  }


  res.json({

    success: true,

    tx_ref:
      order.tx_ref,

    status:
      order.status,

    amount:
      order.amount,

    provider:
      order.provider,

    transactionId:
      order.transactionId ||
      order.azampayTransactionId ||
      null,

    confirmedAt:
      order.confirmedAt || null

  });

});


// ═══════════════════════════════════════════════════════════════
// 🧪 AZAMPAY CONFIG CHECK — ADMIN ONLY
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/azampay-status', (req, res) => {

  const user =
    getUserByToken(req);

  if (!user || !user.isAdmin) {

    return res.status(403).json({
      error: 'Wewe si admin'
    });
  }


  res.json({

    success: true,

    environment:
      AZAMPAY_ENV,

    configured:
      !!(
        AZAMPAY_APP_NAME &&
        AZAMPAY_CLIENT_ID &&
        AZAMPAY_CLIENT_SECRET
      ),

    authUrl:
      AZAMPAY_AUTH_URL,

    checkoutUrl:
      AZAMPAY_CHECKOUT_URL,

    message:
      'Secrets hazionyeshwi kwa security.'

  });

});