import { defaultAreaLookup, defaultHitLocations } from "./lookups.js"
// Utility methods that don't really belong anywhere else

export function properCase(str) {
    return str.replace(
        /\w\S*/g,
        function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
};

export function replaceIn(replaceIn, replaceWith) {
    return replaceIn.replace("[VAR]", replaceWith);
}

export function localize(key, data = {}) {
  return game.i18n.format("CYBERPUNK." + key, data);
}
export function tryLocalize(str, defaultResult=str) {
    let key = "CYBERPUNK." + str;
    if(!game.i18n.has(key))
        return defaultResult;
    else
        return game.i18n.localize(key);
}
export function localizeParam(str, params) {
    return game.i18n.format("CYBERPUNK."+ str, params);
}

export function shortLocalize(str) {
    let makeShort = !!game.i18n.has("CYBERPUNK." + str + "Short");
    return tryLocalize(makeShort ? str + "Short" : str);
}
/**
 * 
 * @param {CyberpunkActor} The actor you're targeting a location on
 * @param {*} targetArea If you're aiming at a specific area, this is the NAME of that area - eg "Head"
 * @returns {*} {roll: The rolled diceroll when aiming, areaHit: where actually hit}
 */
export async function rollLocation(targetActor, targetArea) {
    if(targetArea) {
        // Area name to number lookup
        const hitLocs = (!!targetActor) ? targetActor.hitLocations : defaultHitLocations();
        const targetNum = hitLocs[targetArea].location[0];
        let roll = await new Roll(`${targetNum}`).evaluate();
        return {
            roll: roll,
            areaHit: targetArea
        };
    }
    // Number to area name lookup
    let hitAreaLookup = (!!targetActor && !!targetActor.hitLocLookup) ? targetActor.hitLocLookup : defaultAreaLookup;

    let roll = await new Roll("1d10").evaluate();
    return {
        roll: roll,
        areaHit: hitAreaLookup[roll.total]
    };
}

export function deepLookup(startObject, path) {
    let current = startObject;
    path.split(".").forEach(segment => {
        current = current[segment];
    });
    return current;
}

// Like deep-lookup, but... setting instead
export function deepSet(startObject, path, value, overwrite=true) {
    let current = startObject;
    let pathArray = path.split(".");
    let lastPath = pathArray.pop();
    pathArray.forEach(segment => {
        let alreadyThere = current[segment];
        if(alreadyThere === undefined) {
            current[segment] = {};
        }
        current = current[segment];
    });
    let alreadyThere = current[lastPath];
    if(alreadyThere === undefined || overwrite) {
        current[lastPath] = value;
    }

    return startObject;
}

// Clamp x to be between min and max inclusive
export function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
}

export async function getDefaultSkills(lang = game.i18n.lang) {
  const packs = getSkillsPackNames(lang);
  const defaultPackName = packs.find((p) => p.startsWith("cyberpunk2020.default-skills-"));
  if (!defaultPackName) return [];

  const pack = game.packs.get(defaultPackName);
  if (!pack) return [];

  return await pack.getDocuments();
}

function _cpNormalizeLang(lang) {
  return String(lang || "en").trim().toLowerCase().replace("_", "-");
}

function _cpLangCandidates(lang) {
  const l = _cpNormalizeLang(lang);
  const out = [];
  if (l) out.push(l);

  const base = l.split("-")[0];
  if (base && base !== l) out.push(base);

  // always keep EN as a final stable fallback if present
  if (!out.includes("en")) out.push("en");

  return out;
}

/**
 * Return compendium pack names that contain skills for the given language.
 * This is dynamic: it discovers available language packs from game.packs.
 *
 * Naming convention:
 *   cyberpunk2020.default-skills-<lang>
 *   cyberpunk2020.role-skills-<lang>
 *
 * Language matching priority:
 *   exact (e.g. pt-br) -> base (pt) -> en -> first available
 *
 * @param {string} lang
 * @returns {string[]} pack collection IDs
 */
export function getSkillsPackNames(lang = game.i18n.lang) {
  const prefixes = {
    default: "cyberpunk2020.default-skills-",
    role: "cyberpunk2020.role-skills-"
  };

  // Discover available packs by suffix
  const available = {
    default: new Map(),
    role: new Map()
  };

  for (const pack of game.packs) {
    const col = pack.collection;
    if (!col) continue;

    for (const [kind, prefix] of Object.entries(prefixes)) {
      if (col.startsWith(prefix)) {
        const suffix = col.slice(prefix.length).toLowerCase();
        available[kind].set(suffix, col);
      }
    }
  }

  const want = _cpLangCandidates(lang);

  const pick = (kind) => {
    // 1) exact/base/en candidate match
    for (const cand of want) {
      const col = available[kind].get(cand);
      if (col) return col;
    }
    // 2) if en exists but not already matched (covers cases where lang candidates didn't include en for some reason)
    const en = available[kind].get("en");
    if (en) return en;

    // 3) otherwise: first available pack of this kind
    return available[kind].values().next().value ?? null;
  };

  const out = [];
  const d = pick("default");
  const r = pick("role");
  if (d) out.push(d);
  if (r) out.push(r);

  return out;
}

