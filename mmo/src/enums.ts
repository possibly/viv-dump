// Single source of truth for enum values.

export const ENUMS = {
    // Importance presets used in viv source
    HIGH: 5,
    CRITICAL: 8,

    // Location kinds
    TOWN: 100,
    TOWN_SQUARE: 101,
    NPC_HALL: 102,
    TAVERN: 103,
    DUNGEON_ENTRANCE: 104,
    DUNGEON_FLOOR: 105,
    BOSS_ROOM: 106,
    CORPSE_GROUND: 107,
    PARTY: 108,

    // Character roles
    PLAYER: 200,
    NPC_QUEST_GIVER: 201,
    NPC_VENDOR: 202,
    NPC_HEALER: 203,
    MOB: 204,
    BOSS: 205,

    // Character classes
    WARRIOR: 301,
    MAGE: 302,
    CLERIC: 303,
    ROGUE: 304,
    MOB_CLASS_GENERIC: 305,
    MOB_CLASS_CASTER: 306,

    // Party roles
    PARTY_TANK: 310,
    PARTY_DPS: 311,
    PARTY_HEAL: 312,

    // Item kinds
    WEAPON: 400,
    ARMOR: 401,
    TRINKET: 402,
    QUEST_ITEM: 403,
    CONSUMABLE: 404,
    CORPSE_MARKER: 405,

    // Item slots
    SLOT_HEAD: 410,
    SLOT_CHEST: 411,
    SLOT_LEGS: 412,
    SLOT_MAIN_HAND: 413,
    SLOT_OFF_HAND: 414,
    SLOT_TRINKET: 415,

    // Ability IDs (string keys in actual table, but we expose enums for ref)
    ABILITY_STRIKE: 501,
    ABILITY_FIREBALL: 502,
    ABILITY_HEAL: 503,
    ABILITY_RESURRECT: 504,
} as const satisfies Record<string, number>;
