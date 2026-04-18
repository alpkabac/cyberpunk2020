'use client';

import { useState, useMemo, useCallback } from 'react';
import { Character, Zone, Weapon, Armor, FireMode } from '@/lib/types';
import { useGameStore } from '@/lib/store/game-store';
import { DamageApplicator, type DamageApplicatorPreset } from '../DamageApplicator';
import { FireModeTargetModal } from '../FireModeTargetModal';
import { ItemBrowser } from '../ItemBrowser';
import { maxLayeredSP, getStabilizationMedicBonus } from '@/lib/game-logic/formulas';
import {
  rangeBrackets,
  getRangeDistance,
  getRangeBracket,
  reliabilityLabels,
  concealabilityLabels,
  hitLocationRollRanges,
  rangedCombatModifiers,
  RangeBracket,
} from '@/lib/game-logic/lookups';
import { sheetRollContext } from '@/lib/dice-roll-send-to-gm';
import { sumEquippedCyberwareInitiativeBonus } from '@/lib/session/combat-state';
import {
  MAP_GRID_DEFAULT_COLS,
  MAP_GRID_DEFAULT_ROWS,
  normalizeGridDimension,
  pctToCell,
  cellDistance,
} from '@/lib/map/grid';
import { summarizeMapFireCover } from '@/lib/map/fire-cover';
import { burstAllowedAtBracket, burstAmmo } from '@/lib/game-logic/fire-modes';
import { computeAutofireModStrip, runAutomatedWeaponFire } from '@/lib/game-logic/automated-weapon-fire';
import { playWeaponFireSfx } from '@/lib/audio/session-sfx';

/** Must match `rangedCombatModifiers` key for aimed shots (attack −4; zone chosen if hit). */
const AIMED_SHOT_LABEL = 'Aimed shot (specific area)' as const;

const COVER_TO_HIT_KEYS = [
  'Target behind cover (1/4)',
  'Target behind cover (1/2)',
  'Target behind cover (3/4)',
] as const;

type CoverToHitKey = (typeof COVER_TO_HIT_KEYS)[number];

function getGlobalCoverSelection(
  weaponsList: Weapon[],
  toggles: Record<string, Record<string, boolean>>,
): CoverToHitKey | 'none' | 'mixed' {
  const ranged = weaponsList.filter((w) => w.weaponType !== 'Melee');
  if (ranged.length === 0) return 'none';
  const activePerWeapon = ranged.map((w) => COVER_TO_HIT_KEYS.find((k) => toggles[w.id]?.[k]) ?? null);
  const first = activePerWeapon[0];
  if (activePerWeapon.every((a) => a === first)) return first ?? 'none';
  return 'mixed';
}

interface CombatTabProps {
  character: Character;
  editable: boolean;
}

