// ═══════════ GameHub — Hali ya mtumiaji (kila ukurasa) ═══════════
(function () {
  const user = JSON.parse(localStorage.getItem('gamehubUser') || 'null');
  const btn = document.querySelector('.btn-login');

  if (btn) {
    if (user) {
      btn.textContent = '👤 ' + user.name;
      btn.href = '#';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Toka nje?')) {
          fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': localStorage.getItem('gamehubToken') || '' } });
          localStorage.removeItem('gamehubUser');
          localStorage.removeItem('gamehubToken');
          location.reload();
        }
      });
    } else {
      btn.textContent = '🔐 Login';
      btn.href = 'login.html';
    }
  }

  // Kiungo cha Admin (kwa admin pekee)
  if (user && user.isAdmin) {
    const nav = document.querySelector('.nav-links') || document.querySelector('.menu');
    if (nav && !nav.querySelector('.admin-nav-link')) {
      const adminLink = document.createElement('a');
      adminLink.textContent = '👑 Admin';
      adminLink.href = 'admin.html';
      adminLink.className = 'admin-nav-link';
      adminLink.style.color = '#ff3d71';
      adminLink.style.fontWeight = 'bold';
      nav.appendChild(adminLink);
    }
  }

  // Namba ya kikapu (kama iko kwenye navbar)
  window.updateCartBadge = function () {
    const cart = JSON.parse(localStorage.getItem('gamehubCart') || '{}');
    const count = Object.values(cart).reduce((t, i) => t + i.qty, 0);
    const badge = document.getElementById('cartCount');
    if (badge) badge.textContent = count;
  };
  window.updateCartBadge();
})();
