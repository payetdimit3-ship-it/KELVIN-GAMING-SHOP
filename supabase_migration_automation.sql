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
