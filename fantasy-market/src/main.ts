import { randomUUID } from "node:crypto";
import set from "lodash/set.js";

import {
    EntityType,
    initializeVivRuntime,
    queuePlan,
    runSiftingPattern,
    selectAction,
    tickPlanner,
    type ActionView,
    type CharacterView,
    type DiegeticTimestamp,
    type EntityView,
    type HostApplicationAdapter,
    type LocationView,
    type TimeOfDay,
    type UID,
    type VivInternalState,
} from "@siftystudio/viv-runtime";

import { CONTENT_BUNDLE } from "./content/index.js";
import { ENUMS } from "./enums.js";
import { dayOf, hourOf, isNight, TICK_MINUTES, timeOfDayOf } from "./clock.js";
import { seedWorld, type MarketCharacter, type MarketLocation, type World } from "./world.js";

const SEED = Number.parseInt(process.env.FM_SEED ?? "1", 10);
const DAYS = Number.parseInt(process.env.FM_DAYS ?? "30", 10);
const SCALE = (process.env.FM_SCALE ?? "phase-a") as "phase-a" | "phase-b" | "full";

const SCALES = {
    "phase-a": { nVendors: 5, nCustomers: 8, nGuards: 2, nNightwatch: 2, nDrunkards: 3, nUrchins: 3, nNobles: 1, nPriests: 1, nStalls: 5, nTaverns: 1, nHomes: 12 },
    "phase-b": { nVendors: 30, nCustomers: 80, nGuards: 8, nNightwatch: 6, nDrunkards: 10, nUrchins: 15, nNobles: 6, nPriests: 4, nStalls: 30, nTaverns: 2, nHomes: 60 },
    "full":    { nVendors: 70, nCustomers: 260, nGuards: 30, nNightwatch: 20, nDrunkards: 30, nUrchins: 50, nNobles: 25, nPriests: 15, nStalls: 60, nTaverns: 3, nHomes: 120 },
} as const;

const STATE: {
    timestamp: DiegeticTimestamp;
    entities: Record<UID, EntityView>;
    characters: UID[];
    locations: UID[];
    items: UID[];
    actions: UID[];
    vivInternalState: VivInternalState | null;
    world: World | null;
    activeVendettaAvenger: UID | null;
} = {
    timestamp: 0 as DiegeticTimestamp,
    entities: {},
    characters: [],
    locations: [],
    items: [],
    actions: [],
    vivInternalState: null,
    world: null,
    activeVendettaAvenger: null,
};

function clone<T>(x: T): T { return structuredClone(x); }

function getCharacter(id: UID): MarketCharacter {
    const e = STATE.entities[id];
    if (!e || e.entityType !== EntityType.Character) throw new Error(`not a character: ${id}`);
    return e as MarketCharacter;
}
function getLocation(id: UID): MarketLocation {
    const e = STATE.entities[id];
    if (!e || e.entityType !== EntityType.Location) throw new Error(`not a location: ${id}`);
    return e as MarketLocation;
}

function isCharRole(id: UID, role: number): boolean {
    const e = STATE.entities[id];
    return !!e && e.entityType === EntityType.Character && (e as MarketCharacter).role === role;
}

function charactersAt(locationID: UID): UID[] {
    return STATE.characters.filter(id => (STATE.entities[id] as CharacterView)?.location === locationID);
}

const HOST_FUNCTIONS = {
    "is-night-now": () => isNight(STATE.timestamp),
    "is-day-now": () => !isNight(STATE.timestamp),
    "is-night-at": (timestamp: unknown) => {
        const t = typeof timestamp === "number" ? timestamp : Number(timestamp);
        if (!Number.isFinite(t)) return false;
        return isNight(t);
    },
    "no-watch-at": (locationID: unknown) => {
        if (typeof locationID !== "string") return true;
        for (const cid of charactersAt(locationID)) {
            if (isCharRole(cid, ENUMS.GUARD) || isCharRole(cid, ENUMS.NIGHTWATCH)) return false;
        }
        return true;
    },
    "move-to": (characterID: unknown, locationID: unknown) => {
        if (typeof characterID !== "string" || typeof locationID !== "string") return false;
        const c = STATE.entities[characterID] as CharacterView | undefined;
        if (!c) return false;
        (c as MarketCharacter).location = locationID;
        return true;
    },
    "move-to-tavern": (characterID: unknown) => {
        if (typeof characterID !== "string") return false;
        const taverns = STATE.locations.filter(id => (STATE.entities[id] as MarketLocation)?.kind === ENUMS.TAVERN);
        if (taverns.length === 0) return false;
        const dest = taverns[Math.floor(Math.random() * taverns.length)]!;
        (STATE.entities[characterID] as MarketCharacter).location = dest;
        return true;
    },
    "move-to-random-stall": (characterID: unknown) => {
        if (typeof characterID !== "string") return false;
        const stalls = STATE.locations.filter(id => (STATE.entities[id] as MarketLocation)?.kind === ENUMS.STALL);
        if (stalls.length === 0) return false;
        const dest = stalls[Math.floor(Math.random() * stalls.length)]!;
        (STATE.entities[characterID] as MarketCharacter).location = dest;
        return true;
    },
};

