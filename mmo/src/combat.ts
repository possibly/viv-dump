// Combat math and formulae (host-side).

export function rollHit(attackerAgi: number, targetAgi: number): boolean {
    const base = 0.55 + (attackerAgi - targetAgi) * 0.02;
    const clamped = Math.max(0.1, Math.min(0.95, base));
    return Math.random() < clamped;
}

export function rollCrit(attackerAgi: number): boolean {
    const crit_chance = Math.max(0.05, Math.min(0.5, 0.05 + attackerAgi * 0.01));
    return Math.random() < crit_chance;
}

export function meleeDamage(attackerStr: number, targetArmor: number = 0): number {
    const roll = 1 + Math.floor(Math.random() * 6);
    const base = Math.max(1, attackerStr + roll - Math.floor(targetArmor / 4));
    return base;
}

export function spellDamage(casterInt: number): number {
    const roll = 1 + Math.floor(Math.random() * 8);
    return Math.max(1, casterInt + roll);
}

export function healAmount(healerSpi: number): number {
    const roll = 1 + Math.floor(Math.random() * 6);
    return Math.max(1, healerSpi + roll);
}
