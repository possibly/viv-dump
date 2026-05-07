// Quest table: quest definitions (not entities; host-side).

export type QuestType = "one-shot" | "daily";

export interface Quest {
    id: string;
    npc_id: string;
    name: string;
    type: QuestType;
    location: string;
    objective: string;
    xp_reward: number;
    gold_reward: number;
    level_required: number;
}

export const QUESTS: Record<string, Quest> = {
    "kill-mobs-1": {
        id: "kill-mobs-1",
        npc_id: "questgiver-1",
        name: "Slay the Rats",
        type: "one-shot",
        location: "dungeon-floor-1",
        objective: "Defeat 5 rats",
        xp_reward: 100,
        gold_reward: 50,
        level_required: 1,
    },
    "kill-mobs-2": {
        id: "kill-mobs-2",
        npc_id: "questgiver-1",
        name: "Clear the Goblins",
        type: "daily",
        location: "dungeon-floor-1",
        objective: "Defeat 3 goblins",
        xp_reward: 50,
        gold_reward: 25,
        level_required: 3,
    },
};

export function questsAvailableForLevel(level: number): Quest[] {
    return Object.values(QUESTS).filter(q => q.level_required <= level);
}

export function questsForNpc(npcId: string): Quest[] {
    return Object.values(QUESTS).filter(q => q.npc_id === npcId);
}
