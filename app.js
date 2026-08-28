// ============ GAMEHUB APP.JS (AZAMPAY INTEGRATION) ============

// 1. KUSIMAMIA KIKAPU (CART MANAGEMENT)
function getCart() {
  return JSON.parse(localStorage.getItem('gamehubCart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('gamehubCart', JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const cart = getCart();
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.textContent = cart.reduce((total, item) => total + (item.quantity || 1), 0);
  }
}

// 2. KUTAMBUA MTANDAO WENYE NAMBA YA SIMU AUTOMATIC
function detectNetwork(phone) {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  let prefix = '';
  
  if (cleanPhone.startsWith('255')) {
    prefix = cleanPhone.substring(3, 5);
  } else if (cleanPhone.startsWith('0')) {
    prefix = cleanPhone.substring(1, 3);
  } else {
    prefix = cleanPhone.substring(0, 2);
  }

  // Tigo Pesa
  if (['65', '67', '71', '68'].includes(prefix)) return 'Tigo';
  // M-Pesa (Vodacom)
  if (['74', '75', '76', '79'].includes(prefix)) return 'Vodacom';
  // Airtel Money
  if (['78', '69', '68'].includes(prefix)) return 'Airtel';
  // HaloPesa
  if (['62'].includes(prefix)) return 'Halotel';

  return 'Airtel'; // Default fallback
}

// 3. PROCESSHOUOUT / MALIPO KUPITIA AZAMPAY
async function processAzamPayCheckout(event) {
  if (event) event.preventDefault();

  const nameInput = document.getElementById('checkoutName') || { value: 'Kelvin' };
  const emailInput = document.getElementById('checkoutEmail') || { value: '' };
  const phoneInput = document.getElementById('checkoutPhone');
  const errorBox = document.getElementById('checkoutError') || document.querySelector('.error-msg');
  const payBtn = document.getElementById('payBtn') || document.querySelector('.buy-btn');

  if (!phoneInput || !phoneInput.value.trim()) {
    showError("Tafadhali weka namba ya simu ya malipo.", errorBox);
    return;
  }

  let phone = phoneInput.value.trim().replace(/\s+/g, '');
  
  // Hakikisha namba ipo kwenye muundo wa 255...
  if (phone.startsWith('0')) {
    phone = '255' + phone.substring(1);
  } else if (!phone.startsWith('255') && phone.length === 9) {
    phone = '255' + phone;
  }

  const cart = getCart();
  // Kama kikapu kipo wazi, angalia kama kuna product_id kwenye URL au dataset
  let amount = 0;
  let items = [];

  if (cart.length > 0) {
    amount = cart.reduce((sum, item) => sum + (Number(item.price) * (item.quantity || 1)), 0);
    items = cart;
  } else {
    // Mfano wa ununuzi wa bidhaa moja kwa moja (Single Product Page / Rental)
    const singlePrice = window.currentProductPrice || 1000; 
    amount = singlePrice;
    items = [{ name: window.currentProductName || 'GameHub Purchase', price: amount }];
  }

  const networkProvider = detectNetwork(phone);

  // Badilisha muonekano wa kitufe wakati inaload
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.textContent = '⏳ Inatuma ombi la PIN...';
  }
  if (errorBox) errorBox.style.display = 'none';

  try {
    const response = await fetch('/api/azampay/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount,
        phone: phone,
        provider: networkProvider,
        items: items,
        name: nameInput.value,
        email: emailInput.value
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      alert("📲 Ombi la malipo limetumwa kwenye simu yako (" + phone + ")!\n\nWeka PIN yako kwenye simu kukamilisha muamala.");
      localStorage.removeItem('gamehubCart');
      updateCartBadge();
      window.location.href = 'myorders.html';
    } else {
      showError(data.error || "Hitilafu ya mtandao. Jaribu tena.", errorBox);
    }
  } catch (err) {
    console.error("AzamPay Payment Error:", err);
    showError("Hitilafu ya mtandao. Jaribu tena.", errorBox);
  } finally {
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.textContent = '💳 Lipa Hapa';
    }
  }
}

function showError(msg, element) {
  if (element) {
    element.textContent = "❌ " + msg;
    element.style.display = 'block';
  } else {
    alert("❌ " + msg);
  }
}

// 4. LISTENERS NA INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();

  // Unganisha fomu ya checkout kama ipo kwenye ukurasa
  const checkoutForm = document.getElementById('checkoutForm');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', processAzamPayCheckout);
  }

  const checkoutBtn = document.getElementById('payBtn');
  if (checkoutBtn && !checkoutForm) {
    checkoutBtn.addEventListener('click', processAzamPayCheckout);
  }
});
