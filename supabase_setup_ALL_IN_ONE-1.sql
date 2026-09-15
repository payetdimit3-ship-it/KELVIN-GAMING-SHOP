-- =====================================================================
-- LifeIsGameTZ — Supabase Database Schema
-- =====================================================================
-- Mpangilio: kila module ina sehemu yake, ikifuata mtiririko wa
-- Blueprint_ya_Platform.md. Tumia Supabase SQL Editor kuendesha faili
-- hili mara moja (kutoka juu hadi chini) kwenye project mpya.
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- 0. ENUM TYPES
-- =====================================================================

create type user_role as enum ('customer','freelancer','referee','staff','admin','owner');
create type order_status as enum ('pending','paid','processing','delivered','cancelled','refunded');
create type escrow_status as enum ('held','released','refunded','disputed');
create type payment_method as enum ('mpesa','tigopesa','airtel','halopesa','wallet','card');
create type wallet_tx_type as enum ('deposit','withdrawal','purchase','payout','refund','commission','fund_contribution');
create type wallet_tx_status as enum ('pending','completed','failed');
create type tournament_status as enum ('open','soon','full','ongoing','completed','cancelled');
create type registration_status as enum ('registered','checked_in','eliminated','winner','withdrawn');
create type match_status as enum ('scheduled','live','awaiting_verification','disputed','completed');
create type gig_status as enum ('open','review','in_progress','completed','cancelled');
create type application_status as enum ('applied','shortlisted','accepted','rejected','completed');
create type course_level as enum ('beginner','intermediate','advanced','all_levels');
create type enrollment_status as enum ('in_progress','completed');
create type ai_agent_status as enum ('online','offline','needs_approval');
create type approval_status as enum ('pending','approved','rejected');
create type health_urgency as enum ('low','medium','urgent');

-- =====================================================================
-- 1. USERS & ROLES
-- =====================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text unique,
  avatar_url text,
  role user_role not null default 'customer',
  is_verified boolean not null default false,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 2. PRODUCTS & STORE
-- =====================================================================

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  icon text
);

create table products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  category_id uuid references product_categories(id),
  description text,
  platforms text[] default '{}',
  price numeric(12,2) not null,
  compare_at_price numeric(12,2),
  stock integer not null default 0,
  is_digital boolean not null default true,
  images jsonb default '[]',
  badge text check (badge in ('sale','bestseller','new')),
  rating_avg numeric(2,1) default 0,
  rating_count integer default 0,
  status text not null default 'active' check (status in ('active','draft','archived')),
  created_at timestamptz not null default now()
);

create table product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  user_id uuid references profiles(id),
  status order_status not null default 'pending',
  escrow_status escrow_status not null default 'held',
  payment_method payment_method,
  subtotal numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  service_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  promo_code text,
  delivery_method text default 'digital',
  delivery_phone text,
  delivery_email text,
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id),
  quantity integer not null,
  unit_price numeric(12,2) not null
);

-- =====================================================================
-- 3. WALLET & PAYMENTS
-- =====================================================================

create table wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type wallet_tx_type not null,
  amount numeric(12,2) not null,
  status wallet_tx_status not null default 'pending',
  reference_type text,          -- 'order' | 'tournament' | 'gig' | 'affiliate' | 'manual'
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 4. eFOOTBALL & TOURNAMENTS
-- =====================================================================

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  game text not null,
  entry_fee numeric(12,2) not null default 0,
  service_fee numeric(12,2) not null default 0,
  prize_pool numeric(12,2) not null default 0,
  prize_breakdown jsonb default '[]',   -- [{rank:1, amount:60000}, ...]
  max_players integer not null,
  status tournament_status not null default 'open',
  rules text[],
  start_time timestamptz,
  registration_deadline timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  in_game_id text,
  platform text,
  team_name text,
  bracket_slot integer,
  status registration_status not null default 'registered',
  payment_status wallet_tx_status not null default 'pending',
  registered_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  round integer not null,
  player1_id uuid references profiles(id),
  player2_id uuid references profiles(id),
  score1 integer,
  score2 integer,
  winner_id uuid references profiles(id),
  status match_status not null default 'scheduled',
  verified_by uuid references profiles(id),
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 5. YOUTH MARKETPLACE  (Opportunity → Apply → Review → Accepted → Task → Payment)
-- =====================================================================

