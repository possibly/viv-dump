// Demo 9: Sift the chronicle for the "hero-falls-in-the-dungeon" pattern after a kill.
// Setup: hero (1 hp) + mob killer in dungeon → hero dies. Then run sifting pattern.
// Expect: at least one match where @hero is bound to the player and @death is the die action.

import { Demo, actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer } from "./_harness.js";
import { ENUMS } from "../enums.js";
import { runSiftingPattern } from "@siftystudio/viv-runtime";

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const dungeon = mkLocation(state, "Dungeon", ENUMS.DUNGEON_FLOOR);

    const hero = mkCharacter(state, {
        name: "Hero", role: ENUMS.PLAYER, location: dungeon, hp: 1, hp_max: 100, str: 1,
    });
    const mob = mkCharacter(state, {
        name: "Goblin", role: ENUMS.MOB, location: dungeon, hp: 100, hp_max: 100, str: 10,
    });

    const demo = new Demo("09-sift-hero-falls");
    const { elapsedMs } = await withTimer(async () => run(state, { ticks: 4 }));

    const acts = actionsOf(state);
    demo.expect(acts.some(a => a.name === "die"), "die fired");

    let matchCount = 0;
    for (let i = 0; i < 10; i++) {
        const m = await runSiftingPattern({ patternName: "hero-falls-in-the-dungeon" });
        if (!m) break;
        matchCount += 1;
    }

    demo.expectGte(matchCount, 1, "sifting pattern matched at least once");

    void mob;
    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
