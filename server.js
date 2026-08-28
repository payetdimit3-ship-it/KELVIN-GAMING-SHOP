// ═══════════════════════════════════════════════════════════════
// 💳 MAIN PAYMENT ENDPOINT (INASHAWISHI LOGGED-IN & GUEST CHECKOUT)
// ═══════════════════════════════════════════════════════════════

const handlePaymentRequest = async (req, res) => {
  try {
    // 1. Jaribu kupata user (Kama yupo logged in)
    let user = null;
    try {
      if (typeof getUserByToken === 'function') {
        user = getUserByToken(req);
      }
    } catch (e) {
      user = null;
    }

    const {
      amount,
      email,
      phone,
      name,
      network,
      items
    } = req.body;

    // Kama user hajainikiwa kuwa authenticated, tumia data za form ya checkout
    const customerEmail = String(email || user?.email || '').trim().toLowerCase();
    const customerName = String(name || user?.name || 'Mteja GameHub').trim();

    // ─────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────

    if (!validPaymentAmount(amount)) {
      return res.status(400).json({
        success: false,
        error: 'Kiasi cha malipo si sahihi (Lazima kianzie TZS 100).'
      });
    }

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email inahitajika kukamilisha agizo.'
      });
    }

    const phoneFull = normalizeTanzaniaPhone(phone);

    if (!phoneFull) {
      return res.status(400).json({
        success: false,
        error: 'Namba ya simu si sahihi. Tumia mfano 0712345678 au 255712345678.'
      });
    }

    const provider = normalizeAzamProvider(network, phoneFull);

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: 'Chagua mtandao sahihi: M-Pesa, Tigo Pesa, Airtel Money, HaloPesa au AzamPesa.'
      });
    }

    // ─────────────────────────────────────
    // ORDER REFERENCE & SAVE
    // ─────────────────────────────────────

    const tx_ref = createAzamOrderReference();
    const orders = typeof readJson === 'function' ? readJson('orders.json', []) : [];

    const order = {
      tx_ref,
      transactionId: null,
      customer: customerEmail,
      customerPhone: phoneFull,
      customerName: customerName,
      customerEmail: customerEmail,
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
    if (typeof writeJson === 'function') {
      writeJson('orders.json', orders);
    }

    // ─────────────────────────────────────
    // SEND PAYMENT TO AZAMPAY
    // ─────────────────────────────────────

    const azamResponse = await azamPayMnoCheckout({
      accountNumber: phoneFull,
      amount: Number(amount),
      provider,
      externalId: tx_ref
    });

    const transactionId =
      azamResponse.transactionId ||
      azamResponse.data?.transactionId ||
      azamResponse.data?.pgReferenceId ||
      null;

    order.transactionId = transactionId;
    order.status = 'pending';

    if (typeof writeJson === 'function') {
      writeJson('orders.json', orders);
    }

    if (typeof logSecurity === 'function') {
      logSecurity(
        'AZAMPAY_PAYMENT_STARTED',
        `Malipo yameanzishwa: ${tx_ref} | ${provider} | ${amount} TZS`,
        'LOW',
        typeof getIP === 'function' ? getIP(req) : req.ip
      );
    }

    return res.json({
      success: true,
      tx_ref,
      transactionId,
      provider,
      amount: Number(amount),
      status: 'pending',
      message: azamResponse.message || 'Ombi la malipo limetumwa. Angalia simu yako na ingiza PIN kuthibitisha.'
    });

  } catch (err) {
    console.error('AZAMPAY PAYMENT ERROR:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Imeshindikana kuanzisha malipo ya AzamPay. Angalia API Keys zilizopo Render.'
    });
  }
};

// Ruhusu endpoints zote mbili zifanye kazi bila kufeli!
app.post('/api/pay', handlePaymentRequest);
app.post('/api/azampay/pay', handlePaymentRequest);
