/**
 * One-shot session SFX. Uses independent `Audio()` instances so the soundtrack
 * player (`SessionSoundtrackPlayer`) keeps exclusive control of its element.
 */
import type { FireMode, Weapon } from '@/lib/types';

const DEFAULT_SFX_VOL = 0.32;

function playSfx(src: string, volume = DEFAULT_SFX_VOL): void {
  if (typeof window === 'undefined') return;
  try {
    const a = new Audio(src);
    a.volume = Math.min(1, Math.max(0, volume));
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export type SessionUiSfxKind =
  | 'tap'
  | 'commit'
  | 'warn'
  | 'combatOn'
  | 'turnTick'
  | 'panel'
  | 'roll'
  | 'select';

const UI_PATHS: Record<SessionUiSfxKind, readonly string[]> = {
  tap: ['/sfx/ui/Click_Mid.wav', '/sfx/ui/Click_02.wav', '/sfx/ui/High_Click_1.wav'],
  commit: ['/sfx/ui/Confirm_02.wav', '/sfx/ui/Complete_01.wav'],
  warn: ['/sfx/ui/Denied_01.wav', '/sfx/ui/Denied_02.wav'],
  combatOn: ['/sfx/ui/Sequence_01.wav', '/sfx/ui/Glitch_1.wav', '/sfx/ui/Execute_01.wav'],
  turnTick: ['/sfx/ui/Data_Point_05.wav', '/sfx/ui/Click_Pitched_Up.wav'],
  panel: ['/sfx/ui/Air_FX.wav', '/sfx/ui/Click_Scoop_Up.wav'],
  roll: ['/sfx/ui/Click_Combo_3.wav', '/sfx/ui/Bleep_04.wav', '/sfx/ui/Sequence_03.wav'],
  select: ['/sfx/ui/Data_Point_02.wav', '/sfx/ui/Ting_Pitched_Up.wav'],
};

/** Short UI cues — kept quiet so they sit under the soundtrack bus. */
export function playSessionUi(kind: SessionUiSfxKind, volumeMul = 1): void {
  playSfx(pickRandom(UI_PATHS[kind]), 0.26 * volumeMul);
}

type WeaponFirePick = Pick<Weapon, 'weaponType' | 'isAutoCapable'>;

function isRapidFireMode(mode: FireMode): boolean {
  return mode === 'FullAuto' || mode === 'ThreeRoundBurst' || mode === 'Suppressive';
}

/**
 * Gunfire after ammo is committed. Skips melee. Layered bursts use staggered
 * one-shots so they never touch the music player's audio node.
 */
export function playWeaponFireSfx(weapon: WeaponFirePick, mode: FireMode): void {
  if (weapon.weaponType === 'Melee') return;

  const rapid = isRapidFireMode(mode);
  const wt = weapon.weaponType;

  const scheduleEcho = (src: string, delayMs: number, vol: number) => {
    window.setTimeout(() => playSfx(src, vol), delayMs);
  };

  if (wt === 'Pistol' || wt === 'Exotic') {
    const src = pickRandom(['/sfx/gun/Pistol01.ogg', '/sfx/gun/Pistol02.ogg'] as const);
    playSfx(src, rapid ? 0.4 : 0.46);
    if (rapid) scheduleEcho(src, 55, 0.3);
    return;
  }

  if (wt === 'SMG') {
    const src = pickRandom(['/sfx/gun/SubmachineAuto01.ogg', '/sfx/gun/SubmachineAuto02.ogg'] as const);
    playSfx(src, 0.48);
    if (mode === 'FullAuto' || mode === 'Suppressive') scheduleEcho(src, 72, 0.34);
    return;
  }

  if (wt === 'Shotgun') {
    playSfx(pickRandom(['/sfx/gun/SemiAuto01.ogg', '/sfx/gun/SemiAuto02.ogg'] as const), 0.52);
    return;
  }

  if (wt === 'Heavy') {
    const src = pickRandom(['/sfx/gun/RifleSniper01.ogg', '/sfx/gun/RifleSniper02.ogg'] as const);
    playSfx(src, 0.5);
    if (rapid) {
      scheduleEcho(pickRandom(['/sfx/gun/SemiAuto01.ogg', '/sfx/gun/SemiAuto02.ogg'] as const), 85, 0.36);
    }
    return;
  }

  // Rifle (and any other ranged)
  if (rapid && weapon.isAutoCapable) {
    const src = pickRandom(['/sfx/gun/SubmachineAuto01.ogg', '/sfx/gun/SubmachineAuto02.ogg'] as const);
    playSfx(src, 0.44);
    return;
  }

  const semi = pickRandom(['/sfx/gun/SemiAuto01.ogg', '/sfx/gun/SemiAuto02.ogg'] as const);
  playSfx(semi, 0.46);
  if (mode === 'ThreeRoundBurst') scheduleEcho(semi, 58, 0.34);
}
