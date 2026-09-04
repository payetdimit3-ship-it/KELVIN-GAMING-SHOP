(function () {
  const root = document.documentElement;
  const pageData = {
    shop: ['Game & Digital Shop', 'STOREFRONT', 'Games, gift cards na digital items — zote ziko sehemu moja.', ['PC Games', 'Console', 'Mobile', 'Gift Cards'], '🎮'],
    cart: ['Shopping Cart', 'YOUR BAG', 'Kagua bidhaa ulizochagua kabla ya kuendelea na checkout salama.', ['Cart Items', 'Apply Coupon', 'Delivery Details', 'Proceed to Checkout'], '🛒'],
    marketplace: ['Gaming Marketplace', 'BUY & SELL', 'Soko la gamers kwa accounts, digital games, coins na accessories.', ['Browse Listings', 'Sell an Item', 'Saved Listings', 'Seller Support'], '📦'],
    rental: ['Game Rental', 'PLAY FOR LESS', 'Kodesha game au account kwa muda uliouchagua bila kucommit full price.', ['Available Rentals', 'My Rentals', 'Rental Rules', 'Extend Rental'], '🎮'],
    requests: ['Game Requests', 'COMMUNITY WISHLIST', 'Omba game, top-up au digital product ambayo ungependa iongezwe.', ['New Request', 'Popular Requests', 'My Requests', 'Request Status'], '👥'],
    mygames: ['My Games', 'YOUR LIBRARY', 'Mkusanyiko wa games zako, keys na downloads za digital purchases.', ['Recently Added', 'Installed Games', 'Game Keys', 'Download Library'], '🎮'],
    myorders: ['Order History', 'PURCHASES', 'Angalia orders zote, receipts na status ya delivery kwa account yako.', ['Recent Orders', 'Completed', 'Pending Payment', 'Receipts'], '📦'],
    product: ['Product Details', 'GAME DROP', 'Kagua maelezo, compatibility, stock na delivery kabla ya kununua.', ['Overview', 'System Requirements', 'Reviews', 'Add to Cart'], '🧩'],
    'steam-accounts': ['Steam Accounts', 'READY TO PLAY', 'Akaunti zenye games zilizopakiwa tayari na delivery salama.', ['Browse Accounts', 'Games Included', 'Account Protection', 'How Delivery Works'], '🛡️'],
    efootball: ['eFootball Hub', 'FOOTBALL GAMING', 'Coins, tournaments, rankings na updates za eFootball kwa sehemu moja.', ['Top Up Coins', 'Join Tournament', 'Live Scores', 'Player Rankings'], '🏆'],
    faq: ['Frequently Asked Questions', 'HELP CENTER', 'Majibu ya maswali ya kawaida kuhusu accounts, payments, orders na delivery.', ['Orders & Delivery', 'Payments', 'Account Safety', 'Contact Support'], '🤖'],
    contact: ['Contact Support', 'WE ARE HERE TO HELP', 'Tuma swali lako kwa support team au anza mazungumzo na AI assistant.', ['Open Ticket', 'Chat with AI', 'Order Support', 'Business Inquiry'], '🤖'],
    refund: ['Refund Policy', 'CUSTOMER PROTECTION', 'Soma masharti ya refund, eligibility na hatua za kuwasilisha request.', ['Policy Overview', 'Start Refund Request', 'Track Request', 'Contact Support'], '🛡️'],
    terms: ['Terms & Conditions', 'PLATFORM RULES', 'Masharti ya matumizi ya MchezoHub, purchases, accounts na community.', ['User Terms', 'Seller Terms', 'Payments', 'Privacy'], '🛡️'],
    success: ['Payment Successful', 'ORDER CONFIRMED', 'Malipo yako yamepokelewa. Fungua order yako kuona delivery details.', ['View Order', 'Open Library', 'Download Receipt', 'Contact Support'], '✅'],
    'admin-products': ['Admin Product Manager', 'CATALOG CONTROL', 'Ongeza, edit na approve bidhaa za storefront bila kuweka bei kutoka client.', ['All Products', 'Add Product', 'Review Queue', 'Inventory'], '📦'],
    'admin-orders': ['Admin Order Manager', 'OPERATIONS', 'Fuatilia orders, delivery status, refunds na payment reconciliation.', ['New Orders', 'Processing', 'Delivered', 'Refund Review'], '📋'],
    'ai-chat': ['AI Gaming Assistant', 'SMART SUPPORT', 'Pata msaada wa games, compatibility, orders na platform navigation.', ['Ask a Question', 'Game Advisor', 'Order Help', 'Escalate to Support'], '🤖'],
    wishlist: ['My Wishlist', 'SAVED ITEMS', 'Hifadhi games na bidhaa unazotaka kununua baadaye.', ['Saved Products', 'Price Drops', 'New Releases', 'Share Wishlist'], '❤️'],
    accounts: ['Steam Accounts', 'READY TO PLAY', 'Akaunti zenye games zilizopakiwa tayari na delivery salama.', ['Games 10+', 'Games 50+', 'Premium Accounts', 'Account Protection'], '🛡️'],
    coins: ['eFootball Coins & Top-Up', 'INSTANT TOP-UP', 'Ongeza coins kwa Android, iOS au PC kwa hatua salama.', ['Android', 'iOS', 'PC', 'Top-up History'], '💰'],
    tournaments: ['eFootball Tournaments', 'COMPETE & WIN', 'Jiunge na leagues, fuatilia fixtures na chukua zawadi.', ['Upcoming Leagues', 'My Registrations', 'Fixtures', 'Prizes'], '🏆'],
    scores: ['Live Scores', 'LIVE NOW', 'Matokeo ya mechi na hali ya ligi kwa wakati halisi.', ['eFootball', 'Football', 'Today', 'Results'], '🏆'],
    predictions: ['Predictions & Bet Slip', 'RESPONSIBLE PLAY', 'Tengeneza prediction slip. Fedha halisi zitasubiri validation na approval ya mfumo.', ['Open Markets', 'My Bets', 'Bet Slip', 'Responsible Gaming'], '💰'],
    wallet: ['Wallet & Transactions', 'YOUR BALANCE', 'Dhibiti salio lako, top-up kupitia AzamPay adapter, na historia ya miamala.', ['Top Up', 'Withdraw', 'Transactions', 'Limits & KYC'], '💳'],
    support: ['Customer Support', 'GEMINI SUPPORT', 'Chat na AI support kwa Kiswahili, au mpeleke mteja kwa admin.', ['Start Chat', 'Game Advisor', 'My Tickets', 'Help Center'], '🤖'],
    profile: ['Mchezaji Profile', 'PLAYER HUB', 'Wasifu, ranking, games ulizonunua na settings zako.', ['Profile', 'Leaderboard', 'Notifications', 'Settings'], '👤'],
    giftcards: ['Gift Cards Marketplace', 'DIGITAL GIFTS', 'Nunua PlayStation, Xbox, Steam na mobile gift cards kwa delivery ya haraka.', ['PlayStation Cards', 'Xbox Cards', 'Steam Wallet', 'Mobile Vouchers'], '🎁'],
    topup: ['Game Top-Up Center', 'INSTANT CREDIT', 'Top-up salama kwa games zako bila kusubiri.', ['eFootball', 'Free Fire', 'PUBG Mobile', 'Mobile Legends'], '💰'],
    checkout: ['Secure Checkout', 'SAFE PAYMENT', 'Kagua order yako, chagua njia ya malipo na pata confirmation.', ['Order Summary', 'AzamPay', 'Discount Code', 'Confirm Payment'], '💳'],
    orders: ['My Orders', 'ORDER CENTER', 'Fuatilia orders zako, delivery codes na payment receipts.', ['All Orders', 'Processing', 'Delivered', 'Receipts'], '📦'],
    downloads: ['My Digital Library', 'YOUR GAMES', 'Fungua bidhaa zako za kidigitali, keys na download instructions.', ['Game Keys', 'Steam Library', 'Gift Cards', 'Download Help'], '⬇️'],
    leaderboard: ['Global Leaderboard', 'TOP PLAYERS', 'Angalia rankings za wachezaji bora na stats za tournaments.', ['Weekly Ranking', 'Monthly Ranking', 'My Position', 'Player Stats'], '🏆'],
    leagues: ['Leagues & Seasons', 'COMPETE', 'Jiunge na season mpya, groups na mashindano ya MchezoHub.', ['Active Seasons', 'Join League', 'League Table', 'Season History'], '🏆'],
    news: ['Gaming Newsroom', 'LATEST UPDATES', 'Habari za games, updates, releases na announcements za platform.', ['Game Updates', 'Release Calendar', 'MchezoHub News', 'Community Posts'], '📰'],
    community: ['Gaming Community', 'PLAY TOGETHER', 'Connect na gamers wengine, share tips na pata teammates.', ['Discover Players', 'Groups', 'Discussions', 'Invite Friends'], '👥'],
    notifications: ['Notifications Center', 'UPDATES', 'Pata alerts za orders, tournaments, promotions na security.', ['All Alerts', 'Orders', 'Tournaments', 'Security'], '🔔'],
    settings: ['Account Settings', 'CONTROL PANEL', 'Simamia profile, password, privacy na preferences zako.', ['Profile Settings', 'Security', 'Privacy', 'Preferences'], '⚙️'],
    promotions: ['Promotions & Rewards', 'EXCLUSIVE OFFERS', 'Pata offers, coupons na rewards maalum kwa gamers wetu.', ['Active Offers', 'Coupons', 'Referral Rewards', 'Claim Reward'], '🎁'],
    'post-product': ['Post New Product', 'SELL ON MchezoHub', 'Weka game, Steam account, coins, gift card au digital service yako kwa wateja.', ['Product details', 'Pricing & stock', 'Upload images', 'Submit for review'], '📦'],
    'post-video': ['Post Game Video', 'CREATOR STUDIO', 'Pakia trailer, gameplay au tournament clip yako kwa community ya MchezoHub.', ['Video details', 'Upload trailer', 'Choose category', 'Publish for review'], '🎬']
  };

  function nav() {
    const nav = document.querySelector('[data-mh-nav]');
    if (!nav) return;
    nav.innerHTML = `
      <div class="mh-nav-inner">
        <a class="mh-brand" href="index.html" aria-label="MchezoHub home"><b class="mh-mark">MH</b><span>Mchezo<span>Hub</span><small>TZ</small></span></a>
        <div class="mh-links">
          <a href="index.html">Nyumbani</a><a href="shop.html">Shop</a><a href="accounts.html">Accounts</a>
          <a href="coins.html">Coins</a><a href="tournaments.html">Tournaments</a><a href="scores.html">Scores</a>
          <a href="post-product.html">Sell</a>
        </div>
        <div class="mh-nav-actions"><a class="mh-login" href="login.html">Log in</a><a class="mh-admin" href="admin-dashboard.html">Admin</a><button class="mh-menu" type="button" aria-label="Open menu">☰</button></div>
      </div>
      <div class="mh-mobile-menu"><a href="../index.html">← Kelvin Gaming Shop</a><a href="index.html">Nyumbani</a><a href="shop.html">Shop</a><a href="marketplace.html">Marketplace</a><a href="tournaments.html">Tournaments</a><a href="wallet.html">Wallet</a><a href="contact.html">Support</a><a href="admin-dashboard.html">Admin Dashboard</a></div>`;
    nav.querySelector('.mh-menu').addEventListener('click', () => nav.querySelector('.mh-mobile-menu').classList.toggle('open'));
  }

  function renderPage() {
    const key = document.body.dataset.page;
    const mount = document.querySelector('[data-mh-page]');
    if (!key || !mount || !pageData[key]) return;
    const [title, eyebrow, description, actions, icon] = pageData[key];
    mount.innerHTML = `
      <div class="mh-page-hero mh-grid-bg"><div class="mh-kicker">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>
      <div class="mh-page-grid">${actions.map((action, i) => `<article class="mh-card mh-action-card"><span class="mh-tag">MODULE 0${i + 1}</span><h3>${action}</h3><p>Prototype module iko tayari kwa kuunganishwa na Admin Panel na data ya duka.</p><a href="${key === 'cart' && i === 3 ? 'checkout.html' : key === 'support' && i === 0 ? 'contact.html' : '#'}" class="mh-mini-btn" data-action="${action}">Fungua →</a></article>`).join('')}</div>
      <section class="mh-card mh-assistant"><span class="mh-tag">MchezoHub AI</span><h2>AI gaming assistant ${icon}</h2><p class="mh-muted">Uliza kuhusu games, compatibility, order au navigation. Actions za pesa na payout zinahitaji Boss Approval na audit log.</p><form data-assistant><input required placeholder="Andika swali lako kwa Kiswahili..." /><button class="mh-btn" type="submit">Tuma</button></form><p class="mh-muted" data-assistant-reply></p></section>`;
    mount.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', (event) => {
      if (button.getAttribute('href') === '#') { event.preventDefault(); alert(`${button.dataset.action}: module hii iko tayari kuunganishwa na backend.`); }
    }));
  }

  function assistant() {
    document.querySelectorAll('[data-assistant]').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      const reply = form.parentElement.querySelector('[data-assistant-reply]');
      reply.textContent = 'AI: Nimepokea swali lako. Kwa hatua inayohusu malipo au order, support team itathibitisha kwanza.';
      form.reset();
    }));
  }

  function checkout() {
    const form = document.querySelector('[data-checkout]');
    if (!form) return;
    const items = [
      { name: 'EA FC 25 Deluxe', type: 'Digital key', price: 95000, qty: 1 },
      { name: 'eFootball Coins Pack', type: 'Instant top-up', price: 25000, qty: 2 }
    ];
    const list = document.querySelector('[data-cart-lines]');
    const total = document.querySelector('[data-total]');
    const notice = document.querySelector('[data-checkout-notice]');
    function draw() {
      list.innerHTML = items.length ? items.map((item, i) => `<div class="mh-line"><div><h3>${item.name}</h3><p>${item.type} · ${item.price.toLocaleString()} TSh</p></div><div class="mh-quantity"><button type="button" data-minus="${i}">−</button><span>${item.qty}</span><button type="button" data-plus="${i}">+</button></div></div>`).join('') : '<div class="mh-empty">Cart yako iko tupu.</div>';
      total.textContent = `${items.reduce((sum, item) => sum + item.price * item.qty, 0).toLocaleString()} TSh`;
      list.querySelectorAll('[data-minus]').forEach(b => b.onclick = () => { items[b.dataset.minus].qty = Math.max(1, items[b.dataset.minus].qty - 1); draw(); });
      list.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => { items[b.dataset.plus].qty = Math.min(10, items[b.dataset.plus].qty + 1); draw(); });
    }
    draw();
    form.addEventListener('submit', e => {
      e.preventDefault();
      const phone = form.querySelector('[name=phone]').value.replace(/[\s-]/g, '').replace(/^0/, '255');
      notice.classList.remove('show');
      if (!/^(\+?255)\d{9}$/.test(phone)) { notice.textContent = 'Weka namba ya Tanzania sahihi, mfano 0712345678.'; notice.classList.add('show'); return; }
      const id = 'MH-' + Math.floor(100000 + Math.random() * 900000);
      localStorage.setItem('mchezoLastOrder', JSON.stringify({ id, phone, total: total.textContent, date: new Date().toLocaleString('sw-TZ') }));
      notice.textContent = `Malipo yameanzishwa kwa ${phone}. Thibitisha ombi kwenye simu yako. Order: ${id}`;
      notice.classList.add('show');
      setTimeout(() => { window.location.href = `order.html?id=${id}`; }, 700);
    });
  }

  function auth(formSelector, message) {
    const form = document.querySelector(formSelector);
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const alertBox = form.querySelector('.mh-alert');
      alertBox.textContent = message;
      alertBox.classList.add('show');
      const submit = form.querySelector('button[type=submit]');
      submit.textContent = 'Imefanikiwa ✓';
    });
  }

  function order() {
    const target = document.querySelector('[data-order-id]');
    if (!target) return;
    const saved = JSON.parse(localStorage.getItem('mchezoLastOrder') || '{}');
    const id = new URLSearchParams(location.search).get('id') || saved.id || 'MH-204851';
    target.textContent = id;
    if (saved.total) document.querySelector('[data-order-total]').textContent = saved.total;
  }

  document.addEventListener('DOMContentLoaded', () => {
    nav(); renderPage(); assistant(); checkout(); order();
    auth('[data-login]', 'Demo login imekubaliwa. Unganisha Supabase kwenye server.js kwa authentication ya production.');
    auth('[data-signup]', 'Account demo imeundwa. Sasa unaweza kuendelea kwenye MchezoHub.');
  });
})();