import { EntityType, type CharacterView, type EntityView, type ItemView, type LocationView, type UID } from "@siftystudio/viv-runtime";
import { ENUMS } from "./enums.js";

export interface MmoLocation extends LocationView {
    readonly entityType: EntityType.Location;
    readonly id: UID;
    name: string;
    kind: number;
    parent: UID | null;
    contents: UID[];
    mob_pack: UID[];
    quest_giver: UID | null;
    respawn_point: UID | null;
}

export interface MmoItem extends ItemView {
    readonly entityType: EntityType.Item;
    readonly id: UID;
    name: string;
    kind: number;
    slot: number | null;
    holder: UID | null;
    location: UID | null;
    stats: { str: number; agi: number; int_: number; sta: number; spi: number };
    required_level: number;
    quest_id: UID | null;
    inscriptions: UID[];
}

export interface MmoCharacter extends CharacterView {
    readonly entityType: EntityType.Character;
    readonly id: UID;
    name: string;
    role: number;
    class_: number;
    location: UID;
    home_town: UID;

    level: number;
    xp: number;
    abilities: string[];
    ability_cooldowns: Record<string, number>;

    str: number;
    agi: number;
    int_: number;
    sta: number;
    spi: number;
    hp: number;
    hp_max: number;
    mp: number;
    mp_max: number;

    alive: boolean;
    corpse_run_ticks_remaining: number | null;
    last_corpse_location: UID | null;
    threat: Record<UID, number>;

    party: UID | null;
    party_role: number | null;

    active_quests: string[];
    completed_quests: string[];
    daily_quest_last_accepted: Record<string, number>;
    has_active_quest: boolean;
    quest_kill_count: number;
    quest_target: number;

    inventory: UID[];
    equipped: Record<number, UID | null>;
    gold: number;

    mood: number;
    fatigue: number;
    composure: number | null;
    alertness: number;
    memories: CharacterView["memories"];
}

export interface World {
    locations: UID[];
    characters: UID[];
    items: UID[];
    actions: UID[];
    entities: Record<UID, EntityView>;
}

class Rand {
    private s: number;
    constructor(seed: number) { this.s = seed >>> 0 || 1; }
    next(): number {
        let x = this.s;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.s = x >>> 0;
        return (this.s % 100000) / 100000;
    }
    int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
    pick<T>(xs: readonly T[]): T { return xs[this.int(0, xs.length - 1)]!; }
    chance(p: number): boolean { return this.next() < p; }
}

