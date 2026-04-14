# AI Reference: Cyberpunk 2020 Web App — Technical Blueprint

> This document is written for an AI coding assistant. It contains the full technical context
> needed to build a standalone Cyberpunk 2020 web app with an AI Game Master.
> Read this file first before starting any implementation work.

---

## 1. Project Goal

Build a Next.js web app for playing Cyberpunk 2020 TTRPG with an AI as the Game Master.
No human GM. Players interact through character sheets, a chat interface, dice rolls,
and a simple token map. The AI narrates, adjudicates rules, controls NPCs, and mutates
game state via tool/function calls.

### Source Codebase

This project lives alongside an existing **Foundry VTT system** for Cyberpunk 2020.
The Foundry code is the source of truth for game data and rules logic, but the new app
does NOT use Foundry. We extract data and formulas; we rebuild the UI and infrastructure.

Key files in the Foundry system to reference:

| File | Contains |
|---|---|
| `template.json` | Data schemas for Actor (character/npc) and Item (skill, weapon, armor, cyberware, vehicle, misc, program) |
| `module/lookups.js` | All game constants: weapon types, attack types, fire modes, range brackets, DCs, martial actions/bonuses, BTM table, concealment, availability, reliability |
| `module/actor/actor.js` | Character data preparation: stat totals, SP layering (combineSP/maxLayeredSP), BTM, wound state, humanity/EMP, SDP, carry/lift/run/leap, wound penalties |
| `module/item/item.js` | Weapon roll logic: semi-auto, burst, full-auto, suppressive, melee, martial arts. Damage formulas, point-blank maximization, ammo tracking, fumble integration |
| `module/utils.js` | Hit location rolling, fumble tables (ranged combat, skill, vehicle control), reliability thresholds |
| `module/dice.js` | Dice: base die is `1d10x10` (exploding d10). Multiroll class for bundling attack+damage |
| `lang/en.json` | All UI strings and game term translations (~600 entries) |
| `packs/*.db` | Compendium databases (LevelDB format) — must be exported to JSON for use |

---

## 2. Tech Stack

```
Next.js 14+          — App Router, API routes, React Server Components where useful
React 18+            — Client components for interactive sheets/map/chat
Zustand              — Client state management (character data, UI state)
Tailwind CSS         — Styling, with cyberpunk color theme extracted from scss/
Supabase (or Firebase) — Persistence, auth, realtime sync for multiplayer
```

No Foundry VTT dependency. No Handlebars. No jQuery. Pure React.

---

## 3. Data Models

Derive directly from `template.json`. Here are the core schemas:

### Character (Actor)

```typescript
interface Character {
  id: string;
  name: string;
  type: "character" | "npc";
  img: string;

  // Info
  role: "solo" | "rocker" | "netrunner" | "media" | "nomad" | "fixer" | "cop" | "corp" | "techie" | "medtechie";
  age: number;
  points: number;

  // Stats — each has base + tempMod, derived total computed in prepareData
  stats: {
    int: StatBlock;   // Intelligence
    ref: StatBlock;   // Reflexes
    tech: StatBlock;  // Technical Ability
    cool: StatBlock;  // Cool
    attr: StatBlock;  // Attractiveness
    luck: StatBlock;  // Luck
    ma: StatBlock;    // Movement Allowance — derived: run = ma*3, leap = floor(run/4)
    bt: StatBlock;    // Body Type — derived: carry = bt*10, lift = bt*40, modifier = btmFromBT(bt)
    emp: StatBlock;   // Empathy — derived: humanity = (base+tempMod+cyberMod)*10 - humanityLoss
  };

  // Skills — array of skill items (from compendium)
  skills: SkillItem[];

  // Wound tracking
  damage: number; // 0 = uninjured, 1-4 Light, 5-8 Serious, 9-12 Critical, 13+ Mortal, 37+ Dead

  // Hit locations
  hitLocations: {
    Head:  { location: [1],    stoppingPower: number };
    Torso: { location: [2,4],  stoppingPower: number };
    rArm:  { location: [5],    stoppingPower: number };
    lArm:  { location: [6],    stoppingPower: number };
    lLeg:  { location: [7,8],  stoppingPower: number };
    rLeg:  { location: [9,10], stoppingPower: number };
  };

  // Structural Damage Points (cyberlimbs)
  sdp: {
    sum:     Record<Zone, number>;
    current: Record<Zone, number>;
  };

  // Gear
  eurobucks: number;
  items: GameItem[]; // weapons, armor, cyberware, misc, programs, vehicles

  // Netrunning
  netrun: NetrunDeck;

  // Lifepath (free text)
  lifepath: { events: string; family: string; style: string; motivations: string; notes: string };
}

interface StatBlock {
  base: number;
  tempMod: number;
  // Computed:
  cyberMod?: number;
  armorMod?: number;
  woundMod?: number;
  total?: number;
}

type Zone = "Head" | "Torso" | "lArm" | "rArm" | "lLeg" | "rLeg";
```