create table freelancer_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  headline text,
  bio text,
  skills text[] default '{}',
  portfolio_url text,
  starting_price numeric(12,2),
  rating_avg numeric(2,1) default 0,
  completed_projects integer default 0,
  is_verified boolean default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  applied_at timestamptz not null default now()
);

create table youth_gigs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text,
  budget numeric(12,2) not null,
  deadline date,
  status gig_status not null default 'open',
  posted_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table gig_applications (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid references youth_gigs(id) on delete cascade,
  freelancer_id uuid references profiles(id) on delete cascade,
  status application_status not null default 'applied',
  cover_note text,
  applied_at timestamptz not null default now(),
  unique (gig_id, freelancer_id)
);

create table gig_tasks (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid references youth_gigs(id) on delete cascade,
  freelancer_id uuid references profiles(id),
  submitted_url text,
  submitted_at timestamptz,
  approved boolean,
  commission_rate numeric(4,2) not null default 10.00,
  payout_amount numeric(12,2),
  payout_status wallet_tx_status default 'pending'
);

-- =====================================================================
-- 6. ACADEMY  (Learn → Course → Lesson → Quiz → Certificate)
-- =====================================================================

create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  category text not null,
  level course_level not null default 'beginner',
  is_premium boolean not null default false,
  price numeric(12,2) default 0,
  description text,
  duration_minutes integer,
  rating_avg numeric(2,1) default 0,
  created_at timestamptz not null default now()
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  order_index integer not null,
  title text not null,
  body text,
  code_snippet text
);

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  question text not null,
  options jsonb not null,        -- ["opt1","opt2","opt3"]
  correct_index smallint not null
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  progress_percent integer not null default 0,
  status enrollment_status not null default 'in_progress',
  enrolled_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table lesson_progress (
  enrollment_id uuid references enrollments(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (enrollment_id, lesson_id)
);

create table certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id),
  issued_at timestamptz not null default now(),
  certificate_code text unique not null
);

-- =====================================================================
-- 7. COMMUNITY SUPPORT FUND
-- =====================================================================

create table community_fund_ledger (
  id uuid primary key default gen_random_uuid(),
  period text not null,               -- e.g. '2026-09'
  collected numeric(14,2) not null default 0,
  distributed numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table community_fund_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  amount numeric(12,2) not null,
  supported_at timestamptz not null default now()
);

-- =====================================================================
-- 8. HEALTH & COMMUNITY  (Isolated Safety Layer — sensitive data)
-- =====================================================================
-- Kumbuka: jedwali hizi zinahitaji RLS kali zaidi na huenda encryption
-- ya ziada kwenye baadhi ya columns. Hazishirikiani moja kwa moja na
-- jedwali za biashara (orders/wallet) kwa sababu za faragha.

create table health_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  channel text not null default 'chat' check (channel in ('chat','voice')),
  urgency health_urgency,
  referred_to_professional boolean default false,
  created_at timestamptz not null default now()
);

create table health_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references health_conversations(id) on delete cascade,
  sender text not null check (sender in ('user','ai')),
  content text not null,
  created_at timestamptz not null default now()
);

create table health_professionals (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null,              -- Doctor / Nurse / Counselor
  area text,
  verification_status text default 'pending' check (verification_status in ('pending','verified','rejected')),
  availability text,
  contact_method text
);

-- =====================================================================
-- 9. AI GOVERNANCE (9 Agents + Boss Approval System)
-- =====================================================================

create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,        -- 'business_manager','web_builder','customer_support', ...
  display_name text not null,
  status ai_agent_status not null default 'online',
  last_active_at timestamptz default now()
);

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),      -- null ikiwa ni Boss anayeongea na AI Boss Assistant
  agent_key text references ai_agents(key),
  channel text not null default 'chat' check (channel in ('chat','voice')),
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references ai_conversations(id) on delete cascade,
  sender text not null check (sender in ('user','ai')),
  content text not null,
  created_at timestamptz not null default now()
);

create table ai_approval_requests (
  id uuid primary key default gen_random_uuid(),
  agent_key text references ai_agents(key),
  action_type text not null,        -- 'payout','refund','delete_user','publish_change', ...
  payload jsonb not null,
  status approval_status not null default 'pending',
  requested_at timestamptz not null default now(),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz
);

