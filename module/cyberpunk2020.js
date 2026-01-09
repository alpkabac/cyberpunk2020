import { CyberpunkActor } from "./actor/actor.js";
import { CyberpunkActorSheet } from "./actor/actor-sheet.js";
import { CyberpunkItem } from "./item/item.js";
import { CyberpunkItemSheet } from "./item/item-sheet.js";

import { preloadHandlebarsTemplates } from "./templates.js";
import { registerHandlebarsHelpers } from "./handlebars-helpers.js"
import * as migrations from "./migrate.js";
import { registerSystemSettings } from "./settings.js"

Hooks.once('init', async function () {

    // Place classes in system namespace for later reference.
    game.cyberpunk = {
        entities: {
            CyberpunkActor,
            CyberpunkItem,
        },
        // A manual migrateworld.
        migrateWorld: migrations.migrateWorld
    };

    // Define custom Document classes
    CONFIG.Actor.documentClass = CyberpunkActor;
    CONFIG.Item.documentClass = CyberpunkItem;

    // Register sheets, unregister original core sheets
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("cyberpunk2020", CyberpunkActorSheet, { makeDefault: true });
    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("cyberpunk2020", CyberpunkItemSheet, { makeDefault: true });

    // Register System Settings
    registerSystemSettings();

    registerHandlebarsHelpers();

    // Register and preload templates with Foundry. See templates.js for usage
    preloadHandlebarsTemplates();
});

/**
 * Once the entire VTT framework is initialized, check to see if we should perform a data migration (nabbed from Foundry's 5e module and adapted)
 */
Hooks.once("ready", async function () {
  // Determine whether a system migration is required and feasible
  if (!game.user.isGM) return;

  // If setting was never written, it will be "" (default). Normalize to "0" for safe compare.
  const lastMigrateVersion =
    game.settings.get("cyberpunk2020", "systemMigrationVersion") || "0";

  // The version migrations need to begin - bump this only when you add a new migration step
  const NEEDS_MIGRATION_VERSION = "1.1.0";

  console.log("CYBERPUNK: Last migrated in version: " + lastMigrateVersion);

  const needsMigration = foundry.utils.isNewerVersion(
    NEEDS_MIGRATION_VERSION,
    lastMigrateVersion
  );
  if (!needsMigration) return;

  // IMPORTANT: await so we don't exit early and so version write happens deterministically
  await migrations.migrateWorld(NEEDS_MIGRATION_VERSION);
});
