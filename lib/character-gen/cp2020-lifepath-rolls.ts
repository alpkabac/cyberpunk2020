/**
 * Cyberpunk 2020 Lifepath random generation (View from the Edge pp.34–39).
 * Dice procedures follow the core book; output is plain text for the Life tab.
 */

import type { LifeEvent, Lifepath } from '@/lib/types';
import {
  LIFEPATH_AFFECTATIONS,
  LIFEPATH_CHILDHOOD,
  LIFEPATH_CLOTHES,
  LIFEPATH_ETHNICITY,
  LIFEPATH_FAMILY_RANKING,
  LIFEPATH_FEEL_ABOUT_PEOPLE,
  LIFEPATH_HAIR,
  LIFEPATH_TRAITS,
  LIFEPATH_VALUED_PERSON,
  LIFEPATH_VALUED_POSSESSION,
  LIFEPATH_VALUE_MOST,
} from '@/lib/data/lifepath-options';
import { rollD10, rollD6, type Cp2020Rng } from './cp2020-char-gen';

function pick10<T extends readonly string[]>(table: T, rng: Cp2020Rng): T[number] {
  return table[rollD10(rng) - 1]!;
}

function rollD10Times100(rng: Cp2020Rng): number {
  return rollD10(rng) * 100;
}

function sexFromD10(rng: Cp2020Rng): string {
  return rollD10(rng) % 2 === 0 ? 'Male' : 'Female';
}

/** p.34 — 1D10 per column */
export function rollLifepathStyleFromBook(rng: Cp2020Rng): Lifepath['style'] {
  return {
    clothes: pick10(LIFEPATH_CLOTHES, rng),
    hair: pick10(LIFEPATH_HAIR, rng),
    affectations: pick10(LIFEPATH_AFFECTATIONS, rng),
  };
}

/** p.34 ethnic origins — one D10; language note per book */
export function rollLifepathEthnicityFromBook(rng: Cp2020Rng): Pick<Lifepath, 'ethnicity' | 'language'> {
  const row = pick10(LIFEPATH_ETHNICITY, rng);
  return {
    ethnicity: row,
    language: 'Native tongue at +8 per table; also Streetslang',
  };
}

const FAMILY_TRAGEDY = [
  'Family lost everything through betrayal',
  'Family lost everything through bad management',
  'Family exiled or otherwise driven from their original home/nation/corporation',
  'Family is imprisoned and you alone escaped',
  'Family vanished. You are the only remaining member',
  'Family was murdered/killed and you were the only survivor',
  'Family is involved in a long-term conspiracy, organization or association (crime family, revolutionary group, etc.)',
  'Your family was scattered to the winds due to misfortune',
  'Your family is cursed with a hereditary feud lasting generations',
  'You are the inheritor of a family debt you must honor before moving on',
] as const;

const SOMETHING_HAPPENED_PARENTS = [
  'Your parent(s) died in warfare',
  'Your parent(s) died in an accident',
  'Your parent(s) were murdered',
  'Your parent(s) have amnesia and don\'t remember you',
  'You never knew your parent(s)',
  'Your parent(s) are in hiding to protect you',
  'You were left with relatives for safekeeping',
  'You grew up on the Street and never had parents',
  'Your parent(s) gave you up for adoption',
  'Your parent(s) sold you for money',
] as const;

const SIBLING_AGE_REL = [
  'older',
  'older',
  'older',
  'older',
  'older',
  'younger',
  'younger',
  'younger',
  'younger',
  'twin',
] as const;

const SIBLING_FEELING = [
  'Sibling dislikes you',
  'Sibling dislikes you',
  'Sibling likes you',
  'Sibling likes you',
  'Sibling neutral',
  'Sibling neutral',
  'They hero-worship you',
  'They hero-worship you',
  'They hate you',
  'They hate you',
] as const;

/**
 * p.34–35 — family ranking → parents → (tragedy/status) → childhood, then siblings.
 * Returns free-text blocks for `familyBackground` and `siblings`.
 */
