/**
 * CP2020 "Common Cover SPs" (Friday Night Firefight) — VIEW FROM THE EDGE p.99–102.
 * Used for tactical map cover regions (SP = structural points absorbed before the target).
 */

export interface CoverTypeDefinition {
  id: string;
  label: string;
  /** Stopping power of the material (CP2020). */
  sp: number;
}

/** Table: COMMON COVER SPS + formal section table (p.102). */
export const CP2020_COVER_TYPES: CoverTypeDefinition[] = [
  { id: 'sheetrock_wall', label: 'Sheetrock Wall', sp: 5 },
  { id: 'stone_wall', label: 'Stone Wall', sp: 30 },
  { id: 'tree_phone_pole', label: 'Large Tree / Phone Pole', sp: 30 },
  { id: 'brick_wall', label: 'Brick Wall', sp: 25 },
  { id: 'concrete_block_wall', label: 'Concrete Block Wall', sp: 10 },
  { id: 'wood_door', label: 'Wood Door', sp: 5 },
  { id: 'heavy_wood_door', label: 'Heavy Wood Door', sp: 15 },
  { id: 'steel_door', label: 'Steel Door', sp: 20 },
  { id: 'concrete_utility_pole', label: 'Concrete Utility Pole', sp: 35 },
  { id: 'data_term', label: 'Data Term™', sp: 25 },
  { id: 'car_body_door', label: 'Car Body / Door', sp: 10 },
  { id: 'armored_car_body', label: 'Armored Car Body', sp: 40 },
  { id: 'av4_body', label: 'AV-4 Body', sp: 40 },
  { id: 'engine_block', label: 'Engine Block', sp: 35 },
  { id: 'mailbox', label: 'Mailbox', sp: 25 },
  { id: 'hydrant', label: 'Hydrant', sp: 35 },
  { id: 'curb', label: 'Curb', sp: 25 },
];

const COVER_IDS = new Set(CP2020_COVER_TYPES.map((t) => t.id));

export function isValidCoverTypeId(id: string): boolean {
  return COVER_IDS.has(id);
}

export function coverTypeLabel(id: string): string {
  return CP2020_COVER_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function coverTypeSp(id: string): number {
  return CP2020_COVER_TYPES.find((t) => t.id === id)?.sp ?? 0;
}

/** Visual hint: higher SP → warmer / more opaque. */
export function coverSpStyle(sp: number): { bg: string; border: string } {
  if (sp >= 35) return { bg: 'rgba(220, 38, 38, 0.35)', border: 'rgba(248, 113, 113, 0.65)' };
  if (sp >= 20) return { bg: 'rgba(234, 179, 8, 0.32)', border: 'rgba(250, 204, 21, 0.55)' };
  if (sp >= 10) return { bg: 'rgba(34, 197, 94, 0.28)', border: 'rgba(74, 222, 128, 0.5)' };
  return { bg: 'rgba(56, 189, 248, 0.22)', border: 'rgba(125, 211, 252, 0.45)' };
}
