import { EntityType, type CharacterView, type EntityView, type ItemView, type LocationView, type UID } from "@siftystudio/viv-runtime";
import { ENUMS } from "./enums.js";

export type Role = typeof ENUMS["VENDOR"] | typeof ENUMS["CUSTOMER"] | typeof ENUMS["GUARD"]
    | typeof ENUMS["NIGHTWATCH"] | typeof ENUMS["DRUNKARD"] | typeof ENUMS["URCHIN"]
    | typeof ENUMS["NOBLE"] | typeof ENUMS["PRIEST"];

export interface MarketLocation extends LocationView {
    readonly entityType: EntityType.Location;
    readonly id: UID;
    name: string;
    kind: number;
    owner: UID | null;
    parent: UID | null;
    flammable: boolean;
    wares: UID[];
}

export interface MarketItem extends ItemView {
    readonly entityType: EntityType.Item;
    readonly id: UID;
    name: string;
    kind: number;
    holder: UID | null;
    location: UID | null;
    lit: boolean;
    oil_level: number;
    inscriptions: UID[];
}

export interface MarketCharacter extends CharacterView {
    readonly entityType: EntityType.Character;
    readonly id: UID;
    name: string;
    role: number;
    home: UID;
    location: UID;
    stall: UID | null;
    inventory: UID[];

    wealth: number;
    debts_owed: number;
    wares_unsold: number;
    hunger: number;
    sleepiness: number;

    mood: number;
    intoxication: number;
    fatigue: number;
    health: number;
    composure: number | null;

    pride: number;
    piety: number;
    thrift: number;
    generosity: number;
    honor: number;
    courage: number;
    recklessness: number;
    secrecy: number;

    shame: number;
    desperation: number;
    paranoia: number;
    alertness: number;
    reputation: number;

    grudges: Record<UID, number>;
    vengefulness: Record<UID, number>;
    debts_to: Record<UID, number>;
    affection: Record<UID, number>;
    rivalry: Record<UID, number>;
    suspicions: Record<UID, number>;
    fear: Record<UID, number>;
    respect: Record<UID, number>;

    pursued_target: UID | null;

    memories: CharacterView["memories"];
}

export interface World {
    locations: UID[];
    characters: UID[];
    items: UID[];
    actions: UID[];
    entities: Record<UID, EntityView>;
    square: UID;
    tavern: UID;
    guardPost: UID;
    stalls: UID[];
    homes: UID[];
}

class Rand {
    private s: number;
    constructor(seed: number) { this.s = seed >>> 0 || 1; }
    next(): number {
        // xorshift32
        let x = this.s;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.s = x >>> 0;
        return (this.s % 100000) / 100000;
    }
    int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
    pick<T>(xs: readonly T[]): T { return xs[this.int(0, xs.length - 1)]!; }
    chance(p: number): boolean { return this.next() < p; }
}

const FIRST = ["Ada","Bren","Cal","Dora","Edmun","Fenn","Gwen","Hal","Iva","Jor","Kael","Lira","Mira","Nor","Osric","Pell","Quill","Rana","Sten","Tira","Una","Vex","Wren","Xan","Yara","Zane","Aldwin","Brisa","Cedric","Daphne","Elric","Faye","Garth","Hilda","Idris","Jensa","Kerrin","Lyra","Marek","Nessa","Orin","Petra","Rhett","Saska","Thorn","Ursa","Vance","Wynn"];
const LAST = ["Ash","Briar","Coal","Down","Elm","Fern","Gale","Hawk","Ink","Jade","Knot","Loam","Moss","Nett","Oak","Pyre","Quay","Rook","Stone","Thorn","Urn","Vale","Wick","Yew"];

let counter = 0;
const uid = (kind: string) => `${kind}-${(++counter).toString(36)}`;

function makeName(r: Rand): string { return `${r.pick(FIRST)} ${r.pick(LAST)}`; }

function newChar(id: UID, name: string, role: number, home: UID, location: UID, r: Rand, stall: UID | null = null): MarketCharacter {
    return {
        entityType: EntityType.Character,
        id, name, role, home, location, stall,
        inventory: [],
        wealth: r.int(2, 8),
        debts_owed: 0,
        wares_unsold: stall ? r.int(3, 12) : 0,
        hunger: r.int(0, 4),
        sleepiness: r.int(0, 3),
        mood: r.int(0, 5),
        intoxication: 0,
        fatigue: r.int(0, 3),
        health: 10,
        composure: null,
        pride: r.int(2, 8),
        piety: r.int(0, 8),
        thrift: r.int(2, 8),
        generosity: r.int(0, 8),
        honor: r.int(2, 9),
        courage: r.int(2, 8),
        recklessness: r.int(0, 6),
        secrecy: r.int(0, 6),
        shame: 0,
        desperation: r.int(0, 3),
        paranoia: r.int(0, 5),
        alertness: r.int(2, 6),
        reputation: r.int(0, 6),
        grudges: {},
        vengefulness: {},
        debts_to: {},
        affection: {},
        rivalry: {},
        suspicions: {},
        fear: {},
        respect: {},
        pursued_target: null,
        memories: {},
    };
}