export function rollLifepathFamilyAndSiblingsFromBook(rng: Cp2020Rng): {
  familyBackground: string;
  siblings: string;
} {
  const ranking = pick10(LIFEPATH_FAMILY_RANKING, rng);
  const lines: string[] = [`Family ranking: ${ranking}.`];

  let childhood: (typeof LIFEPATH_CHILDHOOD)[number];
  const parentsRoll = rollD10(rng);

  if (parentsRoll <= 6) {
    lines.push('Both parents living at start of this path.');
    const statusRoll = rollD10(rng);
    if (statusRoll <= 6) {
      lines.push('Family status in danger — tragedy struck.');
      lines.push(`Tragedy: ${pick10(FAMILY_TRAGEDY, rng)}`);
      childhood = pick10(LIFEPATH_CHILDHOOD, rng);
    } else {
      lines.push('Family status OK despite complications.');
      childhood = pick10(LIFEPATH_CHILDHOOD, rng);
    }
  } else {
    lines.push(`Parents: ${pick10(SOMETHING_HAPPENED_PARENTS, rng)}`);
    const statusRoll = rollD10(rng);
    if (statusRoll <= 6) {
      lines.push('Family status in danger — tragedy.');
      lines.push(`Tragedy: ${pick10(FAMILY_TRAGEDY, rng)}`);
      childhood = pick10(LIFEPATH_CHILDHOOD, rng);
    } else {
      lines.push('Family status OK.');
      childhood = pick10(LIFEPATH_CHILDHOOD, rng);
    }
  }

  lines.push(`Childhood environment: ${childhood}`);

  const sibRoll = rollD10(rng);
  let sibLines: string[];
  if (sibRoll >= 8) {
    sibLines = ['Only child (D10 roll 8–10).'];
  } else {
    const n = sibRoll;
    sibLines = [`${n} sibling(s):`];
    for (let i = 0; i < n; i++) {
      const sex = sexFromD10(rng);
      const ageRel = SIBLING_AGE_REL[rollD10(rng) - 1]!;
      const feel = pick10(SIBLING_FEELING, rng);
      sibLines.push(`  · ${sex}, ${ageRel} than you — ${feel}.`);
    }
  }

  return {
    familyBackground: lines.join(' '),
    siblings: sibLines.join('\n'),
  };
}

function rollFeelAboutPeopleBook(rng: Cp2020Rng): string {
  const r = rollD10(rng);
  const idx = r <= 2 ? 0 : r - 2;
  return LIFEPATH_FEEL_ABOUT_PEOPLE[Math.min(idx, LIFEPATH_FEEL_ABOUT_PEOPLE.length - 1)]!;
}

/** p.35–36 — five D10 rolls */
export function rollLifepathMotivationsFromBook(rng: Cp2020Rng): Lifepath['motivations'] {
  return {
    traits: pick10(LIFEPATH_TRAITS, rng),
    valuedPerson: pick10(LIFEPATH_VALUED_PERSON, rng),
    valueMost: pick10(LIFEPATH_VALUE_MOST, rng),
    feelAboutPeople: rollFeelAboutPeopleBook(rng),
    valuedPossession: pick10(LIFEPATH_VALUED_POSSESSION, rng),
  };
}

const DISASTER = [
  'Financial loss or debt',
  'Imprisonment or hostage',
  'Illness or addiction (−1 REF permanently)',
  'Betrayal',
  'Accident',
  'Lover, friend or relative killed',
  'False accusation',
  'Hunted by the Law',
  'Hunted by a Corporation',
  'Mental or physical incapacitation',
] as const;

const LUCKY = [
  'Powerful connection in city government',
  'Financial windfall',
  'Big score on job or deal',
  'Found a Sensei — Martial Arts +2 or +1 to MA skill',
  'Found a teacher — +1 INT skill or new INT skill at +2',
  'Powerful Corporate exec owes you one favor',
  'Local Nomad Pack befriends you (≈ Family +2, 1 favor/month)',
  'Friend on the Police Force (+2 Streetwise on police situations)',
  'Local Booster gang likes you (1 favor/month, Family +2 equivalent; don\'t push it)',
  'Combat teacher — +1 weapon skill (not MA/Brawling) or new combat skill at +2',
] as const;

