// Demo 6: Two players form a party, hunt mobs, both gain XP via share-xp.
// Setup: 2 players in town → form-party → move to dungeon → kill mobs.
// Expect: form-party fires once, share-xp fires per kill, ally also gains XP.

import { Demo, actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer } from "./_harness.js";
import { ENUMS } from "../enums.js";
import type { CharacterView } from "@siftystudio/viv-runtime";

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const town = mkLocation(state, "Town", ENUMS.TOWN);
    const dungeon = mkLocation(state, "Dungeon", ENUMS.DUNGEON_FLOOR);

    const p1 = mkCharacter(state, { name: "Tank",   role: ENUMS.PLAYER, location: town,
                                    str: 50, hp: 100, hp_max: 100 });
    const p2 = mkCharacter(state, { name: "Healer", role: ENUMS.PLAYER, location: town,
                                    str: 5,  hp: 100, hp_max: 100, class_: ENUMS.CLERIC });

    let mobsSpawned = false;

    const demo = new Demo("06-party-share-xp");
    const { elapsedMs } = await withTimer(async () => run(state, {
        ticks: 30,
        perTickHook: (s, _t) => {
            const a = s.entities[p1] as any;
            const b = s.entities[p2] as any;
            if (!mobsSpawned && a.party != null && b.party != null) {
                a.location = dungeon;
                b.location = dungeon;
                for (let i = 0; i < 4; i++) {
                    mkCharacter(s, {
                        name: `Goblin${i}`, role: ENUMS.MOB, location: dungeon, hp: 1, hp_max: 1, str: 1,
                    });
                }
                mobsSpawned = true;
            }
        },
    }));

    const acts = actionsOf(state);
    const has = (n: string) => acts.some(a => a.name === n);
    const count = (n: string) => acts.filter(a => a.name === n).length;

    demo.expect(has("form-party"),       "form-party must fire");
    demo.expectGte(count("gain-xp"), 3,  "≥3 mob kills");
    demo.expectGte(count("share-xp"), 1, "share-xp must fire at least once");

    const a = state.entities[p1] as CharacterView & { xp: number; party: any };
    const b = state.entities[p2] as CharacterView & { xp: number; party: any };
    demo.expect(a.party != null && a.party === b.party, `both players bound to same party (a=${a.party}, b=${b.party})`);
    demo.expectGte(b.xp, 5, "ally healer received at least 5 xp from share-xp");

    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
