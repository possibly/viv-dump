# MMO World — Implementation Plan

A Viv world + runtime that simulates an MMORPG-style storyworld: NPCs hand out
quests, players form groups, travel to dungeons, fight mobs, loot/equip items,
level abilities, die, corpse-run, and get resurrected. The simulation emits a
viv-space-compatible chronicle for visualization.

This is the **planner's** output. An implementation agent should follow the
file plan and implementation order verbatim. Where a tradeoff comes up,
prefer the choice marked **DECIDED**; alternatives are noted only as context.

---

## 0. Scope and success criteria

- **Where:** `mmo/` subfolder of this repo (sibling to `fantasy-market/`).
- **Reference clones (LOCAL ONLY, NEVER COMMIT):**
  - `/tmp/viv-ref` — clone of `https://github.com/siftystudio/viv` (already done by planner).
  - `/tmp/viv-space` — clone of `https://github.com/possibly/viv-space.git` (already done by planner).
  - The implementer should re-clone if `/tmp` was wiped: `git clone --depth 1 https://github.com/siftystudio/viv /tmp/viv-ref` and `git clone --depth 1 https://github.com/possibly/viv-space.git /tmp/viv-space`.
  - **DO NOT** add either path to `mmo/`. **DO NOT** stage them. Add `mmo/.gitignore` only if needed (see §11) — but the safer rule is "never `cp -r` from `/tmp/viv-ref` or `/tmp/viv-space` into the repo."

- **Done when:**
  1. `npm run build` (compile + start) inside `mmo/` finishes without errors.
  2. Console log shows: a multi-day simulation ran, quests were accepted, parties formed, mobs were fought, drops were looted, characters leveled, deaths happened, some were resurrected, others corpse-ran the full 3 ticks.
  3. `mmo/public/chronicle-seed{SEED}-scale{SCALE}-{ISO_DATE}.json` exists and loads in the viv-space visualizer hosted at `https://possibly.github.io/viv-space/?url=<raw github URL of the snapshot on this branch>`.
  4. Snapshot is committed and pushed on the working branch `claude/plan-mmo-world-xVWOm`.
  5. At least one **sifting pattern** ("a hero falls in the dungeon", or similar — see §7) returns matches over the chronicle.

- **Non-goals (do NOT implement these):**
  - No actual networking / multiplayer transport. "MMO" here means *many-player simulation*, not netcode.
  - No graphics. The chronicle is the artifact; the visualizer is viv-space.
  - No PvP combat balancing. Focus on PvE adventuring.
  - No persistence between runs other than the snapshot file.

---

## 1. Read this first: viv runtime invariants (act-react chains)

The hardest part of this project is **getting act-react chains right**. Read
`/tmp/viv-ref/docs/reference/language/10-actions.md`, `11-reactions.md`,
`20-runtime-model.mdx`, and `12-temporal-constraints.md` before writing any
`.viv` files. The lessons that *must* shape our design:

- **`reserved` actions can only be performed via reactions, plans, or selectors.** Anything that should never spontaneously happen (e.g. `die`, `resurrect`, `mob-attack`, `boss-enrage`, `quest-complete`) MUST be `reserved`. The `fantasy-market/` `set-fire` action is the canonical example.
- **`with partial:` vs `with:`** — when reactions queue a reserved action, they typically *partially* precast roles, leaving the runtime to cast remaining roles via the action's own role definitions. We use `with partial:` for reactions whose remaining roles need normal casting (e.g. mob-attack which still needs to pick a target party member). Use `with:` for fully-bound queues (e.g. resurrect-target precasts both `@healer` and `@corpse`).
- **`urgent: true`** drains *before* the next tick. Use it for combat reactions (mob retaliation, AoE splash, healing in response to taking damage) so a fight resolves visibly within the same tick rather than dribbling across many ticks. Do **NOT** mark slow narrative reactions (loot-decay, quest-expire) urgent.
- **`embargoes`** matter. A combat round that produces 4 damage instances should not trigger 4 retaliation reactions queued onto the same target. Embargo retaliations on `@attacker, @defender` for a small window so the combat loop alternates cleanly. Likewise, embargo `accept-quest` per `(player, quest)` for `forever` so a quest cannot be re-accepted while in progress.
- **Causal bookkeeping is automatic** when a reaction queues a child action. We rely on this so that `loot-corpse → equip-item → kill-boss` chains show up in viv-space as a connected DAG. We do **not** need to set causes manually.
- **Conditions can call host functions** (`~func-name(args)`). We will register a small set: `~party-of(@player)`, `~mobs-here()`, `~corpse-here(@player)`, etc. Keep host functions deterministic — they are evaluated during role casting and will be re-evaluated during backtracking.
- **Plans (`.viv` plan blocks)** are useful for long-running multi-phase narratives that span dozens of ticks. We use a plan for **quest-arc** (NPC-talk → accept → travel → party → defeat → return → reward) and for **dungeon-run**. We do **not** use a plan for moment-to-moment combat — that's a reaction cascade.
- **`@this` is the in-flight action** in scratch/effects/reactions. We use it when a reaction needs to refer back to the act that triggered it (e.g., damage report referencing the strike).

### Act-react chain blueprints we will actually rely on

These are the chains that need to *just work*, expressed as pseudo-Viv. They
are designed before any code is written so the implementer can sanity-check
each `.viv` file against this list.

```
# Combat chain — single round
strike (general) ──reactions──► take-damage (reserved, urgent)
                                  └─ if @target.health <= 0:
                                       reactions ──► die (reserved, urgent)
take-damage ──reactions──► retaliate (reserved, urgent, embargo 1 tick)
                              └─ casts via mob-target-selector

# Death chain
die ──reactions──► drop-loot (reserved, urgent)        # corpse spawns
   └────────────► start-corpse-run (reserved)          # 3-tick countdown begins
   └────────────► broadcast-death (reserved)           # nearby allies hear

# Resurrection chain
cast-resurrect (general, by player ability) ──reactions──► resurrect-target (reserved, urgent)
                                                            └─ cancels start-corpse-run
                                                            └─ revives @corpse at location

# Loot chain
loot-corpse (general) ──reactions──► equip-item (reserved, conditional on slot empty)
                                       └─ updates stats

# Quest acceptance chain
talk-to-npc (general) ──reactions──► offer-quest (reserved if NPC has unoffered quest)
                                       └─ embargo: forever for one-time, 1 day for daily
offer-quest ──reactions──► accept-quest (reserved, urgent if player chooses)
                              └─ embargo accept-quest forever per (player, questline)

# Party chain
form-party (general) ──reactions──► join-party (reserved, urgent)
                                      └─ for each nearby player with same active quest

# Dungeon chain — driven by a plan, not a reaction cascade
plan dungeon-run:
  >assemble: queue form-party, wait until party.size >= min
  >travel: queue travel-to (location: dungeon-entrance)
  >clear-floors: loop floors -> queue engage-mob-pack ... succeed when boss dead
  >reward: queue distribute-loot, queue gain-xp
  succeed
```

