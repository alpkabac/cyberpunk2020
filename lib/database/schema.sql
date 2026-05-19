-- ============================================================================
-- Cyberpunk 2020 Multiplayer Table Database Schema
-- ============================================================================
-- This schema defines all tables for the multiplayer table application
-- Run this in your Supabase SQL editor to set up the database
--
-- For a new database, run this file first. The migrations folder is for older
-- databases that were created before this schema was squashed.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Sessions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Map state
  map_background_url TEXT,
  map_state JSONB DEFAULT '{"coverRegions":[],"suppressiveZones":[],"pendingSuppressivePlacements":[]}'::jsonb,
  
  -- Active scene
  active_scene JSONB DEFAULT '{
    "location": "",
    "description": "",
    "npcsPresent": [],
    "situation": ""
  }'::jsonb,
  
  -- Session history and summary
  session_summary TEXT DEFAULT '',
  
  -- Settings
  settings JSONB DEFAULT '{
    "autoRollDamage": true,
    "allowPlayerTokenMovement": true
  }'::jsonb,

  -- FNFF initiative / turn order (null = not in combat)
  combat_state JSONB DEFAULT NULL,

  -- Shared soundtrack (Storage object paths under public bucket `soundtrack`)
  soundtrack_state JSONB DEFAULT NULL,

  -- GM scene image (HTTPS URL, synced to all clients)
  narration_image JSONB DEFAULT NULL
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- ============================================================================
-- Characters Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('character', 'npc')),
  image_url TEXT DEFAULT '',
  
  -- Character info
  role TEXT DEFAULT '',
  age INTEGER DEFAULT 25,
  points INTEGER DEFAULT 0,
  
  -- Stats (JSONB; matches StatBlock in app/lib/types.ts)
  stats JSONB NOT NULL DEFAULT '{
    "int": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5},
    "ref": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5},
    "tech": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5},
    "cool": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5},
    "attr": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5},
    "luck": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5},
    "ma": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5},
    "bt": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5},
    "emp": {"base": 5, "tempMod": 0, "cyberMod": 0, "armorMod": 0, "woundMod": 0, "total": 5}
  }'::jsonb,

  -- Role special ability (matches Character.specialAbility)
  special_ability JSONB NOT NULL DEFAULT '{"name":"","value":0}'::jsonb,

  reputation INTEGER NOT NULL DEFAULT 0,
  improvement_points INTEGER NOT NULL DEFAULT 0,

  -- Skills array (Skill[] in app — id, name, value, linkedStat, category, isChipped, …)
  skills JSONB DEFAULT '[]'::jsonb,
  
  -- Wound tracking
  damage INTEGER DEFAULT 0,
  is_stunned BOOLEAN NOT NULL DEFAULT FALSE,
  is_stabilized BOOLEAN NOT NULL DEFAULT FALSE,
  conditions JSONB DEFAULT '[]'::jsonb,

  combat_modifiers JSONB DEFAULT '{"initiative":0,"stunSave":0,"deathSave":0}'::jsonb,
  
  -- Hit locations with SP
  hit_locations JSONB NOT NULL DEFAULT '{
    "Head": {"location": [1], "stoppingPower": 0, "ablation": 0},
    "Torso": {"location": [2, 3, 4], "stoppingPower": 0, "ablation": 0},
    "rArm": {"location": [5], "stoppingPower": 0, "ablation": 0},
    "lArm": {"location": [6], "stoppingPower": 0, "ablation": 0},
    "lLeg": {"location": [7, 8], "stoppingPower": 0, "ablation": 0},
    "rLeg": {"location": [9, 10], "stoppingPower": 0, "ablation": 0}
  }'::jsonb,
  
  -- SDP for cyberlimbs
  sdp JSONB DEFAULT '{
    "sum": {"Head": 0, "Torso": 0, "rArm": 0, "lArm": 0, "lLeg": 0, "rLeg": 0},
    "current": {"Head": 0, "Torso": 0, "rArm": 0, "lArm": 0, "lLeg": 0, "rLeg": 0}
  }'::jsonb,
  
  -- Gear
  eurobucks INTEGER DEFAULT 0,
  items JSONB DEFAULT '[]'::jsonb,
  
  -- Netrunning
  netrun_deck JSONB,
  
  -- Lifepath
  lifepath JSONB,

  -- Tactical team (same string = allies; empty = default party/hostile)
  team TEXT NOT NULL DEFAULT '',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_characters_session_id ON characters(session_id);
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_type ON characters(type);