const _cpSkillIndexCache = new Map();

/**
 * Get a locale-appropriate list of skills from compendiums, without requiring an Actor.
 * Returns: [{ id, name }]
 * Cached per resolved pack-set (not just by language string).
 *
 * @param {string} lang
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getSkillIndex(lang = game.i18n.lang) {
  const packs = getSkillsPackNames(lang);
  const cacheKey = packs.join("|") || "none";
  if (_cpSkillIndexCache.has(cacheKey)) return _cpSkillIndexCache.get(cacheKey);

  const out = [];

  for (const packName of packs) {
    const pack = game.packs.get(packName);
    if (!pack) continue;

    // v12/v13: getIndex supports { fields }
    const idx = await pack.getIndex({ fields: ["name", "type"] });

    for (const e of idx) {
      if (e.type && e.type !== "skill") continue;
      // Compendium index uses "_id"
      out.push({ id: e._id, name: e.name });
    }
  }

  // De-duplicate by id (default + role packs can overlap)
  const byId = new Map();
  for (const s of out) {
    if (s?.id && s?.name && !byId.has(s.id)) byId.set(s.id, s);
  }

  const list = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  _cpSkillIndexCache.set(cacheKey, list);
  return list;
}

// Checking implant mechanics
// Accepts: the Item document itself, its system, or directly the CyberWorkType object
export function cwHasType(obj, type) {
  const cwt =
    obj?.system?.CyberWorkType ??
    obj?.CyberWorkType ??
    obj;
  const types = Array.isArray(cwt?.Types) ? cwt.Types : [];
  return types.includes(type) || cwt?.Type === type;
}

// Is the implant active, taking into account the mode (Permanent/Activated) and the “Active” flag
export function cwIsEnabled(obj) {
  const sys = obj?.system ?? obj;
  const mode = sys?.EffectMode ?? "Permanent";
  if (mode === "Activatable") return !!sys?.EffectActive;
  return true;
}

// Fumble Table (optional rule)

/**
 * Extract the first d10 result from a Cyberpunk roll
 * @param {Roll} roll
 * @returns {number|null}
 */
export function getInitialD10Result(roll) {
  try {
    const dieTerm = roll?.terms?.find(t => t instanceof foundry.dice.terms.Die);
    const res = dieTerm?.results?.find(r => !r.discarded && !r.rerolled);
    const n = Number(res?.result);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    return null;
  }
}

export function isFumbleRoll(roll) {
  return getInitialD10Result(roll) === 1;
}

function _dieSpan(faces, value, roll = null) {
  const v = Number(value);
  if (!Number.isFinite(v)) return String(value ?? "");

  if (roll && typeof roll === "object" && (roll.formula || roll.terms)) {
    try {
      const data = (typeof roll.toJSON === "function") ? roll.toJSON() : roll;
      const json = encodeURIComponent(JSON.stringify(data));
      const formula =
        foundry?.utils?.escapeHTML?.(String(roll.formula ?? `1d${faces}`)) ??
        String(roll.formula ?? `1d${faces}`);

      return `<a class="inline-roll inline-result cp-inline-roll roll-result roll die d${faces}" data-roll="${json}">${v}</a>`;
    } catch (e) {
    }
  }

  return `<span class="roll-result roll die d${faces}">${v}</span>`;
}
function _inlineRollResult(value, roll, extraClasses = "") {
  const v = Number(value);
  if (!Number.isFinite(v)) return String(value ?? "");

  if (roll && typeof roll === "object" && (roll.formula || roll.terms)) {
    try {
      const data = (typeof roll.toJSON === "function") ? roll.toJSON() : roll;
      const json = encodeURIComponent(JSON.stringify(data));
      const formula =
        foundry?.utils?.escapeHTML?.(String(roll.formula ?? "")) ??
        String(roll.formula ?? "");

      const cls = String(extraClasses || "").trim();
      return `<a class="inline-roll inline-result cp-inline-roll roll-result roll ${cls}" data-roll="${json}">${v}</a>`;
    } catch (e) {}
  }

  return `<span class="roll-result roll ${extraClasses}">${v}</span>`;
}

