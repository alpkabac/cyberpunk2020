-- Tactical teams: same string = allies; different = hostile for map/LOS hints and GM tools.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN characters.team IS 'Tactical team id (free text). Empty = default party (PC) or hostile (NPC).';