const WHAT_GONNA_DO = [
  'Clear your name',
  'Clear your name',
  'Live it down and try to forget it',
  'Live it down and try to forget it',
  'Hunt down those responsible and make them pay',
  'Hunt down those responsible and make them pay',
  'Get what\'s rightfully yours',
  'Get what\'s rightfully yours',
  'Save anyone else involved if possible',
  'Save anyone else involved if possible',
] as const;

const GOV_BRANCH = [
  'Police Dept.',
  'Police Dept.',
  'Police Dept.',
  'Police Dept.',
  'District Attorney\'s Office',
  'District Attorney\'s Office',
  'District Attorney\'s Office',
  'Mayor\'s Office',
  'Mayor\'s Office',
  'Mayor\'s Office',
] as const;

function expandDisaster(which: number, rng: Cp2020Rng): string {
  const base = DISASTER[which - 1] ?? 'Unknown disaster';
  switch (which) {
    case 1:
      return `${base}: lost ${rollD10Times100(rng)} eb (debt if you can\'t pay).`;
    case 2:
      return `${base}: ${rollD10(rng)} months.`;
    case 3:
      return `${base}.`;
    case 4: {
      const b = rollD10(rng);
      const detail =
        b <= 3
          ? 'being blackmailed'
          : b <= 7
            ? 'a secret was exposed'
            : 'betrayed by a close friend (romance or career — your choice)';
      return `${base}: ${detail}.`;
    }
    case 5: {
      const a = rollD10(rng);
      if (a <= 4) return `${base}: terribly disfigured — −5 ATT (note for chargen/ref).`;
      if (a <= 6) return `${base}: hospitalized ${rollD10(rng)} months that year.`;
      if (a <= 8) return `${base}: lost ${rollD10(rng)} months of memory of that year.`;
      return `${base}: nightmares of the accident (8 in 10 nights).`;
    }
    case 6: {
      const k = rollD10(rng);
      if (k <= 5) return `${base}: they died accidentally.`;
      if (k <= 8) return `${base}: murdered by unknown parties.`;
      return `${base}: murdered — you know who; need proof.`;
    }
    case 7: {
      const f = rollD10(rng);
      const acc =
        f <= 3
          ? 'theft'
          : f <= 5
            ? 'cowardice'
            : f <= 8
              ? 'murder'
              : f === 9
                ? 'rape'
                : 'lying or betrayal';
      return `${base}: accusation — ${acc}.`;
    }
    case 8: {
      const h = rollD10(rng);
      const scope =
        h <= 3
          ? 'a few local cops'
          : h <= 6
            ? 'entire local force'
            : h <= 8
              ? 'State Police / Militia'
              : 'FBI or national equivalent';
      return `${base}: ${scope}.`;
    }
    case 9: {
      const h = rollD10(rng);
      const scope =
        h <= 3
          ? 'small local firm'
          : h <= 6
            ? 'larger corp (statewide)'
            : h <= 8
              ? 'national corp'
              : 'huge multinational';
      return `${base}: ${scope}.`;
    }
    case 10: {
      const m = rollD10(rng);
      if (m <= 3) return `${base}: nervous disorder / bioplague — −1 REF.`;
      if (m <= 7) return `${base}: anxiety/phobias — −1 COOL.`;
      return `${base}: major psychosis — −1 COOL, −1 REF.`;
    }
    default:
      return base;
  }
}

function expandLucky(which: number, rng: Cp2020Rng): string {
  const base = LUCKY[which - 1] ?? 'Lucky break';
  switch (which) {
    case 1:
      return `${base}: ${GOV_BRANCH[rollD10(rng) - 1]}.`;
    case 2:
      return `${base}: +${rollD10Times100(rng)} eb.`;
    case 3:
      return `${base}: +${rollD10Times100(rng)} eb.`;
    default:
      return `${base}.`;
  }
}

