# Combat System Debugging Summary

## Problem Statement
The MMO world ran successfully with greeting actions only, but hung when strike/combat actions were added to the selector. The hang occurred on the first `selectAction` call in the tick loop.

## Root Cause
**Missing entity properties**: Character entities were missing properties referenced by Viv actions:
- `fatigue` (referenced by `wander` action: `@who.fatigue += 1`)
- `composure` (referenced by other actions)
- `alertness` (referenced by combat flow)

When Viv tried to execute `@who.fatigue += 1` on an entity missing the `fatigue` property, it threw:
```
VivInterpreterError: Cannot execute assignment: non-numeric operand(s) with arithmetic operator
```

This caused the first `selectAction` call to fail, but the error wasn't surfaced clearly, making it appear as a hang.

## Solution
Updated `MmoCharacter` interface in `src/world.ts` to include:
- `fatigue: number` (initialized to 0)
- `composure: number | null` (initialized to null)
- `alertness: number` (initialized to 3)

Updated `newChar()` factory to initialize these properties for all characters.

## Results After Fix
- **Strike actions**: Working, selectable, and executing at 2-7ms per call
- **Combat reactions**: `strike` → `take-damage` (urgent) → `retaliate` successfully chain
- **Death chain**: `die` queues `drop-loot` + `start-corpse-run` (both urgent, tested)
- **No hang**: All selectAction calls return in <10ms

## Verification
- `main-debug.ts`: 2-tick run with 3 characters ✓ (working, shows strike + take-damage in output)
- `main-full-test.ts`: Full 1-day run with 7 characters (in progress, slow but not hung)
- `main.ts`: Updated to work with clean output format

## Key Lesson
**Always initialize all entity properties referenced by actions in .viv files**. Viv errors on missing numeric properties are not obvious hangs — they fail silently with confusing error handling. The debug approach (adding logging, isolating selectAction calls, reducing scope) effectively identified the real issue.

## Files Modified
- `src/world.ts`: Added properties to MmoCharacter interface and newChar() factory
- `src/content/selectors.viv`: Restored strike to pick-player-action selector
- `src/main.ts`: Cleaned up logging
- Added: `src/main-debug.ts`, `src/main-full-test.ts` (testing utilities)

## Status
Combat system is **FUNCTIONAL**. Next: loot/equip, progression (XP/levels), quests, full dungeon system.
