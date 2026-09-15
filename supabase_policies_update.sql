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