The implementer should encode each arrow above as a `reactions:` block in the
parent action. Embargoes and `urgent:` flags are listed in §6.

---

## 2. File layout

Mirror `fantasy-market/`. Concrete tree:

```
mmo/
├── PLAN.md                              # (this file)
├── README.md                            # short project overview, run commands, snapshot URL recipe
├── package.json
├── tsconfig.json
├── public/                              # chronicle snapshots land here (committed)
│   └── chronicle-seed{N}-scale{S}-{DATE}.json
├── scripts/                             # optional runtime helper scripts (none needed at MVP)
└── src/
    ├── main.ts                          # host loop: world seed, tick loop, sifting, snapshot export
    ├── clock.ts                         # tick = 1 minute. day/night/dawn helpers (re-use fantasy-market shape)
    ├── enums.ts                         # numeric ENUMS for kinds/roles/slots/abilities/etc.
    ├── world.ts                         # seedWorld() builds locations, NPCs, players, items
    ├── combat.ts                        # damage formulas, stat math (host-side)
    ├── items.ts                         # item kind tables, drop tables, equipment slot rules
    ├── abilities.ts                     # ability table: id, name, level req, cost, effect kind
    ├── quests.ts                        # quest table: NPC id, quest type (one-shot|daily), location, mob target, reward
    └── content/
        ├── source.viv                   # top-level include
        ├── compiled_content_bundle.json # compiler output
        ├── index.ts                     # re-exports the JSON bundle
        ├── tropes.viv                   # reusable condition bundles (see §4)
        ├── queries.viv                  # named queries used by conditions and patterns
        ├── selectors.viv                # per-role action selectors (NPC + mob + player roles)
        ├── actions/
        │   ├── movement.viv             # travel-to, enter-dungeon, return-to-town
        │   ├── social.viv               # talk-to-npc, group-up, invite, accept-invite
        │   ├── quest.viv                # offer-quest, accept-quest, abandon-quest, complete-quest, turn-in-quest
        │   ├── combat.viv               # strike, cast-spell, take-damage, retaliate, miss, crit
        │   ├── death.viv                # die, drop-loot, start-corpse-run, tick-corpse-run, respawn, cast-resurrect, resurrect-target
        │   ├── loot.viv                 # loot-corpse, equip-item, unequip-item, discard-item
        │   ├── progression.viv          # gain-xp, level-up, learn-ability
        │   ├── dungeon.viv              # engage-mob-pack, defeat-boss, clear-room
        │   └── reactions.viv            # any pure-reaction-target reserved actions that don't fit elsewhere
        ├── plans/
        │   ├── quest-arc.viv            # talk → accept → travel → fight → return → turn-in
        │   └── dungeon-run.viv          # assemble → travel → clear floors → reward
        └── patterns/
            └── hero-falls-in-the-dungeon.viv
```

---

## 3. Domain model (host TypeScript)

### 3.1 Entity shapes (`src/world.ts`)

All entity objects extend the appropriate viv-runtime view. Match the
`fantasy-market` style: `entityType`, `id`, `name`, plus domain fields. Do not
nest data — viv prefers flat fields with named accessors.

**`MmoLocation`** (extends `LocationView`):
```
kind: number             // ENUMS.TOWN | TOWN_SQUARE | NPC_HALL | TAVERN | DUNGEON_ENTRANCE | DUNGEON_FLOOR | BOSS_ROOM | CORPSE_GROUND
parent: UID | null       // dungeon floors live inside a dungeon entrance
name: string
contents: UID[]          // items lying on the ground (corpses, dropped loot)
mob_pack: UID[]          // mob character IDs spawned here (empty for towns)
quest_giver: UID | null  // npc that hands quests here
respawn_point: UID | null // for dungeon floors → nearest town
```

**`MmoCharacter`** (extends `CharacterView`):
```
// identity
role: number             // ENUMS.PLAYER | NPC_QUEST_GIVER | NPC_VENDOR | NPC_HEALER | MOB | BOSS
class_: number           // ENUMS.WARRIOR | MAGE | CLERIC | ROGUE  (mobs use ENUMS.MOB_CLASS_*)
location: UID
home_town: UID

// progression
level: number            // 1-50
xp: number
abilities: UID[]         // learned ability IDs
ability_cooldowns: Record<UID, number>   // remaining ticks; decremented in softDrift()

// combat stats (base + equipment delta is computed live; we store base only)
str: number              // melee damage / carry
agi: number              // hit chance / dodge / crit
int_: number             // spell damage
sta: number              // hp pool
spi: number              // mp regen / heal power
hp: number               // current
hp_max: number           // derived: sta * 10 + level * 5
mp: number
mp_max: number           // derived: int_ * 5 + spi * 5

// state
alive: boolean
corpse_run_ticks_remaining: number | null    // null when alive; set to 3 when downed; 0 = ready to respawn
last_corpse_location: UID | null              // where the corpse lies
threat: Record<UID, number>                   // mob aggro vs each player

// social / party
party: UID | null                             // party id, or null
party_role: number | null                     // ENUMS.PARTY_TANK | DPS | HEAL  (assigned on join)

// quest state
active_quests: UID[]                          // quest entity IDs accepted but not turned-in
completed_quests: UID[]                       // for embargo gating one-shots
daily_quest_last_accepted: Record<UID, number>  // daily quest id → day number

// inventory / equipment
inventory: UID[]                              // item IDs not equipped
equipped: Record<number, UID | null>          // slot enum → item id  (HEAD/CHEST/LEGS/MAIN_HAND/OFF_HAND/TRINKET)
gold: number

// memories, etc. — required by viv runtime
memories: CharacterView["memories"]
```

