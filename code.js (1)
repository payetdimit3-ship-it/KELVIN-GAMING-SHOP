// ===== SUPABASE CLIENT (Browser) =====
const SUPABASE_URL = 'https://zcviroqygjtautfsyahs.supabase.co';
const SUPABASE_ANON_KEY = 'IlEsUpRuT4sGqI9LQ1RVguJ6wlgp8YAXVNV0LCfjBnk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== HELPER FUNCTIONS =====

async function getProducts(type, search) {
  let query = supabase.from('products').select('*');
  if (type) query = query.eq('type', type);
  if (search) query = query.ilike('name', `%${search}%`);
  const { data } = await query.order('id', { ascending: false });
  return data || [];
}

async function addProduct(name, type, price, emoji, desc, link) {
  const token = localStorage.getItem('gamehubToken');
  const res = await fetch('/api/products', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token || '' },
    body: JSON.stringify({ name, type, price: parseInt(price), emoji: emoji || '🎮', description: desc || '', link: link || '' })
  });
  return res.json();
}

async function deleteProduct(id) {
  const token = localStorage.getItem('gamehubToken');
  const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: { 'Authorization': token || '' } });
  return res.json();
}

async function getOrders() {
  const token = localStorage.getItem('gamehubToken');
  const res = await fetch('/api/orders', { headers: { 'Authorization': token || '' } });
  return res.json();
}

async function getUsers() {
  const token = localStorage.getItem('gamehubToken');
  const res = await fetch('/api/users', { headers: { 'Authorization': token || '' } });
  return res.json();
}

async function getRequests() {
  const res = await fetch('/api/requests');
  return res.json();
}

async function getLogs() {
  const token = localStorage.getItem('gamehubToken');
  const res = await fetch('/api/security/logs', { headers: { 'Authorization': token || '' } });
  return res.json();
}