### Items

```typescript
// Common fields shared by all items
interface ItemCommon {
  id: string;
  name: string;
  type: "skill" | "weapon" | "armor" | "cyberware" | "vehicle" | "misc" | "program";
  flavor: string;
  notes: string;
  cost: number;
  weight: number;
  equipped: boolean;
  source: string;
}

interface WeaponItem extends ItemCommon {
  type: "weapon";
  weaponType: "Pistol" | "SMG" | "Shotgun" | "Rifle" | "Heavy" | "Melee" | "Exotic";
  accuracy: number;
  concealability: "P" | "J" | "L" | "N";
  availability: "Excellent" | "Common" | "Poor" | "Rare";
  ammoType: string;
  damage: string;       // dice formula, e.g. "2d6+1"
  ap: boolean;           // armor piercing
  shotsLeft: number;
  shots: number;         // max ammo capacity
  rof: number;           // rate of fire
  reliability: "VeryReliable" | "Standard" | "Unreliable";
  range: number;         // in meters
  attackType: string;    // from rangedAttackTypes or meleeAttackTypes
  attackSkill: string;   // skill key used for attack rolls
}

interface ArmorItem extends ItemCommon {
  type: "armor";
  coverage: Record<Zone, { stoppingPower: number; ablation: number }>;
  encumbrance: number;
}

interface CyberwareItem extends ItemCommon {
  type: "cyberware";
  surgCode: string;
  humanityCost: string;  // dice formula or number
  humanityLoss: number;  // rolled/applied loss
  cyberwareType: string;
  // CyberWorkType has many subtypes — see template.json for full schema
}
```

---

## 4. Core Game Formulas to Implement

These are the formulas the character sheet must compute. Extract from `actor.js` and `lookups.js`.

### Stat Totals
```
stat.total = stat.base + stat.tempMod + stat.cyberMod + stat.armorMod + stat.woundMod
```

### Body Type Modifier (BTM)
```
BT 1-2  → BTM 0
BT 3-4  → BTM 1
BT 5-7  → BTM 2
BT 8-9  → BTM 3
BT 10   → BTM 4
BT 11+  → BTM 5
```
Source: `lookups.js` → `btmFromBT()`

### Strength Damage Bonus (melee)
```
BT 1-2  → -2    BT 3-4  → -1    BT 5-7  → 0
BT 8-9  → +1    BT 10   → +2    BT 11-12 → +4
BT 13-14 → +6   BT 15+  → +8
```
Source: `lookups.js` → `strengthDamageBonus()`

### Derived Movement
```
run  = MA × 3 (meters/round)
leap = floor(run / 4) (meters)
```

### Derived Body
```
carry = BT × 10 (kg)
lift  = BT × 40 (kg)
```

### Humanity & Empathy
```
baseHumanity = (EMP.base + EMP.tempMod + EMP.cyberMod) × 10
currentHumanity = baseHumanity - totalHumanityLoss
currentEMP = max(0, ceil(currentHumanity / 10))
```