**`MmoItem`** (extends `ItemView`):
```
kind: number             // ENUMS.WEAPON | ARMOR | TRINKET | QUEST_ITEM | CONSUMABLE | CORPSE_MARKER
slot: number | null      // ENUMS.SLOT_HEAD | CHEST | LEGS | MAIN_HAND | OFF_HAND | TRINKET (null for non-equipment)
holder: UID | null
location: UID | null
stats: { str: number; agi: number; int_: number; sta: number; spi: number }   // equipment deltas
required_level: number
quest_id: UID | null     // for quest items
```

**`MmoQuest`** (this is **NOT** a viv entity — it lives in a host-side table). The reason: viv entities are limited to character / location / item / action types. Quests live in `src/quests.ts` as a static table indexed by ID, plus a per-player active list. When a quest is accepted, we store its ID in `MmoCharacter.active_quests` and the host evaluates completion in conditions for the `complete-quest` action.

**`MmoAbility`** — same treatment. Static table in `src/abilities.ts`, referenced by ID from character `abilities`.

**`MmoParty`** — viv has no party type; we synthesize parties as **locations of kind `ENUMS.PARTY`** so members can be queried via `getEntityIDs(Character, partyID)`. **DECIDED:** model parties as locations for query simplicity; characters keep `party: UID` pointing at the party-location, *and* `location: UID` pointing at the world location they stand in. Use a derived host function `~party-of(@a) == ~party-of(@b)` rather than comparing `location` fields directly. Alternative considered: parties as a custom flat record map — rejected because viv's role casting machinery cannot iterate non-entity collections.

### 3.2 Combat math (`src/combat.ts`)

A separate host module so `.viv` files do not have to express damage formulas:

```
hit_chance = clamp(0.55 + (attacker.agi - target.agi) * 0.02, 0.1, 0.95)
crit_chance = clamp(0.05 + attacker.agi * 0.01, 0.05, 0.5)
melee_damage = max(1, attacker.str + weapon.stats.str + roll(1..6) - target_armor/4)
spell_damage = max(1, attacker.int_ + roll(1..8))
heal_amount = max(1, healer.spi + roll(1..6))
```

All are exposed as host functions: `~roll-hit(@a, @b)`, `~melee-damage(@a, @b)`, `~spell-damage(@a, @b)`, `~heal-amount(@h, @t)`. Effects in `.viv` actions assign their results back: `@target.hp -= ~melee-damage(@attacker, @target)`.

### 3.3 The clock (`src/clock.ts`)

Copy `fantasy-market/src/clock.ts` shape but with:
- `TICK_MINUTES = 1` (an MMO tick is short — combat needs sub-minute resolution).
- Day/night helpers retained but mostly used for daily-quest reset (a "day" is 24 * 60 = 1440 ticks).
- Add `tickOf(timestamp)` returning the absolute tick index for cooldown decrement.

---

## 4. Tropes (`src/content/tropes.viv`)

Reusable condition bundles. Modeled on `fantasy-market/src/content/tropes.viv`.

```
trope alive:
    roles: @who: as: character
    conditions: @who.alive == true
    # (used in nearly every action — write it once)

trope at-same-spot:
    roles: @a: as: character; @b: as: character
    conditions: @a.location == @b.location

trope party-mate:
    roles: @a: as: character; @b: as: character
    conditions:
        @a.party != null
        @a.party == @b.party

trope hostile:
    roles: @a: as: character; @b: as: character
    conditions:
        (@a.role == #PLAYER && (@b.role == #MOB || @b.role == #BOSS))
        || (@b.role == #PLAYER && (@a.role == #MOB || @a.role == #BOSS))

trope can-cast-spell:
    roles: @who: as: character; @ability: as: item    # (abilities aren't items — see note below)
    # NOTE: abilities are host-side records. Use a host function ~can-cast(@who, ability_id) instead of a trope here.

trope downed:
    roles: @who: as: character
    conditions:
        @who.alive == false
        @who.corpse_run_ticks_remaining > 0
```

(The `can-cast-spell` trope is illustrative — implementer should drop it in
favor of host functions because abilities are not entities.)

---

## 5. Queries (`src/content/queries.viv`)

```
# Used by sifting pattern + by reactions to find triggering mob attacks.
query recent-mob-strike-on:
    roles: @victim: as: character
    action: any: strike
    recipients: any: @victim
    time: after: 3 minutes ago

# For "hero-falls" sifting pattern.
query hero-deaths:
    action: any: die
    # filter to players via condition on initiator role at sift time

# For "rezzed-just-in-time": find recent resurrects on a victim.
query recent-resurrect-of:
    roles: @victim: as: character
    action: any: resurrect-target
    recipients: any: @victim
    time: after: 5 minutes ago

# For quest gates: did this player already turn in this quest?
query turn-ins-of:
    roles: @player: as: character
    action: any: turn-in-quest
    initiator: any: @player
```

---

## 6. Actions (`src/content/actions/*.viv`)

This section enumerates every action with its roles, key conditions, effects,
reactions, and embargoes. The implementer should encode each one verbatim in
the corresponding `.viv` file. Where formulas are too complex for `.viv`, use a
host function (registered in `main.ts` `HOST_FUNCTIONS`).

### 6.1 `social.viv`

- `action talk-to-npc` (general)
  - roles: `@player as initiator`, `@npc as recipient`
  - conditions: `~at-same-spot(@player, @npc)`, `@npc.role == #NPC_QUEST_GIVER`, `@player.role == #PLAYER`, `~alive(@player)`
  - effects: `@player.mood += 1`
  - reactions: `queue action offer-quest with partial: @giver: @npc, @asker: @player; urgent: true`
  - embargoes: `time: 30 minutes; roles: @player, @npc`

