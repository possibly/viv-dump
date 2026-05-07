import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
    type LocationView,
    type TimeOfDay,
    type UID,
    type VivInternalState,
} from "@siftystudio/viv-runtime";

import { CONTENT_BUNDLE } from "./content/index.js";
import { ENUMS } from "./enums.js";
import { dayOf, hourOf, TICK_MINUTES, timeOfDayOf } from "./clock.js";
import { seedWorld, type MmoCharacter, type World } from "./world.js";

const SEED = Number.parseInt(process.env.MMO_SEED ?? "1", 10);
const DAYS = Number.parseInt(process.env.MMO_DAYS ?? "1", 10);
const SCALE = (process.env.MMO_SCALE ?? "phase-a") as "phase-a" | "phase-b" | "full";

const SCALES = {
    "phase-a": { nPlayers: 5, nQuestGivers: 2, nTowns: 1 },
    "phase-b": { nPlayers: 30, nQuestGivers: 6, nTowns: 2 },
    "full":    { nPlayers: 120, nQuestGivers: 15, nTowns: 4 },
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
                return STATE.characters.filter(id => (STATE.entities[id] as CharacterView)?.location === locationID);
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

function exportSnapshot() {
    const snapshot = {
        schemaVersion: "0.10.2",
        timestamp: STATE.timestamp,
        entities: STATE.entities,
        vivInternalState: STATE.vivInternalState,
    };
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const outDir = resolve(__dirname, "..", "public");
    mkdirSync(outDir, { recursive: true });
    const filename = `chronicle-seed${SEED}-scale${SCALE}-${new Date().toISOString().split("T")[0]}.json`;
    const outPath = resolve(outDir, filename);
    try {
        writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf-8");
        console.log(`\n=== Exported snapshot to ${filename} ===`);
    } catch (e) {
        console.error(`Failed to export snapshot: ${e}`);
    }
}

async function main(): Promise<void> {
    const cfg = SCALES[SCALE];
    console.log(`[seed=${SEED} scale=${SCALE} days=${DAYS}] initializing...`);

    initializeVivRuntime({ contentBundle: CONTENT_BUNDLE, adapter: ADAPTER });
    STATE.world = seedWorld(cfg);
    Object.assign(STATE.entities, STATE.world.entities);
    STATE.locations = STATE.world.locations.slice();
    STATE.characters = STATE.world.characters.slice();
    STATE.items = STATE.world.items.slice();
    STATE.actions = STATE.world.actions.slice();

    console.log(`characters=${STATE.characters.length} locations=${STATE.locations.length} items=${STATE.items.length}`);

    const ticks = DAYS * 24 * 60;
    console.log(`Starting tick loop: ${ticks} ticks`);
    let lastDay = -1;
    let progressInterval = Math.max(1, Math.floor(ticks / 10));
    for (let t = 0; t < ticks; t++) {
        const day = dayOf(STATE.timestamp);
        if (day !== lastDay) {
            console.log(`  [day ${day}]`);
            lastDay = day;
        }
        if (t > 0 && t % progressInterval === 0) {
            console.log(`  tick ${t}/${ticks}, actions: ${STATE.actions.length}`);
        }

        const order = STATE.characters.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < order.length; i++) {
            const cid = order[i]!;
            try {
                await selectAction({ initiatorID: cid });
            } catch (e) {
                // ignore action errors
            }
        }
        try {
            await tickPlanner();
        } catch (e) {
            console.error(`tickPlanner failed: ${e}`);
            throw e;
        }
        STATE.timestamp = (STATE.timestamp + TICK_MINUTES) as DiegeticTimestamp;
    }
    console.log(`Tick loop complete.`);

    console.log(`\n=== Chronicle (${STATE.actions.length} actions) ===`);
    for (const aid of STATE.actions.slice(-10)) {
        const a = STATE.entities[aid] as ActionView;
        console.log(`  [d${dayOf(a.timestamp).toString().padStart(2, " ")} ${hourOf(a.timestamp).toString().padStart(2, "0")}h] ${a.gloss ?? a.name}`);
    }

    exportSnapshot();
}

main().catch(err => { console.error(err); process.exit(1); });
