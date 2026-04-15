# Backlog & follow-ups

Personal reminder file for features and decisions that are **not** implemented yet or are **partially** done.

---

## Current focus (scope)

- **Netrunning** — **Skipped for now** (no active work). Stays in the backlog below; **do not delete** the row or NetRun tab work already in the repo—we’re just not prioritizing parity with *Gameplay* until later.
- **Next major slice after combat backlog items:** **Chargen** (pickup points, role skills, starting gear workflows). Everything above netrunning in the table remains the preferred order for sheet/combat work.

---

## Combat modifiers (`initiative` / `stunSave` on the character)

**Current behavior:** `combatModifiers` are **manual** — nothing in the app reads equipped gear/cyberware and fills these for you. That’s **intentional** for flexibility (drugs, referee rulings, one-shots, homebrew).

**If we automate later (suggested approach):**

- **Don’t** replace manual fields — keep them (or a “situational ±”) for things that aren’t in data.
- **Do** add optional fields on gear/cyberware (e.g. initiative / stun-save bonus) and **sum equipped** items when the data is trustworthy.
- **Hybrid UX:** show a breakdown, e.g. “from gear: +1” + “manual: +0”, or a read-only gear sum plus **Apply from equipped** that copies into the editable fields.
- **Data cost:** most effort is **curating** `cyberware.json` / gear — not the React wiring. Default is **defer** until you’re ready to tag items; optional **tiny** first step: types + helper that sums `0` until rows exist.

---

## Suggested feature backlog

Rough priority order — adjust as you like.

| Area | Idea |
|------|------|
| **Ranged combat** | **Done (v1):** per-weapon checklist from `rangedCombatModifiers`, attack preview (DV + d10 hint), bracket buttons roll **1d10 + base + mods** (`CombatTab`). |
| **Point-blank** | **Done (v1):** ranged **Apply Damage — point blank** + melee **fill weapon code** open `DamageApplicator` with preset (`CombatTab` / `DamageApplicator`). |
| **Attack d10 / exploding** | **Done (v1):** Dice roller detects real **FNFF** explosions (`hadExplodingD10` + optional face chains); **`flat:`** stun/death saves never show this. |
| **Fumbles / reliability** | **Done (v1):** natural **1** on weapon attack (`1d10+…` + attack intent) resolves **melee d6** or **reflex combat d10** + **reliability** (VR/ST/UR thresholds) in `DiceRoller` / `fumbles.ts`. |
| **Stabilization** | **Done (v1):** Combat tab + dice intent — **TECH + First Aid/Medical Tech + 1d10** vs patient damage (`getStabilizationMedicBonus`, `DiceRollIntent` `stabilization`). |
| **Netrunning** *(deferred)* | Full net turn / programs / ICE if you want parity with *Gameplay*. **Not in current scope**—keep in list; no removal. |
| **Chargen** | Pickup points (REF+INT), role skills, starting gear workflows. **Next** after the combat-focused rows above (given netrunning skipped). |

---

## Practical next steps (what to do next)

1. **Stability** — Keep fixing sheet/combat/dice edge cases (you already hit setState-during-render; watch for more).
2. **Ranged checklist or preview** — **Shipped (v1)** on Combat tab expanded ranged weapons (see `rangedCombatModifiers` in lookups).
3. **Point-blank → Apply Damage** — **Shipped (v1)** — preset modal from weapon rows (point blank + weapon code / melee fill).
4. **Attack “10” reminder** — **Shipped (v1)** — exploding d10 callout + chains in `DiceRoller` (`rollExplodingD10Detailed` / `RollResult`).
5. **Reliability / fumbles** — **Shipped (v1)** — attack fumble + reliability lines in dice roller (`lookups` thresholds match Foundry).
6. **Stabilization roll** — **Shipped (v1)** — medic roll + target in Combat tab; success/fail in dice roller.
7. **Gear-driven combat modifiers** — When you’re ready to **tag data**; optional read-only “from gear: 0” first.
8. **Chargen** — Pickup points, role skills, starting gear (**next** large slice while **netrunning is skipped**—net stays in backlog, not removed).

---

## Related docs

- `PROJECT_PLAN.md` — product vision & build order  
- `app/components/character/FEATURES.md` — character sheet feature notes  
- `AI_REFERENCE.md` — AI / state integration hints  
