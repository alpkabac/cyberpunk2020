/**
 * Core type definitions for the Cyberpunk 2020 AI-GM application
 */

// ============================================================================
// Character Types
// ============================================================================

export interface StatBlock {
  base: number;
  tempMod: number;
  cyberMod: number;
  armorMod: number;
  woundMod: number;
  total: number;
}

export interface Stats {
  int: StatBlock;
  ref: StatBlock;
  tech: StatBlock;
  cool: StatBlock;
  attr: StatBlock;
  luck: StatBlock;
  ma: StatBlock;
  bt: StatBlock;
  emp: StatBlock;
}

export interface DerivedStats {
  btm: number;
  strengthDamageBonus: number;
  run: number;
  leap: number;
  carry: number;
  lift: number;
  humanity: number;
  currentEmp: number;
  saveNumber: number;
  woundState: WoundState;
  woundPenalties: WoundPenalties;
  stunSaveTarget: number;
  deathSaveTarget: number;
}

export type WoundState =
  | 'Uninjured'
  | 'Light'
  | 'Serious'
  | 'Critical'
  | 'Mortal0'
  | 'Mortal1'
  | 'Mortal2'
  | 'Mortal3'
  | 'Mortal4'
  | 'Mortal5'
  | 'Mortal6'
  | 'Dead';

export interface WoundPenalties {
  ref: number;
  int: number;
  cool: number;
}

export type Zone = 'Head' | 'Torso' | 'rArm' | 'lArm' | 'lLeg' | 'rLeg';

export interface HitLocation {
  location: number[];
  stoppingPower: number;
  ablation: number;
}

export type RoleType =
  | 'Solo'
  | 'Rockerboy'
  | 'Netrunner'
  | 'Media'
  | 'Nomad'
  | 'Fixer'
  | 'Cop'
  | 'Corp'
  | 'Techie'
  | 'Medtechie';

export const ROLE_SPECIAL_ABILITIES: Record<RoleType, string> = {
  Solo: 'Combat Sense',
  Rockerboy: 'Charismatic Leadership',
  Netrunner: 'Interface',
  Media: 'Credibility',
  Nomad: 'Family',
  Fixer: 'Streetdeal',
  Cop: 'Authority',
  Corp: 'Resources',
  Techie: 'Jury Rig',
  Medtechie: 'Medical Tech',
};

export interface CharacterCondition {
  name: string;
  /** Remaining rounds (null = indefinite / manual removal only). */
  duration: number | null;
}

export interface Character {
  id: string;
  userId: string;
  sessionId: string;
  name: string;
  type: 'character' | 'npc';
  /** True when `type === 'npc'`; duplicated for LLM payloads and clarity (Task 19.1). */
  isNpc: boolean;
  /**
   * Tactical team id (shared string = allies). Empty uses defaults: PCs `party`, NPCs `hostile`.
   * Used for map enemy detection and GM cover suggestions.
   */
  team: string;
  imageUrl: string;

  // Info
  role: RoleType;
  age: number;
  points: number;

  // Stats
  stats: Stats;

  // Role special ability
  specialAbility: {
    name: string;
    value: number;
  };

  // Reputation & Improvement Points
  reputation: number;
  improvementPoints: number;

  // Skills
  skills: Skill[];

  // Wound tracking
  damage: number;
  isStunned: boolean;
  /**
   * True while the character is medically stabilized — ongoing start-of-turn
   * death saves are suppressed until they take new damage. Set by stabilization
   * success, Speedheal, Trauma Team, etc.; auto-cleared by any fresh damage in
   * applyDamage (both client and GM paths). Does NOT suppress the severance
   * forced Mortal-0 save (that's per-hit trauma, not the ongoing roll).
   */
  isStabilized: boolean;
  /** Persistent status conditions. Stun is tracked via isStunned only. */
  conditions: CharacterCondition[];

  // Hit locations with SP
  hitLocations: Record<Zone, HitLocation>;

  // SDP for cyberlimbs
  sdp: {
    sum: Record<Zone, number>;
    current: Record<Zone, number>;
  };

  // Gear
  eurobucks: number;
  items: Item[];