-- ============================================================================
-- Tokens Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  
  -- Position (percentage coordinates 0-100)
  x NUMERIC(5,2) NOT NULL CHECK (x >= 0 AND x <= 100),
  y NUMERIC(5,2) NOT NULL CHECK (y >= 0 AND y <= 100),
  
  -- Size in pixels
  size INTEGER DEFAULT 50,
  
  -- Ownership
  controlled_by TEXT NOT NULL CHECK (controlled_by IN ('player', 'gm')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tokens_session_id ON tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_tokens_character_id ON tokens(character_id);

-- ============================================================================
-- Map Presets Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS map_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_presets_session_id ON map_presets(session_id);

-- ============================================================================
-- Chat Messages Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('narration', 'player', 'system', 'roll')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat history queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at);

-- ============================================================================
-- Game Data Tables
-- ============================================================================

-- Weapons Table
CREATE TABLE IF NOT EXISTS weapons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  weapon_type TEXT NOT NULL,
  accuracy INTEGER DEFAULT 0,
  concealability TEXT,
  availability TEXT,
  ammo_type TEXT DEFAULT '',
  damage TEXT NOT NULL,
  ap BOOLEAN DEFAULT FALSE,
  shots INTEGER DEFAULT 0,
  rof INTEGER DEFAULT 1,
  reliability TEXT DEFAULT 'ST',
  range INTEGER DEFAULT 0,
  attack_type TEXT DEFAULT '',
  attack_skill TEXT DEFAULT '',
  cost INTEGER DEFAULT 0,
  weight NUMERIC DEFAULT 0,
  flavor TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weapons_name ON weapons(name);
CREATE INDEX IF NOT EXISTS idx_weapons_weapon_type ON weapons(weapon_type);

-- Armor Table
CREATE TABLE IF NOT EXISTS armor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  coverage JSONB NOT NULL,
  encumbrance INTEGER DEFAULT 0,
  cost INTEGER DEFAULT 0,
  weight NUMERIC DEFAULT 0,
  flavor TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_armor_name ON armor(name);

