// Demo 3: Verify loot-corpse transfers gold from a fallen mob to a player.
// Setup: 1 player (full hp, str 50 for fast kill) + 1 mob (5 hp, 10 gold).
// Run ~10 ticks. Expect: drop-loot fires once, loot-corpse fires ≥1 time,
// player.gold increased by N, mob.gold decreased by N.

import { Demo, actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer } from "./_harness.js";
import { ENUMS } from "../enums.js";
import type { CharacterView } from "@siftystudio/viv-runtime";

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const dungeon = mkLocation(state, "Dungeon", ENUMS.DUNGEON_FLOOR);

    const player = mkCharacter(state, {
        name: "Hero", role: ENUMS.PLAYER, location: dungeon, hp: 100, hp_max: 100, str: 20,
    });
    const mob = mkCharacter(state, {
        name: "Goblin", role: ENUMS.MOB, location: dungeon, hp: 1, hp_max: 1,
    });
    (state.entities[mob] as any).gold = 10;
    const playerStartGold = (state.entities[player] as any).gold ?? 0;

    const demo = new Demo("03-loot-drop");
    const { elapsedMs } = await withTimer(async () => run(state, { ticks: 10 }));

    const acts = actionsOf(state);
    const has = (n: string) => acts.some(a => a.name === n);

    demo.expect(has("die"), "mob must die");
    demo.expect(has("drop-loot"), "drop-loot must fire");
    const lootCount = acts.filter(a => a.name === "loot-corpse").length;
    demo.expectGte(lootCount, 1, "at least one loot-corpse");

    const playerNow = state.entities[player] as CharacterView & { gold: number };
    const mobNow    = state.entities[mob]    as CharacterView & { gold: number };
    demo.expectGte(playerNow.gold, playerStartGold + 1, "player gold increased");
    demo.expectLte(mobNow.gold, 10 - 1, "mob gold decreased");
    demo.expect(playerNow.gold - playerStartGold === 10 - mobNow.gold,
        `gold conserved: player+${playerNow.gold - playerStartGold} mob-${10 - mobNow.gold}`);

    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
