// js/auth.js
// Login, Register, Logout, Check Session

window.Auth = {
  
  // Register user mpya
  register: async function(email, password, fullName, username) {
    if (!window.DB) return { error: 'DB not initialized' };
    
    const { data, error } = await window.DB.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          username: username
        }
      }
    });
    
    return { data, error };
  },
  
  // Login
  login: async function(email, password) {
    if (!window.DB) return { error: 'DB not initialized' };
    
    const { data, error } = await window.DB.auth.signInWithPassword({
      email,
      password
    });
    
    return { data, error };
  },
  
  // Logout
  logout: async function() {
    if (!window.DB) return;
    await window.DB.auth.signOut();
    window.location.href = '/';
  },
  
  // Check session
  checkSession: async function() {
    if (!window.DB) return null;
    const { data: { session } } = await window.DB.auth.getSession();
    return session;
  },
  
  // Get current user
  getUser: async function() {
    const session = await this.checkSession();
    return session ? session.user : null;
  },
  
  // Get current profile
  getProfile: async function() {
    const user = await this.getUser();
    if (!user) return null;
    
    const { data } = await window.DB
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    return data;
  },
  
  // Require login (redirect kama hajalogin)
  requireLogin: async function() {
    const session = await this.checkSession();
    if (!session) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },
  
  // Require admin
  requireAdmin: async function() {
    const profile = await this.getProfile();
    if (!profile || profile.role !== 'admin') {
      window.Utils.toast('Huna ruhusa!', 'error');
      window.location.href = '/';
      return false;
    }
    return true;
  },
  
  // Update profile header (jina, wallet, n.k.)
  updateHeader: async function() {
    const profile = await this.getProfile();
    
    const nameEl = document.getElementById('top-name');
    const walletEl = document.getElementById('top-wallet');
    const roleEl = document.getElementById('top-role');
    
    if (profile) {
      if (nameEl) nameEl.textContent = profile.full_name || profile.username || 'User';
      if (walletEl) walletEl.textContent = window.Utils.formatPrice(profile.wallet_balance || 0);
      if (roleEl) roleEl.textContent = profile.is_premium ? 'Premium User' : 'User';
    } else {
      if (nameEl) nameEl.textContent = 'Enter';
      if (walletEl) walletEl.textContent = 'TSh 0';
      if (roleEl) roleEl.textContent = 'Bonyeza kuingia';
    }
  }
};

console.log('✅ Auth loaded!');