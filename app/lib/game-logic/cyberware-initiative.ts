/**
 * Initiative-only bonus from cyberware JSON (sheet fields, Foundry `checks.Initiative`,
 * nested `system.CyberWorkType.Checks`).
 */

export function cyberwareInitiativeBonusFromRaw(o: Record<string, unknown>): number {
  const fin = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    return undefined;
  };
  let v = fin(o.initiativeBonus) ?? fin(o.initiative_bonus);
  if (v !== undefined) return v;
  const checks = o.checks;
  if (checks && typeof checks === 'object') {
    v = fin((checks as Record<string, unknown>).Initiative);
    if (v !== undefined) return v;
  }
  const cwtFlat = o.CyberWorkType;
  if (cwtFlat && typeof cwtFlat === 'object') {
    const ch = (cwtFlat as Record<string, unknown>).Checks;
    if (ch && typeof ch === 'object') {
      v = fin((ch as Record<string, unknown>).Initiative);
      if (v !== undefined) return v;
    }
  }
  const sys = o.system;
  if (sys && typeof sys === 'object') {
    const cwt = (sys as Record<string, unknown>).CyberWorkType;
    if (cwt && typeof cwt === 'object') {
      const ch = (cwt as Record<string, unknown>).Checks;
      if (ch && typeof ch === 'object') {
        v = fin((ch as Record<string, unknown>).Initiative);
        if (v !== undefined) return v;
      }
    }
  }
  return 0;
}
