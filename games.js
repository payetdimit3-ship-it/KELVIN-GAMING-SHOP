// js/games.js
// Games loading, filtering, searching

window.Games = {
  
  allGames: [],
  filteredGames: [],
  
  // Load all games
  loadAll: async function() {
    const { data, error } = await window.DB
      .from('games')
      .select('*, categories(name, slug)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Games load error:', error);
      return [];
    }
    
    this.allGames = data || [];
    this.filteredGames = [...this.allGames];
    return this.allGames;
  },
  
  // Filter by category
  filterByCategory: function(categorySlug) {
    if (categorySlug === 'all') {
      this.filteredGames = [...this.allGames];
    } else {
      this.filteredGames = this.allGames.filter(g => 
        g.categories?.slug === categorySlug
      );
    }
    return this.filteredGames;
  },
  
  // Filter by platform
  filterByPlatform: function(platforms) {
    if (!platforms || platforms.length === 0) return this.filteredGames;
    
    this.filteredGames = this.filteredGames.filter(g =>
      (g.platforms || []).some(p => platforms.includes(p))
    );
    return this.filteredGames;
  },
  
  // Search
  search: function(query) {
    if (!query) return this.filteredGames;
    
    const q = query.toLowerCase();
    this.filteredGames = this.filteredGames.filter(g =>
      g.title.toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q)
    );
    return this.filteredGames;
  },
  
  // Get single game
  getById: async function(id) {
    const { data } = await window.DB
      .from('games')
      .select('*, categories(name, slug)')
      .eq('id', id)
      .single();
    
    return data;
  },
  
  // Render game card
  renderCard: function(game) {
    const price = parseFloat(game.discount_price || game.price || 0);
    const isFree = price <= 0;
    const hasDiscount = !isFree && game.discount_price && game.discount_price < game.price;
    
    return `
      <a href="/game.html?id=${game.id}" class="game-card gradient-card rounded-xl border border-dark-4 overflow-hidden hover:border-primary transition group">
        <div class="aspect-[3/4] bg-dark-3 relative overflow-hidden">
          ${game.image_url 
            ? `<img src="${game.image_url}" alt="${game.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">`
            : `<div class="w-full h-full flex items-center justify-center text-gray-600">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>`
          }
          ${isFree ? `<div class="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-extrabold px-2 py-1 rounded">FREE</div>` : ''}
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
            <span class="text-primary font-bold text-sm">${window.Utils.formatPrice(price)}</span>
            ${hasDiscount ? `<span class="text-gray-500 text-xs line-through">${window.Utils.formatPrice(game.price)}</span>` : ''}
          </div>
          <button onclick="event.preventDefault(); Cart.add('${game.id}')" class="w-full gradient-primary text-white text-xs font-semibold py-2 rounded-lg hover:opacity-90 transition">
            Add to Cart
          </button>
        </div>
      </a>
    `;
  }
};

console.log('✅ Games loaded!');