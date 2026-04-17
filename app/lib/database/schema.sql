-- ============================================================================
-- Cyberpunk 2020 AI-GM Database Schema
-- ============================================================================
-- This schema defines all tables for the multiplayer AI-GM application
-- Run this in your Supabase SQL editor to set up the database
--
-- If you already applied an older schema.sql, run the migrations in order:
--   migrations/001_character_sheet_columns.sql
--   migrations/003_character_conditions.sql
-- to add the same columns without recreating tables.

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
    "ttsEnabled": true,
    "ttsVoice": "alloy",
    "autoRollDamage": true,
    "allowPlayerTokenMovement": true,
    "voiceInputMode": "pushToTalk",
    "sessionRecordingStartedBy": null
  }'::jsonb,

  -- FNFF initiative / turn order (null = not in combat)
  combat_state JSONB DEFAULT NULL
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
