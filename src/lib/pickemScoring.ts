// src/lib/pickemScoring.ts
// Single source of truth for every scoring value the browser and the server both
// need. Import from here rather than redeclaring — these used to be duplicated in
// `+page.svelte` and `server/scoring.ts` and drifted apart.

// ---------- Match points ----------

// Fixed base for every match. Tune here.
export const BASE_POINTS = 50;

// Match bonuses, added on top of the base. Gold/silver/bronze apply to their
// designated fixture for everyone; the fan-team bonus applies to a player's own
// club's fixture. They STACK — a fan team in the golden match gets 50 + 20 + 10.
export const GOLDEN_BONUS = 20;
export const SILVER_BONUS = 15;
export const BRONZE_BONUS = 10;
export const FAN_BONUS = 10;

// Map a bonus flag to its base-point value.
export function bonusPoints(flag: string | null): number {
    if (flag === 'GOLDEN') return GOLDEN_BONUS;
    if (flag === 'SILVER') return SILVER_BONUS;
    if (flag === 'BRONZE') return BRONZE_BONUS;
    return 0;
}

// ---------- Table-prediction points ----------

// How many places out a club can be before it stops scoring. Also the divisor,
// which is what keeps every table score on a whole number of tenths.
export const TABLE_REACH = 10;

// Points for one club in one week: the matchweek number for an exact call, losing
// a tenth of it per place out, and nothing at TABLE_REACH places or beyond.
// Week 38 → 38, 34.2, 30.4, 26.6, 22.8, 19, 15.2, 11.4, 7.6, 3.8, 0.
export function tableScoring(distance: number, week: number): number {
    if (!Number.isFinite(distance) || distance < 0 || week < 1) return 0;
    if (distance >= TABLE_REACH) return 0;
    // Multiply before dividing so the result lands exactly on a tenth.
    return (week * (TABLE_REACH - distance)) / TABLE_REACH;
}

// ---------- Rounding ----------

// Individual table scores are exact tenths, but summing floats isn't — round any
// running total before it is stored or displayed.
export function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

// Match points are rounded UP to the next tenth, applied per match so no score
// anywhere in the game is ever finer than 0.1.
export function ceil1(n: number): number {
    const tenths = n * 10;
    // A value already sitting on a tenth can land a few ulps above it (0.1 and
    // friends aren't exact in binary). Snap those back instead of letting a
    // 1e-15 error push the score up a whole step.
    const nearest = Math.round(tenths);
    return (Math.abs(tenths - nearest) < 1e-9 ? nearest : Math.ceil(tenths)) / 10;
}
