// js/main.js
// Hii ni file kuu - inaanzisha kila kitu

document.addEventListener('DOMContentLoaded', async function() {
  
  console.log('🚀 LifeisGameTz inaanza...');
  
  // 1. Load sidebar
  if (window.Sidebar) {
    await window.Sidebar.load();
  }
  
  // 2. Update header (jina, wallet, n.k.)
  if (window.Auth) {
    await window.Auth.updateHeader();
  }
  
  // 3. Update cart badge
  if (window.Cart) {
    await window.Cart.updateCount();
  }
  
  // 4. Setup profile click (kama hajalogin)
  const profileSection = document.getElementById('profile-section');
  if (profileSection) {
    profileSection.addEventListener('click', async function() {
      const session = await window.Auth.checkSession();
      if (!session) {
        window.location.href = '/login.html';
      } else {
        window.location.href = '/profile.html';
      }
    });
  }
  
  // 5. Setup logout buttons
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      window.Auth.logout();
    });
  });
  
  console.log('✅ LifeisGameTz iko tayari!');
});