- `action invite-to-party` (general)
  - roles: `@inviter as initiator`, `@invitee as recipient`
  - conditions: `~at-same-spot(@inviter, @invitee)`, both players, both have at least one common active quest, `@invitee.party == null`
  - reactions: `queue action accept-invite with partial: @leader: @inviter, @joiner: @invitee; urgent: true`
  - embargoes: `time: 5 minutes; roles: @inviter, @invitee`

### 6.2 `quest.viv`

- `reserved action offer-quest`
  - roles: `@giver as initiator`, `@asker as recipient`
  - conditions: `@giver.role == #NPC_QUEST_GIVER`, host function `~has-quest-to-offer(@giver, @asker)` returns true
  - effects: scratch a `@quest_id` via `~roll-offered-quest(@giver, @asker)`; assign to `@asker.scratch.offered_quest_id` (this requires the action's `scratch` field — see viv docs §10)
  - reactions: `queue action accept-quest with partial: @asker: @asker, @giver: @giver; urgent: false`
  - embargoes: `time: 1 day if daily else forever; roles: @asker` (encode by host function returning two queue entries — see implementation note below)

  **Implementation note on the daily-vs-one-shot embargo:** Viv embargoes are static, so we cannot vary `time:` based on quest type. Solution: define **two** offer actions, `offer-quest-once` and `offer-quest-daily`, with different embargo windows. The host quest table flags which to queue.

- `reserved action accept-quest`
  - roles: `@asker as initiator`, `@giver as recipient`
  - conditions: `~at-same-spot(@asker, @giver)`, host function `~quest-not-active(@asker)`
  - effects: host function `~push-active-quest(@asker)` adds the offered quest to `@asker.active_quests`
  - **NO reactions queued from here** — the quest plan ( §8 ) takes over.

- `action complete-quest` (general — fires automatically when conditions met)
  - roles: `@player as initiator`, `@quest as recipient` — but quests are not entities. Solution: roles are `@player as initiator` only; condition checks host function `~has-completable-quest(@player)`; effect calls `~mark-quest-complete(@player)`.
  - reactions: `queue action turn-in-quest with partial: @player: @player; urgent: false`
  - embargoes: `time: 1 hour; roles: @player`

- `reserved action turn-in-quest`
  - roles: `@player as initiator`, `@giver as recipient`
  - conditions: `~at-same-spot(@player, @giver)`, host function `~player-can-turn-in-here(@player, @giver)`
  - effects: `@player.xp += ~quest-xp-reward(@player)`, `@player.gold += ~quest-gold-reward(@player)`, host function `~grant-quest-item(@player)`
  - reactions: `queue action gain-xp with partial: @who: @player; urgent: false` (the `gain-xp` action handles level-up cascade)
  - embargoes: handled by host quest tables (one-shot quests get a `forever` embargo per `(player, quest_id)` key in a host-side embargo map; daily quests reset at day rollover).

### 6.3 `combat.viv`

- `action strike` (general — players use this; mobs use `mob-strike` reserved variant)
  - roles: `@attacker as initiator`, `@target as recipient`
  - conditions: `~at-same-spot`, `~hostile`, `~alive(@attacker)`, `~alive(@target)`, `@attacker.mp >= 0` (no cost for melee), no embargo
  - effects: scratch `@hit = ~roll-hit(@attacker, @target)`; if hit, `@target.hp -= ~melee-damage(@attacker, @target)`; `@attacker.threat[@target] = (@attacker.threat[@target] ?? 0) + 1`
  - reactions:
    ```
    queue action take-damage:
        with partial: @victim: @target, @source: @attacker
        urgent: true
    ```
  - embargoes: `time: 6 ticks; roles: @attacker, @target` (one strike per 6 sec per attacker-target pair)

- `reserved action take-damage`
  - roles: `@victim as initiator`, `@source as recipient`
  - conditions: `@victim.alive == true`
  - effects: nothing direct (damage was already applied by `strike`); this action exists primarily to trigger the death and retaliation reactions and to give viv-space a clean causal node.
  - reactions:
    ```
    queue action die:
        with partial: @who: @victim, @killer: @source
        urgent: true
        # only fires when health gate hit; we attach an abandon clause:
        abandon: @victim.hp > 0
    queue action retaliate:
        with partial: @attacker: @victim, @target: @source
        urgent: true
        abandon: @victim.alive == false
    ```
  - embargoes: none

- `reserved action retaliate`
  - roles: `@attacker as initiator`, `@target as recipient`
  - conditions: `@attacker.alive == true`, `@target.alive == true`, `~at-same-spot`
  - effects: `@target.hp -= ~melee-damage(@attacker, @target)`
  - reactions: same chain as `strike` (queue another `take-damage`), creating a back-and-forth loop bounded by hp + the strike embargo on `@attacker, @target`.

- `action cast-spell` (general)
  - roles: `@caster as initiator`, `@target as recipient`, `@ability as item from @caster.inventory` — **NO**, abilities are not items. Use **scratch role** instead: condition `~caster-has-castable-ability(@caster, @target)` and resolve the ability id in scratch.
  - conditions: alive, mp ≥ cost (host function), at-same-spot or in-range, hostile if damaging, party-mate if healing, ability not on cooldown
  - effects: deduct mp, set cooldown, apply effect via host function `~apply-ability(@caster, @target, ability_id)`
  - reactions: `queue action take-damage` if damaging, `queue action receive-heal` if healing.

- `action cast-resurrect` (general)
  - roles: `@healer as initiator`, `@corpse as recipient`
  - conditions: `@healer.role == #PLAYER`, `@healer.class_ == #CLERIC || ~has-ability(@healer, RESURRECT_ABILITY)`, `@corpse.alive == false`, `@corpse.corpse_run_ticks_remaining > 0`, `~at-same-spot(@healer, @corpse)`, `@healer.mp >= 30`
  - effects: `@healer.mp -= 30`
  - reactions:
    ```
    queue action resurrect-target:
        with: @healer: @healer, @corpse: @corpse
        urgent: true
    ```
  - embargoes: `time: 30 seconds; roles: @healer, @corpse`

### 6.4 `death.viv`

- `reserved action die`
  - roles: `@who as initiator`, `@killer as recipient`
  - conditions: `@who.hp <= 0`, `@who.alive == true`
  - effects: `@who.alive = false`, `@who.corpse_run_ticks_remaining = 3`, `@who.last_corpse_location = @who.location`
  - reactions:
    ```
    queue action drop-loot:
        with partial: @corpse: @who
        urgent: true
    queue action start-corpse-run:
        with partial: @who: @who
        urgent: true
    queue action broadcast-death:
        with partial: @who: @who
        urgent: false
    ```
  - embargoes: `time: forever; roles: @who` (cannot die twice without first respawning)

- `reserved action drop-loot`
  - roles: `@corpse as initiator`
  - conditions: `@corpse.alive == false`
  - effects: host function `~spawn-loot-from(@corpse)` adds items to `@corpse.location.contents` from a drop table.
  - reactions: none. Looting is player-driven (`loot-corpse`).

- `reserved action start-corpse-run`
  - roles: `@who as initiator`
  - conditions: `@who.alive == false`, `@who.corpse_run_ticks_remaining > 0`
  - effects: nothing direct — exists as a chronicle anchor and to schedule the tick-corpse-run reaction.
  - reactions:
    ```
    queue action tick-corpse-run:
        with partial: @who: @who
        # not urgent — let the tick boundary roll first
        time: after: 1 minute from action
        repeat:
            if: @who.alive == false
            max: 3
    ```

- `reserved action tick-corpse-run`
  - conditions: `@who.alive == false`, `@who.corpse_run_ticks_remaining > 0`
  - effects: `@who.corpse_run_ticks_remaining -= 1`
  - reactions:
    ```
    queue action respawn:
        with: @who: @who
        urgent: true
        abandon: @who.corpse_run_ticks_remaining > 0 || @who.alive == true
    ```

- `reserved action respawn`
  - conditions: `@who.alive == false`, `@who.corpse_run_ticks_remaining == 0`
  - effects:
    - `@who.alive = true`
    - `@who.hp = @who.hp_max / 2`
    - `@who.mp = @who.mp_max / 2`
    - `~move-to(@who, @who.home_town)` (host fn)
    - `@who.corpse_run_ticks_remaining = null`

- `reserved action resurrect-target`
  - roles: `@healer as initiator`, `@corpse as recipient`
  - conditions: `@corpse.alive == false`, `@corpse.corpse_run_ticks_remaining > 0`, `~at-same-spot(@healer, @corpse)`
  - effects:
    - `@corpse.alive = true`
    - `@corpse.hp = @corpse.hp_max * 0.6`
    - `@corpse.mp = @corpse.mp_max * 0.4`
    - `@corpse.corpse_run_ticks_remaining = null`
  - reactions: none. The previously queued `tick-corpse-run` and `respawn` will be self-abandoning (their abandon clauses now fire because `@who.alive == true`).

  **Critical:** the `respawn` and `tick-corpse-run` actions both carry `abandon` clauses keyed on `@who.alive == true`. Without these, a resurrected character would still respawn at home a few ticks later. The implementer must verify abandon-clause behavior by writing a small reproducer (player dies, gets rezzed before tick 3, never gets teleported home).

### 6.5 `loot.viv`

- `action loot-corpse` (general)
  - roles: `@looter as initiator`, `@corpse as recipient`
  - conditions: `@corpse.alive == false`, `~at-same-spot`, `@corpse.role != #PLAYER` (no PvP looting), corpse has loot
  - effects: host function `~transfer-loot(@corpse, @looter)`
  - reactions:
    ```
    queue action equip-item:
        with partial: @who: @looter
        # only fires if there is a slot-empty for some looted item
        abandon: ~no-equippable-upgrade(@looter)
    ```

- `reserved action equip-item`
  - roles: `@who as initiator`, `@item as item from @who.inventory`
  - conditions: `@item.slot != null`, `@who.equipped[@item.slot] == null` OR upgrade preferred (host function `~is-upgrade(@who, @item)`)
  - effects: host function `~equip(@who, @item)` (recomputes hp_max etc.)

### 6.6 `progression.viv`

- `reserved action gain-xp`
  - roles: `@who as initiator`
  - effects: host function `~grant-xp(@who, scratch.amount)`
  - reactions:
    ```
    queue action level-up:
        with partial: @who: @who
        urgent: false
        abandon: ~no-pending-level(@who)
    ```

- `reserved action level-up`
  - effects: host function `~level-up(@who)` (bumps level, raises stats, restores hp/mp)
  - reactions:
    ```
    queue action learn-ability:
        with partial: @who: @who
        urgent: false
        abandon: ~no-ability-to-learn-at-level(@who)
    ```

- `reserved action learn-ability`
  - effects: append a new ability id to `@who.abilities`

### 6.7 `dungeon.viv`

- `reserved action engage-mob-pack`
  - roles: `@party as location`, `@pack_leader as recipient`
  - conditions: party has `≥ 1` member at `@party`, `@pack_leader.role == #MOB`, `~at-same-spot(party-members, @pack_leader)`
  - effects: each mob's `threat[party-leader] = 1` (host function `~aggro-pack(@pack_leader, @party)`)
  - reactions: none direct — mobs will start striking on their next selector tick

- `reserved action defeat-boss`
  - conditions: boss.hp <= 0 in the room
  - effects: spawn epic loot, mark dungeon room cleared
  - reactions: queue `gain-xp` for each living party member

### 6.8 `movement.viv`

- `action travel-to` (general)
  - roles: `@who as initiator`
  - conditions: `~alive`, `@who.party != null` implies all party members at same location (so the party doesn't fragment)
  - effects: `~move-to(@who, scratch.dest)` — destination chosen by selector / plan

- `reserved action enter-dungeon`
  - effects: move whole party into dungeon entrance, set respawn point

### 6.9 `reactions.viv`

For any reserved action that didn't fit thematically above (e.g.,
`broadcast-death` for chronicle annotation, `mob-aggro` for taunt mechanics).
Keep this file thin.

---

## 7. Selectors (`src/content/selectors.viv`)

Per-role action selectors mirroring `fantasy-market/src/content/selectors.viv`.
The host calls `behave` once per character per tick.

```
action-selector pick-player-action:
    conditions: @actor.role == #PLAYER, @actor.alive == true
    target with weights:
        (5) strike     # if hostiles in room, this dominates
        (3) cast-spell
        (3) loot-corpse
        (2) talk-to-npc
        (2) travel-to
        (2) invite-to-party
        (1) cast-resurrect
        (1) wander

action-selector pick-mob-action:
    conditions: @actor.role == #MOB || @actor.role == #BOSS, @actor.alive == true
    target with weights:
        (8) strike      # mobs mostly hit the highest-threat party member
        (1) wander

action-selector pick-quest-giver-action:
    conditions: @actor.role == #NPC_QUEST_GIVER
    target with weights:
        (1) greet      # background flavor only — quest offering happens via talk-to-npc reaction

action-selector behave:
    target randomly:
        selector pick-player-action
        selector pick-mob-action
        selector pick-quest-giver-action
```

Notes:
- For dead characters (`@actor.alive == false`), `behave` should fall through to nothing — every selector has an `alive` condition.
- The host loop should *skip* dead characters entirely (similar to fantasy-market's nightwatch-skip pattern) to avoid wasted casting.

---

## 8. Plans (`src/content/plans/*.viv`)

### 8.1 `quest-arc.viv`

```
plan quest-arc:
    roles:
        @player: as: character
        @giver: as: character
    phases:
        >travel:
            queue action travel-to:
                with partial: @who: @player
                # destination set via scratch by host
            wait:
                timeout: 1 day
                until: @player.location == ~quest-target-location(@player)
        >fight:
            wait:
                timeout: 12 hours
                until: ~quest-objective-met(@player)
        >return:
            queue action travel-to:
                with partial: @who: @player
            wait:
                timeout: 1 day
                until: @player.location == @giver.location
        >turn-in:
            queue action turn-in-quest:
                with partial: @player: @player, @giver: @giver
                urgent: true
            succeed;
```

The host queues this plan inside the `accept-quest` action's effects (via
`~queue-quest-plan(@player, @giver)` — see "Plans queued from effects" in the
viv docs §17).

### 8.2 `dungeon-run.viv`

```
plan dungeon-run:
    roles:
        @leader: as: character
    phases:
        >assemble:
            wait:
                until: ~party-size(@leader) >= 3
                timeout: 30 minutes
        >descend:
            queue action enter-dungeon:
                with partial: @who: @leader
        >clear:
            wait:
                until: ~boss-dead-in(@leader.location.parent)
                timeout: 4 hours
        >loot-and-return:
            queue action distribute-loot:
                with partial: @leader: @leader
            queue action travel-to:
                with partial: @who: @leader
                # back to town
            succeed;
```

`distribute-loot` is one more reserved action in `loot.viv`; it iterates party
members via a group role and grants epic-tier items.

---

## 9. Sifting patterns (`src/content/patterns/`)

`hero-falls-in-the-dungeon.viv`:

```
pattern hero-falls-in-the-dungeon:
    roles:
        @hero: as: character
        @killer: as: character
        @dungeon: as: location
    actions:
        @death:
            from: search query hero-deaths:
                over: inherit
    conditions:
        @death.initiator == @hero
        @hero.role == #PLAYER
        @killer.role == #BOSS || @killer.role == #MOB
        @death.location->parent != null
        @death.location->parent->kind == #DUNGEON_ENTRANCE
        @dungeon == @death.location->parent
```

(Optional second pattern — `rezzed-just-in-time` — finds dies that were
followed within 5 minutes by a `resurrect-target` on the same victim. Bonus
material if time permits.)

---

## 10. Host loop (`src/main.ts`)

Skeleton, modeled on `fantasy-market/src/main.ts`:

```
1. Parse env: SEED (default 1), DAYS (default 3), SCALE (phase-a | phase-b | full).
2. initializeVivRuntime({ contentBundle, adapter }).
3. world = seedWorld({...}). Populate STATE.entities, STATE.characters, etc.
4. For each player at startup, queue plan dungeon-run via queuePlan with @leader = player.
5. Tick loop: for t in 0..DAYS*1440:
   a. softDrift: decrement ability cooldowns; tick mob respawn timers in dungeons; daily quest reset on day rollover.
   b. shuffle characters.
   c. for each cid: if alive, await selectAction({initiatorID: cid}) inside try/catch.
   d. await tickPlanner().
   e. STATE.timestamp += TICK_MINUTES.
6. After the loop: run sifting pattern hero-falls-in-the-dungeon, log matches.
7. Export snapshot to public/.
```

### 10.1 Host functions registered on the adapter

These are the `~name(...)` calls in `.viv`:

| Name | Args | Returns | Use site |
|---|---|---|---|
| `roll-hit` | `@a, @b` | bool | `strike` effects |
| `melee-damage` | `@a, @b` | int | `strike`, `retaliate` |
| `spell-damage` | `@a, @b, ability_id` | int | `cast-spell` |
| `heal-amount` | `@h, @t` | int | healing spells |
| `move-to` | `@who, @where` | bool | movement actions |
| `apply-ability` | `@caster, @target, id` | void | `cast-spell` |
| `transfer-loot` | `@corpse, @looter` | void | `loot-corpse` |
| `equip` | `@who, @item` | void | `equip-item` |
| `is-upgrade` | `@who, @item` | bool | equip gating |
| `no-equippable-upgrade` | `@who` | bool | abandon clause |
| `grant-xp` | `@who, amount` | void | `gain-xp` |
| `level-up` | `@who` | void | `level-up` |
| `no-pending-level` | `@who` | bool | abandon clause |
| `no-ability-to-learn-at-level` | `@who` | bool | abandon clause |
| `has-quest-to-offer` | `@giver, @asker` | bool | `offer-quest` |
| `roll-offered-quest` | `@giver, @asker` | string | sets scratch.offered_quest_id |
| `quest-not-active` | `@asker` | bool | `accept-quest` |
| `push-active-quest` | `@asker` | void | `accept-quest` |
| `has-completable-quest` | `@player` | bool | `complete-quest` |
| `mark-quest-complete` | `@player` | void | `complete-quest` |
| `player-can-turn-in-here` | `@player, @giver` | bool | `turn-in-quest` |
| `quest-xp-reward` | `@player` | int | `turn-in-quest` |
| `quest-gold-reward` | `@player` | int | `turn-in-quest` |
| `grant-quest-item` | `@player` | void | `turn-in-quest` |
| `quest-target-location` | `@player` | UID | quest-arc plan wait |
| `quest-objective-met` | `@player` | bool | quest-arc plan wait |
| `party-size` | `@leader` | int | dungeon-run plan |
| `party-of` | `@a` | UID or null | trope `party-mate` (alt path) |
| `boss-dead-in` | `@dungeon` | bool | dungeon-run plan |
| `aggro-pack` | `@leader, @party` | void | `engage-mob-pack` |
| `spawn-loot-from` | `@corpse` | void | `drop-loot` |
| `caster-has-castable-ability` | `@caster, @target` | bool | `cast-spell` |
| `has-ability` | `@who, ability_id` | bool | `cast-resurrect` |
| `queue-quest-plan` | `@player, @giver` | void | called from `accept-quest` effects |

Each is a one-screen function. Keep them deterministic per `(SEED, timestamp)` —
seed Math.random by `xorshift32(SEED ^ STATE.timestamp ^ characterID-hash)` if
you need RNG. The fantasy-market `Rand` class is a fine model.

### 10.2 Snapshot export (`exportSnapshot()`)

Match `fantasy-market/src/main.ts` `exportSnapshot` exactly. Output path:

```
mmo/public/chronicle-seed${SEED}-scale${SCALE}-${YYYY-MM-DD}.json
```

Schema fields required by viv-space (see `/tmp/viv-space/src/types.ts`):

```
{
  "schemaVersion": "0.10.2",
  "timestamp": <final tick>,
  "entities": <STATE.entities>,
  "vivInternalState": <STATE.vivInternalState>
}
```

The implementer **must verify** by:
1. Running the simulation.
2. `cp mmo/public/chronicle-...json /tmp/viv-space/public/sample-chronicle.json`
3. `cd /tmp/viv-space && npm install && npm run dev`
4. Open `http://localhost:5173` and confirm the action graph renders without console errors.
5. (Re-do step 4 with the *committed* file via the github raw URL once pushed — see §12.)

---

## 11. Scaling parameters

Three scales (mirror fantasy-market):

| | phase-a | phase-b | full |
|---|---|---|---|
| players | 5 | 30 | 120 |
| quest givers | 2 | 6 | 15 |
| healers | 1 | 4 | 10 |
| towns | 1 | 2 | 4 |
| dungeons | 1 | 3 | 8 |
| mobs per dungeon floor | 4 | 6 | 8 |
| floors per dungeon | 2 | 3 | 4 |
| ticks (DAYS * 1440) | DAYS=1 → 1440 | DAYS=3 → 4320 | DAYS=7 → 10080 |

`phase-a` should produce a snapshot under 5 MB. `full` may produce 30+ MB —
fine for upload to a github blob, but slow to render in the browser, so the
**default committed snapshot** should be `phase-a` or `phase-b`.

---

## 12. Snapshot URL recipe (so the user can preview)

Goal: deliver a URL the user can click to view the chronicle in viv-space.
Format (per the user's example):

```
https://possibly.github.io/viv-space/?url=<URL-encoded raw github URL>
```

Concrete: after committing `mmo/public/chronicle-seed1-scalephase-a-2026-05-07.json`
to branch `claude/plan-mmo-world-xVWOm`, the visualizer URL is:

```
https://possibly.github.io/viv-space/?url=https%3A%2F%2Fgithub.com%2Fpossibly%2Fviv-dump%2Fblob%2Fclaude%2Fplan-mmo-world-xVWOm%2Fmmo%2Fpublic%2Fchronicle-seed1-scalephase-a-2026-05-07.json
```

**Two gotchas the implementer must check:**
1. viv-space's `?url=` may want the **raw** content URL (`raw.githubusercontent.com/...`) not the `blob` URL. The user's example uses `blob`, so leave as `blob` to match — but if rendering fails, swap to `raw.githubusercontent.com/possibly/viv-dump/claude/plan-mmo-world-xVWOm/mmo/public/...` and document the working form in `mmo/README.md`.
2. CORS: github's `blob` URLs serve HTML; the viv-space loader must fetch raw JSON. Inspect `/tmp/viv-space/src/main.ts` to confirm whether it auto-rewrites `blob → raw`. If it does not, prefer `raw.githubusercontent.com` from the start.

`mmo/README.md` should include the exact URL after the snapshot is pushed.

---

## 13. .gitignore and "do not commit reference repos"

Add to `mmo/.gitignore`:

```
node_modules/
*.log
.DS_Store
```

Do **NOT** add `/tmp/viv-ref` or `/tmp/viv-space` — those are outside the
repo, so git will not see them. The discipline is simply: never `cp -r` from
those paths into `mmo/`. The implementer should `git status` after major
checkpoints to confirm nothing unwanted is staged.

Top-level `.gitignore` (at repo root) already excludes `node_modules`. Verify
before staging.

---

## 14. Implementation order (do this in this sequence)

Each step ends with a `git status` and a build-and-run that does not crash.

1. **Bootstrap project.** `mmo/package.json`, `tsconfig.json`, install deps (`@siftystudio/viv-runtime`, `lodash`, `tsx`, `typescript`, `@types/node`, `@types/lodash`). Mirror `fantasy-market/`'s versions exactly.
2. **Enums + clock.** `mmo/src/enums.ts` and `mmo/src/clock.ts`. Add a 1-line dummy `main.ts` that imports them and prints `STATE.timestamp = 0`. `npm start` should succeed.
3. **World seeder.** `mmo/src/world.ts` — locations + characters + items only. No quests, no abilities yet. Print entity counts.
4. **Empty content bundle.** `mmo/src/content/source.viv` with one trivial action (`action greet: …`) so the compiler runs. `mmo/src/content/index.ts` re-exports `compiled_content_bundle.json`. `npm run compile && npm start` — characters perform `greet`, world prints chronicle.
5. **Combat first.** Add `combat.viv`, `tropes.viv` minimal, host functions for damage. Spawn 1 player + 1 mob in a small dungeon. Confirm strike → take-damage → die chain works with `urgent: true`. Verify chronicle has connected nodes in viv-space.
6. **Death + corpse-run.** Add `death.viv`. Verify a slain mob stays dead for 3 ticks then respawns. Then verify a slain *player* corpse-runs and respawns at home.
7. **Resurrect.** Add `cast-resurrect` + `resurrect-target`. Spawn a player + a cleric + a mob; cleric kills the mob, player dies, cleric rezzes. Verify the abandon clauses cancel the queued `respawn`.
8. **Loot + equip.** Add `loot.viv`. Mob drops weapon; player equips it; weapon stat boosts increase strike damage on the next mob.
9. **Progression.** Add `progression.viv`. Killing 5 mobs levels the player; level-up grants a new ability; ability lookup table in `abilities.ts`.
10. **Quests.** Add `quest.viv`, `quests.ts`, `quest-arc.viv` plan. Player talks to NPC, accepts a "kill 3 mobs" quest, completes it, turns in for XP.
11. **Parties.** Add `invite-to-party`, model parties as locations of kind `PARTY`. Two players form a party, share quest credit, share location for `~at-same-spot`.
12. **Dungeons.** Add `dungeon.viv`, `dungeon-run.viv` plan. Party of 3 enters dungeon, clears 2 floors, kills boss, returns.
13. **Sifting.** Add `hero-falls-in-the-dungeon.viv`. Confirm at least one match per simulation at `phase-a` scale.
14. **Snapshot export.** Wire `exportSnapshot()`. Commit the resulting JSON. Push branch.
15. **Visualizer smoke test.** Open the github-pages viv-space URL with the `?url=` parameter pointing at the just-pushed file. If it renders, ship.
16. **README.** Write `mmo/README.md` with run commands and the working URL.

Each step should be its own commit on `claude/plan-mmo-world-xVWOm`.

---

## 15. Testing / sanity checks the implementer must perform

These are not optional. They directly verify the act-react chains.

- **Combat round-trip:** fight a mob, dump the chronicle, confirm: `strike → take-damage → retaliate → take-damage → … → die → drop-loot`. All linked via `causes`/`caused`.
- **Strike embargo:** confirm an attacker does not have two `strike` actions on the same target within 6 ticks.
- **Death blocks die-twice:** verify the `forever` embargo on `die` per `@who` prevents a double-death from being recorded.
- **Corpse-run timing:** kill a player, count chronicle entries; should see exactly 3 `tick-corpse-run` actions before `respawn`.
- **Resurrect cancels respawn:** rez before tick 3 → no `respawn` action in chronicle for that death; the queued one's `abandon` clause must report it abandoned (visible in `vivInternalState.queuedConstructStatuses`).
- **Quest one-shot:** accept and turn in a one-shot quest, then `talk-to-npc` again — must NOT trigger a second `offer-quest` for the same quest. The `forever` embargo per `(player, quest_id)` is the gate.
- **Quest daily reset:** accept a daily, turn it in, advance the clock 24h, confirm a new `offer-quest` fires.
- **Party-mate restriction:** a `cast-resurrect` from a non-party-mate should still work (the user said "friendly nearby other player"), but a heal spell from a non-party-mate should not — write the conditions accordingly.
- **Snapshot loads in viv-space:** the snapshot file must `JSON.parse` cleanly and produce a non-empty graph in viv-space's renderer (no "0 nodes" empty state).

---

## 16. Open questions / DECIDED items recap

| Question | DECIDED |
|---|---|
| Tick length | 1 minute |
| Party representation | Location of kind `PARTY` |
| Quest representation | Host-side static table keyed by string ID |
| Ability representation | Host-side static table keyed by string ID |
| Combat formulas in .viv or host? | Host functions (`combat.ts`) |
| Mob respawn | Host softDrift counter; mob `respawn` reuses the player respawn action |
| Default scale committed | `phase-a` for fast viv-space rendering |
| Default seed | `1` |
| Branch | `claude/plan-mmo-world-xVWOm` (per the system prompt) |
| Snapshot path | `mmo/public/chronicle-seedN-scaleS-YYYY-MM-DD.json` |
| URL form to test first | github `blob/...` (matches user's example); fallback to `raw.githubusercontent.com/...` if loader fails |

---

## 17. What the implementation agent should NOT do

- Do not touch `fantasy-market/`. The MMO project is independent.
- Do not commit `/tmp/viv-ref` or `/tmp/viv-space` — they exist locally only.
- Do not invent new viv runtime APIs. Stick to what `@siftystudio/viv-runtime` exports (verify with `node -e "import('@siftystudio/viv-runtime').then(m => console.log(Object.keys(m)))"`).
- Do not add tests-as-files (e.g., a `tests/` folder). The "tests" in §15 are run-and-observe checks against the chronicle.
- Do not push to any branch other than `claude/plan-mmo-world-xVWOm`. Do not open a PR.
- Do not create any markdown files beyond `mmo/PLAN.md` (this) and `mmo/README.md` (a thin run-recipe).

---

## 18. Quick reference: the act-react chain at a glance

If the implementer has only 60 seconds before writing `.viv` code, this is the
diagram to internalize:

```
                     ┌───────────────────────────────────────┐
                     │     PLAYER SELECTOR PICKS strike      │
                     └───────────────┬───────────────────────┘
                                     │ general
                                     ▼
                                 strike  ──effects──► hp -= dmg
                                     │
                                     │ urgent reaction
                                     ▼
                              take-damage (reserved)
                                     │
                       ┌─────────────┼──────────────┐
                       │ urgent      │ urgent       │
                       ▼             ▼              ▼
                     die         retaliate     (broadcast)
                  (abandon if    (abandon if
                   hp > 0)       victim dead)
                       │
        ┌──────────────┼─────────────────┐
        │ urgent       │ urgent          │ non-urgent
        ▼              ▼                 ▼
   drop-loot   start-corpse-run   broadcast-death
                       │
                       │ time: 1 minute, repeat max 3
                       ▼
                tick-corpse-run
                       │
                       │ urgent (when ticks_remaining == 0)
                       ▼
                   respawn  ──move-to(home)
       (abandoned by cast-resurrect → resurrect-target)
```

The implementer's mental model: *every reserved action either has an `abandon`
clause or carries a `forever` embargo, or both.* That is what keeps the chains
from looping forever or firing twice.
