-- =====================================================================
-- LifeIsGameTZ — Seed Data ya Products
-- Endesha hii BAADA ya supabase_schema.sql (inahitaji product_categories)
-- =====================================================================

insert into products (title, slug, category_id, description, platforms, price, compare_at_price, stock, is_digital, images, badge, rating_avg, rating_count, status)
values
('FC 26 — Standard Edition', 'fc26-standard', (select id from product_categories where slug='pc-games'),
  'FC 26 inaleta uzoefu mpya wa soka na HyperMotion V, timu zilizosasishwa za msimu 2025/26.',
  '{PC,PlayStation,Xbox}', 45000, 60000, 999, true, '["🎮"]', 'bestseller', 4.8, 482, 'active'),

('Steam Account — 12 Games Bundle', 'steam-12-bundle', (select id from product_categories where slug='pc-games'),
  'Akaunti ya Steam yenye games 12 zilizopakwa tayari, verified na salama.',
  '{PC}', 80000, 120000, 4, false, '["🔑"]', 'sale', 4.6, 139, 'active'),

('eFootball Coins — 5,000', 'efootball-coins-5000', (select id from product_categories where slug='efootball'),
  'Top-up ya haraka ya eFootball Coins 5,000 kwa Android, iOS na PC.',
  '{Mobile,PC,PlayStation}', 12000, null, 999, true, '["⚽"]', null, 5.0, 910, 'active'),

('Gaming Headset RGB Pro', 'gaming-headset-rgb-pro', (select id from product_categories where slug='accessories'),
  'Vipokea sauti vya kisasa vyenye RGB lighting na sauti ya hali ya juu.',
  '{Universal}', 65000, 85000, 23, false, '["🎧"]', 'sale', 4.7, 76, 'active'),

('PSN Gift Card 20,000', 'psn-giftcard-20000', (select id from product_categories where slug='gift-cards'),
  'PlayStation Network Gift Card yenye thamani ya TZS 20,000.',
  '{PlayStation}', 30000, null, 999, true, '["🎁"]', null, 4.9, 203, 'active'),

('Need for Speed Unbound', 'nfs-unbound', (select id from product_categories where slug='pc-games'),
  'Mchezo wa mbio wa kisasa wenye graphics za hali ya juu.',
  '{PC,PlayStation}', 52000, 70000, 999, true, '["🏎️"]', 'bestseller', 4.6, 310, 'active'),

('Call of Duty: Modern Ops', 'cod-modern-ops', (select id from product_categories where slug='pc-games'),
  'Mchezo wa risasi wa hali ya juu na multiplayer ya papo hapo.',
  '{PC,Xbox}', 58000, null, 9, true, '["🔫"]', null, 4.8, 560, 'active'),

('Wireless Pro Controller', 'wireless-pro-controller', (select id from product_categories where slug='accessories'),
  'Kidhibiti (controller) cha wireless chenye uzoefu wa hali ya juu.',
  '{Universal}', 42000, null, 999, false, '["🕹️"]', null, 4.6, 88, 'active'),

('Xbox Game Pass — 3 Months', 'xbox-gamepass-3m', (select id from product_categories where slug='xbox'),
  'Access ya games 100+ kwa miezi 3 kupitia Xbox Game Pass.',
  '{Xbox,PC}', 35000, 50000, 999, true, '["🎮"]', 'sale', 4.9, 415, 'active');