-- =====================================================================
-- 10. SECURITY & AFFILIATES
-- =====================================================================

create table security_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,               -- 'login_attempt','api_abuse','fraud_alert', ...
  severity text not null default 'low' check (severity in ('low','medium','high','critical')),
  description text,
  ip_address text,
  user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table affiliates (
  user_id uuid primary key references profiles(id) on delete cascade,
  referral_code text unique not null,
  clicks integer not null default 0,
  conversions integer not null default 0,
  commission_earned numeric(12,2) not null default 0
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 11. ROW LEVEL SECURITY (mfano wa msingi — panua kulingana na role)
-- =====================================================================

alter table profiles enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table wallets enable row level security;
alter table wallet_transactions enable row level security;
alter table tournament_registrations enable row level security;
alter table freelancer_profiles enable row level security;
alter table gig_applications enable row level security;
alter table enrollments enable row level security;
alter table lesson_progress enable row level security;
alter table certificates enable row level security;
alter table health_conversations enable row level security;
alter table health_messages enable row level security;
alter table notifications enable row level security;

-- Kanuni: mtumiaji anaona/anahariri data yake mwenyewe tu.
create policy "own_profile" on profiles for select using (auth.uid() = id);
create policy "own_profile_update" on profiles for update using (auth.uid() = id);

create policy "own_cart" on cart_items for all using (auth.uid() = user_id);
create policy "own_orders" on orders for select using (auth.uid() = user_id);
create policy "own_wallet" on wallets for select using (auth.uid() = user_id);
create policy "own_wallet_tx" on wallet_transactions for select using (auth.uid() = user_id);
create policy "own_tournament_reg" on tournament_registrations for all using (auth.uid() = user_id);
create policy "own_freelancer_profile" on freelancer_profiles for all using (auth.uid() = user_id);
create policy "own_gig_applications" on gig_applications for all using (auth.uid() = freelancer_id);
create policy "own_enrollments" on enrollments for all using (auth.uid() = user_id);
create policy "own_certificates" on certificates for select using (auth.uid() = user_id);
create policy "own_health_conversations" on health_conversations for all using (auth.uid() = user_id);
create policy "own_notifications" on notifications for all using (auth.uid() = user_id);

-- Kumbuka: ongeza policies za ziada kwa role = 'admin'/'owner' zenye
-- bypass ya kuona data zote (mfano: `using (auth.jwt() ->> 'role' in ('admin','owner'))`)
-- baada ya kuweka role kwenye JWT custom claims au kwenye jedwali la profiles.

-- =====================================================================
-- 12. SEED DATA YA MSINGI (AI agents 9 + categories)
-- =====================================================================

insert into ai_agents (key, display_name) values
  ('business_manager','AI Business Manager'),
  ('web_builder','AI Web Developer & Builder'),
  ('customer_support','AI Customer Support'),
  ('game_advisor','AI Game Advisor'),
  ('health_assistant','AI Health Assistant & Recovery'),
  ('security_guardian','AI Security Guardian'),
  ('tournament_manager','AI Tournament Manager'),
  ('finance_analyst','AI Data & Finance Analyst'),
  ('content_marketing','AI Content & Marketing Agent');

insert into product_categories (name, slug, icon) values
  ('PC Games','pc-games','🖥️'),
  ('PlayStation','playstation','🎮'),
  ('Xbox','xbox','🕹️'),
  ('Mobile','mobile','📱'),
  ('Gift Cards','gift-cards','🎁'),
  ('eFootball','efootball','⚽'),
  ('Accessories','accessories','🎧');
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
-- =====================================================================
-- LifeIsGameTZ — Seed Data ya Tournament
-- Endesha hii BAADA ya supabase_schema.sql
-- =====================================================================

insert into tournaments (title, game, entry_fee, service_fee, prize_pool, prize_breakdown, max_players, status, rules, start_time, registration_deadline)
values (
  'Dar Cup — Weekly Championship',
  'eFootball 2026',
  2000,
  500,
  100000,
  '[{"rank":1,"amount":60000},{"rank":2,"amount":30000},{"rank":3,"amount":10000}]',
  64,
  'open',
  '{"Mechi moja moja (Single Elimination)","Best of 1, dakika 6 kwa nusu","Matokeo yanathibitishwa na AI Referee","Disputes zinatatuliwa ndani ya masaa 2","No-show ndani ya dakika 10 = kutolewa nje"}',
  now() + interval '2 days',
  now() + interval '1 day'
);
-- =====================================================================
-- LifeIsGameTZ — Seed Data ya Youth Gigs
-- Endesha hii BAADA ya supabase_schema.sql
-- =====================================================================

insert into youth_gigs (title, category, description, budget, deadline, status) values
('Tengeneza Banner ya Tournament ya Wiki', 'Design', 'Banner ya kuvutia ya tournament ya wiki kwa ajili ya Home page na social media.', 25000, current_date + interval '2 days', 'open'),
('Video Recap ya FC26 Championship (dakika 3-5)', 'Video Editing', 'Highlight reel ya mechi bora za FC26 Championship.', 45000, current_date + interval '4 days', 'open'),
('Landing Page ya Youth Academy', 'Web Dev', 'Ukurasa mmoja wa kuvutia kutangaza Youth Academy.', 120000, current_date + interval '6 days', 'review'),
('Maandishi ya Bidhaa (Product Descriptions) — Bidhaa 30', 'Content', 'Maelezo mafupi na ya kuvutia ya bidhaa 30 za store.', 30000, current_date + interval '7 days', 'open');
-- =====================================================================
-- LifeIsGameTZ — Seed Data ya Academy Course
-- Endesha hii BAADA ya supabase_schema.sql
-- =====================================================================

insert into courses (title, slug, category, level, is_premium, price, description, duration_minutes, rating_avg)
values ('HTML & CSS kwa Wanaoanza', 'html-css-wanaoanza', 'Web Development', 'beginner', false, 0,
  'Kozi ya msingi ya HTML na CSS kwa wanaoanza kabisa, ikijumuisha lessons 5, quiz, na certificate.', 180, 4.8);
-- =====================================================================
-- LifeIsGameTZ — RLS Policies za Ziada (INSERT)
-- Endesha hii BAADA ya supabase_schema.sql
-- =====================================================================
-- Muhimu: policies hizi zinaruhusu client (anon key) kuandika orders na
-- tournament_registrations moja kwa moja kwa ajili ya DEMO/MVU. Kwa
-- production halisi, uandishi wa order zenye thamani ya pesa unapaswa
-- kupitia Supabase Edge Function (server-side) ili bei/totals zisiwezwe
-- kubadilishwa na mteja kwenye browser kabla ya kutumwa AzamPay.
-- Angalia AzamPay_Integration.md kwa muundo sahihi wa production.
-- =====================================================================

-- ---------- Certificates & Lesson Progress: mtumiaji anaandika zake mwenyewe ----------
create policy "insert_own_certificate" on certificates
  for insert
  with check (auth.uid() = user_id);

create policy "insert_own_lesson_progress" on lesson_progress
  for insert
  with check (
    exists (select 1 from enrollments e where e.id = enrollment_id and e.user_id = auth.uid())
  );

alter table courses enable row level security;
create policy "public_read_courses" on courses for select using (true);

-- ---------- Auto-create Wallet kila profile mpya inapoundwa ----------
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into wallets (user_id, balance) values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created on profiles;
create trigger on_profile_created
  after insert on profiles
  for each row execute function public.handle_new_profile();

-- ---------- Admin Read Access (Owner/Admin/Staff wanaona data ZOTE) ----------
-- Hii ni muhimu kwa Admin Dashboard: bila hii, Boss/Staff wangeona rekodi zao
-- WENYEWE tu (kwa mujibu wa policy za "own_*" hapo juu), siyo za watumiaji wote.
--
-- Muhimu kiufundi: policy isiyorejerea "profiles" ndani ya "profiles" moja kwa
-- moja (hilo linasababisha "infinite recursion" error kwenye Postgres RLS).
-- Suluhisho ni helper function ya SECURITY DEFINER (mtindo rasmi wa Supabase).

create or replace function public.is_staff_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin','owner','staff')
  );
