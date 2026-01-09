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

export async function getDefaultSkills() {
    // Получаем значение настройки языка
    // Get the language setting value
    const selectedLanguage= game.i18n.lang

    // Определяем, какой пакет загружать на основе выбранного языка
    // Determine which package to load based on the selected language
    let packName;
    switch(selectedLanguage) {
        case "en":
            packName = "cyberpunk2020.default-skills-en";
            break;
        case "ru":
            packName = "cyberpunk2020.default-skills-ru";
            break;
        default:
            packName = "cyberpunk2020.default-skills-en";
    }

    // Получаем пакет на основе его имени
    // Retrieve the package by its name
    const pack = game.packs.get(packName);

    // Загружаем содержимое выбранного пакета
    // Load the content of the selected package
    const content = await pack.getDocuments();

    // Возвращаем содержимое пакета
    // Return the package content
    return content;
}

/**
 * Return compendium pack names that contain skills for the given language.
 * We keep EN as a safe fallback.
 * @param {string} lang
 * @returns {string[]} pack collection IDs (e.g. "cyberpunk2020.default-skills-en")
 */
export function getSkillsPackNames(lang = game.i18n.lang) {
  const l = String(lang || "en").toLowerCase();
  const suffix = (l === "ru" || l === "en") ? l : "en";
  const candidates = [
    `cyberpunk2020.default-skills-${suffix}`,
    `cyberpunk2020.role-skills-${suffix}`
  ];
  return candidates.filter((n) => !!game.packs.get(n));
}

const _cpSkillIndexCache = new Map();

/**
 * Get a locale-appropriate list of skills from compendiums, without requiring an Actor.
 * Returns: [{ id, name }]
 * Cached per language.
 * @param {string} lang
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getSkillIndex(lang = game.i18n.lang) {
  const l = String(lang || "en").toLowerCase();
  if (_cpSkillIndexCache.has(l)) return _cpSkillIndexCache.get(l);

  const packs = getSkillsPackNames(l);
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
  for (const s of out) if (s?.id && s?.name && !byId.has(s.id)) byId.set(s.id, s);

  const list = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  _cpSkillIndexCache.set(l, list);
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
