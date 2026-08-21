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

// ---------- Auto-assigned picks ----------

// A player who never picked still gets a side once the match locks, decided by a
// 50/50 coin — but that match's weight drops by this much. Deducted from the
// effective base, so a wrong coin still scores 0 rather than going negative.
export const AUTO_PICK_PENALTY = 20;

// The coin. Derived from (player, fixture) rather than stored, so the leaderboard
// and the UI always agree and nothing has to run at lock time to keep them in sync.
//
// Deterministic, but not exploitable: an auto-pick is always worth AUTO_PICK_PENALTY
// less than a real one, so knowing your own flip in advance can never beat simply
// making the pick.
export function coinPick(userId: number, fixtureId: string): 'HOME' | 'AWAY' {
    // FNV-1a over "<userId>:<fixtureId>", then an xorshift-multiply finalizer.
    // FNV alone doesn't avalanche into the low bit well enough to split 50/50 on
    // the near-sequential keys this gets called with; the finalizer fixes that.
    const key = `${userId}:${fixtureId}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    return (h & 1) === 0 ? 'HOME' : 'AWAY';
}

// Effective base for one match: the fixed base, plus any bonuses that apply, less
// the penalty when nobody made the call. Never below zero.
export function effectiveBasePoints(matchBonus: number, fanBonus: number, auto: boolean): number {
    return Math.max(0, BASE_POINTS + matchBonus + fanBonus - (auto ? AUTO_PICK_PENALTY : 0));
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
