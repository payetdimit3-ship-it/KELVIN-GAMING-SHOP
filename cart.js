// js/cart.js
// Cart logic - add, remove, update qty

window.Cart = {
  
  // Add to cart
  add: async function(gameId, quantity = 1) {
    const user = await window.Auth.getUser();
    if (!user) {
      window.Utils.toast('Tafadhali ingia kwanza', 'warning');
      window.location.href = '/login.html';
      return false;
    }
    
    const { error } = await window.DB
      .from('cart_items')
      .insert({
        user_id: user.id,
        game_id: gameId,
        quantity: quantity
      });
    
    if (error) {
      if (error.code === '23505') {
        // Already in cart - update qty
        await window.DB
          .from('cart_items')
          .update({ quantity: quantity })
          .eq('user_id', user.id)
          .eq('game_id', gameId);
      } else {
        window.Utils.toast('Kosa: ' + error.message, 'error');
        return false;
      }
    }
    
    window.Utils.toast('✅ Imeongezwa kwenye kikapu!', 'success');
    this.updateCount();
    return true;
  },
  
  // Remove from cart
  remove: async function(itemId) {
    const { error } = await window.DB
      .from('cart_items')
      .delete()
      .eq('id', itemId);
    
    if (error) {
      window.Utils.toast('Kosa: ' + error.message, 'error');
      return false;
    }
    
    window.Utils.toast('✅ Imefutwa!', 'success');
    this.updateCount();
    return true;
  },
  
  // Update quantity
  updateQty: async function(itemId, quantity) {
    if (quantity < 1) return this.remove(itemId);
    
    await window.DB
      .from('cart_items')
      .update({ quantity })
      .eq('id', itemId);
    
    this.updateCount();
  },
  
  // Get cart items
  getItems: async function() {
    const user = await window.Auth.getUser();
    if (!user) return [];
    
    const { data } = await window.DB
      .from('cart_items')
      .select('*, games(*)')
      .eq('user_id', user.id);
    
    return data || [];
  },
  
  // Get cart count
  getCount: async function() {
    const user = await window.Auth.getUser();
    if (!user) return 0;
    
    const { count } = await window.DB
      .from('cart_items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    
    return count || 0;
  },
  
  // Update cart badge
  updateCount: async function() {
    const count = await this.getCount();
    const badge = document.getElementById('cart-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  },
  
  // Get cart total
  getTotal: async function() {
    const items = await this.getItems();
    return items.reduce((sum, item) => {
      const game = item.games;
      const price = parseFloat(game.discount_price || game.price || 0);
      return sum + (price * item.quantity);
    }, 0);
  }
};

console.log('✅ Cart loaded!');