$$;

create policy "admin_read_all_profiles" on profiles
  for select
  using (public.is_staff_or_admin());

create policy "admin_read_all_certificates" on certificates
  for select
  using (public.is_staff_or_admin());

create policy "admin_read_all_orders" on orders
  for select
  using (public.is_staff_or_admin());

create policy "admin_read_all_wallets" on wallets
  for select
  using (public.is_staff_or_admin());

create policy "admin_read_all_wallet_transactions" on wallet_transactions
  for select
  using (public.is_staff_or_admin());

-- ---------- Profiles: ruhusu mtumiaji kuandika profile yake mwenyewe (signup) ----------
create policy "insert_own_profile" on profiles
  for insert
  with check (auth.uid() = id);

-- ---------- Orders: ruhusu guest (user_id null) au mtumiaji mwenyewe ----------
create policy "insert_order" on orders
  for insert
  with check (auth.uid() = user_id or user_id is null);

alter table order_items enable row level security;
create policy "insert_order_items" on order_items
  for insert
  with check (true);  -- order_items haina user_id ya moja kwa moja; ulinzi upo kwenye order husika
create policy "select_order_items" on order_items
  for select
  using (true);

-- ---------- Tournament Registrations: tayari ina RLS, ongeza INSERT ----------
create policy "insert_tournament_registration" on tournament_registrations
  for insert
  with check (auth.uid() = user_id or user_id is null);