  // Combat modifiers (optional; initiative also used for Combat Sense initiative roll)
  combatModifiers?: {
    initiative: number;
    /** Added to flat stun save target only (easier when positive). */
    stunSave: number;
    /**
     * Added to flat death save target only (stacks with stunSave for death rolls).
     * Use for gear/perks that help death saves but not stun (rare).
     */
    deathSave?: number;
  };

  // Netrunning
  netrunDeck: NetrunDeck | null;

  // Lifepath
  lifepath: Lifepath | null;

  // Computed fields (not stored in DB)
  derivedStats?: DerivedStats;
}

export interface Skill {
  id: string;
  name: string;
  value: number;
  linkedStat: keyof Stats;
  category: string;
  isChipped: boolean;
  isSpecialAbility?: boolean;
}

// ============================================================================
// Item Types
// ============================================================================

export type ItemType = 'weapon' | 'armor' | 'cyberware' | 'vehicle' | 'misc' | 'program';

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  flavor: string;
  notes: string;
  cost: number;
  weight: number;
  equipped: boolean;
  source: string;
}

export type WeaponType = 'Pistol' | 'SMG' | 'Shotgun' | 'Rifle' | 'Heavy' | 'Melee' | 'Exotic';
export type Concealability = 'P' | 'J' | 'L' | 'N';
export type Availability = 'E' | 'C' | 'R' | 'P';
export type Reliability = 'VR' | 'ST' | 'UR';
export type FireMode = 'SemiAuto' | 'ThreeRoundBurst' | 'FullAuto' | 'Suppressive';

export interface Weapon extends Item {
  type: 'weapon';
  weaponType: WeaponType;
  accuracy: number;
  concealability: Concealability;
  availability: Availability;
  ammoType: string;
  damage: string;
  ap: boolean;
  shotsLeft: number;
  shots: number;
  rof: number;
  reliability: Reliability;
  range: number;
  attackType: string;
  attackSkill: string;
  isAutoCapable: boolean;
}

export interface Armor extends Item {
  type: 'armor';
  coverage: Record<Zone, { stoppingPower: number; ablation: number }>;
  encumbrance: number;
}

export interface Cyberware extends Item {
  type: 'cyberware';
  surgCode: string;
  humanityCost: string;
  humanityLoss: number;
  cyberwareType: string;
  statMods?: Partial<Record<keyof Stats, number>>;
  /**
   * Initiative-only bonus (e.g. Kerenzikov / boosterware in CP2020). Not the same as REF from `statMods`.
   * Parsed from item JSON (`initiativeBonus`, Foundry `checks.Initiative`, nested `system.CyberWorkType.Checks`).
   */
  initiativeBonus?: number;
}

export interface Vehicle extends Item {
  type: 'vehicle';
  vehicleType: string;
  topSpeed: number;
  acceleration: number;
  handling: number;
  vehicleArmor: number;
  vehicleSdp: number;
}

export interface Program extends Item {
  type: 'program';
  programType: string;
  strength: number;
  muCost: number;
  programClass: string;
  options: string[];
}

// ============================================================================
// Netrun Deck
// ============================================================================

export interface NetrunDeck {
  model: string;
  cpu: number;
  speed: number;
  dataWall: number;
  strength: number;
  ramMax: number;
  ramUsed: number;
}

// ============================================================================
// Lifepath
// ============================================================================

export interface Lifepath {
  style: {
    clothes: string;
    hair: string;
    affectations: string;
  };
  ethnicity: string;
  language: string;
  familyBackground: string;
  siblings: string;
  motivations: {
    traits: string;
    valuedPerson: string;
    valueMost: string;
    feelAboutPeople: string;
    valuedPossession: string;
  };
  lifeEvents: LifeEvent[];
  notes: string;
}

export interface LifeEvent {
  age: number;
  event: string;
}

// ============================================================================
// Session Types
// ============================================================================

export interface Session {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;

  // Current state
  characters: Character[];
  npcs: Character[];
  map: MapState;
  activeScene: Scene;

  // History
  chatHistory: ChatMessage[];
  sessionSummary: string;

