// Simplified test version to debug hangs

import { randomUUID } from "node:crypto";
import set from "lodash/set.js";

import {
    EntityType,
    initializeVivRuntime,
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

const STATE: {
    timestamp: DiegeticTimestamp;
    entities: Record<UID, EntityView>;
    characters: UID[];
    locations: UID[];
    items: UID[];
    actions: UID[];
    vivInternalState: VivInternalState | null;
} = {
    timestamp: 0 as DiegeticTimestamp,
    entities: {},
    characters: [],
    locations: [],
    items: [],
    actions: [],
    vivInternalState: null,
};

function clone<T>(x: T): T { return structuredClone(x); }

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
    functions: {},
    debug: { validateAPICalls: true, watchlists: {} },
};

function createWorld(): void {
    const townId = "town-1";
    STATE.locations.push(townId);
    STATE.entities[townId] = {
        entityType: EntityType.Location,
        id: townId,
        name: "Town",
    };

    for (let i = 0; i < 3; i++) {
        const id = `char-${i}`;
        STATE.characters.push(id);
        STATE.entities[id] = {
            entityType: EntityType.Character,
            id,
            name: `Char${i}`,
            location: townId,
            alive: true,
            mood: 0,
            memories: {},
        };
    }
}

async function main(): Promise<void> {
    console.log("Initializing runtime...");
    initializeVivRuntime({ contentBundle: CONTENT_BUNDLE, adapter: ADAPTER });
    console.log("Creating world...");
    createWorld();
    console.log(`Created ${STATE.characters.length} characters at ${STATE.locations.length} locations`);

    console.log("Test complete.");
}

main().catch(err => { console.error(err); process.exit(1); });
