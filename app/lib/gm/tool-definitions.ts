/**
 * OpenAI-compatible tool schemas for OpenRouter (used in chat/completions).
 */

export const GM_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'apply_damage',
      description:
        'Apply resolved damage to a character after you have determined hit location and raw damage. Uses CP2020 armor/BTM pipeline. Pass explicit location (Head, Torso, rArm, lArm, rLeg, lLeg) from the fiction or from a rolled d10 table — the tool does not roll hit location server-side.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string', description: 'UUID of the character sheet' },
          raw_damage: { type: 'number', description: 'Damage before armor multipliers (head doubling done inside pipeline)' },
          location: {
            type: 'string',
            enum: ['Head', 'Torso', 'rArm', 'lArm', 'lLeg', 'rLeg'],
            description: 'Omit for non-location damage (SP not applied by location)',
          },
          is_ap: { type: 'boolean', description: 'Armor-piercing ammo halves SP before subtraction' },
          point_blank: { type: 'boolean', description: 'Point-blank max damage for firearm' },
          weapon_damage_formula: { type: 'string', description: 'e.g. 3d6 for max damage when point_blank' },
        },
        required: ['character_id', 'raw_damage'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'deduct_money',
      description: 'Subtract eurobucks from a character.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          amount: { type: 'number', minimum: 0 },
        },
        required: ['character_id', 'amount'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_item',
      description:
        'Add a typed gear item to a character inventory. For weapons include weapon_type, damage, shots, rof, range, accuracy; for armor include coverage with zone stopping power; for cyberware include cyberware_type and humanity_loss.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          item: {
            type: 'object',
            description:
              'Item fields. id optional (server-generated if omitted). Include type-specific fields: weapon → weapon_type, damage (e.g. "4d6"), shots, shots_left, rof, range, accuracy, ap, ammo_type, attack_skill, is_auto_capable; armor → coverage (object with zone keys: head/torso/r_arm/l_arm/r_leg/l_leg each having stopping_power and ablation), encumbrance; cyberware → cyberware_type, surgery_code, humanity_cost, humanity_loss, stat_mods.',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              type: {
                type: 'string',
                enum: ['weapon', 'armor', 'cyberware', 'vehicle', 'misc', 'program'],
              },
              flavor: { type: 'string' },
              notes: { type: 'string' },
              cost: { type: 'number' },
              weight: { type: 'number' },
              equipped: { type: 'boolean' },
              source: { type: 'string' },
              weapon_type: {
                type: 'string',
                description:
                  'Weapon category. Values: pistol, smg, shotgun, assault_rifle, rifle, heavy, melee, exotic, grenade, bow',
              },
              damage: { type: 'string', description: 'Dice expression e.g. "3d6+3", "8d10"' },
              shots: { type: 'number', description: 'Magazine size' },
              shots_left: { type: 'number', description: 'Current ammo; defaults to shots if omitted' },
              rof: { type: 'number', description: 'Rate of fire' },
              range: { type: 'number', description: 'Effective range in metres' },
              accuracy: { type: 'number', description: 'Accuracy modifier' },
              ap: { type: 'boolean', description: 'Armour piercing' },
              ammo_type: { type: 'string' },
              attack_skill: { type: 'string', description: 'Governing skill name e.g. "Heavy Weapons"' },
              is_auto_capable: { type: 'boolean' },
              coverage: {
                type: 'object',
                description:
                  'Armor coverage by body zone. Keys MUST be: Head, Torso, rArm, lArm, rLeg, lLeg (exact case). Each zone: { stopping_power: number, ablation: number }.',
              },
              encumbrance: { type: 'number' },
              cyberware_type: {
                type: 'string',
                description: 'e.g. "implant", "weapon", "neural", "optic", "body", "limb"',
              },
              surgery_code: { type: 'string', description: 'M / MA / N / EX' },
              humanity_cost: { type: 'string', description: 'e.g. "2d6"' },
              humanity_loss: { type: 'number' },
              stat_mods: {
                type: 'object',
                description: 'Stat bonuses granted by the cyberware e.g. { "ref": 2 }',
              },
            },
            required: ['name', 'type'],
          },
        },
        required: ['character_id', 'item'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_item',
      description: 'Remove an item from a character by item id.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          item_id: { type: 'string' },
        },
        required: ['character_id', 'item_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_roll',
      description:
        'Ask the table to roll dice (guidance only). Prefer roll_kind skill or stat with character_id + skill_id/stat from CHARACTERS_JSON so the app builds the same 1d10+bonus as the sheet. raw_formula + formula for freeform rolls.',
      parameters: {
        type: 'object',
        properties: {
          roll_kind: {
            type: 'string',
            enum: ['skill', 'stat', 'raw_formula'],
            description:
              'skill = character_id + skill_id (sheet math). stat = character_id + stat key. raw_formula = formula string only.',
          },
          formula: {
            type: 'string',
            description: 'Required for raw_formula; optional hint otherwise. e.g. 1d10+8',
          },
          reason: { type: 'string', description: 'Situation / what the roll is for' },
          character_id: { type: 'string', description: 'UUID from CHARACTERS_JSON' },
          skill_id: { type: 'string', description: 'UUID of skill on that character (skills[].id)' },
          stat: {
            type: 'string',
            description: 'For roll_kind stat: int, ref, tech, cool, attr, luck, ma, bt, emp',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'move_token',
      description: 'Move a map token to percentage coordinates (0–100).',
      parameters: {
        type: 'object',
        properties: {
          token_id: { type: 'string' },
          x: { type: 'number', minimum: 0, maximum: 100 },
          y: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['token_id', 'x', 'y'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_token',
      description:
        'Place a new token on the battle map (NPC, object, hazard, or a PC marker). Use controlled_by gm for neutral or GM-owned markers; use player with character_id to anchor a player character token.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Label on the map' },
          x: { type: 'number', minimum: 0, maximum: 100, description: 'Horizontal position 0–100 (default 50)' },
          y: { type: 'number', minimum: 0, maximum: 100, description: 'Vertical position 0–100 (default 50)' },
          image_url: { type: 'string', description: 'Optional portrait URL' },
          controlled_by: {
            type: 'string',
            enum: ['gm', 'player'],
            description: 'gm = GM-controlled marker; player = tied to character_id',
          },
          character_id: { type: 'string', description: 'Required when controlled_by is player' },
          size: { type: 'number', minimum: 20, maximum: 120, description: 'Token diameter in pixels (default 50)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_token',
      description: 'Remove a token from the map (defeated NPC, destroyed object, etc.).',
      parameters: {
        type: 'object',
        properties: {
          token_id: { type: 'string', description: 'UUID from MAP_TOKENS_JSON' },
        },
        required: ['token_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_scenery',
      description: 'Update the active scene description/situation in the session.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Sensory/environment description' },
          situation: { type: 'string', description: 'What is happening right now' },
          location: { type: 'string', description: 'Place name' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'play_narration',
      description: 'Post a narration line to session chat (use for mid-tool beats if needed).',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_rules',
      description:
        'Search the table\'s loaded CP2020 lore snippets (keyword match). Use this whenever the player asks how a rule works, wants a "refresh" on mechanics, or asks about armor/SP/BTM/combat/dice/etc. before answering.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_character_field',
      description:
        'Update a single dot-path field on a character (e.g. reputation, damage). Use only for simple fields you understand.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          path: { type: 'string', description: 'Dot path such as reputation or isStunned' },
          value: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'object' },
              { type: 'array' },
            ],
            description: 'New value for the field',
          },
        },
        required: ['character_id', 'path', 'value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_money',
      description: 'Add eurobucks to a character (rewards, loot, payment received).',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          amount: { type: 'number', minimum: 0 },
        },
        required: ['character_id', 'amount'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'heal_damage',
      description:
        'Reduce damage points on a character (medical attention, rest, first aid). Heals by the given amount, clamped to 0.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          amount: { type: 'number', minimum: 1, description: 'Damage points to heal' },
        },
        required: ['character_id', 'amount'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'roll_dice',
      description:
        'Roll dice server-side (for NPC actions, random events, hit location, etc.). Posts the result as a chat message. Formula examples: 1d10, 3d6, 2d6+3, 1d10x10. Prefix with flat: for non-exploding d10 (saves).',
      parameters: {
        type: 'object',
        properties: {
          formula: { type: 'string', description: 'Dice formula, e.g. 1d10, 3d6+2, flat:1d10' },
          reason: { type: 'string', description: 'Why this roll is being made' },
          character_id: { type: 'string', description: 'Optional: character or NPC performing the roll' },
        },
        required: ['formula'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'equip_item',
      description:
        'Toggle a character item equipped/unequipped. Triggers armor SP recalculation for hit locations.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          item_id: { type: 'string' },
          equipped: { type: 'boolean', description: 'true to equip, false to unequip' },
        },
        required: ['character_id', 'item_id', 'equipped'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'modify_skill',
      description:
        'Set a skill value by skill name (case-insensitive match). Use for IP spending, training, or temporary bonuses. Value 0–10.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          skill_name: { type: 'string', description: 'Skill name (case-insensitive)' },
          new_value: { type: 'number', minimum: 0, maximum: 10, description: 'New skill value' },
        },
        required: ['character_id', 'skill_name', 'new_value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_ammo',
      description:
        'Set shots remaining for a weapon. Pass shots_left for an absolute value, or reload:true to restore to full magazine capacity.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          weapon_id: { type: 'string', description: 'Item ID of the weapon' },
          shots_left: { type: 'number', minimum: 0, description: 'New shots remaining' },
          reload: { type: 'boolean', description: 'If true, restore to full magazine (ignores shots_left)' },
        },
        required: ['character_id', 'weapon_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_condition',
      description:
        'Add or remove a persistent status condition on a character. "stunned" toggles only isStunned (not stored in conditions[]). Other conditions are persisted in conditions[] with optional duration and synced to all clients. Specify duration_rounds when CP2020 rules define one (e.g. Dazzle grenade = blinded 12 rounds, Sonic grenade = deafened 12 rounds, Incendiary = on_fire 9 rounds). CP2020 conditions: unconscious, asleep, blinded, on_fire, grappled, prone, deafened, poisoned, drugged, cyberpsychosis.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          condition: {
            type: 'string',
            description: 'Condition name (e.g. stunned, unconscious, asleep, blinded, on_fire, grappled, prone, deafened, poisoned, drugged, cyberpsychosis)',
          },
          active: { type: 'boolean', description: 'true to apply, false to remove' },
          duration_rounds: {
            type: 'integer',
            description: 'Optional duration in combat rounds (~3s each). Omit or null for indefinite conditions. CP2020 "turns" = 3 rounds.',
          },
        },
        required: ['character_id', 'condition', 'active'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_summary',
      description:
        'Update the session summary text. Use to persist important story events so context survives long sessions.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'New session summary text (replaces existing)' },
        },
        required: ['summary'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'spawn_npc',
      description:
        'Same as spawn_random_npc: disposable CP2020 **Fast Character System** NPC (2D6 stats, 40-pt career, book armor/weapon table). Prefer spawn_random_npc for name clarity. For named bosses or canon characters with GM-defined stats/skills/gear, use spawn_unique_npc instead.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Display name; omit for an auto-generated label (role + number)',
          },
          role: {
            type: 'string',
            enum: ['Solo', 'Rockerboy', 'Netrunner', 'Media', 'Nomad', 'Fixer', 'Cop', 'Corp', 'Techie', 'Medtechie'],
            description: 'CP2020 role; omit for a random role',
          },
          threat: {
            type: 'string',
            enum: ['mook', 'average', 'capable', 'elite'],
            description:
              'Power tier: shifts all stats (−1 mook … +2 elite), then applies stat_overrides. Capable/elite add 2D10 pickup skill points (Fast NPC advanced package).',
          },
          stat_overrides: {
            type: 'object',
            description: 'Optional base stats 2–10 after threat adjustment (keys: int, ref, tech, cool, attr, luck, ma, bt, emp)',
            properties: {
              int: { type: 'number' },
              ref: { type: 'number' },
              tech: { type: 'number' },
              cool: { type: 'number' },
              attr: { type: 'number' },
              luck: { type: 'number' },
              ma: { type: 'number' },
              bt: { type: 'number' },
              emp: { type: 'number' },
            },
          },
          place_token: {
            type: 'boolean',
            description: 'If true (default), add a GM token on the map at a random position',
          },
          announce: {
            type: 'boolean',
            description: 'If true (default), post a system line introducing the NPC (name, role, threat, gear)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'spawn_random_npc',
      description:
        'Create a **generic** CP2020 NPC via the book Fast Character System (random or guided mooks, guards, crowd). Random 2D6 stats, career package, table gear. Use spawn_unique_npc for important named NPCs (bosses, Adam Smasher–style builds) where you set stats, special ability name/value, custom skills, and items.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Display name; omit for an auto-generated label (role + number)',
          },
          role: {
            type: 'string',
            enum: ['Solo', 'Rockerboy', 'Netrunner', 'Media', 'Nomad', 'Fixer', 'Cop', 'Corp', 'Techie', 'Medtechie'],
            description: 'CP2020 role; omit for a random role',
          },
          threat: {
            type: 'string',
            enum: ['mook', 'average', 'capable', 'elite'],
            description:
              'Power tier: shifts all stats (−1 mook … +2 elite), then applies stat_overrides. Capable/elite add 2D10 pickup skill points.',
          },
          stat_overrides: {
            type: 'object',
            description: 'Optional base stats 2–10 after threat adjustment (keys: int, ref, tech, cool, attr, luck, ma, bt, emp)',
            properties: {
              int: { type: 'number' },
              ref: { type: 'number' },
              tech: { type: 'number' },
              cool: { type: 'number' },
              attr: { type: 'number' },
              luck: { type: 'number' },
              ma: { type: 'number' },
              bt: { type: 'number' },
              emp: { type: 'number' },
            },
          },
          place_token: {
            type: 'boolean',
            description: 'If true (default), add a GM token on the map at a random position',
          },
          announce: {
            type: 'boolean',
            description: 'If true (default), post a system line introducing the NPC',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'spawn_unique_npc',
      description:
        'Create a **GM-authored** NPC sheet: you choose base stats (2–10 each, default 6), special ability name and value, arbitrary skills (including custom skill names and linked stats), and items. Use for bosses, legend NPCs, or any character where random Fast generation is wrong. Items: type weapon supports weapon_type, damage (dice string e.g. "4d6"), range, shots, rof, ap, attack_skill; type armor supports coverage object with keys Head/Torso/rArm/lArm/rLeg/lLeg each having stopping_power and ablation; type cyberware supports cyberware_type, humanity_loss, stat_mods. Then use add_item if you need to refine gear after spawn.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name (required)' },
          role: {
            type: 'string',
            enum: ['Solo', 'Rockerboy', 'Netrunner', 'Media', 'Nomad', 'Fixer', 'Cop', 'Corp', 'Techie', 'Medtechie'],
            description: 'Sheet role (defines typical hooks; you still set special_ability freely)',
          },
          stats: {
            type: 'object',
            description: 'Optional bases 2–10; omitted stats default to 6',
            properties: {
              int: { type: 'number' },
              ref: { type: 'number' },
              tech: { type: 'number' },
              cool: { type: 'number' },
              attr: { type: 'number' },
              luck: { type: 'number' },
              ma: { type: 'number' },
              bt: { type: 'number' },
              emp: { type: 'number' },
            },
          },
          special_ability: {
            type: 'object',
            description: 'Role special line on the sheet (e.g. Combat Sense 10, or a custom label for homebrew)',
            properties: {
              name: { type: 'string' },
              value: { type: 'number', description: '0–10' },
            },
            required: ['name', 'value'],
          },
          skills: {
            type: 'array',
            description: 'Skill rows; use any skill name. linked_stat defaults to ref, category defaults to Custom',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'number', description: '0–10' },
                linked_stat: {
                  type: 'string',
                  enum: ['int', 'ref', 'tech', 'cool', 'attr', 'luck', 'ma', 'bt', 'emp'],
                },
                category: { type: 'string' },
                is_chipped: { type: 'boolean' },
                is_special_ability: { type: 'boolean' },
              },
              required: ['name', 'value'],
            },
          },
          items: {
            type: 'array',
            description: 'Gear rows (weapon/armor/cyberware/misc/vehicle/program). See tool description for fields.',
            items: { type: 'object' },
          },
          age: { type: 'number' },
          reputation: { type: 'number' },
          improvement_points: { type: 'number' },
          eurobucks: { type: 'number' },
          damage: { type: 'number', description: 'Starting wound track 0–41' },
          image_url: { type: 'string' },
          combat_modifiers: {
            type: 'object',
            properties: {
              initiative: { type: 'number' },
              stun_save: { type: 'number' },
            },
          },
          announcement_text: {
            type: 'string',
            description: 'Optional custom system chat line; default summarizes name, role, and gear',
          },
          place_token: { type: 'boolean', description: 'Default true: GM map token' },
          announce: { type: 'boolean', description: 'Default true: post intro to chat' },
        },
        required: ['name', 'role', 'special_ability'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_chat_as_npc',
      description: 'Post an in-character dialogue line from a named NPC to the session chat.',
      parameters: {
        type: 'object',
        properties: {
          npc_name: { type: 'string', description: 'Display name of the NPC speaking' },
          text: { type: 'string', description: 'What the NPC says' },
        },
        required: ['npc_name', 'text'],
      },
    },
  },
];
