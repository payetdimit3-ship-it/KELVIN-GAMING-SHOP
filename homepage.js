// js/homepage.js
// Logic maalum kwa homepage (index.html)

window.Homepage = {
  
  loadCategories: async function() {
    if (!window.DB) return;
    
    const { data } = await window.DB
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order');
    
    const grid = document.getElementById('categories-grid');
    if (!grid) return;
    
    if (!data || data.length === 0) {
      grid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500 text-sm">Hakuna categories bado</div>`;
      return;
    }
    
    const emojiMap = {
      'action-adventure': '🎯',
      'racing': '🏎️',
      'sports': '⚽',
      'rpg': '⚔️',
      'strategy': '♟️',
      'shooting': '🔫'
    };
    
    grid.innerHTML = data.map(cat => `
      <a href="/category.html?slug=${cat.slug}" class="group relative gradient-card rounded-xl border border-dark-4 overflow-hidden hover:border-primary transition">
        <div class="aspect-square flex flex-col items-center justify-center p-4">
          ${cat.image_url 
            ? `<img src="${cat.image_url}" alt="${cat.name}" class="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition">`
            : `<div class="absolute inset-0 flex items-center justify-center text-6xl opacity-20 group-hover:opacity-40 transition">${emojiMap[cat.slug] || '🎮'}</div>`
          }
          <div class="relative z-10 text-center">
            <div class="text-2xl mb-1">${emojiMap[cat.slug] || '🎮'}</div>
            <div class="text-xs font-semibold text-white drop-shadow-lg">${cat.name}</div>
          </div>
        </div>
      </a>
    `).join('');
  },
  
  loadTrendingGames: async function() {
    if (!window.DB) return;
    
    const { data } = await window.DB
      .from('games')
      .select('*, categories(name, slug)')
      .eq('is_active', true)
      .eq('is_trending', true)
      .order('created_at', { ascending: false })
      .limit(6);
    
    const container = document.getElementById('trending-games');
    if (!container) return;
    
    if (!data || data.length === 0) {
      container.innerHTML = Array(6).fill(0).map(() => `
        <div class="gradient-card rounded-xl border border-dark-4 overflow-hidden">
          <div class="aspect-[3/4] bg-dark-3 flex items-center justify-center">
            <svg class="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <div class="p-3">
            <div class="h-3 bg-dark-3 rounded mb-2"></div>
            <div class="h-3 bg-dark-3 rounded w-2/3 mb-3"></div>
            <div class="h-4 bg-dark-3 rounded w-1/2 mb-3"></div>
            <div class="h-8 bg-dark-3 rounded"></div>
          </div>
        </div>
      `).join('');
      return;
    }
    
    container.innerHTML = data.map(game => {
      const finalPrice = game.discount_price || game.price;
      const hasDiscount = game.discount_price && game.discount_price < game.price;
      
      return `
        <a href="/game.html?id=${game.id}" class="group gradient-card rounded-xl border border-dark-4 overflow-hidden hover:border-primary transition">
          <div class="aspect-[3/4] bg-dark-3 relative overflow-hidden">
            ${game.image_url 
              ? `<img src="${game.image_url}" alt="${game.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">`
              : `<div class="w-full h-full flex items-center justify-center text-gray-600">
                  <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>`
            }
            ${hasDiscount ? `<div class="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded">-${game.discount_percent}%</div>` : ''}
          </div>
          <div class="p-3">
            <h3 class="text-sm font-semibold text-white mb-2 line-clamp-2 group-hover:text-primary transition">${game.title}</h3>
            <div class="flex flex-wrap gap-1 mb-2">
              ${(game.platforms || []).slice(0, 3).map(p => `<span class="text-[10px] px-1.5 py-0.5 bg-dark-3 rounded text-gray-400">${p}</span>`).join('')}
            </div>
            <div class="flex items-center gap-1 mb-2">
              <div class="flex text-yellow-400 text-xs">${'★'.repeat(Math.round(game.rating || 0))}${'☆'.repeat(5 - Math.round(game.rating || 0))}</div>
              <span class="text-[10px] text-gray-500">${game.reviews_count || 0}</span>
            </div>
            <div class="flex items-baseline gap-2 mb-3">
              <span class="text-primary font-bold text-sm">${window.Utils.formatPrice(finalPrice)}</span>
              ${hasDiscount ? `<span class="text-gray-500 text-xs line-through">${window.Utils.formatPrice(game.price)}</span>` : ''}
            </div>
            <button onclick="event.preventDefault(); event.stopPropagation(); window.Cart.add('${game.id}')" class="w-full gradient-primary text-white text-xs font-semibold py-2 rounded-lg hover:opacity-90 transition">
              Add to Cart
            </button>
          </div>
        </a>
      `;
    }).join('');
  }
};

console.log('✅ Homepage loaded!');