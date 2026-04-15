/**
 * Load authoritative session state from Postgres (used on first connect and after reconnect).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Character, ChatMessage, Scene, SessionSettings, Token } from '../types';
import {
  characterRowToCharacter,
  chatRowToMessage,
  parseSceneJson,
  parseSessionSettingsJson,
  tokenRowToToken,
} from './db-mapper';

export interface LoadedSessionSnapshot {
  session: {
    id: string;
    name: string;
    createdBy: string | null;
    createdAt: number;
    activeScene: Scene;
    settings: SessionSettings;
    sessionSummary: string;
    mapBackgroundUrl: string;
  };
  characters: Character[];
  tokens: Token[];
  chatMessages: ChatMessage[];
}

function sessionTs(v: unknown): number {
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? Date.now() : t;
  }
  if (v instanceof Date) return v.getTime();
  return Date.now();
}

export async function fetchSessionSnapshot(
  client: SupabaseClient,
  sessionId: string,
): Promise<LoadedSessionSnapshot | null> {
  const { data: sessionRow, error: sessionError } = await client
    .from('sessions')
    .select(
      'id, name, created_by, created_at, map_background_url, active_scene, settings, session_summary',
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !sessionRow) {
    return null;
  }

  const s = sessionRow as Record<string, unknown>;

  const [{ data: charRows, error: charError }, { data: tokenRows, error: tokenError }, { data: chatRows, error: chatError }] =
    await Promise.all([
      client.from('characters').select('*').eq('session_id', sessionId),
      client.from('tokens').select('*').eq('session_id', sessionId),
      client
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    ]);

  if (charError || tokenError || chatError) {
    return null;
  }

  const characters = (charRows ?? []).map((r) => characterRowToCharacter(r as Record<string, unknown>));
  const tokens = (tokenRows ?? []).map((r) => tokenRowToToken(r as Record<string, unknown>));
  const chatMessages = (chatRows ?? []).map((r) => chatRowToMessage(r as Record<string, unknown>));

  return {
    session: {
      id: String(s.id),
      name: String(s.name ?? ''),
      createdBy: s.created_by != null ? String(s.created_by) : null,
      createdAt: sessionTs(s.created_at),
      activeScene: parseSceneJson(s.active_scene),
      settings: parseSessionSettingsJson(s.settings),
      sessionSummary: String(s.session_summary ?? ''),
      mapBackgroundUrl: String(s.map_background_url ?? ''),
    },
    characters,
    tokens,
    chatMessages,
  };
}
