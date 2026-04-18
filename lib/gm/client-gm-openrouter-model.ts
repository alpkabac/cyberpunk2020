'use client';

import {
  isGmSelectableOpenRouterModelId,
  type GmSelectableOpenRouterModelId,
} from '@/lib/gm/gm-openrouter-models';
import { useGameStore } from '@/lib/store/game-store';

const STORAGE_KEY = 'cp2020-gm-openrouter-model-v1';

export type GmOpenRouterClientChoice = {
  modelId: GmSelectableOpenRouterModelId;
};

export const GM_OPENROUTER_MODEL_STORAGE_KEY = STORAGE_KEY;

export function defaultGmOpenRouterClientChoice(): GmOpenRouterClientChoice {
  return { modelId: 'deepseek/deepseek-v3.2' };
}

export function readGmOpenRouterClientChoice(): GmOpenRouterClientChoice {
  if (typeof window === 'undefined') return defaultGmOpenRouterClientChoice();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultGmOpenRouterClientChoice();
    const j = JSON.parse(raw) as { modelId?: string };
    const id = j.modelId?.trim();
    if (id && isGmSelectableOpenRouterModelId(id)) {
      return { modelId: id };
    }
  } catch {
    /* ignore */
  }
  return defaultGmOpenRouterClientChoice();
}

export function writeGmOpenRouterClientChoice(choice: GmOpenRouterClientChoice): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ modelId: choice.modelId }));
  } catch {
    /* ignore */
  }
}

/**
 * Prefer the live session’s room setting when `sessionId` matches the joined room; otherwise
 * localStorage (e.g. GM scenarios page with an arbitrary UUID).
 */
export function openRouterModelForGmApi(sessionId: string | null | undefined): GmSelectableOpenRouterModelId {
  const sid = sessionId?.trim() ?? '';
  if (sid) {
    const st = useGameStore.getState().session;
    if (st.id === sid) return st.settings.gmOpenRouterModel;
  }
  return readGmOpenRouterClientChoice().modelId;
}