### Wound State
```
damage  0       → Uninjured
damage  1-4     → Light        (no penalty)
damage  5-8     → Serious      (REF -2)
damage  9-12    → Critical     (REF/INT/COOL halved, round up)
damage 13-16    → Mortal 0     (REF/INT/COOL = ceil(total/3))
damage 17-20    → Mortal 1     (same)
...continues in 4-point increments through Mortal 6...
damage 37+      → Dead
```

### Armor SP Layering
When wearing multiple armor layers on the same zone:
```
combineSP(a, b):
  diff = abs(a - b)
  if diff >= 27 → bonus = 0
  if diff >= 21 → bonus = 1
  if diff >= 15 → bonus = 2
  if diff >= 9  → bonus = 3
  if diff >= 5  → bonus = 4
  else          → bonus = 5
  result = max(a, b) + bonus
```
For 3+ layers, find the ordering that maximizes final SP.
Source: `actor.js` → `combineSP()` and `maxLayeredSP()`

### REF Armor Penalty
```
REF.armorMod = -(sum of all equipped armor encumbrance values)
```

### Range DCs
```
Point Blank: DC 10 (distance: 1m)
Close:       DC 15 (distance: range/4)
Medium:      DC 20 (distance: range/2)
Long:        DC 25 (distance: range)
Extreme:     DC 30 (distance: range×2)
```

### Hit Location Table (d10)
```
1     → Head
2-4   → Torso
5     → Right Arm
6     → Left Arm
7-8   → Left Leg
9-10  → Right Leg
```

### Damage Pipeline (AI-GM uses this for rulings, app applies the result)
```
1. Roll weapon damage dice
2. Head hits: damage × 2
3. Subtract SP of hit location (if SP > 0, reduce SP by 1 for ablation)
4. Subtract BTM
5. Remaining damage (min 0) added to character's damage total
6. If AP ammo: halve SP before subtraction
7. Point-blank firearms: maximize damage dice
```

---

## 5. Dice System

Base mechanic: `1d10` (exploding on 10 — roll again and add).
Implemented as `1d10x10` in Foundry's Roll syntax.

For the new app, implement a simple dice roller:

```typescript
function rollExplodingD10(): number {
  let total = 0;
  let roll;
  do {
    roll = Math.floor(Math.random() * 10) + 1;
    total += roll;
  } while (roll === 10);
  return total;
}

function rollDice(formula: string): { total: number; rolls: number[] } {
  // Parse "2d6+1", "1d10x10", "3d6", etc.
  // Return total and individual die results for display
}
```

Skill check: `1d10(exploding) + STAT + Skill ± modifiers vs DC`
Attack roll: `1d10(exploding) + REF + weapon skill + accuracy ± modifiers vs range DC`

---

## 6. AI-GM Integration

### LLM Setup

Use OpenAI or Anthropic API with **tool/function calling**. The AI-GM is a system prompt
with tools that mutate game state.

### Tool Definitions

