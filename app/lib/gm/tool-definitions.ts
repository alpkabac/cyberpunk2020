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
        'Ask the table to roll dice (guidance only). Does not roll server-side; persists a system message with suggested formula.',
      parameters: {
        type: 'object',
        properties: {
          formula: { type: 'string', description: 'Dice formula suggestion, e.g. REF+Melee+1d10' },
          reason: { type: 'string' },
          character_id: { type: 'string', description: 'Optional focus character' },
        },
        required: ['formula'],
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
];