  // Settings
  settings: SessionSettings;

  /** Session room: FNFF tracker (optional; store hydrates from Postgres). */
  combatState?: CombatState | null;
}

/** Tactical cover on the grid (CP2020 common cover SPs). Cell indices 0-based inclusive. */
export interface MapCoverRegion {
  id: string;
  c0: number;
  r0: number;
  c1: number;
  r1: number;
  coverTypeId: string;
}

export interface MapState {
  backgroundImageUrl: string;
  tokens: Token[];
  coverRegions: MapCoverRegion[];
}

export interface Token {
  id: string;
  name: string;
  imageUrl: string;
  x: number;
  y: number;
  size: number;
  controlledBy: 'player' | 'gm';
  /** Set when synced from Postgres (`tokens.character_id`). */
  characterId?: string | null;
}

export interface Scene {
  location: string;
  description: string;
  npcsPresent: string[];
  situation: string;
}

export interface ChatMessage {
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
  type: 'narration' | 'player' | 'system' | 'roll';
  metadata?: Record<string, unknown>;
}

export interface SessionSettings {
  ttsEnabled: boolean;
  ttsVoice: string;
  autoRollDamage: boolean;
  allowPlayerTokenMovement: boolean;
  /** Persisted room-wide voice UX; synced via Postgres + Realtime for late joiners. */
  voiceInputMode: 'pushToTalk' | 'session';
  /** Display name of who last turned on group Session mode (best-effort). */
  sessionRecordingStartedBy: string | null;

  /** Tactical map grid: column count (2–99). */
  mapGridCols: number;
  /** Tactical map grid: row count (2–99). */
  mapGridRows: number;
  mapShowGrid: boolean;
  mapSnapToGrid: boolean;
  /** If greater than zero, distance labels also show approximate meters (× cell distance). */
  mapMetersPerSquare: number;
}

/** Initiative row for FNFF turn order (persisted on `sessions.combat_state`). */
export interface InitiativeEntry {
  characterId: string;
  name: string;
  ref: number;
  initiativeMod: number;
  /** Solo Combat Sense (or 0). */
  combatSense: number;
  /** Equipped cyberware initiative-only bonuses (e.g. boosterware), not REF. */
  cyberInitiativeBonus: number;
  /** Total d10 contribution (may be exploding 1d10). */
  d10Total: number;
  /** e.g. "7" or "10+4" for display. */
  d10Detail: string;
  /** REF + d10 + manual mod + Combat Sense + cyber initiative bonuses. */
  total: number;
}

/** Active combat / initiative (null = not in combat). */
export interface CombatState {
  round: number;
  /** Index into `entries` (sorted highest initiative first). */
  activeTurnIndex: number;
  entries: InitiativeEntry[];
  /**
   * When set, this PC (`type === "character"`) owes start-of-turn stun recovery /
   * ongoing death saves — client should resolve then clear (future: PATCH combat_state).
   */
  startOfTurnSavesPendingFor?: string | null;
}

// ============================================================================
// AI-GM Types
// ============================================================================

export interface AIGMRequest {
  sessionId: string;
  messages: ChatMessage[];
  characters: Character[];
  activeScene: Scene;
}

