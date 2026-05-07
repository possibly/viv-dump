// Item tables: kinds, drop rates, stat profiles.

export interface ItemTemplate {
    id: string;
    name: string;
    kind: number;
    slot: number | null;
    stats: { str: number; agi: number; int_: number; sta: number; spi: number };
    required_level: number;
}

export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
    "rusty-sword": {
        id: "rusty-sword",
        name: "Rusty Sword",
        kind: 400, // WEAPON
        slot: 413, // SLOT_MAIN_HAND
        stats: { str: 2, agi: 0, int_: 0, sta: 0, spi: 0 },
        required_level: 1,
    },
    "iron-sword": {
        id: "iron-sword",
        name: "Iron Sword",
        kind: 400,
        slot: 413,
        stats: { str: 4, agi: 0, int_: 0, sta: 0, spi: 0 },
        required_level: 5,
    },
    "steel-armor": {
        id: "steel-armor",
        name: "Steel Armor",
        kind: 401, // ARMOR
        slot: 411, // SLOT_CHEST
        stats: { str: 1, agi: 0, int_: 0, sta: 3, spi: 0 },
        required_level: 5,
    },
    "mage-staff": {
        id: "mage-staff",
        name: "Mage's Staff",
        kind: 400,
        slot: 413,
        stats: { str: 0, agi: 0, int_: 3, sta: 0, spi: 2 },
        required_level: 5,
    },
    "cleric-mace": {
        id: "cleric-mace",
        name: "Cleric Mace",
        kind: 400,
        slot: 413,
        stats: { str: 2, agi: 0, int_: 0, sta: 1, spi: 2 },
        required_level: 5,
    },
    "dagger": {
        id: "dagger",
        name: "Dagger",
        kind: 400,
        slot: 414, // SLOT_OFF_HAND
        stats: { str: 1, agi: 2, int_: 0, sta: 0, spi: 0 },
        required_level: 1,
    },
};

// Drop tables: what mobs drop at what level ranges
export const DROP_TABLES: Record<string, { weight: number }[]> = {
    "level-1-3": [
        { weight: 50 }, // 50% chance of rusty-sword
        { weight: 30 }, // 30% chance of nothing
        { weight: 20 }, // 20% chance of dagger
    ],
    "level-5-10": [
        { weight: 40 }, // iron-sword
        { weight: 30 }, // steel-armor
        { weight: 20 }, // mage-staff
        { weight: 10 }, // nothing
    ],
};

export function pickDropForLevel(level: number): string | null {
    if (level >= 5) {
        const table = DROP_TABLES["level-5-10"]!;
        const items = ["iron-sword", "steel-armor", "mage-staff", null];
        const total = table.reduce((s, t) => s + t.weight, 0);
        let roll = Math.random() * total;
        for (let i = 0; i < table.length; i++) {
            roll -= table[i]!.weight;
            if (roll <= 0) return items[i] ?? null;
        }
        return null;
    } else {
        const table = DROP_TABLES["level-1-3"]!;
        const items = ["rusty-sword", null, "dagger"];
        const total = table.reduce((s, t) => s + t.weight, 0);
        let roll = Math.random() * total;
        for (let i = 0; i < table.length; i++) {
            roll -= table[i]!.weight;
            if (roll <= 0) return items[i] ?? null;
        }
        return null;
    }
}