-- Cyberware Table
CREATE TABLE IF NOT EXISTS cyberware (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  surg_code TEXT DEFAULT '',
  humanity_cost TEXT DEFAULT '',
  humanity_loss NUMERIC DEFAULT 0,
  cyberware_type TEXT DEFAULT '',
  cost INTEGER DEFAULT 0,
  weight NUMERIC DEFAULT 0,
  flavor TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cyberware_name ON cyberware(name);
CREATE INDEX IF NOT EXISTS idx_cyberware_type ON cyberware(cyberware_type);

-- Gear Table (miscellaneous items)
CREATE TABLE IF NOT EXISTS gear (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  cost INTEGER DEFAULT 0,
  weight NUMERIC DEFAULT 0,
  flavor TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gear_name ON gear(name);

-- Vehicles Table
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  vehicle_type TEXT DEFAULT '',
  top_speed INTEGER DEFAULT 0,
  acceleration INTEGER DEFAULT 0,
  handling INTEGER DEFAULT 0,
  armor INTEGER DEFAULT 0,
  sdp INTEGER DEFAULT 0,
  cost INTEGER DEFAULT 0,
  weight NUMERIC DEFAULT 0,
  flavor TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_name ON vehicles(name);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON vehicles(vehicle_type);

-- Skills Table (reference data)
CREATE TABLE IF NOT EXISTS skills_reference (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  linked_stat TEXT NOT NULL,
  category TEXT DEFAULT '',
  description TEXT DEFAULT '',
  source TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_reference_name ON skills_reference(name);
CREATE INDEX IF NOT EXISTS idx_skills_reference_category ON skills_reference(category);

-- Programs Table (for netrunning)
CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  program_type TEXT DEFAULT '',
  program_class TEXT DEFAULT '',
  strength INTEGER DEFAULT 0,
  mu_cost INTEGER DEFAULT 0,
  cost INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  source TEXT DEFAULT '',
  options JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_programs_name ON programs(name);
CREATE INDEX IF NOT EXISTS idx_programs_type ON programs(program_type);

-- ============================================================================
-- Triggers for updated_at timestamps
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tokens_updated_at
  BEFORE UPDATE ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_map_presets_updated_at
  BEFORE UPDATE ON map_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Realtime
-- ============================================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tokens;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.characters REPLICA IDENTITY FULL;

-- ============================================================================
-- Row-Level Security
-- ============================================================================

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_presets ENABLE ROW LEVEL SECURITY;

ALTER TABLE weapons ENABLE ROW LEVEL SECURITY;
ALTER TABLE armor ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyberware ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_user_in_session(session_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sessions WHERE id = session_uuid AND created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM characters WHERE session_id = session_uuid AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION claim_session_character(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid;
  ctype text;
  cuid uuid;
BEGIN
  SELECT session_id, type, user_id INTO sid, ctype, cuid
  FROM characters
  WHERE id = p_character_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'character not found';
  END IF;

  IF ctype IS DISTINCT FROM 'character' THEN
    RAISE EXCEPTION 'not a player character';
  END IF;

  IF cuid IS NOT NULL THEN
    RAISE EXCEPTION 'already claimed';
  END IF;

  IF NOT is_user_in_session(sid) THEN
    RAISE EXCEPTION 'not in session';
  END IF;

  IF EXISTS (
    SELECT 1 FROM characters
    WHERE session_id = sid
      AND user_id = auth.uid()
      AND type = 'character'
      AND id <> p_character_id
  ) THEN
    RAISE EXCEPTION 'already has a character in this session';
  END IF;

  UPDATE characters
  SET user_id = auth.uid(), updated_at = NOW()
  WHERE id = p_character_id;
END;
$$;

REVOKE ALL ON FUNCTION claim_session_character(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_session_character(uuid) TO authenticated;

CREATE POLICY "Users can view their sessions"
  ON sessions FOR SELECT
  USING (created_by = auth.uid() OR is_user_in_session(id));

CREATE POLICY "Users can create sessions"
  ON sessions FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their sessions"
  ON sessions FOR UPDATE
  USING (created_by = auth.uid() OR is_user_in_session(id))
  WITH CHECK (created_by = auth.uid() OR is_user_in_session(id));

CREATE POLICY "Only creators can delete sessions"
  ON sessions FOR DELETE
  USING (created_by = auth.uid());

CREATE POLICY "Users can view characters in their sessions"
  ON characters FOR SELECT
  USING (is_user_in_session(session_id));

CREATE POLICY "Users can create characters in their sessions"
  ON characters FOR INSERT
  WITH CHECK (
    is_user_in_session(session_id) AND
    (
      (type = 'character' AND user_id = auth.uid()) OR
      (type = 'npc' AND (user_id IS NULL OR user_id = auth.uid())) OR
      (
        type = 'character' AND user_id IS NULL AND
        EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
      ) OR
      (
        type = 'character' AND user_id IS NOT NULL AND
        EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
      )
    )
  );

CREATE POLICY "Users can update their own characters"
  ON characters FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (type = 'npc' AND is_user_in_session(session_id))
    OR (
      type = 'character'
      AND user_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (type = 'npc' AND is_user_in_session(session_id))
    OR (
      type = 'character'
      AND user_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
  );

CREATE POLICY "Users can delete their own characters"
  ON characters FOR DELETE
  USING (
    user_id = auth.uid()
    OR (type = 'npc' AND is_user_in_session(session_id))
    OR (
      type = 'character'
      AND user_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid())
    )
  );

CREATE POLICY "Users can view tokens in their sessions"
  ON tokens FOR SELECT
  USING (is_user_in_session(session_id));

CREATE POLICY "Users can create tokens in their sessions"
  ON tokens FOR INSERT
  WITH CHECK (is_user_in_session(session_id));

CREATE POLICY "Users can update tokens they control"
  ON tokens FOR UPDATE
  USING (
    (controlled_by = 'player' AND EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = tokens.character_id
        AND characters.user_id = auth.uid()
    )) OR
    (controlled_by = 'gm' AND EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = tokens.session_id
        AND sessions.created_by = auth.uid()
    ))
  )
  WITH CHECK (
    (controlled_by = 'player' AND EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = tokens.character_id
        AND characters.user_id = auth.uid()
    )) OR
    (controlled_by = 'gm' AND EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = tokens.session_id
        AND sessions.created_by = auth.uid()
    ))
  );

CREATE POLICY "Session participants can delete tokens"
  ON tokens FOR DELETE
  USING (is_user_in_session(session_id));

CREATE POLICY "Users can view chat in their sessions"
  ON chat_messages FOR SELECT
  USING (is_user_in_session(session_id));

CREATE POLICY "Users can send messages in their sessions"
  ON chat_messages FOR INSERT
  WITH CHECK (is_user_in_session(session_id));

CREATE POLICY "Session creators can delete messages"
  ON chat_messages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = chat_messages.session_id
      AND sessions.created_by = auth.uid()
  ));

CREATE POLICY "Session participants can view map presets"
  ON map_presets FOR SELECT
  USING (is_user_in_session(session_id));

CREATE POLICY "GMs can create map presets"
  ON map_presets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_id
        AND sessions.created_by = auth.uid()
    )
  );