function newLoc(id: UID, name: string, kind: number, parent: UID | null, owner: UID | null = null): MarketLocation {
    return {
        entityType: EntityType.Location, id, name, kind, owner, parent, flammable: false, wares: [],
    };
}

function newItem(id: UID, name: string, kind: number, location: UID | null, holder: UID | null = null, lit = false, oil_level = 0): MarketItem {
    return {
        entityType: EntityType.Item, id, name, kind, holder, location, lit, oil_level, inscriptions: [],
    };
}

export interface SeedOptions {
    seed: number;
    nVendors: number;
    nCustomers: number;
    nGuards: number;
    nNightwatch: number;
    nDrunkards: number;
    nUrchins: number;
    nNobles: number;
    nPriests: number;
    nStalls: number;
    nTaverns: number;
    nHomes: number;
}

export function seedWorld(opts: SeedOptions): World {
    const r = new Rand(opts.seed);
    const entities: Record<UID, EntityView> = {};
    const locations: UID[] = [];
    const characters: UID[] = [];
    const items: UID[] = [];

    // Square (parent of stalls), tavern, guard-post
    const square = uid("loc");
    entities[square] = newLoc(square, "Market Square", ENUMS.SQUARE, null);
    locations.push(square);
    const tavern = uid("loc");
    entities[tavern] = newLoc(tavern, "The Burning Stag", ENUMS.TAVERN, null);
    locations.push(tavern);
    const guardPost = uid("loc");
    entities[guardPost] = newLoc(guardPost, "Watch House", ENUMS.GUARD_POST, null);
    locations.push(guardPost);

    // Stalls
    const stalls: UID[] = [];
    for (let i = 0; i < opts.nStalls; i++) {
        const id = uid("loc");
        entities[id] = newLoc(id, `Stall #${i + 1}`, ENUMS.STALL, square);
        locations.push(id);
        stalls.push(id);
    }
    // Homes
    const homes: UID[] = [];
    for (let i = 0; i < opts.nHomes; i++) {
        const id = uid("loc");
        entities[id] = newLoc(id, `Home #${i + 1}`, ENUMS.HOME, null);
        locations.push(id);
        homes.push(id);
    }

    function spawnRole(role: number, count: number, defaultLoc: UID, opts?: { stall?: boolean }) {
        for (let i = 0; i < count; i++) {
            const id = uid("c");
            const home = r.pick(homes);
            let stall: UID | null = null;
            if (opts?.stall && stalls.length > 0) {
                stall = stalls[i % stalls.length]!;
                (entities[stall] as MarketLocation).owner = id;
            }
            const loc = stall ?? defaultLoc;
            const ch = newChar(id, makeName(r), role, home, loc, r, stall);
            entities[id] = ch;
            characters.push(id);
        }
    }
    spawnRole(ENUMS.VENDOR, Math.min(opts.nVendors, opts.nStalls), square, { stall: true });
    spawnRole(ENUMS.CUSTOMER, opts.nCustomers, square);
    spawnRole(ENUMS.GUARD, opts.nGuards, guardPost);
    spawnRole(ENUMS.NIGHTWATCH, opts.nNightwatch, guardPost);
    spawnRole(ENUMS.DRUNKARD, opts.nDrunkards, tavern);
    spawnRole(ENUMS.URCHIN, opts.nUrchins, square);
    spawnRole(ENUMS.NOBLE, opts.nNobles, square);
    spawnRole(ENUMS.PRIEST, opts.nPriests, square);

    // Distribute items: every stall gets a brazier + an oil jar; some have lanterns.
    function placeItem(name: string, kind: number, location: UID, lit = false, oil = 0) {
        const id = uid("i");
        entities[id] = newItem(id, name, kind, location, null, lit, oil);
        (entities[location] as MarketLocation).wares.push(id);
        items.push(id);
        return id;
    }
    for (const stall of stalls) {
        placeItem("brazier", ENUMS.BRAZIER, stall);
        placeItem("oil-jar", ENUMS.OIL_JAR, stall, false, 4);
        if (r.chance(0.4)) placeItem("lantern", ENUMS.LANTERN, stall);
        for (let k = 0; k < r.int(2, 5); k++) placeItem("ware", ENUMS.WARE, stall);
    }
    // Nightwatch: each carries a torch
    for (const cid of characters) {
        const c = entities[cid] as MarketCharacter;
        if (c.role === ENUMS.NIGHTWATCH) {
            const id = uid("i");
            entities[id] = newItem(id, "torch", ENUMS.TORCH, null, cid, true, 0);
            c.inventory.push(id);
            items.push(id);
        }
    }
    // Vendors: each carries a small coin purse
    for (const cid of characters) {
        const c = entities[cid] as MarketCharacter;
        if (c.role === ENUMS.VENDOR) {
            const id = uid("i");
            entities[id] = newItem(id, "coin-purse", ENUMS.COIN_PURSE, null, cid, false, 0);
            c.inventory.push(id);
            items.push(id);
        }
    }

    return { locations, characters, items, actions: [], entities, square, tavern, guardPost, stalls, homes };
}