const FIRST_NAMES = ["Alice", "Bob", "Carol", "David", "Emma", "Frank", "Grace", "Henry", "Iris", "Jack"];
const LAST_NAMES = ["Smith", "Johnson", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas"];

let idCounter = 0;
const uid = (kind: string) => `${kind}-${(++idCounter).toString(36)}`;

function makeName(r: Rand): string { return `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`; }

function newLoc(id: UID, name: string, kind: number, parent: UID | null = null): MmoLocation {
    return {
        entityType: EntityType.Location,
        id, name, kind, parent,
        contents: [],
        mob_pack: [],
        quest_giver: null,
        respawn_point: null,
    };
}

function newChar(id: UID, name: string, role: number, class_: number, home: UID, location: UID): MmoCharacter {
    const sta = 10;
    const hp_max = sta * 10 + 1 * 5;
    const mp_max = 5 * 5 + 5 * 5;
    return {
        entityType: EntityType.Character,
        id, name, role, class_, location, home_town: home,
        level: 1,
        xp: 0,
        abilities: [],
        ability_cooldowns: {},
        str: 5,
        agi: 5,
        int_: 5,
        sta,
        spi: 5,
        hp: hp_max,
        hp_max,
        mp: mp_max,
        mp_max,
        alive: true,
        corpse_run_ticks_remaining: null,
        last_corpse_location: null,
        threat: {},
        party: null,
        party_role: null,
        active_quests: [],
        completed_quests: [],
        daily_quest_last_accepted: {},
        has_active_quest: false,
        quest_kill_count: 0,
        quest_target: 0,
        inventory: [],
        equipped: {},
        gold: 0,
        mood: 0,
        fatigue: 0,
        composure: null,
        alertness: 3,
        memories: {},
    };
}

function newItem(id: UID, name: string, kind: number, location: UID | null = null): MmoItem {
    return {
        entityType: EntityType.Item,
        id, name, kind,
        slot: null,
        holder: null,
        location,
        stats: { str: 0, agi: 0, int_: 0, sta: 0, spi: 0 },
        required_level: 1,
        quest_id: null,
        inscriptions: [],
    };
}

export interface SeedOptions {
    seed: number;
    nPlayers: number;
    nQuestGivers: number;
    nTowns: number;
    nDungeons?: number;
    mobsPerDungeon?: number;
}

export function seedWorld(opts: SeedOptions): World {
    const r = new Rand(opts.seed);
    const entities: Record<UID, EntityView> = {};
    const locations: UID[] = [];
    const characters: UID[] = [];
    const items: UID[] = [];

    const nDungeons       = opts.nDungeons       ?? Math.max(1, opts.nTowns);
    const mobsPerDungeon  = opts.mobsPerDungeon  ?? 4;

    // Towns + town squares.
    const towns: UID[] = [];
    for (let i = 0; i < opts.nTowns; i++) {
        const townId = uid("town");
        entities[townId] = newLoc(townId, `Town ${i + 1}`, ENUMS.TOWN);
        locations.push(townId);
        towns.push(townId);

        const squareId = uid("loc");
        entities[squareId] = newLoc(squareId, `Square of ${(entities[townId] as any).name}`, ENUMS.TOWN_SQUARE, townId);
        locations.push(squareId);
    }

    // Dungeons: entrance → floor → boss room.
    const dungeonFloors: UID[] = [];
    const bossRooms: UID[] = [];
    for (let d = 0; d < nDungeons; d++) {
        const entranceId = uid("dungeon");
        entities[entranceId] = newLoc(entranceId, `Dungeon ${d + 1} Entrance`, ENUMS.DUNGEON_ENTRANCE);
        locations.push(entranceId);

        const floorId = uid("loc");
        entities[floorId] = newLoc(floorId, `Dungeon ${d + 1} Floor`, ENUMS.DUNGEON_FLOOR, entranceId);
        locations.push(floorId);
        dungeonFloors.push(floorId);

        const bossId = uid("loc");
        entities[bossId] = newLoc(bossId, `Dungeon ${d + 1} Boss Room`, ENUMS.BOSS_ROOM, entranceId);
        locations.push(bossId);
        bossRooms.push(bossId);
    }

    // Players (start in town).
    for (let i = 0; i < opts.nPlayers; i++) {
        const id = uid("char");
        const home = r.pick(towns);
        const loc = home;
        const cls = [ENUMS.WARRIOR, ENUMS.MAGE, ENUMS.CLERIC, ENUMS.ROGUE][i % 4]!;
        const ch = newChar(id, makeName(r), ENUMS.PLAYER, cls, home, loc);
        // Roughly half the party should be at the dungeon to keep combat alive.
        if (i % 2 === 1 && dungeonFloors.length > 0) {
            (ch as any).location = r.pick(dungeonFloors);
        }
        entities[id] = ch;
        characters.push(id);
    }

    // Quest givers (in town).
    for (let i = 0; i < opts.nQuestGivers; i++) {
        const id = uid("char");
        const home = r.pick(towns);
        const ch = newChar(id, makeName(r), ENUMS.NPC_QUEST_GIVER, ENUMS.WARRIOR, home, home);
        entities[id] = ch;
        characters.push(id);
    }

    // Mobs (one pack per dungeon floor).
    for (const floorId of dungeonFloors) {
        for (let m = 0; m < mobsPerDungeon; m++) {
            const id = uid("char");
            const ch = newChar(id, `Goblin ${m + 1}`, ENUMS.MOB, ENUMS.MOB_CLASS_GENERIC, floorId, floorId);
            ch.hp = 10;
            ch.hp_max = 10;
            ch.str = 2;
            ch.gold = 5;
            entities[id] = ch;
            characters.push(id);
            (entities[floorId] as MmoLocation).mob_pack.push(id);
        }
    }

    // Bosses (one per boss room).
    for (const bossId of bossRooms) {
        const id = uid("char");
        const ch = newChar(id, `Dungeon Lord`, ENUMS.BOSS, ENUMS.MOB_CLASS_GENERIC, bossId, bossId);
        ch.hp = 30;
        ch.hp_max = 30;
        ch.str = 4;
        ch.gold = 50;
        entities[id] = ch;
        characters.push(id);
    }

    return { locations, characters, items, actions: [], entities };
}
