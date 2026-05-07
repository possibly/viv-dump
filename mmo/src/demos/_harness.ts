// Shared demo harness: minimal world setup + tick runner + assertion helpers.
// Designed for fast (<1s) targeted scenario verification.

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

import { CONTENT_BUNDLE } from "../content/index.js";
import { ENUMS } from "../enums.js";
import { TICK_MINUTES, timeOfDayOf, hourOf } from "../clock.js";

export interface DemoState {
    timestamp: DiegeticTimestamp;
    entities: Record<UID, EntityView>;
    characters: UID[];
    locations: UID[];
    items: UID[];
    actions: UID[];
    vivInternalState: VivInternalState | null;
}

export function newState(): DemoState {
    return {
        timestamp: 0 as DiegeticTimestamp,
        entities: {},
        characters: [],
        locations: [],
        items: [],
        actions: [],
        vivInternalState: null,
    };
}

function clone<T>(x: T): T { return structuredClone(x); }

export function makeAdapter(state: DemoState): HostApplicationAdapter {
    return {
        provisionActionID: () => randomUUID(),
        getEntityView: (id) => {
            const e = state.entities[id];
            if (!e) throw new Error(`No entity: ${id}`);
            return clone(e);
        },
        getEntityLabel: (id) => {
            const e = state.entities[id];
            if (!e) return id;
            return (e as { name?: string }).name ?? id;
        },
        updateEntityProperty: (id, path, value) => {
            const e = state.entities[id];
            if (!e) throw new Error(`No entity: ${id}`);
            set(e as object, path as string[], value);
        },
        saveActionData: (id, data) => {
            if (!state.entities[id]) state.actions.push(id);
            state.entities[id] = data;
        },
        saveCharacterMemory: (cid, aid, memory) => {
            const c = state.entities[cid];
            if (!c) throw new Error(`No character: ${cid}`);
            (c as CharacterView).memories[aid] = memory;
        },
        saveItemInscriptions: (iid, inscriptions) => {
            const i = state.entities[iid];
            if (!i) throw new Error(`No item: ${iid}`);
            (i as any).inscriptions = inscriptions;
        },
        getVivInternalState: () => state.vivInternalState ? clone(state.vivInternalState) : null,
        saveVivInternalState: (s) => { state.vivInternalState = clone(s); },
        getEntityIDs: (type, locationID) => {
            if (locationID) {
                if (type === EntityType.Character) {
                    return state.characters.filter(id => (state.entities[id] as CharacterView)?.location === locationID);
                }
                if (type === EntityType.Item) {
                    return state.items.filter(id => (state.entities[id] as any)?.location === locationID);
                }
                throw new Error(`Invalid entity type for location query: ${type}`);
            }
            switch (type) {
                case EntityType.Character: return [...state.characters];
                case EntityType.Item:      return [...state.items];
                case EntityType.Location:  return [...state.locations];
                case EntityType.Action:    return [...state.actions];
                default: throw new Error(`Invalid entity type: ${type}`);
            }
        },
        getCurrentTimestamp: () => state.timestamp,
        getCurrentTimeOfDay: (): TimeOfDay => timeOfDayOf(state.timestamp),
        enums: ENUMS,
        functions: {
            "is-night-now": () => {
                const h = hourOf(state.timestamp);
                return h >= 21 || h < 5;
            },
        },
        debug: { validateAPICalls: true, watchlists: {} },
    };
}

export function initRuntime(state: DemoState): void {
    initializeVivRuntime({ contentBundle: CONTENT_BUNDLE, adapter: makeAdapter(state) });
}

let __id = 0;
export function uid(prefix: string): UID { return `${prefix}-${(++__id).toString(36)}`; }

// ---------- entity factories ----------

export function mkLocation(state: DemoState, name: string, kind: number): UID {
    const id = uid("loc");
    state.entities[id] = {
        entityType: EntityType.Location,
        id, name, kind,
        parent: null,
        contents: [],
        mob_pack: [],
        quest_giver: null,
        respawn_point: null,
    } as any;
    state.locations.push(id);
    return id;
}

export interface CharOpts {
    name: string;
    role: number;
    class_?: number;
    location: UID;
    home?: UID;
    hp?: number;
    hp_max?: number;
    level?: number;
    str?: number;
    abilities?: string[];
}

export function mkCharacter(state: DemoState, opts: CharOpts): UID {
    const id = uid("char");
    const hp_max = opts.hp_max ?? 100;
    state.entities[id] = {
        entityType: EntityType.Character,
        id,
        name: opts.name,
        role: opts.role,
        class_: opts.class_ ?? ENUMS.WARRIOR,
        location: opts.location,
        home_town: opts.home ?? opts.location,
        level: opts.level ?? 1,
        xp: 0,
        abilities: opts.abilities ?? [],
        ability_cooldowns: {},
        str: opts.str ?? 5,
        agi: 5,
        int_: 5,
        sta: 10,
        spi: 5,
        hp: opts.hp ?? hp_max,
        hp_max,
        mp: 50,
        mp_max: 50,
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
    } as any;
    state.characters.push(id);
    return id;
}

