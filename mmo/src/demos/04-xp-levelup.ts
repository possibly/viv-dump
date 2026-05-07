// Demo 4: Verify XP is awarded on mob kill and level-up triggers at threshold.
// Setup: 1 player (high str), 5 weak mobs (1 hp each, sequential kills).
// Each kill = +10 xp. level 1 → 2 needs 50 xp = 5 kills.

import { Demo, actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer } from "./_harness.js";
import { ENUMS } from "../enums.js";
import type { CharacterView } from "@siftystudio/viv-runtime";

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const dungeon = mkLocation(state, "Dungeon", ENUMS.DUNGEON_FLOOR);

    const player = mkCharacter(state, {
        name: "Hero", role: ENUMS.PLAYER, location: dungeon, hp: 100, hp_max: 100, str: 50,
    });
    const mobs: string[] = [];
    for (let i = 0; i < 6; i++) {
        mobs.push(mkCharacter(state, {
            name: `Goblin${i}`, role: ENUMS.MOB, location: dungeon, hp: 1, hp_max: 1, str: 1,
        }));
    }

    const demo = new Demo("04-xp-levelup");
    const { elapsedMs } = await withTimer(async () => run(state, { ticks: 25 }));

    const acts = actionsOf(state);
    const xpCount = acts.filter(a => a.name === "gain-xp").length;
    const levelCount = acts.filter(a => a.name === "level-up").length;

    demo.expectGte(xpCount, 5, "at least 5 mob kills awarded XP");
    demo.expectGte(levelCount, 1, "at least one level-up");

    const heroNow = state.entities[player] as CharacterView & { level: number; xp: number; str: number };
    demo.expectGte(heroNow.level, 2, "hero leveled up");

    void mobs;
    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
