/**
 * Grid LOS vs drawn cover: suggest cells where MAP_COVER_JSON blocks sight from enemy tokens.
 */

import type { Character, MapCoverRegion, SessionSettings, Token } from '../types';
import { effectiveCharacterTeam, teamsAreEnemies } from '../game-logic/teams';
import {
  MAP_GRID_DEFAULT_COLS,
  MAP_GRID_DEFAULT_ROWS,
  cellCenterPct,
  normalizeGridDimension,
  pctToCell,
} from './grid';

function cellKey(c: number, r: number): string {
  return `${c},${r}`;
}

/** Integer Bresenham line in grid space (inclusive endpoints). */
export function bresenhamLine(c0: number, r0: number, c1: number, r1: number): Array<{ c: number; r: number }> {
  const out: Array<{ c: number; r: number }> = [];
  let x0 = c0;
  let y0 = r0;
  const x1 = c1;
  const y1 = r1;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    out.push({ c: x0, r: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

function expandCoverCells(regions: MapCoverRegion[]): Set<string> {
  const set = new Set<string>();
  for (const reg of regions) {
    const cA = Math.min(reg.c0, reg.c1);
    const cB = Math.max(reg.c0, reg.c1);
    const rA = Math.min(reg.r0, reg.r1);
    const rB = Math.max(reg.r0, reg.r1);
    for (let c = cA; c <= cB; c++) {
      for (let r = rA; r <= rB; r++) {
        set.add(cellKey(c, r));
      }
    }
  }
  return set;
}

/** True if any grid cell along the ray from observer to target (excluding observer cell) is cover. */
export function losBlockedByCover(observerC: number, observerR: number, targetC: number, targetR: number, coverCells: Set<string>): boolean {
  const line = bresenhamLine(observerC, observerR, targetC, targetR);
  for (let i = 1; i < line.length; i++) {
    const { c, r } = line[i];
    if (coverCells.has(cellKey(c, r))) return true;
  }
  return false;
}

export interface CoverHintSuggestion {
  x: number;
  y: number;
  cell_column: number;
  cell_row: number;
  enemies_blocked: number;
  enemy_count: number;
}

export interface CoverHintPerToken {
  token_id: string;
  character_id: string;
  name: string;
  team: string;
  current: { cell_column: number; cell_row: number };
  enemies: Array<{ character_id: string; name: string; team: string; cell_column: number; cell_row: number }>;
  suggestions: CoverHintSuggestion[];
}

function manhattan(a: { c: number; r: number }, b: { c: number; r: number }): number {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}

/**
 * For each token with a linked sheet, list up to `limit` grid cells that maximize
 * how many enemy tokens lose clear LOS through cover (ties: closer to current cell).
 */
export function buildTacticalCoverHints(input: {
  characters: Character[];
  tokens: Token[];
  mapCoverRegions: MapCoverRegion[];
  sessionSettings: SessionSettings;
  maxSuggestions?: number;
}): CoverHintPerToken[] {
  const cols = normalizeGridDimension(input.sessionSettings.mapGridCols, MAP_GRID_DEFAULT_COLS);
  const rows = normalizeGridDimension(input.sessionSettings.mapGridRows, MAP_GRID_DEFAULT_ROWS);
  const coverCells = expandCoverCells(input.mapCoverRegions);
  if (coverCells.size === 0) return [];

  const byId = new Map(input.characters.map((c) => [c.id, c]));
  const maxSug = input.maxSuggestions ?? 3;

  const out: CoverHintPerToken[] = [];

  for (const t of input.tokens) {
    if (!t.characterId) continue;
    const mover = byId.get(t.characterId);
    if (!mover) continue;

    const enemyTokens: Array<{ token: Token; char: Character; c: number; r: number }> = [];
    for (const ot of input.tokens) {
      if (!ot.characterId || ot.characterId === mover.id) continue;
      const oc = byId.get(ot.characterId);
      if (!oc || !teamsAreEnemies(mover, oc)) continue;
      const { c, r } = pctToCell(ot.x, ot.y, cols, rows);
      enemyTokens.push({ token: ot, char: oc, c, r });
    }

    if (enemyTokens.length === 0) continue;

    const cur = pctToCell(t.x, t.y, cols, rows);
    const enemyCount = enemyTokens.length;

    type Scored = CoverHintSuggestion & { _d: number };
    const scored: Scored[] = [];

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        let blocked = 0;
        for (const e of enemyTokens) {
          if (losBlockedByCover(e.c, e.r, c, r, coverCells)) blocked++;
        }
        if (blocked === 0) continue;
        const { x, y } = cellCenterPct(c, r, cols, rows);
        scored.push({
          x,
          y,
          cell_column: c,
          cell_row: r,
          enemies_blocked: blocked,
          enemy_count: enemyCount,
          _d: manhattan(cur, { c, r }),
        });
      }
    }

    scored.sort((a, b) => {
      if (b.enemies_blocked !== a.enemies_blocked) return b.enemies_blocked - a.enemies_blocked;
      return a._d - b._d;
    });

    const suggestions: CoverHintSuggestion[] = scored.slice(0, maxSug).map(({ _d, ...rest }) => rest);

    out.push({
      token_id: t.id,
      character_id: mover.id,
      name: t.name,
      team: effectiveCharacterTeam(mover),
      current: { cell_column: cur.c, cell_row: cur.r },
      enemies: enemyTokens.map((e) => ({
        character_id: e.char.id,
        name: e.char.name,
        team: effectiveCharacterTeam(e.char),
        cell_column: e.c,
        cell_row: e.r,
      })),
      suggestions,
    });
  }

  return out;
}