const ADAPTER: HostApplicationAdapter = {
    provisionActionID: () => randomUUID(),
    getEntityView: (id) => {
        const e = STATE.entities[id];
        if (!e) throw new Error(`No entity: ${id}`);
        return clone(e);
    },
    getEntityLabel: (id) => {
        const e = STATE.entities[id];
        if (!e) return id;
        return (e as { name?: string }).name ?? id;
    },
    updateEntityProperty: (id, path, value) => {
        const e = STATE.entities[id];
        if (!e) throw new Error(`No entity: ${id}`);
        set(e as object, path as string[], value);
    },
    saveActionData: (id, data) => {
        if (!STATE.entities[id]) STATE.actions.push(id);
        STATE.entities[id] = data;
    },
    saveCharacterMemory: (cid, aid, memory) => {
        const c = STATE.entities[cid] as CharacterView | undefined;
        if (!c) throw new Error(`No character: ${cid}`);
        (c.memories as Record<UID, unknown>)[aid] = memory;
    },
    saveItemInscriptions: (iid, inscriptions) => {
        const i = STATE.entities[iid];
        if (!i) throw new Error(`No item: ${iid}`);
        (i as { inscriptions?: UID[] }).inscriptions = inscriptions;
    },
    getVivInternalState: () => STATE.vivInternalState ? clone(STATE.vivInternalState) : null,
    saveVivInternalState: (s) => { STATE.vivInternalState = clone(s); },
    getEntityIDs: (type, locationID) => {
        if (locationID) {
            if (type === EntityType.Character) return charactersAt(locationID);
            if (type === EntityType.Item) return STATE.items.filter(id => (STATE.entities[id] as { location?: UID })?.location === locationID);
            throw new Error(`Invalid entity type for location query: ${type}`);
        }
        switch (type) {
            case EntityType.Character: return [...STATE.characters];
            case EntityType.Item:      return [...STATE.items];
            case EntityType.Location:  return [...STATE.locations];
            case EntityType.Action:    return [...STATE.actions];
            default: throw new Error(`Invalid entity type: ${type}`);
        }
    },
    getCurrentTimestamp: () => STATE.timestamp,
    getCurrentTimeOfDay: (): TimeOfDay => timeOfDayOf(STATE.timestamp),
    enums: ENUMS,
    functions: HOST_FUNCTIONS,
    debug: { validateAPICalls: true, watchlists: {} },
};

// ----- Daily vendetta enrollment ------------------------------------------------

function findVendettaCandidate(): { avenger: UID; target: UID } | null {
    if (STATE.activeVendettaAvenger) return null;
    for (const aid of STATE.characters) {
        const a = getCharacter(aid);
        if (a.honor > 3) continue;
        if (a.piety > 3) continue;
        if (a.secrecy < 6) continue;
        if (a.courage < 6) continue;
        if (a.recklessness < 4) continue;
        if (a.shame < 5) continue;
        if (a.desperation < 7) continue;
        if (a.hunger < 5) continue;
        for (const tid of Object.keys(a.vengefulness)) {
            if ((a.vengefulness[tid] ?? 0) < 8) continue;
            if ((a.grudges[tid] ?? 0) < 7) continue;
            const t = STATE.entities[tid] as MarketCharacter | undefined;
            if (!t || t.role !== ENUMS.VENDOR || !t.stall) continue;
            const debtsTo = a.debts_to[tid] ?? 0;
            if (debtsTo < 6 && a.wealth > 2) continue;
            return { avenger: aid, target: tid };
        }
    }
    return null;
}

async function dailyVendettaCheck() {
    const cand = findVendettaCandidate();
    if (!cand) return;
    try {
        await queuePlan({ planName: "vendetta", precastBindings: { avenger: [cand.avenger], target: [cand.target] } });
        STATE.activeVendettaAvenger = cand.avenger;
        const a = getCharacter(cand.avenger);
        const t = getCharacter(cand.target);
        console.log(`[day ${dayOf(STATE.timestamp)}] vendetta enrolled: ${a.name} -> ${t.name}`);
    } catch (e) {
        // queuePlan can fail validation; that's fine, we'll try again tomorrow
    }
}

// ----- Drift: nudge the soup so a vendetta path can ever ripen -------------------

