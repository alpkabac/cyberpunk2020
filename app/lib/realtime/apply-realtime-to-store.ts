/**
 * Default wiring from Supabase `postgres_changes` payloads into the Zustand game store.
 */

import { useGameStore } from '../store/game-store';
import { chatRowToMessage, parseSceneJson, parseSessionSettingsJson } from './db-mapper';
import type { PostgresChangeHandlers } from './session-channel';

export function createDefaultPostgresHandlersForGameStore(): PostgresChangeHandlers {
  return {
    onSessionChange: (row) => {
      const settings = parseSessionSettingsJson(row.settings);
      useGameStore.getState().setSession({
        id: String(row.id ?? ''),
        name: String(row.name ?? ''),
        activeScene: parseSceneJson(row.active_scene),
        sessionSummary: String(row.session_summary ?? ''),
        settings,
      });
      useGameStore.getState().setMapBackground(String(row.map_background_url ?? ''));
      useGameStore.getState().syncVoiceUiFromSessionSettings(settings);
    },
    onCharacterChange: ({ eventType, newRecord, oldRecord }) => {
      if (eventType === 'DELETE') {
        const id = oldRecord?.id;
        if (id) useGameStore.getState().removeRemoteCharacter(id);
        return;
      }
      if (newRecord) useGameStore.getState().applyRemoteCharacterUpsert(newRecord);
    },
    onTokenChange: ({ eventType, newRecord, oldRecord }) => {
      if (eventType === 'DELETE') {
        const id = oldRecord?.id;
        if (id) useGameStore.getState().removeRemoteToken(id);
        return;
      }
      if (newRecord) useGameStore.getState().applyRemoteTokenUpsert(newRecord);
    },
    onChatMessageChange: ({ eventType, new: newRow }) => {
      if (eventType === 'DELETE') return;
      if (newRow) {
        useGameStore.getState().appendRemoteChatMessage(chatRowToMessage(newRow));
      }
    },
  };
}
