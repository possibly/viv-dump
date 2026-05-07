// Ability table: learnable skills

export interface Ability {
    id: string;
    name: string;
    level_required: number;
    mp_cost: number;
    cooldown_ticks: number;
    kind: "melee" | "spell" | "heal";
    class_: number; // ENUMS.WARRIOR | etc. or 0 for any
}

export const ABILITIES: Record<string, Ability> = {
    "strike": {
        id: "strike",
        name: "Strike",
        level_required: 1,
        mp_cost: 0,
        cooldown_ticks: 6,
        kind: "melee",
        class_: 0, // any class
    },
    "fireball": {
        id: "fireball",
        name: "Fireball",
        level_required: 5,
        mp_cost: 15,
        cooldown_ticks: 30,
        kind: "spell",
        class_: 302, // MAGE
    },
    "heal": {
        id: "heal",
        name: "Heal",
        level_required: 3,
        mp_cost: 10,
        cooldown_ticks: 20,
        kind: "heal",
        class_: 303, // CLERIC
    },
    "resurrect": {
        id: "resurrect",
        name: "Resurrect",
        level_required: 10,
        mp_cost: 30,
        cooldown_ticks: 120,
        kind: "heal",
        class_: 303, // CLERIC
    },
};

export function abilitiesAtLevel(level: number, class_: number): string[] {
    const result: string[] = [];
    for (const [id, ability] of Object.entries(ABILITIES)) {
        if (ability.level_required <= level && (ability.class_ === 0 || ability.class_ === class_)) {
            result.push(id);
        }
    }
    return result;
}
