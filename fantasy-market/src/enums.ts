// Single source of truth for enum values. The host registers this object as the adapter's
// `enums` map, and the world seeder assigns these numeric constants to entity properties.

export const ENUMS = {
    // Importance presets used in viv source
    HIGH: 5,
    CRITICAL: 8,

    // Composure
    FRIGHTENED: 3,

    // Location kinds
    STALL: 100,
    SQUARE: 101,
    TAVERN: 102,
    HOME: 103,
    GUARD_POST: 104,
    ALLEY: 105,

    // Character roles
    VENDOR: 200,
    CUSTOMER: 201,
    GUARD: 202,
    NIGHTWATCH: 203,
    DRUNKARD: 204,
    URCHIN: 205,
    NOBLE: 206,
    PRIEST: 207,

    // Item kinds
    BRAZIER: 300,
    OIL_JAR: 301,
    LANTERN: 302,
    TORCH: 303,
    COIN_PURSE: 304,
    WARE: 305,
} as const satisfies Record<string, number>;