export interface AIGMResponse {
  narration: string;
  toolCalls: ToolCall[];
  ttsAudio?: string;
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

// ============================================================================
// Voice Types
// ============================================================================

export interface VoiceProcessingRequest {
  audioChunk: Buffer;
  sessionId: string;
}

export interface VoiceProcessingResponse {
  transcript: string;
  speakerId: string;
  characterId?: string;
}

// ============================================================================
// Dice Types
// ============================================================================

export interface RollResult {
  total: number;
  rolls: number[];
  formula: string;
  /**
   * True when any CP2020 exploding d10 rolled at least one 10 (extra d10(s) added).
   * Always false for `flat:` saves and non-d10 dice.
   */
  hadExplodingD10: boolean;
  /** One face sequence per exploding d10 in the formula (e.g. `[10, 10, 4]`). */
  explodingD10Chains?: number[][];
  /**
   * First face of the first d10 in the formula (before exploding extra d10s).
   * Used for attack fumbles (natural 1). Omitted when the first die is not d10.
   */
  firstD10Face?: number;
}

/**
 * Optional context for posting a sheet roll to the AI-GM (`/api/gm`).
 * Callers should set `rollSummary` + `sessionId` + `speakerName` when in a session (use `sheetRollContext` helper).
 */
export type DiceRollGmContext = {
  rollSummary?: string;
  sessionId?: string;
  speakerName?: string;
};

/** Intent for the dice roller modal (stun/death saves, weapon attack fumbles, stabilization). */
export type DiceRollIntent =
  | ({ kind: 'stun'; characterId: string } & DiceRollGmContext)
  /** Start of turn: flat d10 vs stun target; success clears STUNNED. */
  | ({ kind: 'stun_recovery'; characterId: string } & DiceRollGmContext)
  /**
   * Ask the AI-GM to rule on stun (fiction / fiat). No dice — posts to `/api/gm`;
   * GM should apply via `set_condition` stunned or equivalent.
   */
  | ({ kind: 'stun_override_request'; characterId: string; note?: string } & DiceRollGmContext)
  | ({ kind: 'death'; characterId: string } & DiceRollGmContext)
  | ({
      kind: 'attack';
      characterId: string;
      weaponId: string;
      reliability: Reliability;
      isMelee: boolean;
      /** True when weapon is auto-capable (reserved for future Foundry-style options). */
      isAutoWeapon: boolean;
      /**
       * When set (FNFF ranged bracket DC or melee default), total ≥ this means a hit vs that DV.
       * Omit for legacy rolls / referee-only resolution.
       */
      difficultyValue?: number;
      /** e.g. "Long" or "Melee (DV 10 default)" — shown in dice UI + GM message. */
      rangeBracketLabel?: string;
      /** Declared target of the attack (for messaging + Apply Damage routing). */
      targetCharacterId?: string;
      targetName?: string;
    } & DiceRollGmContext)
  /**
   * Medic roll on the medic's sheet: exploding 1d10 + TECH + medical skill ≥ `targetDamage`.
   * On success, `patientCharacterId` is marked `isStabilized` (ongoing death saves suppressed
   * until they take new damage).
   */
  | ({
      kind: 'stabilization';
      patientCharacterId: string;
      targetDamage: number;
    } & DiceRollGmContext)
  /** Generic sheet roll with an explicit label (skills, stats, initiative, damage, netrun, etc.). */
  | {
      kind: 'custom';
      characterId: string;
      rollSummary: string;
      sessionId?: string;
      speakerName?: string;
    }
  /** GM requested a player roll via `request_roll`; after rolling, post result to `/api/gm`. */
  | {
      kind: 'gm_request';
      sessionId: string;
      formula: string;
      /** Short label for the GM message (e.g. skill name); falls back to `reason` or formula. */
      rollSummary?: string;
      reason?: string;
      speakerName: string;
      /** When true (default), backdrop does not capture pointer events so the character sheet stays usable. */
      nonBlockingUi?: boolean;
    };

/**
 * Roll saved from the dice roller ("Save for voice") to merge when sending session voice.
 * `rolledAtMs` orders the block with voice (`recordingStartedAtMs` on pending voice).
 */
export interface PendingRollForVoice {
  id: string;
  sessionId: string;
  speakerName: string;
  playerMessage: string;
  rolledAtMs: number;
  formula: string;
  diceRollIntent: DiceRollIntent | null;
}

/** Session voice queued before "Send voice to GM". */
export interface PendingVoiceGmPayload {
  sessionId: string;
  speakerName: string;
  playerMessage: string;
  playerMessageMetadata?: Record<string, unknown>;
  recordingStartedAtMs?: number;
  sttCompletedAtMs?: number;
}

// ============================================================================
// Helper to create a default StatBlock
// ============================================================================

export function createStatBlock(base: number = 1, tempMod: number = 0): StatBlock {
  return {
    base,
    tempMod,
    cyberMod: 0,
    armorMod: 0,
    woundMod: 0,
    total: base + tempMod,
  };
}
