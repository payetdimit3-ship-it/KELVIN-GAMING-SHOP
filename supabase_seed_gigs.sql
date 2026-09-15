-- =====================================================================
-- LifeIsGameTZ — Seed Data ya Youth Gigs
-- Endesha hii BAADA ya supabase_schema.sql
-- =====================================================================

insert into youth_gigs (title, category, description, budget, deadline, status) values
('Tengeneza Banner ya Tournament ya Wiki', 'Design', 'Banner ya kuvutia ya tournament ya wiki kwa ajili ya Home page na social media.', 25000, current_date + interval '2 days', 'open'),
('Video Recap ya FC26 Championship (dakika 3-5)', 'Video Editing', 'Highlight reel ya mechi bora za FC26 Championship.', 45000, current_date + interval '4 days', 'open'),
('Landing Page ya Youth Academy', 'Web Dev', 'Ukurasa mmoja wa kuvutia kutangaza Youth Academy.', 120000, current_date + interval '6 days', 'review'),
('Maandishi ya Bidhaa (Product Descriptions) — Bidhaa 30', 'Content', 'Maelezo mafupi na ya kuvutia ya bidhaa 30 za store.', 30000, current_date + interval '7 days', 'open');