function _floorDamageTotal(total) {
  const n = Number(total);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  return Math.max(1, Math.floor(n));
}

function _pickTableRow(table, d10) {
  for (const row of table) {
    if (d10 >= row.min && d10 <= row.max) return row;
  }
  return table[table.length - 1];
}

const _TABLE_REF_COMBAT = [
  { min: 1, max: 4, key: "Fumble.ReflexCombat.1_4" },
  { min: 5, max: 5, key: "Fumble.ReflexCombat.5" },
  { min: 6, max: 6, key: "Fumble.ReflexCombat.6", needsReliability: "discharge" },
  { min: 7, max: 7, key: "Fumble.ReflexCombat.7", needsReliability: "jam" },
  { min: 8, max: 8, key: "Fumble.ReflexCombat.8", needsLocation: true },
  { min: 9, max: 10, key: "Fumble.ReflexCombat.9_10", needsLocation: true }
];

const _TABLE_REF_ATH = [
  { min: 1, max: 4, key: "Fumble.ReflexAthletics.1_4" },
  { min: 5, max: 7, key: "Fumble.ReflexAthletics.5_7" },
  { min: 8, max: 10, key: "Fumble.ReflexAthletics.8_10", extraAthleticsDamage: true }
];

const _TABLE_TECH = [
  { min: 1, max: 4, key: "Fumble.Tech.1_4" },
  { min: 5, max: 7, key: "Fumble.Tech.5_7" },
  { min: 8, max: 10, key: "Fumble.Tech.8_10" }
];

const _TABLE_EMP = [
  { min: 1, max: 4, key: "Fumble.Emp.1_4" },
  { min: 5, max: 6, key: "Fumble.Emp.5_6" },
  { min: 7, max: 10, key: "Fumble.Emp.7_10", extraEmpathyCheck: true }
];

const _TABLE_INT = [
  { min: 1, max: 4, key: "Fumble.Int.1_4" },
  { min: 5, max: 7, key: "Fumble.Int.5_7" },
  { min: 8, max: 10, key: "Fumble.Int.8_10" }
];

function _skillTableByStat(stat) {
  switch (String(stat || "").toLowerCase()) {
    case "ref": return { titleKey: "Fumble.ReflexAthletics.Title", table: _TABLE_REF_ATH };
    case "tech": return { titleKey: "Fumble.Tech.Title", table: _TABLE_TECH };
    case "emp": return { titleKey: "Fumble.Emp.Title", table: _TABLE_EMP };
    case "int": return { titleKey: "Fumble.Int.Title", table: _TABLE_INT };
    default: return { titleKey: "Fumble.ReflexAthletics.Title", table: _TABLE_REF_ATH };
  }
}

// Reliability helper (weapon.system.reliability)
export function reliabilityThreshold(reliabilityKey) {
  const key = String(reliabilityKey || "").toLowerCase();
  if (["veryreliable", "very", "vr"].includes(key)) return 3;
  if (["standard", "st"].includes(key)) return 5;
  if (["unreliable", "ur"].includes(key)) return 8;
  return 5;
}

export function reliabilityLabel(reliabilityKey) {
  const raw = String(reliabilityKey || "Standard");
  const k = "CYBERPUNK." + raw;
  if (game.i18n.has(k)) return game.i18n.localize(k);
  return raw;
}

// Build fumble UI payload for a skill roll (by skill stat table)
export async function buildSkillFumbleData({ skill, roll }) {
  const stat = skill?.system?.stat;
  const { titleKey, table } = _skillTableByStat(stat);

  const fRoll = await new Roll("1d10").evaluate();
  const row = _pickTableRow(table, fRoll.total);

  let html = "";
  const mainDie = getInitialD10Result(roll) ?? 1;
  html += localizeParam("Fumble.MainRollLine", { die: _dieSpan(10, mainDie, roll) });
  html += localizeParam("Fumble.TableRollLine", {
    table: localize(titleKey),
    die: _dieSpan(10, fRoll.total, fRoll)
  });
  html += `<p>${localize(row.key)}</p>`;
  
  if (row.extraAthleticsDamage) {
    const dmgRoll = await new Roll("1d6").evaluate();
    html += localizeParam("Fumble.AthleticsDamageLine", {
      die: _dieSpan(6, dmgRoll.total, dmgRoll)
    });
  }

  if (row.extraEmpathyCheck) {
    const extra = await new Roll("1d10").evaluate();
    const outcomeKey = (extra.total <= 4)
      ? "Fumble.EmpExtra.1_4"
      : "Fumble.EmpExtra.5_10";

    html += localizeParam("Fumble.EmpExtraLine", {
      die: _dieSpan(10, extra.total, extra),
      outcome: localize(outcomeKey)
    });
  }

  return {
    title: localize("Fumble.TableTitle"),
    html
  };
}

