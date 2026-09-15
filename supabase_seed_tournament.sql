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
