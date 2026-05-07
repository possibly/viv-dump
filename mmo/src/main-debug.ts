// Debug version: trace selectAction step-by-step

import { randomUUID } from "node:crypto";
import set from "lodash/set.js";

import {
    EntityType,
    initializeVivRuntime,
    selectAction,
    tickPlanner,
    type ActionView,
    type CharacterView,
    type DiegeticTimestamp,
    type EntityView,
    type HostApplicationAdapter,
    type TimeOfDay,
    type UID,
    type VivInternalState,
} from "@siftystudio/viv-runtime";

import { CONTENT_BUNDLE } from "./content/index.js";
import { ENUMS } from "./enums.js";
import { dayOf, hourOf, TICK_MINUTES, timeOfDayOf } from "./clock.js";
import { seedWorld, type World } from "./world.js";

const SEED = 1;
const SCALE = "phase-a";

const SCALES = {
    "phase-a": { nPlayers: 2, nQuestGivers: 1, nTowns: 1 },
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
} = {
    timestamp: 0 as DiegeticTimestamp,
    entities: {},
    characters: [],
    locations: [],
    items: [],
    actions: [],
    vivInternalState: null,
    world: null,
};

function clone<T>(x: T): T { return structuredClone(x); }

let selectActionCallCount = 0;

const HOST_FUNCTIONS = {
    "is-night-now": () => {
        const h = hourOf(STATE.timestamp);
        return h >= 21 || h < 5;
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
        const c = STATE.entities[cid];
        if (!c) throw new Error(`No character: ${cid}`);
        (c as CharacterView).memories[aid] = memory;
    },
    saveItemInscriptions: (iid, inscriptions) => {
        const i = STATE.entities[iid];
        if (!i) throw new Error(`No item: ${iid}`);
        (i as any).inscriptions = inscriptions;
    },
    getVivInternalState: () => STATE.vivInternalState ? clone(STATE.vivInternalState) : null,
    saveVivInternalState: (s) => { STATE.vivInternalState = clone(s); },
    getEntityIDs: (type, locationID) => {
        if (locationID) {
            if (type === EntityType.Character) {
                const chars = STATE.characters.filter(id => (STATE.entities[id] as CharacterView)?.location === locationID);
                console.log(`    [getEntityIDs] CHARACTER at location ${locationID}: ${chars.length} found`);
                return chars;
            }
            if (type === EntityType.Item) {
                return STATE.items.filter(id => (STATE.entities[id] as any)?.location === locationID);
            }
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

async function main(): Promise<void> {
    console.log("=== Initializing ===");
    initializeVivRuntime({ contentBundle: CONTENT_BUNDLE, adapter: ADAPTER });
    STATE.world = seedWorld(SCALES["phase-a"]);
    Object.assign(STATE.entities, STATE.world.entities);
    STATE.locations = STATE.world.locations.slice();
    STATE.characters = STATE.world.characters.slice();
    STATE.items = STATE.world.items.slice();
    STATE.actions = STATE.world.actions.slice();

    console.log(`Characters: ${STATE.characters.length}`);
    for (const cid of STATE.characters) {
        const c = STATE.entities[cid] as CharacterView;
        console.log(`  ${cid}: ${c.name} at location ${c.location}`);
    }

    console.log("\nLocations:");
    for (const lid of STATE.locations) {
        const l = STATE.entities[lid] as any;
        console.log(`  ${lid}: ${l.name}`);
    }

    console.log("\n=== Starting ticks ===");
    const maxTicks = 2;
    for (let t = 0; t < maxTicks; t++) {
        console.log(`\nTick ${t}: timestamp=${STATE.timestamp}`);
        const order = STATE.characters.slice();
        for (let i = 0; i < order.length; i++) {
            const cid = order[i]!;
            const c = STATE.entities[cid] as CharacterView;
            console.log(`  Character ${c.name} (${cid}):`);
            selectActionCallCount += 1;
            console.log(`    Calling selectAction (call #${selectActionCallCount})...`);
            try {
                const startTime = Date.now();
                const timeout = setTimeout(() => {
                    console.log(`    >>> TIMEOUT! selectAction hanging after 5 seconds <<<`);
                    process.exit(1);
                }, 5000);

                await selectAction({ initiatorID: cid });

                clearTimeout(timeout);
                const elapsed = Date.now() - startTime;
                console.log(`    selectAction returned in ${elapsed}ms, actions now: ${STATE.actions.length}`);
            } catch (e) {
                console.log(`    selectAction error: ${e}`);
            }
        }
        console.log(`  tickPlanner...`);
        await tickPlanner();
        STATE.timestamp = (STATE.timestamp + TICK_MINUTES) as DiegeticTimestamp;
    }

    console.log(`\n=== Done ===`);
    console.log(`Total actions: ${STATE.actions.length}`);
    console.log(`Last 5:`);
    for (const aid of STATE.actions.slice(-5)) {
        const a = STATE.entities[aid] as ActionView;
        console.log(`  ${a.name}: ${a.gloss}`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