export async function buildRangedCombatFumbleData({
  item,
  attackRoll,
  isAutoWeapon,
  autoOnlyJam
}) {
  const sys = item?._getWeaponSystem?.() ?? item?.system ?? {};
  const relKey = sys.reliability;
  const thr = reliabilityThreshold(relKey);
  const relName = reliabilityLabel(relKey);

  const outcome = { discharge: false, jam: false, jamRounds: 0 };

  let html = "";
  const mainDie = getInitialD10Result(attackRoll) ?? 1;
  html += localizeParam("Fumble.MainRollLine", { die: _dieSpan(10, mainDie, attackRoll) });

  // Auto-only-jam mode: skip combat table
  if (isAutoWeapon && autoOnlyJam) {
    const rel = await new Roll("1d10").evaluate();
    const jam = rel.total <= thr;

    html += `<p>${localize("Fumble.AutoWeaponOnlyJam")}</p>`;
    html += `<p>${localizeParam("Fumble.ReliabilityLine", {
      rel: relName,
      thr,
      die: _dieSpan(10, rel.total, rel),
      result: localize(jam ? "Fumble.ReliabilityResult.Jam" : "Fumble.ReliabilityResult.NoJam")
    })}</p>`;

    if (jam) {
      const r = await new Roll("1d6").evaluate();
      outcome.jam = true;
      outcome.jamRounds = r.total;
      html += `<p>${localizeParam("Fumble.ClearJamLine", { die: _dieSpan(6, r.total, r) })}</p>`;
    }

    return { title: localize("Fumble.TableTitle"), html, outcome };
  }

  // Normal table roll
  const fRoll = await new Roll("1d10").evaluate();
  const row = _pickTableRow(_TABLE_REF_COMBAT, fRoll.total);

  html += localizeParam("Fumble.TableRollLine", {
    table: localize("Fumble.ReflexCombat.Title"),
    die: _dieSpan(10, fRoll.total, fRoll)
  });
  html += `<p>${localize(row.key)}</p>`;

  // Location roll
  if (row.needsLocation) {
    const loc = await rollLocation(undefined, undefined);
    html += `<p>${localizeParam("Fumble.LocationLine", {
      die: _dieSpan(10, loc.roll.total, loc.roll),
      location: localize(loc.areaHit)
    })}</p>`;

    const dmgFormula = sys?.damage || "1d6";
    const rollData = item?.actor?.getRollData?.() ?? {};
    const dmgRoll = await new Roll(dmgFormula, rollData).evaluate();
    const dmg = _floorDamageTotal(dmgRoll.total);

    html += `<p>${localizeParam("Fumble.DamageLine", {
      formula: dmgFormula,
      die: _inlineRollResult(dmg, dmgRoll)
    })}</p>`;
  }

  // Reliability checks:
  const needsReliability = row.needsReliability;

  let relRoll = null;
  if (needsReliability) relRoll = await new Roll("1d10").evaluate();

  if (relRoll) {
    const fails = relRoll.total <= thr;

    const resultKey =
      (needsReliability === "jam")
        ? (fails ? "Fumble.ReliabilityResult.Jam" : "Fumble.ReliabilityResult.NoJam")
        : (fails ? "Fumble.ReliabilityResult.Fail" : "Fumble.ReliabilityResult.Pass");

    const relLine = localizeParam("Fumble.ReliabilityLine", {
      rel: relName,
      thr,
      die: _dieSpan(10, relRoll.total, relRoll),
      result: localize(resultKey)
    });
    html += `<p>${relLine}</p>`;

    if (needsReliability === "discharge") {
      if (fails) {
        outcome.discharge = true;
        html += `<p>${localize("Fumble.DischargeApplied")}</p>`;
      } else {
        html += `<p>${localize("Fumble.DischargeNotApplied")}</p>`;
      }
    }

    if (needsReliability === "jam") {
      if (fails) {
        const r = await new Roll("1d6").evaluate();
        outcome.jam = true;
        outcome.jamRounds = r.total;
        html += `<p>${localizeParam("Fumble.ClearJamLine", { die: _dieSpan(6, r.total, r) })}</p>`;
      }
    }
  }

  return { title: localize("Fumble.TableTitle"), html, outcome };
}
