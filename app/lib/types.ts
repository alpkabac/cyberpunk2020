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

export interface Character {
  id: string;
  userId: string;
  sessionId: string;
  name: string;
  type: 'character' | 'npc';
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

  // Combat modifiers
  combatModifiers?: {
    initiative: number;
    stunSave: number;
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
}

export interface MapState {
  backgroundImageUrl: string;
  tokens: Token[];
}

export interface Token {
  id: string;
  name: string;
  imageUrl: string;
  x: number;
  y: number;
  size: number;
  controlledBy: 'player' | 'gm';
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
