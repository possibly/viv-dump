// Demo 8: A cleric resurrects a fallen ally before respawn fires.
// Setup: hero (1 hp) + mob in dungeon → mob kills hero. A cleric is co-located
// and casts cast-resurrect. Verify resurrect-target fires AND respawn does NOT
// fire (because corpse_run_ticks_remaining was reset).

import { Demo, actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer } from "./_harness.js";
import { ENUMS } from "../enums.js";
import type { CharacterView } from "@siftystudio/viv-runtime";

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const dungeon = mkLocation(state, "Dungeon", ENUMS.DUNGEON_FLOOR);

    // Pre-kill the hero so the cleric has the entire run to cast resurrect.
    // (Combat-induced death is exercised in demo 02.)
    const hero = mkCharacter(state, {
        name: "Hero", role: ENUMS.PLAYER, location: dungeon, hp: 0, hp_max: 100, str: 5,
    });
    Object.assign(state.entities[hero] as any, {
        alive: false,
        corpse_run_ticks_remaining: 20,
        last_corpse_location: dungeon,
    });
    const cleric = mkCharacter(state, {
        name: "Priestess", role: ENUMS.PLAYER, location: dungeon, class_: ENUMS.CLERIC,
        hp: 100, hp_max: 100,
    });
    (state.entities[cleric] as any).mp = 100;
    (state.entities[cleric] as any).mp_max = 100;

    const demo = new Demo("08-resurrection");
    const { elapsedMs } = await withTimer(async () => run(state, { ticks: 10 }));

    const acts = actionsOf(state);
    const has = (n: string) => acts.some(a => a.name === n);

    demo.expect(has("cast-resurrect"),    "cleric cast resurrect");
    demo.expect(has("resurrect-target"),  "resurrect-target fired");

    const heroNow = state.entities[hero] as CharacterView & { alive: boolean; hp: number };
    demo.expectEq(heroNow.alive, true, "hero alive after resurrect");
    demo.expect(heroNow.hp > 0, "hero hp > 0 after resurrect");
    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