function softDrift() {
    // Each tick, slightly raise hunger/fatigue and decay intoxication.
    for (const cid of STATE.characters) {
        const c = getCharacter(cid);
        c.fatigue = Math.min(10, c.fatigue + (isNight(STATE.timestamp) ? 0.05 : 0.02));
        c.intoxication = Math.max(0, c.intoxication - 0.1);
        c.hunger = Math.min(10, c.hunger + 0.02);
    }
}

function dailyMisfortune() {
    // Random vendor pair background drift: minor shame and grudge updates.
    const vendors = STATE.characters.filter(id => isCharRole(id, ENUMS.VENDOR));
    if (vendors.length >= 2) {
        const i = Math.floor(Math.random() * vendors.length);
        let j = Math.floor(Math.random() * vendors.length);
        while (j === i) j = Math.floor(Math.random() * vendors.length);
        const a = getCharacter(vendors[i]!);
        const b = getCharacter(vendors[j]!);
        const loser = a.wealth <= b.wealth ? a : b;
        const winner = loser === a ? b : a;
        loser.wealth = Math.max(0, loser.wealth - 0.5);
        loser.shame += 0.2;
        loser.desperation += 0.1;
        loser.grudges[winner.id] = (loser.grudges[winner.id] ?? 0) + 0.15;
    }
}

// ----- Main loop ---------------------------------------------------------------

async function main() {
    initializeVivRuntime({ contentBundle: CONTENT_BUNDLE, adapter: ADAPTER });
    const cfg = SCALES[SCALE];
    STATE.world = seedWorld({ seed: SEED, ...cfg });
    Object.assign(STATE.entities, STATE.world.entities);
    STATE.locations = STATE.world.locations.slice();
    STATE.characters = STATE.world.characters.slice();
    STATE.items = STATE.world.items.slice();
    STATE.actions = STATE.world.actions.slice();

    console.log(`[seed=${SEED} scale=${SCALE} days=${DAYS}] characters=${STATE.characters.length} locations=${STATE.locations.length} items=${STATE.items.length}`);

    const ticks = DAYS * 24;
    let lastDay = -1;
    for (let t = 0; t < ticks; t++) {
        const day = dayOf(STATE.timestamp);
        if (day !== lastDay) {
            await dailyVendettaCheck();
            dailyMisfortune();
            lastDay = day;
        }
        softDrift();
        // Shuffle for fairness
        const order = STATE.characters.slice().sort(() => Math.random() - 0.5);
        for (const cid of order) {
            // Skip sleeping nightwatch during day, sleeping civilians at night, etc.
            const c = getCharacter(cid);
            const night = isNight(STATE.timestamp);
            const watch = c.role === ENUMS.NIGHTWATCH;
            const guard = c.role === ENUMS.GUARD;
            if (night && !watch && c.role !== ENUMS.DRUNKARD && c.role !== ENUMS.URCHIN && Math.random() < 0.85) continue;
            if (!night && watch && Math.random() < 0.7) continue;
            if (!night && guard && Math.random() < 0.2) continue;
            try {
                await selectAction({ initiatorID: cid });
            } catch (e) {
                // Ignore per-character action selection errors; let the soup keep simmering.
            }
        }
        await tickPlanner();
        STATE.timestamp = (STATE.timestamp + TICK_MINUTES) as DiegeticTimestamp;
    }

    console.log(`\n=== Chronicle (${STATE.actions.length} actions) ===`);
    for (const aid of STATE.actions.slice(-30)) {
        const a = STATE.entities[aid] as ActionView;
        console.log(`  [d${dayOf(a.timestamp).toString().padStart(2, " ")} ${hourOf(a.timestamp).toString().padStart(2, "0")}h] ${a.gloss ?? a.name}`);
    }

    // Sift!
    console.log(`\n=== Sifting "market-stall-burns-at-night" ===`);
    let matches = 0;
    while (true) {
        const m = await runSiftingPattern({ patternName: "market-stall-burns-at-night" });
        if (!m) break;
        matches += 1;
        const stallID = m["stall"]?.[0];
        const keeperID = m["keeper"]?.[0];
        const arsonistID = m["arsonist"]?.[0];
        const ignitionID = m["ignition"]?.[0];
        if (!stallID || !keeperID || !arsonistID || !ignitionID) break;
        const stall = STATE.entities[stallID] as MarketLocation;
        const keeper = STATE.entities[keeperID] as MarketCharacter;
        const arsonist = STATE.entities[arsonistID] as MarketCharacter;
        const ignition = STATE.entities[ignitionID] as ActionView;
        console.log(`  match #${matches}: ${arsonist.name} sets fire to ${keeper.name}'s ${stall.name} on day ${dayOf(ignition.timestamp)} hour ${hourOf(ignition.timestamp)}.`);
        // Single sifting match — no second pass needed for now.
        break;
    }
    if (matches === 0) console.log("  (no matches — the kingdom slept soundly this month.)");
    console.log();
}

main().catch(err => { console.error(err); process.exit(1); });