```typescript
const gmTools = [
  {
    name: "apply_damage",
    description: "Apply damage to a character after armor and BTM have been calculated",
    parameters: {
      character_id: "string — the target character",
      amount: "number — damage after SP and BTM",
      location: "string — hit zone (Head, Torso, lArm, rArm, lLeg, rLeg)"
    }
  },
  {
    name: "deduct_money",
    description: "Subtract eurobucks from a character's wallet",
    parameters: {
      character_id: "string",
      amount: "number"
    }
  },
  {
    name: "add_item",
    description: "Add an item (weapon, armor, gear, cyberware) to a character's inventory",
    parameters: {
      character_id: "string",
      item: "object — item data matching the schema"
    }
  },
  {
    name: "remove_item",
    description: "Remove an item from a character's inventory",
    parameters: {
      character_id: "string",
      item_id: "string"
    }
  },
  {
    name: "request_roll",
    description: "Ask a player to make a dice roll",
    parameters: {
      character_id: "string",
      skill: "string — skill name",
      dc: "number — difficulty class",
      modifiers: "string — description of situational modifiers"
    }
  },
  {
    name: "move_token",
    description: "Move a token on the map",
    parameters: {
      token_id: "string",
      x: "number — percentage of map width (0-100)",
      y: "number — percentage of map height (0-100)"
    }
  },
  {
    name: "generate_scenery",
    description: "Generate an image for the current scene",
    parameters: {
      description: "string — visual description for image generation"
    }
  },
  {
    name: "play_narration",
    description: "Convert text to speech and play for players",
    parameters: {
      text: "string — narration text",
      voice: "string — voice style (dramatic, calm, gruff, etc.)"
    }
  },
  {
    name: "lookup_rules",
    description: "Fetch detailed rules on a specific topic",
    parameters: {
      topic: "string — one of: ranged-combat, melee-combat, autofire, netrunning, cyberware-rules, vehicle-combat, shopping, drugs-medical"
    }
  },
  {
    name: "update_character_field",
    description: "Update any field on a character sheet",
    parameters: {
      character_id: "string",
      field_path: "string — dot-notation path, e.g. 'stats.ref.tempMod'",
      value: "any"
    }
  }
];
```

### Context Assembly (per LLM call)

```
[System Prompt]           ~1,500 tokens  — persona + core rules (always present)
[Character Sheets JSON]   ~800-1,200     — all PCs, compact format (always present)
[Active Scene]            ~200-300       — location, NPCs present, situation
[Triggered Rules]         ~800-1,200     — keyword-matched topic files (0-3 entries)
[Session Summary]         ~500           — compressed history of earlier events
[Recent Chat]             ~2,000-3,000   — last 10-15 messages
─────────────────────────────────────────
Total:                    ~6,000-8,000 tokens
```

### Rules Knowledge: Lorebook Pattern (SillyTavern-style)

Store rules as markdown files with keyword headers:

```markdown
---
keywords: [autofire, full auto, suppressive, spray, burst, ROF, rate of fire]
priority: 8
max_tokens: 400
---

## Autofire Rules
Full automatic fire: Roll 1d10 + REF + weapon skill + modifiers vs DC.
Every point above DC = 1 bullet hits (max = rounds fired)...
```

Before each LLM call:
1. Scan last 2-3 player messages for keyword matches
2. Inject matching entries (up to token budget) into context
3. AI can also call `lookup_rules(topic)` if it needs more detail

---

## 7. Map Component

Keep it simple — no grid, no fog of war, no line-of-sight.

```typescript
interface MapState {
  backgroundImage: string;    // URL to map image (uploaded or AI-generated)
  tokens: Token[];
}

interface Token {
  id: string;
  name: string;
  img: string;               // token image URL
  x: number;                 // percentage position (0-100)
  y: number;
  size: number;              // pixel diameter
  controlled_by: "player" | "gm";  // player tokens vs NPC tokens (AI moves these)
}
```

Implementation: absolutely-positioned `<div>`s over an `<img>`, draggable via
HTML5 drag-and-drop or `@dnd-kit/core`. Sync positions to database for multiplayer.

---

## 8. File Structure

```
/app
  /page.tsx                    — Main game view (map + sheets + chat)
  /api
    /gm/route.ts               — AI-GM endpoint (LLM call + tool execution)
    /tts/route.ts              — TTS generation endpoint
    /image/route.ts            — Image generation endpoint
  /components
    /character-sheet/          — Stat block, skills, wound track, inventory, cyberware
    /map/                      — Map background + draggable tokens
    /chat/                     — GM console, player input, roll results
    /dice-roller/              — Visual dice roller component
    /scenery/                  — Full-bleed image display for AI-generated scenes
    /shop/                     — Optional: browsable item catalog
  /lib
    /game-logic/
      formulas.ts              — BTM, SP layering, wound state, stat derivations
      dice.ts                  — Dice roller (exploding d10, XdY parser)
      lookups.ts               — Weapon types, ranges, DCs, martial bonuses (from lookups.js)
    /ai/
      context-builder.ts       — Assembles the LLM context (system prompt + sheets + rules)
      tool-executor.ts         — Executes AI tool calls against game state
      lorebook.ts              — Keyword scanner + rules file loader
    /store/
      game-store.ts            — Zustand store: characters, map, session state
      actions.ts               — State mutations (apply damage, deduct money, etc.)
    /data/
      weapons.json             — Exported from Foundry compendium
      armor.json
      cyberware.json
      skills.json
      gear.json
/rules
  /core/
    combat-basics.md
    damage-pipeline.md
    skill-checks.md
  /topics/
    ranged-combat.md
    melee-combat.md
    autofire.md
    netrunning.md
    cyberware-rules.md
    vehicle-combat.md
    shopping.md
  /catalogs/
    (symlinks or copies of /lib/data/*.json)
/public
  /tokens/                     — Token images
  /maps/                       — Default map images
```

