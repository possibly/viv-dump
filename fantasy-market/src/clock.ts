import type { DiegeticTimestamp, TimeOfDay } from "@siftystudio/viv-runtime";

export const TICK_MINUTES = 60;
export const HOURS_PER_DAY = 24;
export const NIGHT_START_HOUR = 21;
export const NIGHT_END_HOUR = 5;

export function hourOf(timestamp: DiegeticTimestamp): number {
    const m = ((timestamp % (HOURS_PER_DAY * 60)) + HOURS_PER_DAY * 60) % (HOURS_PER_DAY * 60);
    return Math.floor(m / 60);
}

export function dayOf(timestamp: DiegeticTimestamp): number {
    return Math.floor(timestamp / (HOURS_PER_DAY * 60));
}

export function isNight(timestamp: DiegeticTimestamp): boolean {
    const h = hourOf(timestamp);
    return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

export function timeOfDayOf(timestamp: DiegeticTimestamp): TimeOfDay {
    const h = hourOf(timestamp);
    const minute = (((timestamp % 60) + 60) % 60);
    return { hour: h, minute };
}