-- ---------- Products: soma tu (public), hakuna insert ya client ----------
alter table products enable row level security;
create policy "public_read_products" on products
  for select
  using (status = 'active');

alter table product_categories enable row level security;
create policy "public_read_categories" on product_categories
  for select
  using (true);

-- ---------- Tournaments: soma tu (public) ----------
alter table tournaments enable row level security;
create policy "public_read_tournaments" on tournaments
  for select
  using (true);
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
-- =====================================================================
-- LifeIsGameTZ — Automation Engine: Daily Reports (pg_cron + Edge Function)
-- Endesha hii BAADA ya supabase_schema.sql na baada ya kudeploy
-- Edge Function "daily-report"
-- =====================================================================

-- ---------- Jedwali la kuhifadhi ripoti za kila siku ----------
create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  total_orders integer not null default 0,
  total_revenue numeric(14,2) not null default 0,
  new_users integer not null default 0,
  new_tournament_registrations integer not null default 0,
  pending_withdrawals integer not null default 0,
  summary_text text,
  created_at timestamptz not null default now()
);

alter table daily_reports enable row level security;
create policy "admin_read_daily_reports" on daily_reports
  for select
  using (public.is_staff_or_admin());
-- Edge Function itaandika kwa service_role key (inapita RLS), kwa hiyo
-- hakuna INSERT policy inayohitajika kwa anon/authenticated users.

-- =====================================================================
-- AI Memory: RLS kwa ai_conversations na ai_messages
-- =====================================================================

alter table ai_conversations enable row level security;
create policy "own_ai_conversations" on ai_conversations
  for all
  using (auth.uid() = user_id);
create policy "admin_read_all_ai_conversations" on ai_conversations
  for select
  using (public.is_staff_or_admin());

alter table ai_messages enable row level security;
create policy "own_ai_messages" on ai_messages
  for all
  using (
    exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );
create policy "admin_read_all_ai_messages" on ai_messages
  for select
  using (public.is_staff_or_admin());

-- =====================================================================
-- pg_cron: Ratiba ya kuita Edge Function "daily-report" kila siku saa 8:00 asubuhi
-- (05:00 UTC = 08:00 Afrika Mashariki, EAT ni UTC+3)
-- =====================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ⚠️ BADILISHA <PROJECT_REF> na <SERVICE_ROLE_KEY> kabla ya kuendesha!
-- Utazipata: PROJECT_REF kwenye URL yako ya Supabase, SERVICE_ROLE_KEY
-- kwenye Settings -> API (kamwe usiitume kwenye chat au frontend code).

select cron.schedule(
  'lifeisgametz-daily-report',   -- jina la job
  '0 5 * * *',                    -- kila siku saa 05:00 UTC (08:00 EAT)
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Ukitaka kuangalia ratiba zilizopo:
--   select * from cron.job;
-- Ukitaka kufuta ratiba hii:
--   select cron.unschedule('lifeisgametz-daily-report');
