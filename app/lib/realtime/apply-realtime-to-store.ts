/**
 * Default wiring from Supabase `postgres_changes` payloads into the Zustand game store.
 */

import type { Session } from '../types';
import { useGameStore } from '../store/game-store';
import { parseCombatStateJson } from '../session/combat-state';
import { chatRowToMessage, parseSceneJson, parseSessionSettingsJson } from './db-mapper';
import { parseMapStateJson } from '../map/map-state';
import type { PostgresChangeHandlers } from './session-channel';

export function createDefaultPostgresHandlersForGameStore(): PostgresChangeHandlers {
  return {
    onSessionChange: (row) => {
      const patch: Partial<Session> = {};
      if ('id' in row && row.id != null) patch.id = String(row.id);
      if ('name' in row && row.name != null) patch.name = String(row.name);
      if ('active_scene' in row) patch.activeScene = parseSceneJson(row.active_scene);
      if ('session_summary' in row) patch.sessionSummary = String(row.session_summary ?? '');

      if ('settings' in row) {
        const settings = parseSessionSettingsJson(row.settings);
        patch.settings = settings;
        useGameStore.getState().syncVoiceUiFromSessionSettings(settings);
      }

      if ('map_background_url' in row) {
        useGameStore.getState().setMapBackground(String(row.map_background_url ?? ''));
      }

      if ('map_state' in row) {
        useGameStore.getState().applySessionMapState(parseMapStateJson(row.map_state));
      }

      if ('combat_state' in row) {
        patch.combatState = parseCombatStateJson(row.combat_state);
      }

      if (Object.keys(patch).length > 0) {
        useGameStore.getState().setSession(patch);
      }
    },
    onCharacterChange: ({ eventType, newRow, oldRow }) => {
      if (eventType === 'DELETE') {
        const id = oldRow?.id;
        if (id) useGameStore.getState().removeRemoteCharacter(String(id));
        return;
      }
      if (newRow) useGameStore.getState().applyRemoteCharacterUpsert(newRow);
    },
    onTokenChange: ({ eventType, newRecord, oldRecord }) => {
      if (eventType === 'DELETE') {
        const id = oldRecord?.id;
        if (id) useGameStore.getState().removeRemoteToken(id);
        return;
      }
      if (newRecord) useGameStore.getState().applyRemoteTokenUpsert(newRecord);
    },
    onChatMessageChange: ({ eventType, new: newRow, old: oldRow }) => {
      if (eventType === 'DELETE') {
        const id = oldRow?.id;
        if (id) useGameStore.getState().removeChatMessagesByIds([String(id)]);
        return;
      }
      if (eventType === 'UPDATE' && newRow) {
        useGameStore.getState().mergeRemoteChatMessage(chatRowToMessage(newRow));
        return;
      }
      if (eventType === 'INSERT' && newRow) {
        useGameStore.getState().appendRemoteChatMessage(chatRowToMessage(newRow));
      }
    },
  };
}
