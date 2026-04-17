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
      description: 'Add a gear item to a character inventory.',
      parameters: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          item: {
            type: 'object',
            description: 'Item fields; id optional (server-generated if omitted)',
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
