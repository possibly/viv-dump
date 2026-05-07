// Demo 1: Verify hostile-only combat. Players must not strike each other.
// Setup: 2 players + 1 mob in same location. Run 5 ticks.
// Expect: every strike has either PLAYER→MOB or MOB→PLAYER attacker/target.

import {
    Demo, Demo as _D, // re-export to silence unused warnings
    actionsOf, initRuntime, mkCharacter, mkLocation, newState, run, withTimer,
} from "./_harness.js";
import { ENUMS } from "../enums.js";
import type { ActionView, CharacterView } from "@siftystudio/viv-runtime";

void _D;

async function main(): Promise<void> {
    const state = newState();
    initRuntime(state);

    const town = mkLocation(state, "Town", ENUMS.TOWN);

    const p1 = mkCharacter(state, { name: "Alice",  role: ENUMS.PLAYER, location: town });
    const p2 = mkCharacter(state, { name: "Bob",    role: ENUMS.PLAYER, location: town });
    const m1 = mkCharacter(state, { name: "Goblin", role: ENUMS.MOB,    location: town, hp: 5 });

    const demo = new Demo("01-pvp-blocked");

    const { elapsedMs } = await withTimer(async () => run(state, { ticks: 5 }));

    const acts = actionsOf(state);
    const strikes = acts.filter(a => a.name === "strike");

    demo.expect(strikes.length > 0, "expected at least one strike to occur");

    for (const a of strikes) {
        const bindings = (a as any).bindings as Record<string, string[]>;
        const attackerId = bindings.attacker?.[0]!;
        const targetId   = bindings.target?.[0]!;
        const attacker = state.entities[attackerId] as CharacterView & { role: number };
        const target   = state.entities[targetId]   as CharacterView & { role: number };
        const aRole = attacker?.role;
        const tRole = target?.role;

        const playerVsMob = aRole === ENUMS.PLAYER && (tRole === ENUMS.MOB || tRole === ENUMS.BOSS);
        const mobVsPlayer = (aRole === ENUMS.MOB || aRole === ENUMS.BOSS) && tRole === ENUMS.PLAYER;
        demo.expect(playerVsMob || mobVsPlayer,
            `strike ${a.id} has illegal pair: attacker.role=${aRole} target.role=${tRole}`);
    }

    void p1; void p2; void m1;
    demo.print(state, elapsedMs);
    if (demo.failures.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