function rollBigProblemsBigWins(rng: Cp2020Rng): string {
  const fate = rollD10(rng);
  const won = fate % 2 === 0;
  if (won) {
    const w = rollD10(rng);
    return `Big win: ${expandLucky(w, rng)}`;
  }
  const d = rollD10(rng);
  const detail = expandDisaster(d, rng);
  const cope = pick10(WHAT_GONNA_DO, rng);
  return `Hard loss: ${detail} You plan to: ${cope}`;
}

const ENEMY_WHO = [
  'Ex friend',
  'Ex lover',
  'Relative',
  'Childhood enemy',
  'Person working for you',
  'Person you work for',
  'Partner or co-worker',
  'Booster gang member',
  'Corporate Exec',
  'Government Official',
] as const;

const ENEMY_CAUSE = [
  'Caused the other to lose face or status',
  'Caused the loss of a lover, friend or relative',
  'Caused a major humiliation',
  'Accused the other of cowardice or personal flaw',
  'Caused a physical disability',
  'Deserted or betrayed the other',
  'Turned down offer of job or romance',
  'Just didn\'t like each other',
  'Romantic rival',
  'Foiled a plan of the other\'s',
] as const;

const ENEMY_FRACKED = [
  'They hate you',
  'They hate you',
  'They hate you',
  'They hate you',
  'You hate them',
  'You hate them',
  'You hate them',
  'The feeling\'s mutual',
  'The feeling\'s mutual',
  'The feeling\'s mutual',
] as const;

const ENEMY_WHATCHA = [
  'Murderous rage if face to face',
  'Murderous rage if face to face',
  'Avoid them',
  'Avoid them',
  'Backstab indirectly',
  'Backstab indirectly',
  'Ignore them',
  'Ignore them',
  'Verbally rip into them',
  'Verbally rip into them',
] as const;

const ENEMY_FORCE = [
  'Just himself/herself',
  'Just himself/herself',
  'Just himself/herself',
  'Himself and a few friends',
  'Himself and a few friends',
  'An entire gang',
  'An entire gang',
  'A small Corporation',
  'A large Corporation',
  'An entire Government Agency',
] as const;

const FRIEND_REL = [
  'Like a big brother/sister to you',
  'Like a kid sister/brother to you',
  'A teacher or mentor',
  'A partner or co-worker',
  'An old lover',
  'An old enemy',
  'Like a foster parent',
  'A relative',
  'Reconnect with old childhood friend',
  'Met through a common interest',
] as const;

/** p.38 — same tables as §1 style + §3 motivations to sketch a friend, enemy, or lover. */
export function rollContactPersonaSketch(rng: Cp2020Rng): string {
  const st = rollLifepathStyleFromBook(rng);
  const m = rollLifepathMotivationsFromBook(rng);
  return (
    `They present as: ${st.clothes}, ${st.hair}, ${st.affectations}. ` +
    `Personality: ${m.traits}. Cares about ${m.valuedPerson}; driven by ${m.valueMost}. ` +
    `Toward people: ${m.feelAboutPeople}. Keeps ${m.valuedPossession}.`
  );
}

function rollFriendsAndEnemies(rng: Cp2020Rng): string {
  const t = rollD10(rng);
  if (t <= 5) {
    const sex = sexFromD10(rng);
    const rel = pick10(FRIEND_REL, rng);
    return `New friend (${sex}): ${rel}. ${rollContactPersonaSketch(rng)}`;
  }
  const sex = sexFromD10(rng);
  const who = pick10(ENEMY_WHO, rng);
  let cause: string = pick10(ENEMY_CAUSE, rng);
  if (cause.startsWith('Caused a physical disability')) {
    const limb = rollD6(rng);
    const dis =
      limb <= 2 ? 'lost eye' : limb <= 4 ? 'lost arm' : 'badly scarred';
    cause = `Caused a physical disability (${dis})`;
  }
  const fracked = pick10(ENEMY_FRACKED, rng);
  const whatcha = pick10(ENEMY_WHATCHA, rng);
  const force = pick10(ENEMY_FORCE, rng);
  return `New enemy (${sex}): ${who}. Cause: ${cause}. ${fracked} If you met: ${whatcha}. They can bring: ${force}. ${rollContactPersonaSketch(rng)}`;
}