---

## 9. Data Extraction from Foundry

The `packs/*.db` files are LevelDB. To extract to JSON:

1. Open a Foundry world with this system installed
2. Open browser console
3. For each compendium:
   ```javascript
   const pack = game.packs.get("cyberpunk2020.pistols");
   const docs = await pack.getDocuments();
   const json = docs.map(d => d.toObject());
   console.log(JSON.stringify(json, null, 2));
   ```
4. Save output to corresponding JSON file in `/lib/data/`

Do this for: pistols, rifles, shotguns, submachineguns, melee, heavy, exotics,
armor, cyberware (all categories), gear (all categories), programs, vehicles,
default-skills-en, role-skills-en.

---

## 10. Implementation Priority

1. **Game logic module** (`/lib/game-logic/`) — formulas, dice, lookups. Pure functions, no UI.
2. **Character sheet component** — render and edit a character. Stat totals, skills list, wound track, inventory. Uses game logic module for derived values.
3. **Zustand store + AI tool executor** — state management + the bridge between AI responses and state mutations.
4. **AI-GM endpoint** — context builder + LLM API call + tool execution.
5. **Chat interface** — player input → AI response display. Roll requests show dice UI.
6. **Map component** — background image + draggable tokens.
7. **TTS + image gen** — API integrations for narration and scenery.
8. **Multiplayer sync** — Supabase Realtime subscriptions on the game store.

---

## 11. Weapon Types and Attack Skills Reference

From `lookups.js`:

```
Pistol      → Handgun skill
SMG         → Submachinegun skill
Shotgun     → Rifle skill
Rifle       → Rifle skill
Heavy       → Heavy Weapons skill
Melee       → Fencing, Melee, or Brawling skill
Exotic      → No restriction
```

Fire modes (auto weapons only): Full Auto, Three-Round Burst, Suppressive Fire, Semi-Auto
Non-auto weapons: Semi-Auto only

Martial art styles and their action bonuses:
```
Karate:          Strike +2, Kick +2, Block/Parry +2
Judo:            Throw +3, Hold +3, Escape +3
Boxing:          Strike +3, Block/Parry +3, Dodge +1, Grapple +2
Thai Kickboxing: Strike +3, Kick +3
Choi Li Fut:     Strike +2, Kick +2, Block/Parry +2
Aikido:          Block/Parry +4, Throw +3, Hold +3, Escape +3, Choke +1
Animal Kung Fu:  Strike +2, Kick +2, Grapple +2
Tae Kwon Do:     Strike +3, Kick +3, Block/Parry +1
Savate:          Strike +3, Kick +4
Wrestling:       Grapple +3, Hold +4, Choke +3
Capoeira:        Strike +1, Kick +2, Dodge +2, Sweep/Trip +3
Brawling:        (no bonuses)
```

Ranged combat modifiers:
```
Aimed shot at specific area:  -4
Aiming (per round, max 3):   +1/+2/+3
Ambush:                       +5
Blinded:                      -3
Dual wield:                   -3
Fast draw:                    -3
Hipfire:                      -2
Ricochet:                     -5
Running:                      -3
Turning to face:              -2
```
