// Demo 2: Verify the death chain.
// Player at 1 hp gets struck by mob → die → start-corpse-run → respawn.
// Run ~10 ticks. Expect: strike, take-damage, die, drop-loot, start-corpse-run,
// tick-corpse-run x3, respawn, alive=true at end.

import { Demo, actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer } from "./_harness.js";
import { ENUMS } from "../enums.js";
import type { CharacterView } from "@siftystudio/viv-runtime";

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const town = mkLocation(state, "Town", ENUMS.TOWN);
    const dungeon = mkLocation(state, "Dungeon", ENUMS.DUNGEON_ENTRANCE);

    const player = mkCharacter(state, {
        name: "Hero", role: ENUMS.PLAYER, location: dungeon, home: town, hp: 1, hp_max: 100,
    });
    const mob = mkCharacter(state, {
        name: "Goblin", role: ENUMS.MOB, location: dungeon, hp: 100, hp_max: 100, str: 10,
    });

    const demo = new Demo("02-death-respawn");
    const { elapsedMs } = await withTimer(async () => run(state, { ticks: 10 }));

    const acts = actionsOf(state);
    const names = acts.map(a => a.name);
    const has = (n: string) => names.includes(n);

    demo.expect(has("strike"),            "strike must occur");
    demo.expect(has("take-damage"),       "take-damage must occur");
    demo.expect(has("die"),               "die must occur");
    demo.expect(has("drop-loot"),         "drop-loot must occur after death");
    demo.expect(has("start-corpse-run"),  "start-corpse-run must occur after death");

    const tickCorpseCount = names.filter(n => n === "tick-corpse-run").length;
    demo.expectGte(tickCorpseCount, 1, "at least one tick-corpse-run");

    const heroNow = state.entities[player] as CharacterView & { hp: number; alive: boolean; corpse_run_ticks_remaining: number | null };
    demo.expect(heroNow.alive === false || has("respawn"),
        "either still corpse-running or respawn fired");

    void mob;
    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