const ROMANCE_OUTCOME = [
  'Happy love affair',
  'Happy love affair',
  'Happy love affair',
  'Happy love affair',
  'TRAGIC love affair',
  'Love affair WITH PROBLEMS',
  'Love affair WITH PROBLEMS',
  'Fast affairs & hot dates',
  'Fast affairs & hot dates',
  'Fast affairs & hot dates',
] as const;

const LOVE_PROBLEMS = [
  'Lover\'s friends/family hate you',
  'Lover\'s friends/family would use any means to get rid of you',
  'Your friends/family hate your lover',
  'Romantic rival',
  'Separated somehow',
  'Fight constantly',
  'Professional rivals',
  'One insanely jealous',
  'One "messing around"',
  'Conflicting backgrounds/families',
] as const;

const TRAGIC_LOVE = [
  'Lover died in accident',
  'Lover mysteriously vanished',
  'It didn\'t work out',
  'Personal goal or vendetta came between you',
  'Lover kidnapped',
  'Lover went insane',
  'Lover committed suicide',
  'Lover killed in a fight',
  'Rival cut you out',
  'Lover imprisoned or exiled',
] as const;

const MUTUAL_FEELINGS = [
  'They still love you',
  'You still love them',
  'You still love each other',
  'You hate them',
  'They hate you',
  'You hate each other',
  'You\'re friends',
  'No feelings either way; over',
  'You like them, they hate you',
  'They like you, you hate them',
] as const;

function rollRomanticLife(rng: Cp2020Rng): string {
  const o = pick10(ROMANCE_OUTCOME, rng);
  const persona = rollContactPersonaSketch(rng);
  if (o.startsWith('Happy')) return `${o}. ${persona}`;
  if (o.startsWith('Fast')) return `${o}. ${persona}`;
  if (o.includes('PROBLEMS')) {
    return `Romance: ${pick10(LOVE_PROBLEMS, rng)}. ${persona}`;
  }
  const tragic = pick10(TRAGIC_LOVE, rng);
  const mutual = pick10(MUTUAL_FEELINGS, rng);
  return `Tragic romance: ${tragic}. Afterward: ${mutual}. ${persona}`;
}

function rollOneLifeEventYear(age: number, rng: Cp2020Rng): string {
  const main = rollD10(rng);
  if (main <= 3) return rollBigProblemsBigWins(rng);
  if (main <= 6) return rollFriendsAndEnemies(rng);
  if (main <= 8) return rollRomanticLife(rng);
  return 'Nothing major that year.';
}

/** p.36–39 — one row per year from 17 through `age` inclusive */
export function rollLifepathLifeEventsFromBook(characterAge: number, rng: Cp2020Rng): LifeEvent[] {
  const age = Math.max(16, Math.floor(characterAge));
  const events: LifeEvent[] = [];
  for (let y = 17; y <= age; y++) {
    events.push({ age: y, event: rollOneLifeEventYear(y, rng) });
  }
  return events;
}

export function rollLifepathAgeFromBook(rng: Cp2020Rng): number {
  return 16 + rollD6(rng) + rollD6(rng);
}

/** Roll style, origins, family, siblings, and motivations in one pass */
export function rollLifepathSections1to3FromBook(rng: Cp2020Rng): Pick<Lifepath, 'style' | 'ethnicity' | 'language' | 'familyBackground' | 'siblings' | 'motivations'> {
  const fam = rollLifepathFamilyAndSiblingsFromBook(rng);
  return {
    style: rollLifepathStyleFromBook(rng),
    ...rollLifepathEthnicityFromBook(rng),
    familyBackground: fam.familyBackground,
    siblings: fam.siblings,
    motivations: rollLifepathMotivationsFromBook(rng),
  };
}
