// src/lib/season.ts
// Season-prediction lock deadline: 23:59 the day before games start (Aug 20, 2026, ET).
export const PREDICTIONS_DEADLINE = new Date('2026-08-20T23:59:00-04:00');

export function deadlinePassed(now: Date = new Date()): boolean {
    return now.getTime() > PREDICTIONS_DEADLINE.getTime();
}