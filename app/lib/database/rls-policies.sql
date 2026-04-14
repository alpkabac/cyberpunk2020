-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================
-- This file defines security policies to ensure users can only access
-- their own data and data from sessions they're part of
-- Run this AFTER schema.sql in your Supabase SQL editor

-- ============================================================================
-- Enable RLS on all tables
-- ============================================================================

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Game data tables are read-only for all authenticated users
ALTER TABLE weapons ENABLE ROW LEVEL SECURITY;
ALTER TABLE armor ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyberware ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helper function to check if user is in a session
-- ============================================================================

CREATE OR REPLACE FUNCTION is_user_in_session(session_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- User is in session if they created it OR have a character in it
  RETURN EXISTS (
    SELECT 1 FROM sessions WHERE id = session_uuid AND created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM characters WHERE session_id = session_uuid AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Sessions Table Policies
-- ============================================================================

-- Users can view sessions they created or are part of
CREATE POLICY "Users can view their sessions"
  ON sessions FOR SELECT
  USING (
    created_by = auth.uid() OR
    is_user_in_session(id)
  );

-- Users can create new sessions
CREATE POLICY "Users can create sessions"
  ON sessions FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Users can update sessions they created or are part of
CREATE POLICY "Users can update their sessions"
  ON sessions FOR UPDATE
  USING (
    created_by = auth.uid() OR
    is_user_in_session(id)
  )
  WITH CHECK (
    created_by = auth.uid() OR
    is_user_in_session(id)
  );

-- Only session creators can delete sessions
CREATE POLICY "Only creators can delete sessions"
  ON sessions FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================================
-- Characters Table Policies
-- ============================================================================

-- Users can view characters in sessions they're part of
CREATE POLICY "Users can view characters in their sessions"
  ON characters FOR SELECT
  USING (is_user_in_session(session_id));

-- Users can create characters in sessions they're part of
CREATE POLICY "Users can create characters in their sessions"
  ON characters FOR INSERT
  WITH CHECK (
    is_user_in_session(session_id) AND
    (user_id = auth.uid() OR type = 'npc')
  );

-- Users can only update their own characters (or NPCs if they're the GM)
CREATE POLICY "Users can update their own characters"
  ON characters FOR UPDATE
  USING (
    user_id = auth.uid() OR
    (type = 'npc' AND EXISTS (
      SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid()
    ))
  )
  WITH CHECK (
    user_id = auth.uid() OR
    (type = 'npc' AND EXISTS (
      SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid()
    ))
  );

-- Users can delete their own characters (or NPCs if they're the GM)
CREATE POLICY "Users can delete their own characters"
  ON characters FOR DELETE
  USING (
    user_id = auth.uid() OR
    (type = 'npc' AND EXISTS (
      SELECT 1 FROM sessions WHERE id = session_id AND created_by = auth.uid()
    ))
  );

-- ============================================================================
-- Tokens Table Policies
-- ============================================================================

-- Users can view tokens in sessions they're part of
CREATE POLICY "Users can view tokens in their sessions"
  ON tokens FOR SELECT
  USING (is_user_in_session(session_id));

-- Users can create tokens in sessions they're part of
CREATE POLICY "Users can create tokens in their sessions"
  ON tokens FOR INSERT
  WITH CHECK (is_user_in_session(session_id));

-- Players can update their own tokens, GMs can update all tokens
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

-- Users can delete tokens they control
CREATE POLICY "Users can delete tokens they control"
  ON tokens FOR DELETE
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
  );

-- ============================================================================
-- Chat Messages Table Policies
-- ============================================================================

-- Users can view chat messages in sessions they're part of
CREATE POLICY "Users can view chat in their sessions"
  ON chat_messages FOR SELECT
  USING (is_user_in_session(session_id));

-- Users can create chat messages in sessions they're part of
CREATE POLICY "Users can send messages in their sessions"
  ON chat_messages FOR INSERT
  WITH CHECK (is_user_in_session(session_id));

-- Chat messages cannot be updated (immutable)
-- No UPDATE policy means no one can update

-- Only session creators can delete chat messages (for moderation)
CREATE POLICY "Session creators can delete messages"
  ON chat_messages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM sessions 
    WHERE sessions.id = chat_messages.session_id 
    AND sessions.created_by = auth.uid()
  ));

-- ============================================================================
-- Game Data Tables Policies (Read-only for all authenticated users)
-- ============================================================================

-- Weapons
CREATE POLICY "Authenticated users can view weapons"
  ON weapons FOR SELECT
  USING (auth.role() = 'authenticated');

-- Armor
CREATE POLICY "Authenticated users can view armor"
  ON armor FOR SELECT
  USING (auth.role() = 'authenticated');

-- Cyberware
CREATE POLICY "Authenticated users can view cyberware"
  ON cyberware FOR SELECT
  USING (auth.role() = 'authenticated');

-- Gear
CREATE POLICY "Authenticated users can view gear"
  ON gear FOR SELECT
  USING (auth.role() = 'authenticated');

-- Vehicles
CREATE POLICY "Authenticated users can view vehicles"
  ON vehicles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Skills Reference
CREATE POLICY "Authenticated users can view skills"
  ON skills_reference FOR SELECT
  USING (auth.role() = 'authenticated');

-- Programs
CREATE POLICY "Authenticated users can view programs"
  ON programs FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- Service Role Bypass (for server-side operations)
-- ============================================================================
-- The service role key bypasses RLS, allowing server-side code to perform
-- administrative operations. This is handled automatically by Supabase.

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON POLICY "Users can view their sessions" ON sessions IS 
  'Users can view sessions they created or have characters in';

COMMENT ON POLICY "Only creators can delete sessions" ON sessions IS 
  'Only the user who created a session can delete it';

COMMENT ON POLICY "Users can update their own characters" ON characters IS 
  'Users can only modify their own characters, or NPCs if they are the GM';

COMMENT ON POLICY "Users can update tokens they control" ON tokens IS 
  'Players can move their own tokens, GMs can move all tokens in their sessions';

COMMENT ON POLICY "Session creators can delete messages" ON chat_messages IS 
  'Only session creators can delete messages for moderation purposes';