export function CombatTab({ character, editable }: CombatTabProps) {
  const [showDamageApplicator, setShowDamageApplicator] = useState(false);
  const [damageApplicatorPreset, setDamageApplicatorPreset] =
    useState<DamageApplicatorPreset | null>(null);
  const [showItemBrowser, setShowItemBrowser] = useState(false);
  const [expandedWeaponId, setExpandedWeaponId] = useState<string | null>(null);
  /** Per-weapon checklist for FNFF ranged situational modifiers (lookups). */
  const [rangedModToggles, setRangedModToggles] = useState<Record<string, Record<string, boolean>>>(
    {},
  );
  /** Last selected range bracket per weapon (for DC highlight + preview). */
  const [selectedRangeByWeapon, setSelectedRangeByWeapon] = useState<
    Record<string, RangeBracket>
  >({});
  /** Patient total damage — medic may override when stabilizing someone else. */
  const [stabilizationTarget, setStabilizationTarget] = useState(() =>
    Math.max(1, Math.min(40, character.damage)),
  );
  /** Who receives `isStabilized` on a successful roll (defaults to open sheet). */
  const [stabilizationPatientId, setStabilizationPatientId] = useState(character.id);
  /** When aimed shot is checked, optional declared zone for Apply Damage preset. */
  const [aimedZoneByWeapon, setAimedZoneByWeapon] = useState<Record<string, string>>({});
  /** Declared target for attack rolls + Apply Damage victim (session PCs/NPCs). */
  const [combatTargetId, setCombatTargetId] = useState('');
  /** Burst / full-auto target picker. */
  const [fireModeModal, setFireModeModal] = useState<
    null | { weaponId: string; mode: 'ThreeRoundBurst' | 'FullAuto' }
  >(null);
  /** Per-weapon committed round count for suppressive fire (before drawing the map zone). */
  const [suppressRoundsByWeapon, setSuppressRoundsByWeapon] = useState<Record<string, number>>({});
  /** Optional meters to target — updates range bracket for the expanded ranged weapon. */
  const [combatDistanceMInput, setCombatDistanceMInput] = useState('');
  /** When true, distance field is not overwritten by map token movement / auto sync. */
  const [distanceManualOverride, setDistanceManualOverride] = useState(false);
  /** When true, behind-cover to-hit radios are not overwritten by map fire-line sync. */
  const [coverManualOverride, setCoverManualOverride] = useState(false);

  const openDiceRoller = useGameStore((state) => state.openDiceRoller);
  const pendingGmAttackRequest = useGameStore((state) => state.ui.pendingGmAttackRequest);
  const sessionId = useGameStore((state) => state.session.id);
  const charactersById = useGameStore((state) => state.characters.byId);
  const characterIds = useGameStore((state) => state.characters.allIds);
  const npcsById = useGameStore((state) => state.npcs.byId);
  const npcIds = useGameStore((state) => state.npcs.allIds);
  const beginStunSaveRoll = useGameStore((state) => state.beginStunSaveRoll);
  const beginStunOverrideRequest = useGameStore((state) => state.beginStunOverrideRequest);
  const beginDeathSaveRoll = useGameStore((state) => state.beginDeathSaveRoll);
  const updateCharacterField = useGameStore((state) => state.updateCharacterField);
  const fireWeapon = useGameStore((state) => state.fireWeapon);
  const reloadWeapon = useGameStore((state) => state.reloadWeapon);
  const sellItem = useGameStore((state) => state.sellItem);
  const saveSessionMapPendingSuppressive = useGameStore((state) => state.saveSessionMapPendingSuppressive);
  const pendingSuppressivePlacements = useGameStore((state) => state.map.pendingSuppressivePlacements);
  const viewerUserId = useGameStore((state) => state.session.viewerUserId);
  const sessionCreatedBy = useGameStore((state) => state.session.createdBy);
  const isSessionHost = Boolean(viewerUserId && sessionCreatedBy === viewerUserId);

  const toggleItemEquipped = (itemId: string) => {
    const updatedItems = character.items.map((i) =>
      i.id === itemId ? { ...i, equipped: !i.equipped } : i,
    );
    updateCharacterField(character.id, 'items', updatedItems);
  };

  const initMod = character.combatModifiers?.initiative ?? 0;
  const cyberInitBonus = sumEquippedCyberwareInitiativeBonus(character);
  const stunSaveMod = character.combatModifiers?.stunSave ?? 0;
  const deathSaveOnlyMod = character.combatModifiers?.deathSave ?? 0;
  const stabBonus = getStabilizationMedicBonus(character);
  const medSkillForStab = Math.max(0, stabBonus - (character.stats.tech.total ?? 0));

  const stabilizationPatientOptions = useMemo(() => {
    const rows: { id: string; name: string }[] = [];
    for (const id of characterIds) {
      const c = charactersById[id];
      if (c) rows.push({ id: c.id, name: c.name });
    }
    for (const id of npcIds) {
      const c = npcsById[id];
      if (c) rows.push({ id: c.id, name: c.name });
    }
    if (!rows.some((r) => r.id === character.id)) {
      rows.push({ id: character.id, name: character.name });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [characterIds, charactersById, npcIds, npcsById, character.id, character.name]);

  const stabilizationPatient =
    charactersById[stabilizationPatientId] ?? npcsById[stabilizationPatientId];

  const mapTokens = useGameStore((state) => state.map.tokens);
  const mapCoverRegions = useGameStore((state) => state.map.coverRegions);
  const mapGridSettings = useGameStore((state) => state.session.settings);

  const gridColsRows = useMemo(
    () => ({
      cols: normalizeGridDimension(mapGridSettings.mapGridCols, MAP_GRID_DEFAULT_COLS),
      rows: normalizeGridDimension(mapGridSettings.mapGridRows, MAP_GRID_DEFAULT_ROWS),
    }),
    [mapGridSettings.mapGridCols, mapGridSettings.mapGridRows],
  );

  const mapTokensForTarget = useMemo(() => {
    const tid = combatTargetId.trim();
    if (!tid) return null;
    const shooterTok = mapTokens.find((t) => t.characterId === character.id);
    const targetTok = mapTokens.find((t) => t.characterId === tid);
    if (!shooterTok || !targetTok) return null;
    return { shooterTok, targetTok };
  }, [combatTargetId, character.id, mapTokens]);

  /** Euclidean grid distance × meters/square when session map is calibrated. */
  const mapAutoDistanceM = useMemo(() => {
    if (!mapTokensForTarget) return null;
    const mps = mapGridSettings.mapMetersPerSquare;
    if (!Number.isFinite(mps) || mps <= 0) return null;
    const { cols, rows } = gridColsRows;
    const cells = cellDistance(
      mapTokensForTarget.shooterTok.x,
      mapTokensForTarget.shooterTok.y,
      mapTokensForTarget.targetTok.x,
      mapTokensForTarget.targetTok.y,
      cols,
      rows,
    );
    return cells * mps;
  }, [mapTokensForTarget, mapGridSettings.mapMetersPerSquare, gridColsRows]);

  const mapFireCover = useMemo(() => {
    if (!mapTokensForTarget || mapCoverRegions.length === 0) return null;
    const { cols, rows } = gridColsRows;
    const sc = pctToCell(mapTokensForTarget.shooterTok.x, mapTokensForTarget.shooterTok.y, cols, rows);
    const tc = pctToCell(mapTokensForTarget.targetTok.x, mapTokensForTarget.targetTok.y, cols, rows);
    return summarizeMapFireCover(sc.c, sc.r, tc.c, tc.r, mapCoverRegions);
  }, [mapTokensForTarget, mapCoverRegions, gridColsRows]);

  const combatMapCoverPreset = useMemo((): Pick<
    DamageApplicatorPreset,
    'coverStackedSp' | 'coverRegionIds'
  > | null => {
    if (!mapFireCover || mapFireCover.coverRegionIds.length === 0) return null;
    return {
      coverStackedSp: mapFireCover.stackedCoverSp,
      coverRegionIds: mapFireCover.coverRegionIds,
    };
  }, [mapFireCover]);

  const resolveCombatTargetName = (id: string): string | undefined => {
    const t = id.trim();
    if (!t) return undefined;
    const c = charactersById[t] ?? npcsById[t];
    return c?.name;
  };

  const damagePresetVictim = (): { targetCharacterId?: string } =>
    combatTargetId.trim() ? { targetCharacterId: combatTargetId.trim() } : {};

  const damagePresetWithCover = (): DamageApplicatorPreset => ({
    ...damagePresetVictim(),
    ...(combatTargetId.trim() ? (combatMapCoverPreset ?? {}) : {}),
  });

  const setCombatModifier = (key: 'initiative' | 'stunSave' | 'deathSave', value: number) => {
    const next = {
      initiative: character.combatModifiers?.initiative ?? 0,
      stunSave: character.combatModifiers?.stunSave ?? 0,
      deathSave: character.combatModifiers?.deathSave ?? 0,
      [key]: value,
    };
    updateCharacterField(character.id, 'combatModifiers', next);
  };

  const locationOrder: Zone[] = ['Head', 'Torso', 'rArm', 'lArm', 'rLeg', 'lLeg'];
  const locationLabels: Record<Zone, string> = {
    Head: 'Head',
    Torso: 'Torso',
    rArm: 'Right Arm',
    lArm: 'Left Arm',
    rLeg: 'Right Leg',
    lLeg: 'Left Leg',
  };

  const weapons = character.items.filter((i): i is Weapon => i.type === 'weapon');

  const setGlobalCoverToHit = (label: CoverToHitKey | 'none') => {
    setRangedModToggles((prev) => {
      const next = { ...prev };
      for (const w of weapons) {
        if (w.weaponType === 'Melee') continue;
        const cur = { ...(next[w.id] || {}) };
        for (const k of COVER_TO_HIT_KEYS) {
          if (cur[k]) delete cur[k];
        }
        if (label !== 'none') cur[label] = true;
        next[w.id] = cur;
      }
      return next;
    });
  };

  const globalCoverSelection = useMemo(() => {
    return getGlobalCoverSelection(weapons, rangedModToggles);
  }, [weapons, rangedModToggles]);

  /** When non-null, behind-cover to-hit follows the map fire line (until the user overrides). */
  const mapAutoCoverLabel = useMemo((): CoverToHitKey | 'none' | null => {
    if (!mapFireCover) return null;
    return mapFireCover.suggestedToHitLabel ?? 'none';
  }, [mapFireCover]);

  const applyMapCoverToHitMods = () => {
    setCoverManualOverride(false);
  };

  const armorItems = character.items.filter((i): i is Armor => i.type === 'armor');
  const sdb = character.derivedStats?.strengthDamageBonus ?? 0;

  const coverRadioValue: CoverToHitKey | 'none' | null = useMemo(() => {
    if (!coverManualOverride && mapAutoCoverLabel !== null) return mapAutoCoverLabel;
    return globalCoverSelection === 'mixed' ? null : globalCoverSelection;
  }, [coverManualOverride, mapAutoCoverLabel, globalCoverSelection]);

  /** Meters used for bracket preview / semi-auto fire when map or manual distance is set. */
  const effectiveDistanceMeters = useMemo(() => {
    if (distanceManualOverride) {
      const n = parseFloat(combatDistanceMInput);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return mapAutoDistanceM;
  }, [distanceManualOverride, combatDistanceMInput, mapAutoDistanceM]);

  const displayDistanceInput = distanceManualOverride
    ? combatDistanceMInput
    : mapAutoDistanceM != null
      ? String(Math.round(mapAutoDistanceM * 10) / 10)
      : '';

  const getResolvedRangeBracket = useCallback(
    (weapon: Weapon): RangeBracket => {
      if (weapon.weaponType === 'Melee') return 'PointBlank';
      if (weapon.range > 0 && effectiveDistanceMeters != null) {
        return getRangeBracket(effectiveDistanceMeters, weapon.range);
      }
      return selectedRangeByWeapon[weapon.id] ?? 'Close';
    },
    [effectiveDistanceMeters, selectedRangeByWeapon],
  );

  const metersToTarget = useCallback(
    (targetCharacterId: string): number | null => {
      const shooterTok = mapTokens.find((t) => t.characterId === character.id);
      const targetTok = mapTokens.find((t) => t.characterId === targetCharacterId);
      const mps = mapGridSettings.mapMetersPerSquare;
      if (shooterTok && targetTok && Number.isFinite(mps) && mps > 0) {
        const { cols, rows } = gridColsRows;
        const cells = cellDistance(
          shooterTok.x,
          shooterTok.y,
          targetTok.x,
          targetTok.y,
          cols,
          rows,
        );
        return cells * mps;
      }
      if (distanceManualOverride) {
        const n = parseFloat(combatDistanceMInput);
        if (Number.isFinite(n) && n >= 0) return n;
      }
      if (targetCharacterId === combatTargetId.trim() && mapAutoDistanceM != null) {
        return mapAutoDistanceM;
      }
      return null;
    },
    [
      mapTokens,
      character.id,
      mapGridSettings.mapMetersPerSquare,
      gridColsRows,
      distanceManualOverride,
      combatDistanceMInput,
      combatTargetId,
      mapAutoDistanceM,
    ],
  );

  const bracketForWeaponTarget = useCallback(
    (weapon: Weapon, targetCharacterId: string): RangeBracket => {
      if (weapon.weaponType === 'Melee') return 'PointBlank';
      const m = metersToTarget(targetCharacterId);
      if (m != null && weapon.range > 0) {
        return getRangeBracket(m, weapon.range);
      }
      return getResolvedRangeBracket(weapon);
    },
    [metersToTarget, getResolvedRangeBracket],
  );

  const coverPresetForMapTarget = useCallback(
    (
      targetCharacterId: string,
    ): { stackedSp: number; regionIds: string[] } | undefined => {
      const shooterTok = mapTokens.find((t) => t.characterId === character.id);
      const targetTok = mapTokens.find((t) => t.characterId === targetCharacterId);
      if (!shooterTok || !targetTok || mapCoverRegions.length === 0) return undefined;
      const { cols, rows } = gridColsRows;
      const sc = pctToCell(shooterTok.x, shooterTok.y, cols, rows);
      const tc = pctToCell(targetTok.x, targetTok.y, cols, rows);
      const hint = summarizeMapFireCover(sc.c, sc.r, tc.c, tc.r, mapCoverRegions);
      if (hint.coverRegionIds.length === 0) return undefined;
      return { stackedSp: hint.stackedCoverSp, regionIds: hint.coverRegionIds };
    },
    [mapTokens, character.id, mapCoverRegions, gridColsRows],
  );

  // Armor encumbrance: direct sum (not halved)
  const totalEncumbrance = armorItems
    .filter((a) => a.equipped)
    .reduce((sum, a) => sum + (a.encumbrance || 0), 0);

  // Calculate layered SP per location from equipped armor
  const calculateLayeredSP = (location: Zone): number => {
    const spValues: number[] = [];
    armorItems
      .filter((a) => a.equipped)
      .forEach((armor) => {
        const cov = armor.coverage?.[location];
        if (cov) {
          const sp = cov.stoppingPower || 0;
          if (sp > 0) spValues.push(sp);
        }
      });
    if (spValues.length === 0) return 0;
    if (spValues.length === 1) return spValues[0];
    return maxLayeredSP(spValues);
  };

  // Find attack skill value for a weapon
  const getAttackSkillTotal = (weapon: Weapon): number => {
    const skill = character.skills.find(
      (s) => s.name.toLowerCase() === weapon.attackSkill?.toLowerCase(),
    );
    const skillVal = skill?.value || 0;
    const refTotal = character.stats.ref.total || 0;
    return refTotal + skillVal + (weapon.accuracy || 0);
  };

  const getRangedModSum = (weaponId: string): number => {
    const toggles = rangedModToggles[weaponId];
    let sum = 0;
    for (const [label, value] of Object.entries(rangedCombatModifiers)) {
      if ((COVER_TO_HIT_KEYS as readonly string[]).includes(label)) continue;
      if (toggles?.[label]) sum += value;
    }
    let coverLabel: CoverToHitKey | null = null;
    if (!coverManualOverride && mapFireCover) {
      coverLabel = mapFireCover.suggestedToHitLabel;
    } else if (toggles) {
      coverLabel = COVER_TO_HIT_KEYS.find((k) => toggles[k]) ?? null;
    }
    if (coverLabel) sum += rangedCombatModifiers[coverLabel];
    return sum;
  };

  const getRangedModSumForTarget = useCallback(
    (weaponId: string, targetCharacterId: string): number => {
      const toggles = rangedModToggles[weaponId];
      let sum = 0;
      for (const [label, value] of Object.entries(rangedCombatModifiers)) {
        if ((COVER_TO_HIT_KEYS as readonly string[]).includes(label)) continue;
        if (toggles?.[label]) sum += value;
      }
      let coverLabel: CoverToHitKey | null = null;
      const shooterTok = mapTokens.find((t) => t.characterId === character.id);
      const targetTok = mapTokens.find((t) => t.characterId === targetCharacterId);
      if (!coverManualOverride && shooterTok && targetTok && mapCoverRegions.length > 0) {
        const { cols, rows } = gridColsRows;
        const sc = pctToCell(shooterTok.x, shooterTok.y, cols, rows);
        const tc = pctToCell(targetTok.x, targetTok.y, cols, rows);
        const hint = summarizeMapFireCover(sc.c, sc.r, tc.c, tc.r, mapCoverRegions);
        coverLabel = hint.suggestedToHitLabel;
      } else if (toggles) {
        coverLabel = COVER_TO_HIT_KEYS.find((k) => toggles[k]) ?? null;
      }
      if (coverLabel) sum += rangedCombatModifiers[coverLabel];
      return sum;
    },
    [
      rangedModToggles,
      mapTokens,
      character.id,
      mapCoverRegions,
      coverManualOverride,
      gridColsRows,
    ],
  );

  const toggleRangedMod = (weaponId: string, label: string) => {
    setRangedModToggles((prev) => ({
      ...prev,
      [weaponId]: {
        ...(prev[weaponId] || {}),
        [label]: !prev[weaponId]?.[label],
      },
    }));
  };

  const isCoverModChecked = (weaponId: string, label: string): boolean => {
    if (!coverManualOverride && mapFireCover) {
      const s = mapFireCover.suggestedToHitLabel;
      return s != null && s === label;
    }
    return !!rangedModToggles[weaponId]?.[label];
  };

  const toggleCoverModForWeapon = (weaponId: string, label: CoverToHitKey) => {
    const wasOn = isCoverModChecked(weaponId, label);
    setCoverManualOverride(true);
    setRangedModToggles((prev) => {
      const cur = { ...(prev[weaponId] || {}) };
      for (const k of COVER_TO_HIT_KEYS) {
        if (cur[k]) delete cur[k];
      }
      if (!wasOn) cur[label] = true;
      return { ...prev, [weaponId]: cur };
    });
  };

  const clearRangedMods = (weaponId: string) => {
    setCoverManualOverride(true);
    setRangedModToggles((prev) => ({ ...prev, [weaponId]: {} }));
  };

  const onRangedModCheckboxChange = (weaponId: string, label: string) => {
    if ((COVER_TO_HIT_KEYS as readonly string[]).includes(label)) {
      toggleCoverModForWeapon(weaponId, label as CoverToHitKey);
    } else {
      toggleRangedMod(weaponId, label);
    }
  };

  const attackIntentExtras = (bracket: RangeBracket) => {
    const dv = rangeBrackets[bracket].dc;
    const label = rangeBrackets[bracket].label;
    const tid = combatTargetId.trim();
    const name = tid ? resolveCombatTargetName(tid) : undefined;
    return {
      difficultyValue: dv,
      rangeBracketLabel: label,
      ...(tid && name ? { targetCharacterId: tid, targetName: name } : {}),
    };
  };

  // Roll attack: REF+skill+WA + ranged checklist (ranged only)
  const handleAttackRoll = (weapon: Weapon, bracket: RangeBracket) => {
    const base = getAttackSkillTotal(weapon);
    const modSum = weapon.weaponType === 'Melee' ? 0 : getRangedModSum(weapon.id);
    setSelectedRangeByWeapon((prev) => ({ ...prev, [weapon.id]: bracket }));
    const isAutoWeapon = weapon.isAutoCapable || weapon.attackType === 'Auto';
    const gm =
      pendingGmAttackRequest &&
      pendingGmAttackRequest.characterId === character.id &&
      pendingGmAttackRequest.weaponId === weapon.id
        ? pendingGmAttackRequest
        : null;
    if (gm) {
      openDiceRoller(`1d10+${base + modSum}`, {
        kind: 'attack',
        characterId: character.id,
        weaponId: weapon.id,
        reliability: weapon.reliability,
        isMelee: weapon.weaponType === 'Melee',
        isAutoWeapon,
        difficultyValue: gm.difficultyValue,
        rangeBracketLabel: gm.rangeBracketLabel,
        ...(gm.targetCharacterId ? { targetCharacterId: gm.targetCharacterId } : {}),
        ...(gm.targetName ? { targetName: gm.targetName } : {}),
        promptedByGmRequest: true,
        gmRequestChatMessageId: gm.chatMessageId,
        nonBlockingUi: true,
        ...sheetRollContext(character, sessionId, gm.rollSummary ?? `${weapon.name} attack`),
      });
      return;
    }
    openDiceRoller(`1d10+${base + modSum}`, {
      kind: 'attack',
      characterId: character.id,
      weaponId: weapon.id,
      reliability: weapon.reliability,
      isMelee: weapon.weaponType === 'Melee',
      isAutoWeapon,
      ...attackIntentExtras(bracket),
      ...sheetRollContext(character, sessionId, `${weapon.name} attack`),
    });
  };

  const automatedFireBlockedByGmRequest = (weapon: Weapon) =>
    !!(
      pendingGmAttackRequest &&
      pendingGmAttackRequest.characterId === character.id &&
      pendingGmAttackRequest.weaponId === weapon.id
    );

  const openAutomatedFireModal = (weapon: Weapon, mode: 'ThreeRoundBurst' | 'FullAuto') => {
    if (automatedFireBlockedByGmRequest(weapon)) return;
    setFireModeModal({ weaponId: weapon.id, mode });
  };

  const confirmAutomatedFire = (targetIds: string[]) => {
    if (!fireModeModal) return;
    const w = character.items.find(
      (i): i is Weapon => i.type === 'weapon' && i.id === fireModeModal.weaponId,
    );
    if (!w || w.weaponType === 'Melee') {
      setFireModeModal(null);
      return;
    }
    const mode = fireModeModal.mode;
    if (mode === 'ThreeRoundBurst') {
      const id = targetIds[0];
      if (!id || !burstAllowedAtBracket(bracketForWeaponTarget(w, id))) {
        window.alert('Burst only works at Close or Medium range to the selected target.');
        return;
      }
    }
    const ok = fireWeapon(character.id, w.id, mode);
    if (!ok) {
      window.alert('Not enough ammunition.');
      return;
    }
    playWeaponFireSfx(w, mode);
    const modStrip = computeAutofireModStrip(rangedModToggles[w.id]);
    const targets = targetIds.map((id) => ({
      characterId: id,
      name: resolveCombatTargetName(id) ?? id,
      bracket: bracketForWeaponTarget(w, id),
    }));
    const coverByTargetId: Record<string, { stackedSp: number; regionIds: string[] } | undefined> =
      {};
    for (const id of targetIds) {
      const c = coverPresetForMapTarget(id);
      if (c) coverByTargetId[id] = c;
    }
    runAutomatedWeaponFire({
      shooterName: character.name,
      weapon: w,
      mode,
      attackSkillTotal: getAttackSkillTotal(w),
      situationalModSumByTarget: (tid) => getRangedModSumForTarget(w.id, tid),
      modStrip,
      targets,
      coverByTargetId,
    });
    setFireModeModal(null);
  };

  // Fire weapon (consume ammo) — burst/full auto open target modal first
  const handleFire = (weapon: Weapon, mode: FireMode) => {
    if (mode === 'ThreeRoundBurst' || mode === 'FullAuto') {
      openAutomatedFireModal(weapon, mode);
      return;
    }
    if (mode === 'Suppressive') {
      if (automatedFireBlockedByGmRequest(weapon)) return;
      const maxR = weapon.shotsLeft;
      if (maxR < 1) return;
      const fallback = Math.max(1, Math.min(weapon.rof, maxR));
      const draft = suppressRoundsByWeapon[weapon.id];
      const parsed = draft != null ? Math.floor(draft) : fallback;
      const rounds = Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : fallback, maxR));
      const ok = fireWeapon(character.id, weapon.id, 'Suppressive', { suppressiveRounds: rounds });
      if (!ok) {
        window.alert('Not enough ammunition.');
        return;
      }
      playWeaponFireSfx(weapon, 'Suppressive');
      saveSessionMapPendingSuppressive({
        characterId: character.id,
        weaponId: weapon.id,
        roundsCommitted: rounds,
        weaponDamage: weapon.damage?.trim() || '2d6',
        weaponAp: weapon.ap,
        weaponName: weapon.name?.trim() || 'Weapon',
      });
      return;
    }
    const success = fireWeapon(character.id, weapon.id, mode);
    if (success) {
      playWeaponFireSfx(weapon, mode);
      const base = getAttackSkillTotal(weapon);
      const modSum = weapon.weaponType === 'Melee' ? 0 : getRangedModSum(weapon.id);
      const isAutoWeapon = weapon.isAutoCapable || weapon.attackType === 'Auto';
      const isMelee = weapon.weaponType === 'Melee';
      const bracket: RangeBracket = isMelee ? 'PointBlank' : getResolvedRangeBracket(weapon);
      const dv = rangeBrackets[bracket].dc;
      const rangeBracketLabel = isMelee
        ? 'Melee (default DV 10)'
        : rangeBrackets[bracket].label;
      const tid = combatTargetId.trim();
      const name = tid ? resolveCombatTargetName(tid) : undefined;
      const gm =
        pendingGmAttackRequest &&
        pendingGmAttackRequest.characterId === character.id &&
        pendingGmAttackRequest.weaponId === weapon.id
          ? pendingGmAttackRequest
          : null;
      if (gm) {
        openDiceRoller(`1d10+${base + modSum}`, {
          kind: 'attack',
          characterId: character.id,
          weaponId: weapon.id,
          reliability: weapon.reliability,
          isMelee,
          isAutoWeapon,
          difficultyValue: gm.difficultyValue,
          rangeBracketLabel: gm.rangeBracketLabel,
          ...(gm.targetCharacterId ? { targetCharacterId: gm.targetCharacterId } : {}),
          ...(gm.targetName ? { targetName: gm.targetName } : {}),
          promptedByGmRequest: true,
          gmRequestChatMessageId: gm.chatMessageId,
          nonBlockingUi: true,
          ...sheetRollContext(character, sessionId, gm.rollSummary ?? `${weapon.name} attack`),
        });
        return;
      }
      openDiceRoller(`1d10+${base + modSum}`, {
        kind: 'attack',
        characterId: character.id,
        weaponId: weapon.id,
        reliability: weapon.reliability,
        isMelee,
        isAutoWeapon,
        difficultyValue: dv,
        rangeBracketLabel,
        ...(tid && name ? { targetCharacterId: tid, targetName: name } : {}),
        ...sheetRollContext(character, sessionId, `${weapon.name} attack`),
      });
    }
  };

  const baseStunTarget = character.derivedStats?.stunSaveTarget ?? character.stats.bt.total;
  const effectiveStunTarget = baseStunTarget + stunSaveMod;
  const baseDeathTarget = character.derivedStats?.deathSaveTarget ?? -1;
  const effectiveDeathTarget =
    baseDeathTarget >= 0 ? baseDeathTarget + stunSaveMod + deathSaveOnlyMod : -1;
  const deathSaveBlockedByStabilization =
    character.isStabilized && baseDeathTarget >= 0;

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Combat Rolls */}
        <section>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const combatSense =
                  character.specialAbility?.name === 'Combat Sense'
                    ? character.specialAbility.value
                    : 0;
                const refTotal = character.stats.ref.total || 0;
                openDiceRoller(`1d10+${refTotal + initMod + combatSense + cyberInitBonus}`, {
                  kind: 'custom',
                  characterId: character.id,
                  ...sheetRollContext(character, sessionId, 'Initiative'),
                });
              }}
              className="border-2 border-black p-3 hover:bg-gray-100 font-bold uppercase"
            >
              Initiative
              <div className="text-xs font-normal mt-1">
                REF {character.stats.ref.total}
                {initMod !== 0 && (
                  <span>
                    {' '}
                    {initMod > 0 ? '+' : ''}
                    {initMod} mod
                  </span>
                )}
                {character.specialAbility?.name === 'Combat Sense' &&
                  ` +${character.specialAbility.value} CS`}
                {cyberInitBonus !== 0 && (
                  <span>
                    {' '}
                    {cyberInitBonus > 0 ? '+' : ''}
                    {cyberInitBonus} booster
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => beginStunSaveRoll(character.id)}
              className="border-2 border-black p-3 hover:bg-gray-100 font-bold uppercase"
              title={`Stun/shock: roll one d10 (no exploding 10s). Success if total ≤ ${effectiveStunTarget}; fail sets STUNNED. Optional stun save mod below adds to this target.`}
            >
              Stun Save
              <div className="text-xs font-normal mt-1">
                Target: ≤ {effectiveStunTarget}
                {stunSaveMod !== 0 && (
                  <span className="text-gray-600">
                    {' '}
                    (base {baseStunTarget}, mod {stunSaveMod >= 0 ? '+' : ''}
                    {stunSaveMod})
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => beginDeathSaveRoll(character.id)}
              className={`border-2 border-black p-3 font-bold uppercase ${
                baseDeathTarget >= 0 && !deathSaveBlockedByStabilization
                  ? 'hover:bg-red-100 border-red-600 text-red-600'
                  : 'bg-gray-100 text-gray-400 cursor-default border-gray-400'
              }`}
              disabled={baseDeathTarget < 0 || deathSaveBlockedByStabilization}
              title={
                baseDeathTarget < 0
                  ? 'Not mortally wounded'
                  : deathSaveBlockedByStabilization
                    ? 'Stabilized — no ongoing death saves until new damage (a new severing hit still forces one).'
                    : `Death: roll one d10 (flat). Success if ≤ ${effectiveDeathTarget} (BT − mortal level; FNFF). Fail → dead.`
              }
            >
              Death Save
              <div className="text-xs font-normal mt-1">
                {baseDeathTarget >= 0 && !deathSaveBlockedByStabilization ? (
                  <>
                    Target: ≤ {effectiveDeathTarget}
                    {(stunSaveMod !== 0 || deathSaveOnlyMod !== 0) && (
                      <span className="text-gray-600">
                        {' '}
                        (base {baseDeathTarget}, stun {stunSaveMod >= 0 ? '+' : ''}
                        {stunSaveMod}
                        {deathSaveOnlyMod !== 0 && (
                          <span>
                            , death {deathSaveOnlyMod >= 0 ? '+' : ''}
                            {deathSaveOnlyMod}
                          </span>
                        )}
                        )
                      </span>
                    )}
                  </>
                ) : baseDeathTarget >= 0 && deathSaveBlockedByStabilization ? (
                  <span className="text-teal-800 font-semibold">Stabilized</span>
                ) : (
                  'N/A'
                )}
              </div>
            </button>
          </div>

          {sessionId && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => beginStunOverrideRequest(character.id)}
                className="text-[11px] uppercase font-semibold text-violet-900 border border-violet-700/60 bg-violet-100/80 px-2 py-1.5 rounded hover:bg-violet-200/90 w-full sm:w-auto"
                title="Opens dice panel: send a stun ruling request to the AI-GM (no roll). GM applies isStunned via tools."
              >
                Ask AI-GM (stun ruling)
              </button>
            </div>
          )}

          {character.isStabilized && baseDeathTarget >= 0 && (
            <p className="text-[10px] text-teal-900 font-medium mt-1.5 leading-snug">
              Stabilized — ongoing Mortal death saves are skipped until this character takes new damage.
            </p>
          )}

          <div className="border-2 border-black bg-[#f5f5dc] p-3 mt-2">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-900 mb-3">
              Combat modifiers
            </div>
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-8">
              <div className="space-y-2 min-w-0">
                <div className="text-[11px] font-semibold text-gray-900">Initiative</div>
                <label className="flex flex-col gap-1.5 text-xs">
                  <span className="text-[10px] uppercase tracking-wide text-gray-600">Manual</span>
                  {editable ? (
                    <input
                      type="number"
                      value={initMod}
                      onChange={(e) =>
                        setCombatModifier('initiative', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-16 border-2 border-black px-2 py-1 font-mono bg-white"
                    />
                  ) : (
                    <span className="font-mono font-bold text-sm">{initMod}</span>
                  )}
                  <p className="text-[10px] text-gray-600 leading-relaxed">
                    Drugs, fast draw, referee. Rolls with REF + Combat Sense + 1d10.
                  </p>
                  {cyberInitBonus !== 0 && (
                    <p className="text-[10px] text-teal-900 font-medium">
                      Equipped cyber: +{cyberInitBonus} initiative
                    </p>
                  )}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1 border-t border-black/15">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">
                      Flat bonus (excl. REF &amp; d10)
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {initMod + cyberInitBonus}
                    </span>
                  </div>
                </label>
              </div>
              <div className="space-y-2 min-w-0">
                <div className="text-[11px] font-semibold text-gray-900">Stun / death saves</div>
                <label className="flex flex-col gap-1.5 text-xs">
                  <span className="text-[10px] uppercase tracking-wide text-gray-600">Stun target modifier</span>
                  {editable ? (
                    <input
                      type="number"
                      value={stunSaveMod}
                      onChange={(e) =>
                        setCombatModifier('stunSave', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-16 border-2 border-black px-2 py-1 font-mono bg-white"
                    />
                  ) : (
                    <span className="font-mono font-bold text-sm">{stunSaveMod}</span>
                  )}
                  <p className="text-[10px] text-gray-600 leading-relaxed">
                    Applies to stun saves only (+ easier). Death saves also add the death-only mod below.
                  </p>
                </label>
                <label className="flex flex-col gap-1.5 text-xs">
                  <span className="text-[10px] uppercase tracking-wide text-gray-600">
                    Death-only modifier
                  </span>
                  {editable ? (
                    <input
                      type="number"
                      value={deathSaveOnlyMod}
                      onChange={(e) =>
                        setCombatModifier('deathSave', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-16 border-2 border-black px-2 py-1 font-mono bg-white"
                    />
                  ) : (
                    <span className="font-mono font-bold text-sm">{deathSaveOnlyMod}</span>
                  )}
                  <p className="text-[10px] text-gray-600 leading-relaxed">
                    Extra flat bonus on death saves only (stacks with stun mod). Rare gear / referee.
                  </p>
                </label>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-600 mt-2">
            Saves use a <strong>single flat d10</strong> (no crit explosion). <strong>Success = roll ≤ target</strong>{' '}
            (low numbers are good — unlike rolling &quot;to beat a DC&quot;). Over the target fails: stun save →
            STUNNED; death save while Mortal → dead (damage 41). A successful death save only keeps you alive — it does
            not lower damage. You can still toggle STUNNED manually on the wound tracker.
          </p>

          <div className="border-2 border-teal-900 border-dashed bg-teal-50/70 p-3 mt-3">
            <div className="text-xs font-bold uppercase text-teal-900 mb-1">Stabilization (medic, FNFF)</div>
            <p className="text-xs text-gray-800 mb-2">
              Roll as the <strong>medic</strong> on <strong>this</strong> sheet:{' '}
              <strong>TECH + First Aid or Medical Tech (higher) + 1d10</strong> (exploding d10). Total must be ≥ the
              patient&apos;s full damage; then they stop making death saves until hurt again.
            </p>
            <div className="flex flex-wrap gap-3 items-end text-xs">
              <label className="flex flex-col gap-0.5 min-w-[10rem]">
                <span className="font-semibold">Patient (stabilized if success)</span>
                <select
                  value={stabilizationPatientId}
                  onChange={(e) => setStabilizationPatientId(e.target.value)}
                  className="border-2 border-black px-2 py-1 font-mono bg-white max-w-[14rem]"
                >
                  {stabilizationPatientOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="font-semibold">Patient damage (target)</span>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={stabilizationTarget}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setStabilizationTarget(
                      Number.isFinite(n) ? Math.max(1, Math.min(40, n)) : 1,
                    );
                  }}
                  className="w-20 border-2 border-black px-2 py-1 font-mono bg-white"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const tgt = Math.max(1, Math.min(40, stabilizationTarget));
                  openDiceRoller(`1d10+${stabBonus}`, {
                    kind: 'stabilization',
                    patientCharacterId: stabilizationPatientId,
                    targetDamage: tgt,
                    ...sheetRollContext(
                      character,
                      sessionId,
                      `Stabilization (${stabilizationPatient?.name ?? 'patient'} damage ${tgt})`,
                    ),
                  });
                }}
                className="border-2 border-teal-900 bg-teal-200 px-3 py-2 font-bold uppercase hover:bg-teal-300"
              >
                Roll stabilization
              </button>
              <button
                type="button"
                onClick={() =>
                  setStabilizationTarget(
                    Math.max(
                      1,
                      Math.min(40, stabilizationPatient?.damage ?? character.damage),
                    ),
                  )
                }
                className="border border-teal-800 px-2 py-1 text-[10px] font-bold uppercase hover:bg-teal-100"
                title="Set target to the selected patient’s current damage track"
              >
                Use patient damage ({stabilizationPatient?.damage ?? '—'})
              </button>
            </div>
            <p className="text-[10px] text-teal-950 mt-2">
              Medic bonus on this sheet: <strong>{stabBonus}</strong> (TECH {character.stats.tech.total} + medical{' '}
              {medSkillForStab}). On success, the selected patient gets the <strong>Stabilized</strong> flag (cleared
              automatically when they take new damage).
            </p>
          </div>

          {editable && (
            <button
              type="button"
              onClick={() => {
                const p = damagePresetWithCover();
                setDamageApplicatorPreset(Object.keys(p).length > 0 ? p : null);
                setShowDamageApplicator(true);
              }}
              className="w-full mt-2 bg-red-500 hover:bg-red-600 text-white border-2 border-black p-3 font-bold uppercase"
            >
              Apply Damage
            </button>
          )}
        </section>

        {/* Armor Section */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-bold uppercase border-b-2 border-black pb-1">Armor</h2>
            {totalEncumbrance > 0 && (
              <div className="text-sm font-bold text-orange-600">
                EV: {totalEncumbrance} (REF -{totalEncumbrance})
              </div>
            )}
          </div>

          {/* Hit Locations Grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {locationOrder.map((location) => {
              const hitLoc = character.hitLocations[location];
              const currentSP = Math.max(0, hitLoc.stoppingPower - hitLoc.ablation);
              const layeredSP = calculateLayeredSP(location);

              return (
                <div key={location} className="border-2 border-black p-2 bg-white">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">{locationLabels[location]}</span>
                    <span className="text-xs text-gray-500">d10: {hitLocationRollRanges[location]}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <div>
                      <span className="text-sm">
                        SP: <span className="font-bold text-lg">{currentSP}</span>
                      </span>
                      {layeredSP > 0 && layeredSP !== currentSP && (
                        <span className="text-xs text-blue-600 ml-1">(Layered: {layeredSP})</span>
                      )}
                    </div>
                    {hitLoc.ablation > 0 && (
                      <span className="text-xs text-orange-600">-{hitLoc.ablation} abl</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Armor Items */}
          {armorItems.length > 0 && (
            <div className="space-y-1">
              {armorItems.map((armor) => {
                const coveredZones = Object.entries(armor.coverage || {})
                  .filter(([, v]) => v.stoppingPower > 0)
                  .map(([zone, v]) => `${zone}:${v.stoppingPower}`);

                return (
                  <div
                    key={armor.id}
                    className={`border-2 p-2 text-sm ${
                      armor.equipped ? 'border-green-600 bg-green-50' : 'border-black'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold">{armor.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">EV:{armor.encumbrance || 0}</span>
                        {editable ? (
                          <button
                            onClick={() => toggleItemEquipped(armor.id)}
                            className={`text-xs font-bold px-2 py-0.5 border ${
                              armor.equipped
                                ? 'border-green-600 bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600 hover:border-red-600'
                                : 'border-gray-400 text-gray-500 hover:bg-green-100 hover:text-green-700 hover:border-green-600'
                            }`}
                          >
                            {armor.equipped ? 'EQUIPPED' : 'EQUIP'}
                          </button>
                        ) : (
                          armor.equipped && (
                            <span className="text-xs font-bold text-green-600">EQUIPPED</span>
                          )
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Coverage: {coveredZones.join(', ') || 'None'}
                    </div>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => sellItem(character.id, armor.id)}
                        className="mt-1 text-xs font-bold uppercase px-2 py-0.5 border border-amber-600 text-amber-800 hover:bg-amber-50"
                        title={`Sell for 50% (€${Math.floor(armor.cost * 0.5).toLocaleString()})`}
                      >
                        Sell armor
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {editable && (
            <button
              onClick={() => setShowItemBrowser(true)}
              className="w-full mt-2 bg-green-500 hover:bg-green-600 text-white border-2 border-black p-2 font-bold uppercase text-sm"
            >
              + Add Armor/Weapons
            </button>
          )}
          {editable && (armorItems.length > 0 || weapons.length > 0) && (
            <p className="text-xs text-gray-600 mt-2">
              <strong>Sell</strong> pays <strong>50%</strong> of list price (€). Remove (×) on Gear/Cyberware tabs drops the item with no cash.
            </p>
          )}
        </section>

        {/* Weapons Section */}
        <section>
          <h2 className="text-xl font-bold uppercase mb-3 border-b-2 border-black pb-1">
            Weapons
          </h2>

          {weapons.length > 0 && (
            <div className="border-2 border-slate-700 bg-slate-50/90 p-3 mb-3 text-xs space-y-2">
              <div className="font-bold uppercase text-slate-900 tracking-wide">Targeting</div>
              <p className="text-[10px] text-gray-800 leading-relaxed">
                Choose a <strong>target</strong>. With both tokens on the map and <strong>meters per grid square</strong>{' '}
                set in session settings, <strong>distance</strong> fills from the grid (Euclidean cell distance × m/sq).
                Edit the field anytime to override; use <strong>Use map</strong> to snap back. Expand a ranged weapon to
                sync its range bracket from the distance value. Semi/Burst/Full and bracket buttons roll{' '}
                <strong>1d10 + attack</strong> vs DV. With <strong>cover regions</strong> on the map,{' '}
                <strong>behind cover</strong> (all ranged) follows the fire line like distance; change the radios or
                per-weapon cover checkboxes to override, or <strong>Use map (cover)</strong> to follow the map again.
                Melee attack uses DV 10 by default.
                Use <strong>Apply Damage</strong> after a hit — with a target selected it applies to them; otherwise this
                sheet.
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <label className="flex flex-col gap-0.5 min-w-[12rem]">
                  <span className="font-semibold text-[10px] uppercase tracking-wide text-gray-700">Target</span>
                  <select
                    value={combatTargetId}
                    onChange={(e) => {
                      setCombatTargetId(e.target.value);
                      setDistanceManualOverride(false);
                      setCombatDistanceMInput('');
                      setCoverManualOverride(false);
                    }}
                    className="border-2 border-black px-2 py-1.5 font-mono bg-white max-w-[18rem] text-xs"
                  >
                    <option value="">— Select target —</option>
                    {stabilizationPatientOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.id === character.id ? ' (this sheet)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-[10px] uppercase tracking-wide text-gray-700">
                    Distance (m)
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={displayDistanceInput}
                      onChange={(e) => {
                        setDistanceManualOverride(true);
                        setCombatDistanceMInput(e.target.value);
                      }}
                      placeholder={mapAutoDistanceM != null ? 'map' : '—'}
                      className="w-28 border-2 border-black px-2 py-1.5 font-mono bg-white text-xs"
                      title="Manual entry overrides map auto-distance until you change target or click Use map"
                    />
                    {mapAutoDistanceM != null && (
                      <button
                        type="button"
                        onClick={() => {
                          setDistanceManualOverride(false);
                          setCombatDistanceMInput('');
                        }}
                        className="text-[10px] font-bold uppercase border border-slate-600 px-2 py-1 bg-white hover:bg-slate-100 rounded"
                        title="Replace distance with value from tactical map tokens"
                      >
                        Use map
                      </button>
                    )}
                  </div>
                  {mapAutoDistanceM != null && mapGridSettings.mapMetersPerSquare > 0 ? (
                    <span className="text-[9px] text-gray-600">
                      Map: ~{Math.round(mapAutoDistanceM * 10) / 10} m (
                      {(mapAutoDistanceM / mapGridSettings.mapMetersPerSquare).toFixed(1)} cells ×{' '}
                      {mapGridSettings.mapMetersPerSquare} m/sq)
                      {distanceManualOverride && ' — using manual distance for bracket'}
                    </span>
                  ) : mapTokensForTarget && (!mapGridSettings.mapMetersPerSquare || mapGridSettings.mapMetersPerSquare <= 0) ? (
                    <span className="text-[9px] text-amber-800">
                      Tokens found — set <strong>meters per square</strong> in map/session settings for auto distance.
                    </span>
                  ) : combatTargetId.trim() && !mapTokensForTarget ? (
                    <span className="text-[9px] text-gray-500">
                      Link both characters to map tokens for auto distance and cover line.
                    </span>
                  ) : null}
                </div>
              </div>

              {weapons.some((w) => w.weaponType !== 'Melee') && (
                <div className="mt-2 space-y-1.5 border-t border-slate-300 pt-2">
                  <div className="font-semibold text-[10px] uppercase tracking-wide text-gray-800">
                    Behind cover (all ranged weapons)
                  </div>
                  {coverRadioValue === null && (
                    <p className="text-[9px] text-amber-900 font-medium">
                      Ranged weapons use different cover mods — pick one radio to align all, or adjust per weapon below.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 items-center text-[10px]">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name={`combat-cover-${character.id}`}
                        checked={coverRadioValue === 'none'}
                        onChange={() => {
                          setCoverManualOverride(true);
                          setGlobalCoverToHit('none');
                        }}
                      />
                      None
                    </label>
                    {COVER_TO_HIT_KEYS.map((key) => {
                      const short =
                        key === 'Target behind cover (1/4)'
                          ? '¼'
                          : key === 'Target behind cover (1/2)'
                            ? '½'
                            : '¾';
                      return (
                        <label key={key} className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`combat-cover-${character.id}`}
                            checked={coverRadioValue === key}
                            onChange={() => {
                              setCoverManualOverride(true);
                              setGlobalCoverToHit(key);
                            }}
                          />
                          {short} ({rangedCombatModifiers[key]})
                        </label>
                      );
                    })}
                    {mapFireCover && (
                      <button
                        type="button"
                        onClick={applyMapCoverToHitMods}
                        className="text-[10px] font-bold uppercase border border-amber-800 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 rounded"
                        title="Follow map fire-line cover again (clears manual cover selection)"
                      >
                        Use map (cover)
                      </button>
                    )}
                  </div>
                  {mapFireCover && (
                    <span className="block text-[9px] text-gray-600">
                      Map LOS:{' '}
                      {mapFireCover.suggestedToHitLabel ? (
                        <>
                          {mapFireCover.suggestedToHitLabel} (
                          {rangedCombatModifiers[mapFireCover.suggestedToHitLabel]}) — ~{' '}
                          {Math.round(mapFireCover.coverCellFraction * 100)}% of fire line on cover
                        </>
                      ) : (
                        <>no cover fraction on line (to-hit: none)</>
                      )}
                      {coverManualOverride && ' — using manual cover for to-hit'}
                    </span>
                  )}
                </div>
              )}

              {mapFireCover && mapFireCover.coverRegionIds.length > 0 && (
                <div className="mt-2 w-full border border-amber-800/60 bg-amber-50/90 px-2 py-2 rounded text-[10px] text-amber-950 space-y-1.5">
                  <div className="font-bold uppercase tracking-wide">Map cover (fire line)</div>
                  <p className="leading-snug">
                    Stacked cover SP vs this target: <strong>{mapFireCover.stackedCoverSp}</strong> (combined with
                    their armor via the proportional rule in Apply Damage). Through:{' '}
                    {mapFireCover.regionDescriptions.join(' → ')}.
                  </p>
                  {mapFireCover.suggestedToHitLabel && (
                    <p className="text-[9px]">
                      LOS cover ~{Math.round(mapFireCover.coverCellFraction * 100)}% — suggested to-hit:{' '}
                      <strong>
                        {mapFireCover.suggestedToHitLabel} ({rangedCombatModifiers[mapFireCover.suggestedToHitLabel]})
                      </strong>
                      . Cover radios stay in sync with the map until you override them; use{' '}
                      <strong>Use map (cover)</strong> to resume auto.
                    </p>
                  )}
                  <p className="text-[9px] text-amber-900/90">
                    A penetrating hit chips map cover: +1 ablation per listed region; when ablation reaches the
                    material&apos;s SP, that cover is <strong>destroyed</strong> and removed from the map. See{' '}
                    <em>Use Cover</em> / <em>Do Unto Others</em> (CP2020Gameplay.md, Friday Night Firefight).
                  </p>
                </div>
              )}
            </div>
          )}

          {weapons.length === 0 ? (
            <div className="text-center text-gray-500 py-4">No weapons in inventory</div>
          ) : (
            <div className="space-y-2">
              {weapons.map((weapon) => {
                const isExpanded = expandedWeaponId === weapon.id;
                const attackTotal = getAttackSkillTotal(weapon);
                const isMelee = weapon.weaponType === 'Melee';
                const canAuto = weapon.isAutoCapable || weapon.attackType === 'Auto';

                return (
                  <div
                    key={weapon.id}
                    className={`border-2 border-black ${isExpanded ? 'bg-gray-50' : ''}`}
                  >
                    {/* Weapon Header (always visible) */}
                    <div className="flex items-center gap-2 p-2">
                      {editable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleItemEquipped(weapon.id);
                          }}
                          className={`w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center text-xs ${
                            weapon.equipped
                              ? 'border-green-600 bg-green-500 text-white'
                              : 'border-gray-400 hover:border-green-600'
                          }`}
                          title={weapon.equipped ? 'Unequip' : 'Equip'}
                        >
                          {weapon.equipped ? '✓' : ''}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setExpandedWeaponId(isExpanded ? null : weapon.id)
                        }
                        className="flex-grow flex items-center gap-2 hover:bg-gray-100 text-left"
                      >
                        <div className="flex-grow">
                          <div className={`font-bold ${!weapon.equipped ? 'text-gray-400' : ''}`}>
                            {weapon.name}
                          </div>
                          <div className="text-xs text-gray-600 flex gap-3">
                            <span>{weapon.weaponType}</span>
                            <span>DMG: {weapon.damage}{isMelee && sdb !== 0 ? (sdb > 0 ? `+${sdb}` : `${sdb}`) : ''}</span>
                            {!isMelee && (
                              <span>
                                Ammo: {weapon.shotsLeft}/{weapon.shots}
                              </span>
                            )}
                            {weapon.ap && <span className="text-red-600 font-bold">AP</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">+{attackTotal}</div>
                          <div className="text-xs text-gray-600">Attack</div>
                        </div>
                        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                    </div>

                    {/* Expanded Weapon Details */}
                    {isExpanded && (
                      <div className="border-t-2 border-black p-3 space-y-3">
                        {pendingGmAttackRequest &&
                          pendingGmAttackRequest.characterId === character.id &&
                          pendingGmAttackRequest.weaponId === weapon.id && (
                            <div className="border border-cyan-900 bg-cyan-50/95 px-2 py-1.5 text-[10px] text-cyan-950 leading-snug">
                              <span className="font-bold uppercase">AI-GM attack request</span>
                              {' — '}Use your checklist below; the roll counts vs{' '}
                              <strong>DV {pendingGmAttackRequest.difficultyValue}</strong>
                              {pendingGmAttackRequest.rangeBracketLabel
                                ? ` (${pendingGmAttackRequest.rangeBracketLabel})`
                                : ''}
                              . Send to GM when done (or close the dice window).
                            </div>
                          )}
                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-1 text-xs">
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">WA</div>
                            <div>{weapon.accuracy >= 0 ? `+${weapon.accuracy}` : weapon.accuracy}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Conc</div>
                            <div>{concealabilityLabels[weapon.concealability] || weapon.concealability}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Rel</div>
                            <div>{reliabilityLabels[weapon.reliability] || weapon.reliability}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">ROF</div>
                            <div>{weapon.rof}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Range</div>
                            <div>{weapon.range}m</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Damage</div>
                            <div>{weapon.damage}</div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Ammo</div>
                            <div>
                              {weapon.shotsLeft}/{weapon.shots}
                            </div>
                          </div>
                          <div className="border border-black p-1 text-center">
                            <div className="font-bold uppercase">Skill</div>
                            <div>{weapon.attackSkill}</div>
                          </div>
                        </div>

                        {/* Ranged: modifier checklist + bracket DC preview (lookups) */}
                        {!isMelee && (() => {
                          const modSum = getRangedModSum(weapon.id);
                          const effectiveAttack = attackTotal + modSum;
                          const selBracket = getResolvedRangeBracket(weapon);
                          const selDc = rangeBrackets[selBracket].dc;
                          const needOnD10 = selDc - effectiveAttack;
                          let previewHint: string;
                          if (needOnD10 <= 0) {
                            previewHint = 'Any d10 total meets this DV (before explosions).';
                          } else if (needOnD10 <= 10) {
                            previewHint = `Need d10 ≥ ${needOnD10} (natural on one die; 10 may explode).`;
                          } else {
                            previewHint = `Need ${needOnD10}+ on one d10 before explosions — use exploding 10s.`;
                          }

                          return (
                            <div className="space-y-2">
                              <div>
                                <div className="text-xs font-bold uppercase text-gray-800">
                                  Ranged modifiers (FNFF checklist)
                                </div>
                                <p className="text-[10px] text-gray-600 mt-0.5">
                                  Roll uses <strong>1d10 + {effectiveAttack}</strong> (base {attackTotal}
                                  {modSum !== 0 && (
                                    <>
                                      {' '}
                                      + mods {modSum >= 0 ? '+' : ''}
                                      {modSum}
                                    </>
                                  )}
                                  ). Compare to the bracket <strong>DV</strong> below.{' '}
                                  <span className="text-amber-900/90">
                                    Burst/full auto (Fire) strip aim, optics, and smart modifiers per FNFF.
                                  </span>
                                </p>
                                <div className="max-h-40 overflow-y-auto border border-black p-2 bg-white grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[10px] mt-1">
                                  {Object.keys(rangedCombatModifiers)
                                    .sort((a, b) => a.localeCompare(b))
                                    .map((label) => (
                                      <label
                                        key={label}
                                        className="flex items-start gap-1 cursor-pointer select-none"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={
                                            (COVER_TO_HIT_KEYS as readonly string[]).includes(label)
                                              ? isCoverModChecked(weapon.id, label)
                                              : !!rangedModToggles[weapon.id]?.[label]
                                          }
                                          onChange={() => onRangedModCheckboxChange(weapon.id, label)}
                                          className="mt-0.5 shrink-0"
                                        />
                                        <span>
                                          {label}{' '}
                                          <span className="text-gray-500">
                                            ({rangedCombatModifiers[label] >= 0 ? '+' : ''}
                                            {rangedCombatModifiers[label]})
                                          </span>
                                        </span>
                                      </label>
                                    ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => clearRangedMods(weapon.id)}
                                  className="text-[10px] mt-1 border border-gray-400 px-2 py-0.5 uppercase hover:bg-gray-100"
                                >
                                  Clear ranged mods
                                </button>
                                {rangedModToggles[weapon.id]?.[AIMED_SHOT_LABEL] && (
                                  <div className="mt-2 border border-amber-800/40 bg-amber-50/50 p-2">
                                    <label className="text-[10px] font-bold uppercase text-amber-950">
                                      Aimed target zone (if hit)
                                    </label>
                                    <select
                                      value={aimedZoneByWeapon[weapon.id] ?? ''}
                                      onChange={(e) =>
                                        setAimedZoneByWeapon((prev) => ({
                                          ...prev,
                                          [weapon.id]: e.target.value,
                                        }))
                                      }
                                      className="mt-1 w-full border border-black bg-white px-2 py-1 text-[11px]"
                                    >
                                      <option value="">— Pick after successful aimed shot —</option>
                                      {locationOrder.map((z) => (
                                        <option key={z} value={z}>
                                          {locationLabels[z]} (d10 {hitLocationRollRanges[z]})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              <div className="border-2 border-dashed border-amber-700/40 bg-amber-50/80 p-2 text-xs">
                                <div className="font-bold uppercase text-amber-900 mb-1">
                                  Attack preview
                                </div>
                                <div className="text-[11px] space-y-0.5">
                                  <div>
                                    Effective attack value: <strong>{effectiveAttack}</strong> (base{' '}
                                    {attackTotal}
                                    {modSum !== 0 && (
                                      <>
                                        , situational modifiers {modSum >= 0 ? '+' : ''}
                                        {modSum}
                                      </>
                                    )}
                                    )
                                  </div>
                                  <div>
                                    Bracket for preview:{' '}
                                    <strong>{rangeBrackets[selBracket].label}</strong> · DV{' '}
                                    <strong>{selDc}</strong>
                                  </div>
                                  <div className="text-gray-800">{previewHint}</div>
                                </div>
                              </div>

                              <div>
                                <div className="text-xs font-bold uppercase mb-1">
                                  Range brackets — click to roll (1d10 + effective vs DV)
                                </div>
                                <div className="grid grid-cols-5 gap-1">
                                  {(
                                    Object.entries(rangeBrackets) as [
                                      RangeBracket,
                                      { dc: number; label: string },
                                    ][]
                                  ).map(([key, { dc, label }]) => {
                                    const selected = selBracket === key;
                                    const distM = getRangeDistance(key, weapon.range);
                                    return (
                                      <button
                                        key={key}
                                        type="button"
                                        onClick={() => handleAttackRoll(weapon, key)}
                                        className={`border p-1 text-xs text-center transition-colors ${
                                          selected
                                            ? 'border-amber-700 bg-amber-100 ring-1 ring-amber-800'
                                            : 'border-black hover:bg-gray-200'
                                        }`}
                                        title={`Roll 1d10+${effectiveAttack} · DV ${dc} at ${label}`}
                                      >
                                        <div className="font-bold">{label}</div>
                                        <div>DV {dc}</div>
                                        <div className="text-gray-500">
                                          {distM === null ? '—' : `${distM}m`}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Fire Modes */}
                        {(() => {
                          const selB: RangeBracket = !isMelee
                            ? getResolvedRangeBracket(weapon)
                            : 'PointBlank';
                          const burstPreviewOk = isMelee || burstAllowedAtBracket(selB);
                          const ba = burstAmmo(weapon.rof);
                          const gmAtkBlock = automatedFireBlockedByGmRequest(weapon);
                          return (
                            <div className="flex gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleFire(weapon, 'SemiAuto')}
                                disabled={!isMelee && weapon.shotsLeft < 1}
                                className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400"
                              >
                                {isMelee ? 'Attack' : 'Semi-Auto (1)'}
                              </button>

                              {canAuto && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleFire(weapon, 'ThreeRoundBurst')}
                                    disabled={
                                      weapon.shotsLeft < ba ||
                                      ba < 1 ||
                                      !burstPreviewOk ||
                                      gmAtkBlock
                                    }
                                    title={
                                      !burstPreviewOk
                                        ? 'Burst only at Close or Medium range (set distance / map).'
                                        : gmAtkBlock
                                          ? 'Resolve the AI-GM attack request with a manual roll first.'
                                          : undefined
                                    }
                                    className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400"
                                  >
                                    Burst ({ba})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleFire(weapon, 'FullAuto')}
                                    disabled={
                                      weapon.shotsLeft < weapon.rof ||
                                      weapon.rof < 1 ||
                                      gmAtkBlock
                                    }
                                    title={
                                      gmAtkBlock
                                        ? 'Resolve the AI-GM attack request with a manual roll first.'
                                        : undefined
                                    }
                                    className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400"
                                  >
                                    Full Auto ({weapon.rof})
                                  </button>
                                  <div className="flex flex-1 flex-wrap items-stretch gap-1 min-w-[10rem]">
                                    <label className="flex flex-col justify-end text-[9px] font-bold uppercase leading-tight">
                                      Rds
                                      <input
                                        type="number"
                                        min={1}
                                        max={Math.max(1, weapon.shotsLeft)}
                                        value={
                                          suppressRoundsByWeapon[weapon.id] ??
                                          Math.max(1, Math.min(weapon.rof, weapon.shotsLeft))
                                        }
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value, 10);
                                          setSuppressRoundsByWeapon((prev) => ({
                                            ...prev,
                                            [weapon.id]: Number.isFinite(v) ? v : 1,
                                          }));
                                        }}
                                        disabled={weapon.shotsLeft < 1 || gmAtkBlock}
                                        className="w-14 border-2 border-black px-1 py-1 text-sm font-mono disabled:bg-gray-200"
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => handleFire(weapon, 'Suppressive')}
                                      disabled={weapon.shotsLeft < 1 || gmAtkBlock}
                                      title={
                                        gmAtkBlock
                                          ? 'Resolve the AI-GM attack request with a manual roll first.'
                                          : 'Spend rounds, then draw the suppressive rectangle on the tactical map.'
                                      }
                                      className="flex-1 min-w-[6rem] border-2 border-black p-2 font-bold uppercase text-sm hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400"
                                    >
                                      Suppress
                                    </button>
                                  </div>
                                  <p className="w-full text-[10px] text-gray-700 leading-snug mt-1">
                                    Open the tactical map and drag the orange dashed rectangle (min width 2 m from Grid
                                    m/cell). You can place your own zone; the session host can place any queued zone.
                                    {!isSessionHost && (
                                      <span className="block mt-0.5 text-gray-600">
                                        If you do not see draw mode on the map, switch to this character in the session
                                        bar so the app knows your token, or ask the host to place it.
                                      </span>
                                    )}
                                    {pendingSuppressivePlacements.length > 1 && (
                                      <span className="block mt-0.5 font-semibold text-amber-900">
                                        {pendingSuppressivePlacements.length} suppressive placements are queued—resolve
                                        them in order on the map.
                                      </span>
                                    )}
                                  </p>
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {/* Reload & Damage */}
                        <div className="flex gap-2">
                          {!isMelee && (
                            <button
                              onClick={() => reloadWeapon(character.id, weapon.id)}
                              className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm bg-blue-50 hover:bg-blue-100"
                            >
                              Reload ({weapon.shots})
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const dmgFormula = isMelee && sdb !== 0
                                ? `${weapon.damage}${sdb >= 0 ? '+' : ''}${sdb}`
                                : weapon.damage;
                              openDiceRoller(dmgFormula, {
                                kind: 'custom',
                                characterId: character.id,
                                ...sheetRollContext(character, sessionId, `${weapon.name} damage`),
                              });
                            }}
                            className="flex-1 border-2 border-black p-2 font-bold uppercase text-sm bg-red-50 hover:bg-red-100"
                          >
                            Roll Damage ({weapon.damage}{isMelee && sdb !== 0 ? (sdb > 0 ? `+${sdb}` : sdb) : ''})
                          </button>
                        </div>
                        {editable && !isMelee && (
                          <button
                            type="button"
                            onClick={() => {
                              const aimed = !!rangedModToggles[weapon.id]?.[AIMED_SHOT_LABEL];
                              const z = aimedZoneByWeapon[weapon.id] as Zone | undefined;
                              setDamageApplicatorPreset({
                                ...damagePresetWithCover(),
                                weaponDamageFormula: weapon.damage || '',
                                pointBlank: false,
                                ...(aimed
                                  ? {
                                      hitLocationMode: 'aimed' as const,
                                      ...(z ? { aimedLocation: z } : {}),
                                    }
                                  : { hitLocationMode: 'random' as const }),
                              });
                              setShowDamageApplicator(true);
                            }}
                            className="w-full mt-2 border-2 border-black bg-white hover:bg-gray-100 p-2 text-xs font-bold uppercase"
                            title="Apply Damage with weapon code, hit location (random d10 or aimed zone), and Roll weapon damage in the dialog."
                          >
                            Apply Damage — resolve hit &amp; location
                          </button>
                        )}
                        {editable && isMelee && weapon.damage && (
                          <button
                            type="button"
                            onClick={() => {
                              const dmgWithSdb =
                                sdb !== 0
                                  ? `${weapon.damage}${sdb >= 0 ? '+' : ''}${sdb}`
                                  : weapon.damage;
                              setDamageApplicatorPreset({
                                ...damagePresetWithCover(),
                                weaponDamageFormula: dmgWithSdb,
                                hitLocationMode: 'random',
                              });
                              setShowDamageApplicator(true);
                            }}
                            className="w-full mt-2 border-2 border-gray-600 bg-gray-50 hover:bg-gray-100 p-2 text-xs font-bold uppercase"
                          >
                            Apply Damage — fill weapon code ({sdb !== 0 ? `${weapon.damage}${sdb > 0 ? '+' : ''}${sdb}` : weapon.damage})
                          </button>
                        )}
                        {editable && (
                          <button
                            type="button"
                            onClick={() => sellItem(character.id, weapon.id)}
                            className="w-full mt-2 text-xs font-bold uppercase px-2 py-1 border-2 border-amber-600 text-amber-800 hover:bg-amber-50"
                            title={`Sell for 50% (€${Math.floor(weapon.cost * 0.5).toLocaleString()})`}
                          >
                            Sell weapon
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SDP Tracking */}
        {(character.sdp.sum.rArm > 0 ||
          character.sdp.sum.lArm > 0 ||
          character.sdp.sum.rLeg > 0 ||
          character.sdp.sum.lLeg > 0) && (
          <section>
            <h2 className="text-xl font-bold uppercase mb-3 border-b-2 border-black pb-1">
              Cyberlimb SDP
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {(['rArm', 'lArm', 'rLeg', 'lLeg'] as Zone[]).map((limb) => {
                const maxSDP = character.sdp.sum[limb];
                const currentSDP = character.sdp.current[limb];

                if (maxSDP === 0) return null;

                return (
                  <div key={limb} className="border-2 border-black p-2 bg-gray-50">
                    <div className="font-bold text-sm uppercase">{locationLabels[limb]}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {editable ? (
                        <input
                          type="number"
                          value={currentSDP}
                          onChange={(e) => {
                            const newSDP = Math.max(
                              0,
                              Math.min(maxSDP, parseInt(e.target.value) || 0),
                            );
                            updateCharacterField(character.id, `sdp.current.${limb}`, newSDP);
                          }}
                          className="w-16 border border-gray-400 px-2 py-1 text-center font-bold"
                          max={maxSDP}
                          min={0}
                        />
                      ) : (
                        <span className="font-bold text-lg">{currentSDP}</span>
                      )}
                      <span className="text-sm text-gray-600">/ {maxSDP}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {showDamageApplicator && (
        <DamageApplicator
          key={`${character.id}-${damageApplicatorPreset ? JSON.stringify(damageApplicatorPreset) : 'default'}`}
          characterId={damageApplicatorPreset?.targetCharacterId ?? character.id}
          preset={damageApplicatorPreset}
          onClose={() => {
            setShowDamageApplicator(false);
            setDamageApplicatorPreset(null);
          }}
        />
      )}

      {showItemBrowser && (
        <ItemBrowser characterId={character.id} onClose={() => setShowItemBrowser(false)} />
      )}

      {fireModeModal &&
        (() => {
          const w = character.items.find(
            (i): i is Weapon => i.type === 'weapon' && i.id === fireModeModal.weaponId,
          );
          if (!w) return null;
          const tid = combatTargetId.trim();
          return (
            <FireModeTargetModal
              open
              mode={fireModeModal.mode}
              weaponName={w.name}
              burstAmmo={burstAmmo(w.rof)}
              rof={w.rof}
              options={stabilizationPatientOptions.filter((o) => o.id !== character.id)}
              initialSelectedIds={
                tid && tid !== character.id ? [tid] : []
              }
              onClose={() => setFireModeModal(null)}
              onConfirm={confirmAutomatedFire}
            />
          );
        })()}
    </>
  );
}
