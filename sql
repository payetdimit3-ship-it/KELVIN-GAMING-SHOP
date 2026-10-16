UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';

-- 1. Add columns to sports_matches
ALTER TABLE sports_matches 
ADD COLUMN IF NOT EXISTS stream_url TEXT,
ADD COLUMN IF NOT EXISTS stream_status TEXT DEFAULT 'offline',
ADD COLUMN IF NOT EXISTS viewers INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_possession INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS away_possession INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS home_shots_on_target INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_shots_on_target INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_shots INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_shots INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_corners INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_corners INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_fouls INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_fouls INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_yellow INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_yellow INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_red INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_red INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS broadcaster TEXT;

-- 2. Create match_events table
CREATE TABLE IF NOT EXISTS match_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID REFERENCES sports_matches(id) ON DELETE CASCADE,
  minute INTEGER NOT NULL,
  event_type TEXT CHECK (event_type IN ('goal', 'yellow_card', 'red_card', 'substitution', 'penalty', 'own_goal', 'var')),
  team TEXT CHECK (team IN ('home', 'away')),
  player TEXT,
  player_out TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create match_chat table
CREATE TABLE IF NOT EXISTS match_chat (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID REFERENCES sports_matches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  username TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. RLS
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read events" ON match_events FOR SELECT USING (true);
CREATE POLICY "Admin full events" ON match_events FOR ALL USING (is_admin());

CREATE POLICY "Public read chat" ON match_chat FOR SELECT USING (true);
CREATE POLICY "Users insert chat" ON match_chat FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin full chat" ON match_chat FOR ALL USING (is_admin());