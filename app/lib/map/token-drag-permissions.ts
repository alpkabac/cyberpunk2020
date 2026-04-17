/**
 * Pure rules for who may drag a token in the map UI (matches RLS intent: GM → gm tokens; players → own PC-linked tokens).
 */

import type { Token } from '../types';

export interface TokenDragContext {
  userId: string | undefined;
  isGm: boolean;
  allowPlayerTokenMovement: boolean;
  /** characterId → owning auth user id (player characters only). */
  characterOwnerById: Record<string, string>;
}

export function canDragToken(token: Token, ctx: TokenDragContext): boolean {
  if (!ctx.userId) return false;
  if (token.controlledBy === 'gm') {
    return ctx.isGm;
  }
  if (!ctx.allowPlayerTokenMovement) return false;
  const owner = token.characterId ? ctx.characterOwnerById[token.characterId] : undefined;
  return owner === ctx.userId;
}

/** Visual hint: token is “yours” or GM-owned (for styling). */
export function tokenRoleLabel(token: Token, ctx: TokenDragContext): 'gm' | 'yours' | 'player' | 'npc-marker' {
  if (token.controlledBy === 'gm') return 'gm';
  const owner = token.characterId ? ctx.characterOwnerById[token.characterId] : undefined;
  if (owner && ctx.userId && owner === ctx.userId) return 'yours';
  return 'player';
}
