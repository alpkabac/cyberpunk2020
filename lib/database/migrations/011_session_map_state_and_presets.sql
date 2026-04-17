-- Tactical map: cover regions on grid (JSONB). Map presets for save/load (GM).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS map_state JSONB DEFAULT '{"coverRegions":[]}'::jsonb;

COMMENT ON COLUMN sessions.map_state IS 'Tactical map: { coverRegions: [{ id, c0,r0,c1,r1, coverTypeId }] }';

CREATE TABLE IF NOT EXISTS map_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_presets_session_id ON map_presets(session_id);

COMMENT ON TABLE map_presets IS 'Saved map layouts: background URL, grid settings slice, cover regions (GM)';
