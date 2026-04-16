'use client';

import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveCharacterToSupabase, serializeCharacterForDb } from '@/lib/db/character-serialize';
import { useGameStore } from '@/lib/store/game-store';

const DEBOUNCE_MS = 650;

/**
 * Debounced persist of a single character row to Supabase when Zustand state changes.
 * Enable only when the user is editing a cloud-backed character (session + auth).
 */
export function useCharacterCloudSync(
  client: SupabaseClient,
  characterId: string | null,
  enabled: boolean,
): void {
  const savingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !characterId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSent = '';

    const flush = async () => {
      const s = useGameStore.getState();
      const character = s.characters.byId[characterId] ?? s.npcs.byId[characterId];
      if (!character || savingRef.current) return;
      const payload = JSON.stringify(serializeCharacterForDb(character));
      if (payload === lastSent) return;
      savingRef.current = true;
      const { error } = await saveCharacterToSupabase(client, character);
      savingRef.current = false;
      if (!error) {
        lastSent = payload;
      } else {
        console.error('[character-cloud-sync]', error.message);
      }
    };

    const unsub = useGameStore.subscribe((state, prevState) => {
      const character =
        state.characters.byId[characterId] ?? state.npcs.byId[characterId];
      const prevChar =
        prevState.characters.byId[characterId] ?? prevState.npcs.byId[characterId];
      if (!character) return;
      if (character === prevChar) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void flush();
      }, DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [client, characterId, enabled]);
}
