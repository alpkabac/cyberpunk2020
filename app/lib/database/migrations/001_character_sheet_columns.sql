-- ============================================================================
-- Migration: Character sheet columns + programs extras (existing databases)
-- ============================================================================
-- Run in Supabase SQL Editor after an older schema.sql install.
-- Safe to re-run: uses IF NOT EXISTS.

-- Characters: align with app/lib/types.ts (Character, StatBlock, combatModifiers)
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS special_ability JSONB NOT NULL DEFAULT '{"name":"","value":0}'::jsonb;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS reputation INTEGER NOT NULL DEFAULT 0;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS improvement_points INTEGER NOT NULL DEFAULT 0;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS is_stunned BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS combat_modifiers JSONB DEFAULT '{"initiative":0,"stunSave":0}'::jsonb;

-- Programs: optional fields used by app Item Program type / imports
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS program_class TEXT DEFAULT '';

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN characters.special_ability IS 'Role special ability: { name, value }';
COMMENT ON COLUMN characters.reputation IS 'Character reputation (REP)';
COMMENT ON COLUMN characters.improvement_points IS 'Improvement Points (IP)';
COMMENT ON COLUMN characters.is_stunned IS 'Stun state from failed stun save';
COMMENT ON COLUMN characters.combat_modifiers IS 'Optional { initiative, stunSave }';
