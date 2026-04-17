-- ============================================================================
-- Migration 010: Add is_stabilized flag to characters
-- ============================================================================
-- Tracks whether a Mortally Wounded character has been medically stabilized
-- (medtech first aid, Speedheal, Trauma Team, etc.). While TRUE, ongoing
-- start-of-turn death saves are suppressed. Any new damage MUST reset this
-- flag to FALSE (handled in application code) per FNFF RAW: new trauma
-- un-stabilizes the patient.
--
-- Note: severance-forced death saves still fire regardless of is_stabilized —
-- that's a per-hit trauma save, not the ongoing one.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS is_stabilized BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN characters.is_stabilized IS
  'True while the character is medically stabilized and skips ongoing Mortal death saves. Cleared automatically on any new damage.';