CREATE POLICY "GMs can update map presets"
  ON map_presets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = map_presets.session_id
        AND sessions.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = map_presets.session_id
        AND sessions.created_by = auth.uid()
    )
  );

CREATE POLICY "GMs can delete map presets"
  ON map_presets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = map_presets.session_id
        AND sessions.created_by = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can view weapons"
  ON weapons FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view armor"
  ON armor FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view cyberware"
  ON cyberware FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view gear"
  ON gear FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view vehicles"
  ON vehicles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view skills"
  ON skills_reference FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view programs"
  ON programs FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- Storage Buckets
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('soundtrack', 'soundtrack', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE OR REPLACE FUNCTION public.can_manage_character_avatar_object(p_name text, p_bucket_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  sid uuid;
  cid uuid;
  seg1 text;
  seg2 text;
  seg3 text;
BEGIN
  IF p_bucket_id IS DISTINCT FROM 'avatars' THEN
    RETURN false;
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN false;
  END IF;

  seg1 := split_part(p_name, '/', 1);
  seg2 := split_part(p_name, '/', 2);
  seg3 := split_part(p_name, '/', 3);
  IF seg1 = '' OR seg2 = '' OR seg3 = '' THEN
    RETURN false;
  END IF;

  BEGIN
    sid := seg1::uuid;
    cid := seg2::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM characters c
    WHERE c.session_id = sid
      AND c.id = cid
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = c.session_id AND s.created_by = auth.uid()
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_character_avatar_object(text, text) FROM PUBLIC;

CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatar upload for character editors"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_character_avatar_object(name, bucket_id));

CREATE POLICY "Avatar update for character editors"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (public.can_manage_character_avatar_object(name, bucket_id))
  WITH CHECK (public.can_manage_character_avatar_object(name, bucket_id));

CREATE POLICY "Avatar delete for character editors"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (public.can_manage_character_avatar_object(name, bucket_id));

CREATE POLICY "Public read soundtrack objects"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'soundtrack');

CREATE POLICY "Soundtrack insert for authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'soundtrack'
    AND (name ~ '^ambient/[^/]+$' OR name ~ '^combat/[^/]+$')
  );

CREATE POLICY "Soundtrack update for authenticated"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'soundtrack' AND (name ~ '^ambient/[^/]+$' OR name ~ '^combat/[^/]+$'))
  WITH CHECK (bucket_id = 'soundtrack' AND (name ~ '^ambient/[^/]+$' OR name ~ '^combat/[^/]+$'));

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE sessions IS 'Game sessions with map state, scene, and settings';
COMMENT ON TABLE characters IS 'Player characters and NPCs with full stats and inventory';
COMMENT ON TABLE tokens IS 'Visual representations of characters on the map';
COMMENT ON TABLE chat_messages IS 'Chat history including narration, player messages, and rolls';
COMMENT ON TABLE weapons IS 'Reference data for all weapons in the game';
COMMENT ON TABLE armor IS 'Reference data for all armor in the game';
COMMENT ON TABLE cyberware IS 'Reference data for all cyberware in the game';
COMMENT ON TABLE gear IS 'Reference data for miscellaneous items';
COMMENT ON TABLE vehicles IS 'Reference data for all vehicles in the game';
COMMENT ON TABLE skills_reference IS 'Reference data for all skills in the game';
COMMENT ON TABLE programs IS 'Reference data for netrunning programs';

COMMENT ON COLUMN characters.stats IS 'Stats JSON matching StatBlock (base, tempMod, cyberMod, armorMod, woundMod, total) per key';
COMMENT ON COLUMN characters.special_ability IS 'Role special ability: { name, value }';
COMMENT ON COLUMN characters.reputation IS 'Reputation (REP)';
COMMENT ON COLUMN characters.improvement_points IS 'Improvement Points (IP)';
COMMENT ON COLUMN characters.is_stunned IS 'Stun state after failed stun save';
COMMENT ON COLUMN characters.is_stabilized IS 'True while medically stabilized (suppresses ongoing Mortal death saves). Cleared on any new damage.';
COMMENT ON COLUMN characters.conditions IS 'Active status conditions (string[]), e.g. ["unconscious","on_fire"]. Stun is tracked via is_stunned.';
COMMENT ON COLUMN characters.combat_modifiers IS 'Optional initiative / save bonuses: { initiative, stunSave, deathSave? }';
COMMENT ON COLUMN programs.program_class IS 'Net program class (matches app Program.programClass)';
COMMENT ON COLUMN programs.options IS 'Program options array (matches app Program.options)';
