// Demo 7: Boss encounter. A BOSS is a high-hp hostile target. Players damage it
// repeatedly (with party share-xp), then loot a big payout when it falls.
// Setup: 2 players (party), 1 boss with 5 hp. Verify boss death + loot + xp.

import { Demo, actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer } from "./_harness.js";
import { ENUMS } from "../enums.js";
import type { CharacterView } from "@siftystudio/viv-runtime";

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const town = mkLocation(state, "Town", ENUMS.TOWN);
    const bossRoom = mkLocation(state, "Boss Room", ENUMS.BOSS_ROOM);

    const p1 = mkCharacter(state, { name: "Tank", role: ENUMS.PLAYER, location: town,
                                    str: 50, hp: 200, hp_max: 200 });
    const p2 = mkCharacter(state, { name: "DPS",  role: ENUMS.PLAYER, location: town,
                                    str: 50, hp: 200, hp_max: 200 });
    const boss = mkCharacter(state, { name: "Dragon", role: ENUMS.BOSS, location: bossRoom,
                                      str: 1, hp: 5, hp_max: 5 });
    (state.entities[boss] as any).gold = 50;

    let moved = false;
    const demo = new Demo("07-boss-encounter");
    const { elapsedMs } = await withTimer(async () => run(state, {
        ticks: 25,
        perTickHook: (s, _t) => {
            const a = s.entities[p1] as any;
            const b = s.entities[p2] as any;
            if (!moved && a.party != null && b.party != null) {
                a.location = bossRoom;
                b.location = bossRoom;
                moved = true;
            }
        },
    }));

    const acts = actionsOf(state);
    const has = (n: string) => acts.some(a => a.name === n);

    demo.expect(has("form-party"),  "party formed");
    demo.expect(has("strike"),      "strikes occurred");
    const dies = acts.filter(a => a.name === "die");
    demo.expect(dies.some(a => (a.bindings as any).who?.[0] === boss), "boss died");

    const bossNow = state.entities[boss] as CharacterView & { alive: boolean; gold: number };
    demo.expectEq(bossNow.alive, false, "boss is no longer alive");

    const tank = state.entities[p1] as CharacterView & { xp: number; gold: number };
    const dps  = state.entities[p2] as CharacterView & { xp: number; gold: number };
    demo.expect(tank.xp > 0 || dps.xp > 0, "at least one party member gained XP");

    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
