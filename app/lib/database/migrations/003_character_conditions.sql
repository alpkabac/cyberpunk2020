-- ============================================================================
-- Migration 003: Add persistent conditions column to characters
-- ============================================================================
-- Stores status effects (e.g. unconscious, blinded, on_fire) as a JSONB array
-- of strings. The "stunned" condition is NOT stored here — isStunned owns that.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN characters.conditions IS 'Active status conditions (string[]), e.g. ["unconscious","on_fire"]. Stun is tracked via is_stunned.';
