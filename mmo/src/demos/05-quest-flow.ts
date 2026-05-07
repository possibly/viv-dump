// Demo 5: Quest accept + kill 3 mobs + turn in for reward.
// Scenario: player co-located with NPC quest-giver. Hero accepts, then kills 3 mobs,
// then returns and turns in. Expect: accept-quest, 3× quest-progress, turn-in-quest,
// final hero gold ≥ 25 and xp ≥ 30.

import { Demo, actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer } from "./_harness.js";
import { ENUMS } from "../enums.js";
import type { CharacterView } from "@siftystudio/viv-runtime";

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const town = mkLocation(state, "Town", ENUMS.TOWN);

    const dungeon = mkLocation(state, "Dungeon", ENUMS.DUNGEON_FLOOR);

    const npc  = mkCharacter(state, { name: "Elder",  role: ENUMS.NPC_QUEST_GIVER, location: town });
    const hero = mkCharacter(state, { name: "Hero",   role: ENUMS.PLAYER,          location: town,
                                      str: 50, hp: 100, hp_max: 100 });

    const mobs: string[] = [];
    let mobsSpawned = false;

    const demo = new Demo("05-quest-flow");
    const { elapsedMs } = await withTimer(async () => run(state, {
        ticks: 30,
        perTickHook: (s, _t) => {
            // After hero accepts the quest, move them to the dungeon and spawn mobs.
            const h = s.entities[hero] as any;
            if (!mobsSpawned && h.has_active_quest === true) {
                h.location = dungeon;
                for (let i = 0; i < 4; i++) {
                    mobs.push(mkCharacter(s, {
                        name: `Goblin${i}`, role: ENUMS.MOB, location: dungeon, hp: 1, hp_max: 1, str: 1,
                    }));
                }
                mobsSpawned = true;
            }
            // Once the kill quota is met, return hero to town to turn it in.
            if (mobsSpawned && h.quest_kill_count >= h.quest_target && h.has_active_quest === true) {
                h.location = town;
            }
        },
    }));

    const acts = actionsOf(state);

    const has = (n: string) => acts.some(a => a.name === n);
    const count = (n: string) => acts.filter(a => a.name === n).length;

    demo.expect(has("accept-quest"),    "accept-quest must occur");
    demo.expectGte(count("quest-progress"), 3, "quest-progress at least 3 times");
    demo.expect(has("turn-in-quest"),   "turn-in-quest must occur");

    const heroNow = state.entities[hero] as CharacterView & {
        gold: number; xp: number; has_active_quest: boolean;
    };
    demo.expectGte(heroNow.gold, 25, "hero received gold reward");
    demo.expectGte(heroNow.xp,   30, "hero received xp reward");
    demo.expectEq(heroNow.has_active_quest, false, "active quest cleared after turn-in");

    void npc; void mobs;
    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