export interface ItemOpts {
    name: string;
    kind: number;
    location?: UID | null;
    holder?: UID | null;
}

export function mkItem(state: DemoState, opts: ItemOpts): UID {
    const id = uid("item");
    state.entities[id] = {
        entityType: EntityType.Item,
        id,
        name: opts.name,
        kind: opts.kind,
        slot: null,
        holder: opts.holder ?? null,
        location: opts.location ?? null,
        stats: { str: 0, agi: 0, int_: 0, sta: 0, spi: 0 },
        required_level: 1,
        quest_id: null,
        inscriptions: [],
    } as any;
    state.items.push(id);
    return id;
}

// ---------- tick runner ----------

export interface RunOptions {
    ticks: number;
    log?: boolean;
    perTickHook?: (state: DemoState, t: number) => void | Promise<void>;
}

async function drainUrgent(cid: UID): Promise<void> {
    // Repeatedly target urgent-only queue until empty (or error/null returned).
    for (let safety = 0; safety < 64; safety++) {
        try {
            const res = await selectAction({ initiatorID: cid, urgentOnly: true });
            if (!res) return;
        } catch {
            return;
        }
    }
}

export async function run(state: DemoState, opts: RunOptions): Promise<void> {
    for (let t = 0; t < opts.ticks; t++) {
        if (opts.perTickHook) await opts.perTickHook(state, t);
        const order = state.characters.slice();
        // First pass: general action selection per character (includes one queued action).
        for (const cid of order) {
            try { await selectAction({ initiatorID: cid }); } catch { /* selector misses ok */ }
        }
        // Drain urgent queues until quiescent (handles multi-level reaction chains).
        for (let pass = 0; pass < 8; pass++) {
            let any = false;
            for (const cid of order) {
                const before = state.actions.length;
                await drainUrgent(cid);
                if (state.actions.length > before) any = true;
            }
            if (!any) break;
        }
        await tickPlanner();
        state.timestamp = (state.timestamp + TICK_MINUTES) as DiegeticTimestamp;
        if (opts.log) {
            const last = state.actions[state.actions.length - 1];
            if (last) {
                const a = state.entities[last] as ActionView;
                console.log(`  t${t}: ${a.name} :: ${a.gloss}`);
            }
        }
    }
}

// ---------- assertion + reporting ----------

export interface DemoResult {
    name: string;
    passed: boolean;
    failures: string[];
    actionCounts: Record<string, number>;
    elapsedMs: number;
}

export function actionCountsOf(state: DemoState): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const aid of state.actions) {
        const a = state.entities[aid] as ActionView;
        counts[a.name] = (counts[a.name] ?? 0) + 1;
    }
    return counts;
}

export function actionsOf(state: DemoState): ActionView[] {
    return state.actions.map(aid => state.entities[aid] as ActionView);
}

export class Demo {
    public failures: string[] = [];
    constructor(public name: string) {}

    expect(cond: boolean, msg: string) {
        if (!cond) this.failures.push(msg);
    }

    expectEq<T>(actual: T, expected: T, msg: string) {
        if (actual !== expected) this.failures.push(`${msg}: expected ${expected}, got ${actual}`);
    }

    expectGte(actual: number, expected: number, msg: string) {
        if (actual < expected) this.failures.push(`${msg}: expected ≥${expected}, got ${actual}`);
    }

    expectLte(actual: number, expected: number, msg: string) {
        if (actual > expected) this.failures.push(`${msg}: expected ≤${expected}, got ${actual}`);
    }

    print(state: DemoState, elapsedMs: number): DemoResult {
        const counts = actionCountsOf(state);
        const passed = this.failures.length === 0;
        const status = passed ? "PASS" : "FAIL";
        console.log(`[${status}] ${this.name}  (${elapsedMs}ms, ${state.actions.length} actions)`);
        const summary = Object.entries(counts).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k}:${v}`).join(" ");
        if (summary) console.log(`       ${summary}`);
        for (const f of this.failures) console.log(`       ✗ ${f}`);
        return { name: this.name, passed, failures: this.failures, actionCounts: counts, elapsedMs };
    }
}

export async function withTimer<T>(fn: () => Promise<T>): Promise<{ result: T; elapsedMs: number }> {
    const start = Date.now();
    const result = await fn();
    return { result, elapsedMs: Date.now() - start };
}
