-- =====================================================================
-- LifeIsGameTZ — Jedwali za Ziada: Creator Program, Community Marketplace,
-- Agribusiness Pitches, na Affiliate seed
-- Endesha hii BAADA ya supabase_schema.sql
-- =====================================================================

create type listing_status as enum ('pending','active','rejected');

-- ---------- Creator Program ----------
create table creator_products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references profiles(id) on delete cascade,
  title text not null,
  category text not null,        -- 'Game Guide','Graphics Pack','Sound Effects','Template','Coding Service'
  description text,
  price numeric(12,2) not null,
  file_url text,
  downloads_count integer not null default 0,
  rating_avg numeric(2,1) default 0,
  status listing_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table creator_products enable row level security;
create policy "public_read_active_creator_products" on creator_products for select using (status = 'active');
create policy "own_creator_products" on creator_products for all using (auth.uid() = creator_id);
create policy "admin_read_all_creator_products" on creator_products for select using (public.is_staff_or_admin());

-- ---------- Community Marketplace / Classifieds ----------
create table marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  category text not null,        -- 'Electronics','Fashion','Kilimo','Huduma','Biashara'
  description text,
  price numeric(12,2),
  location text,
  contact_phone text,
  images jsonb default '[]',
  featured boolean not null default false,
  status listing_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table marketplace_listings enable row level security;
create policy "public_read_active_listings" on marketplace_listings for select using (status = 'active');
create policy "own_listings" on marketplace_listings for all using (auth.uid() = user_id);
create policy "admin_read_all_listings" on marketplace_listings for select using (public.is_staff_or_admin());

-- ---------- Vijana Uchumi & Agribusiness Pitches ----------
create table agribusiness_pitches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  sector text not null,          -- 'Teknolojia','Agribusiness','Nishati Safi'
  description text,
  funding_goal numeric(12,2) not null,
  funding_raised numeric(12,2) not null default 0,
  votes_count integer not null default 0,
  status listing_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table agribusiness_pitches enable row level security;
create policy "public_read_active_pitches" on agribusiness_pitches for select using (status = 'active');
create policy "own_pitches" on agribusiness_pitches for all using (auth.uid() = user_id);
create policy "admin_read_all_pitches" on agribusiness_pitches for select using (public.is_staff_or_admin());

create table pitch_votes (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid references agribusiness_pitches(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pitch_id, user_id)
);
alter table pitch_votes enable row level security;
create policy "insert_own_vote" on pitch_votes for insert with check (auth.uid() = user_id);
create policy "read_own_vote" on pitch_votes for select using (auth.uid() = user_id);

-- ---------- Affiliates: insert policy (jedwali lilishakuwepo kwenye schema) ----------
alter table affiliates enable row level security;
create policy "own_affiliate" on affiliates for all using (auth.uid() = user_id);
create policy "admin_read_all_affiliates" on affiliates for select using (public.is_staff_or_admin());

-- =====================================================================
-- SEED DATA (inalingana na mfano wa UI uliopo tayari)
-- =====================================================================

insert into creator_products (creator_id, title, category, price, downloads_count, rating_avg, status) values
(null, 'eFootball 2026 — Ultimate Team Guide', 'Game Guide', 8000, 1240, 4.9, 'active'),
(null, 'Gaming Thumbnail Pack — 50 Designs', 'Graphics Pack', 12000, 680, 4.6, 'active'),
(null, 'Esports Sound Effects Bundle', 'Sound Effects', 6000, 410, 4.5, 'active'),
(null, 'Tournament Bracket Overlay Templates', 'Template', 10000, 95, 4.7, 'active');

insert into marketplace_listings (user_id, title, category, price, location, contact_phone, featured, status) values
(null, 'Gaming PC — RTX 3060, 16GB RAM', 'Electronics & Gaming Specs', 1850000, 'Dar es Salaam', '+255700000001', true, 'active'),
(null, 'Mahindi Yaliyoongezwa Thamani — Debe 5', 'Kilimo & Nishati Safi', 45000, 'Dodoma', '+255700000002', false, 'active'),
(null, 'Solar Panel 100W + Battery Kit', 'Kilimo & Nishati Safi', 320000, 'Arusha', '+255700000003', false, 'active');

insert into agribusiness_pitches (user_id, title, sector, description, funding_goal, funding_raised, votes_count, status) values
(null, 'Smart Irrigation Kit kwa Wakulima Wadogo', 'Agribusiness', 'Mfumo wa umwagiliaji wa bei nafuu unaotumia sensor za udongo.', 5000000, 3400000, 214, 'active'),
(null, 'Solar Charging Hub kwa Vijiji Visivyo na Umeme', 'Nishati Safi', 'Kituo cha kuchaji simu na taa za solar kwa jamii za vijijini.', 4000000, 1640000, 98, 'active'),
(null, 'App ya Kuunganisha Wakulima na Masoko', 'Teknolojia', 'Jukwaa la simu la kuuza mazao moja kwa moja kwa wanunuzi.', 5000000, 4250000, 356, 'active');
