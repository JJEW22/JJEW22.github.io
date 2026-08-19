<!-- src/routes/premierLeaguePickem/+page.svelte -->
<script>
    import { onMount, tick } from 'svelte';
    import { TEAMS, teamById } from '$lib/plTeams';
    import {
        BASE_POINTS,
        GOLDEN_BONUS,
        SILVER_BONUS,
        BRONZE_BONUS,
        FAN_BONUS,
        TABLE_REACH,
        bonusPoints,
        tableScoring,
        round1
    } from '$lib/pickemScoring';
    import { PICK_LOCK_LEAD_MS } from '$lib/season';

    const SEASON = '2026-27';
    const TOTAL_MATCHWEEKS = 38;
    const API = '/premierLeaguePickem/api';
    // 0..TABLE_REACH, for the worked example in the rules tab.
    const distanceRow = Array.from({ length: TABLE_REACH + 1 }, (v, i) => i);

    // Offline fallback so the page still renders before the backend is running.
    const SAMPLE_MATCHWEEKS = {
        1: {
            number: 1,
            fixtures: [
                { id: 'gw1-1', homeId: 'liv', awayId: 'bou', kickoff: '2026-08-21T19:00:00Z' },
                { id: 'gw1-2', homeId: 'avl', awayId: 'new', kickoff: '2026-08-22T11:30:00Z' },
                { id: 'gw1-3', homeId: 'bha', awayId: 'ful', kickoff: '2026-08-22T14:00:00Z' },
                { id: 'gw1-4', homeId: 'sun', awayId: 'cov', kickoff: '2026-08-22T14:00:00Z' },
                { id: 'gw1-5', homeId: 'tot', awayId: 'ips', kickoff: '2026-08-22T14:00:00Z' },
                { id: 'gw1-6', homeId: 'nfo', awayId: 'bre', kickoff: '2026-08-22T16:30:00Z' },
                { id: 'gw1-7', homeId: 'che', awayId: 'cry', kickoff: '2026-08-23T13:00:00Z' },
                { id: 'gw1-8', homeId: 'mci', awayId: 'hul', kickoff: '2026-08-23T15:30:00Z' },
                { id: 'gw1-9', homeId: 'eve', awayId: 'lee', kickoff: '2026-08-24T19:00:00Z' },
                { id: 'gw1-10', homeId: 'mun', awayId: 'ars', kickoff: '2026-08-24T19:00:00Z' }
            ]
        }
    };

    // ---- data layer: real fetches, with graceful fallbacks ----
    async function loadMatchweek(n) {
        try {
            const r = await fetch(`${API}/fixtures?mw=${n}`);
            if (r.ok) return await r.json();
        } catch (_) {}
        return SAMPLE_MATCHWEEKS[n] || { number: n, fixtures: [] };
    }
    async function loadMe() {
        try {
            const r = await fetch(`${API}/me`);
            if (r.ok) return await r.json();
        } catch (_) {}
        return { user: null };
    }
    async function login(identifier, password) {
        try {
            const r = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });
            const data = await r.json();
            return r.ok ? { ok: true } : { ok: false, error: data.error };
        } catch (_) {
            return { ok: false, error: 'Network error.' };
        }
    }
    async function postJSON(path, body) {
        try {
            const r = await fetch(`${API}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return await r.json();
        } catch (_) {
            return { ok: false, error: 'Network error.' };
        }
    }
    async function loadLeaderboard() {
        try {
            const r = await fetch(`${API}/leaderboard`);
            if (r.ok) return await r.json();
        } catch (_) {}
        return [];
    }
    async function loadStandings() {
        try {
            const r = await fetch(`${API}/standings`);
            if (r.ok) return await r.json();
        } catch (_) {}
        return TEAMS.map((t) => ({ teamId: t.id, name: t.name, crest: null, played: 0, won: 0, drawn: 0, lost: 0, gd: 0, points: 0, form: [], formPoints: 0 }));
    }

    // ============================================================
    //  STATE
    // ============================================================
    let activeTab = 'results';

    let user = '';
    let roles = [];
    let joined = false;
    let joining = false;
    let displayName = '';
    let syncStatus = '';
    let syncing = false;
    let loginName = '';
    let loginCode = '';
    let loginError = '';
    let loggingIn = false;

    let currentWeek = 1;
    let matchweek = null;
    let matchPicks = {};
    let matchStatus = '';
    let matchSaving = false;

    let tableOrder = TEAMS.map((t) => t.id);
    let fanTeam = '';
    let fanQuery = '';
    let showFanList = false;
    let predictionsSaved = false;
    let predictionsLocked = false;
    let seasonDeadline = '';
    let seasonSaving = false;
    let seasonStatus = '';
    let dragIndex = null;

    // Everyone's predicted tables. Hidden until an admin reveals them; admins can
    // always look, so they can check the view before publishing it.
    let tablesRevealed = false;
    let tableView = 'mine'; // 'mine' | 'summary' | a player id as a string
    /** @type {any[]} */
    let allTables = [];
    let tablesLoading = false;
    let revealSaving = false;

    /** @type {any[]} */
    let leaderboard = [];
    /** @type {any[]} */
    let standings = [];

    onMount(async () => {
        await applyMe();
        matchweek = await loadMatchweek(currentWeek);
        leaderboard = await loadLeaderboard();
        standings = await loadStandings();
    });

    async function applyMe() {
        const me = await loadMe();
        if (me.user) {
            user = me.user;
            roles = me.roles || [];
            joined = !!me.joined;
            displayName = me.displayName || '';
            matchPicks = me.matchPicks || {};
            if (me.tableOrder) tableOrder = me.tableOrder;
            fanTeam = me.fanTeam || '';
            fanQuery = fanTeam && teamById[fanTeam] ? teamById[fanTeam].name : '';
            predictionsSaved = !!me.predictionsSaved;
            predictionsLocked = !!me.predictionsLocked;
            seasonDeadline = me.deadline || '';
            tablesRevealed = !!me.tablesRevealed;
            loadAllTables();
        }
    }

    // Called on login, on joining, and after an admin flips the reveal switch.
    // A 401/403 just leaves the viewer empty — your own table still edits fine.
    async function loadAllTables() {
        if (tablesLoading) return;
        tablesLoading = true;
        try {
            const r = await fetch(`${API}/tables`);
            if (r.ok) {
                const data = await r.json();
                allTables = data.players || [];
                tablesRevealed = !!data.revealed;
            }
        } catch (_) {
            /* transient; leave the viewer as-is */
        }
        tablesLoading = false;
    }

    // pickem:admin (or site:admin) sees the Admin tab.
    $: isPickemAdmin = roles.includes('site:admin') || roles.includes('pickem:admin');

    // Prediction tabs are gated: must be signed in AND have joined the competition.
    $: predictionsGate = !user || !joined;

    // Competition pot, computed live from the number of joined participants.
    // $10 a head, all of it toward the winner's prize (gear for their club), and the
    // pool caps at $150 — past 15 players the prize stops growing, so each person's
    // share shrinks instead. No lights cost and nothing collected on the day.
    const BUYIN_PRIZE = 10;
    const PRIZE_CAP = 150;
    // Whole amounts render clean ($10, $150); split shares keep their cents ($9.38).
    const money = (n) => {
        const v = Math.round(n * 100) / 100;
        return '$' + (Number.isInteger(v) ? v : v.toFixed(2));
    };
    $: participants = leaderboard.length;
    $: prizePool = Math.min(PRIZE_CAP, BUYIN_PRIZE * participants);
    $: perPrize = participants ? prizePool / participants : BUYIN_PRIZE;

    async function joinCompetition() {
        if (!user) return;
        joining = true;
        try {
            const r = await fetch(`${API}/join`, { method: 'POST' });
            if (r.ok) {
                joined = true;
                loadAllTables(); // the tables endpoint only answers members
            }
        } catch (_) {
            /* transient; leave un-joined */
        }
        joining = false;
    }

    async function toggleRevealTables() {
        revealSaving = true;
        syncStatus = '';
        try {
            const r = await fetch(`${API}/admin/reveal-tables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !tablesRevealed })
            });
            const data = await r.json();
            if (r.ok) {
                tablesRevealed = !!data.enabled;
                await loadAllTables(); // re-read so the viewer matches the new state
            } else {
                syncStatus = data?.message || data?.error || `Could not update (${r.status}).`;
            }
        } catch (_) {
            syncStatus = 'Network error.';
        }
        revealSaving = false;
    }

    async function runSync(which) {
        syncStatus = '';
        syncing = true;
        try {
            const r = await fetch(`${API}/admin/${which}`, { method: 'POST' });
            const data = await r.json();
            if (!r.ok) {
                syncStatus = data?.message || data?.error || `Sync failed (${r.status}).`;
            } else {
                syncStatus = JSON.stringify(data);
            }
        } catch (_) {
            syncStatus = 'Network error.';
        }
        syncing = false;
    }

    // ---- Auth ----
    async function doLogin() {
        loginError = '';
        loggingIn = true;
        const res = await login(loginName, loginCode);
        if (!res.ok) {
            loginError = res.error || 'Could not log in.';
            loggingIn = false;
            return;
        }
        await applyMe();
        loginCode = '';
        loggingIn = false;
    }
    async function logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        user = '';
        roles = [];
        joined = false;
        displayName = '';
        matchPicks = {};
        tableOrder = TEAMS.map((t) => t.id);
        matchStatus = '';
        seasonStatus = '';
        fanTeam = '';
        fanQuery = '';
        predictionsSaved = false;
        predictionsLocked = false;
    }

    // ---- Matches ----
    function kickoffPassed(fixture) {
        // "locked" now means within 15 minutes of kickoff, not just after it.
        return new Date(fixture.kickoff).getTime() - PICK_LOCK_LEAD_MS <= Date.now();
    }

    // Which side (if any) is auto-picked because it's the player's fan team.
    // Only active once season predictions are saved.
    function fanSide(fixture, fan, saved) {
        if (!saved || !fan) return null;
        if (fixture.homeId === fan) return 'HOME';
        if (fixture.awayId === fan) return 'AWAY';
        return null;
    }

    // The golden match this week (kept for possible display use).
    $: goldenFixture = (matchweek?.fixtures || []).find((f) => f.bonus === 'GOLDEN') || null;

    // Per-person effective base for a fixture. Values and bonusPoints() come from
    // $lib/pickemScoring, the same module the server scores with.
    // Gold/silver/bronze apply to their match for everyone; the fan-team bonus
    // applies to the fan's match. They STACK.
    function effectiveBase(fixture, fan, saved) {
        const matchBonus = bonusPoints(fixture.bonus);
        const fanHere = fanSide(fixture, fan, saved) !== null;
        const fanBonus = fanHere ? FAN_BONUS : 0;
        const parts = [{ label: 'Base', pts: BASE_POINTS }];
        if (matchBonus > 0) {
            const label =
                fixture.bonus === 'GOLDEN' ? 'Golden match' : fixture.bonus === 'SILVER' ? 'Silver match' : 'Bronze match';
            parts.push({ label, pts: matchBonus });
        }
        if (fanBonus > 0) parts.push({ label: 'Fan team', pts: fanBonus });
        return { total: BASE_POINTS + matchBonus + fanBonus, parts };
    }
    function baseTooltip(eb) {
        const sum = eb.parts.map((p, i) => (i === 0 ? `${p.label} ${p.pts}` : `+ ${p.label} ${p.pts}`)).join('  ');
        return `${sum}  =  ${eb.total} base points`;
    }

    // Card highlight colours. Bonus matches use gold/silver/bronze; the fan-team
    // match uses that club's colour. If a match is BOTH, split the highlight —
    // the club's colour on the side the club plays (left = home, right = away).
    function bonusColor(flag) {
        return flag === 'GOLDEN' ? '#d4af37' : flag === 'SILVER' ? '#9aa3ad' : flag === 'BRONZE' ? '#c08457' : null;
    }
    function cardHighlight(fixture, fan, saved) {
        const bc = bonusColor(fixture.bonus);
        const side = fanSide(fixture, fan, saved); // 'HOME' | 'AWAY' | null
        const fc = side ? teamById[fan]?.color || '#2c5aa0' : null;
        if (!bc && !fc) return null;
        if (bc && fc) {
            const fanLeft = side === 'HOME';
            return { left: fanLeft ? fc : bc, right: fanLeft ? bc : fc, split: true };
        }
        const c = bc || fc;
        return { left: c, right: c, split: false };
    }
    function pick(fixtureId, choice) {
        matchPicks = { ...matchPicks, [fixtureId]: choice };
    }
    function formatKickoff(iso) {
        return new Date(iso).toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
    }
    // Show the points multiplier only once real odds exist (default sentinel is 1).
    function fmtOdds(m) {
        return m && m !== 1 ? Number(m).toFixed(2) : null;
    }
    function fmtNum(n) {
        return n === null || n === undefined ? null : Number(n).toFixed(2);
    }
    // Probability fraction (0..1) -> whole-number percent.
    function pct(p) {
        return p === null || p === undefined ? null : Math.round(Number(p) * 100);
    }
    async function goToWeek(n) {
        if (n < 1 || n > TOTAL_MATCHWEEKS) return;
        currentWeek = n;
        matchStatus = '';
        matchweek = await loadMatchweek(n);
    }
    async function saveMatchPicks() {
        if (!user) { matchStatus = 'Log in before saving.'; return; }
        const open = (matchweek?.fixtures || []).filter((f) => !kickoffPassed(f));
        const picked = open.filter((f) => matchPicks[f.id]);
        if (picked.length === 0) { matchStatus = 'Make at least one pick before saving.'; return; }
        matchSaving = true;
        matchStatus = '';
        const res = await postJSON('/picks', {
            matchweek: matchweek.number,
            picks: Object.fromEntries(picked.map((f) => [f.id, matchPicks[f.id]]))
        });
        matchSaving = false;
        const n = res.saved ?? picked.length;
        matchStatus = res.ok ? `Saved ${n} pick${n === 1 ? '' : 's'}.` : (res.error || 'Could not save.');
    }

    // ---- Table prediction ----
    function moveUp(i) { if (i <= 0) return; const a = [...tableOrder]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; tableOrder = a; }
    function moveDown(i) { if (i >= tableOrder.length - 1) return; const a = [...tableOrder]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; tableOrder = a; }
    function onDragStart(i) { dragIndex = i; }
    function onDragOver(e) { e.preventDefault(); }
    function onDrop(i) {
        if (dragIndex === null || dragIndex === i) { dragIndex = null; return; }
        const a = [...tableOrder];
        const [m] = a.splice(dragIndex, 1);
        a.splice(i, 0, m);
        tableOrder = a;
        dragIndex = null;
    }
    // Searchable fan-team dropdown
    $: fanMatches = fanQuery.trim()
        ? TEAMS.filter((t) => t.name.toLowerCase().includes(fanQuery.trim().toLowerCase()))
        : TEAMS;
    function selectFan(t) {
        fanTeam = t.id;
        fanQuery = t.name;
        showFanList = false;
    }

    // ---- Everyone's tables ----
    // Gated the same way the tab is, then by the admin's reveal switch.
    $: canViewTables = !predictionsGate && (tablesRevealed || isPickemAdmin);
    // The reveal can be switched off while someone is looking at another player.
    $: if (!canViewTables && tableView !== 'mine') tableView = 'mine';

    $: myTableName = (displayName || user || '').trim();
    $: viewedPlayer =
        tableView === 'mine' || tableView === 'summary'
            ? null
            : allTables.find((p) => String(p.id) === tableView) || null;
    $: tableTitle =
        tableView === 'mine'
            ? 'Your predicted final table'
            : tableView === 'summary'
                ? "Everyone's predicted tables"
                : viewedPlayer
                    ? `${viewedPlayer.name}'s predicted table`
                    : 'Predicted table';

    // Summary grid: one row per club, one column per player, ordered by the
    // group's average call so the grid reads top-to-bottom like a real table.
    $: summaryRows = TEAMS.map((t) => {
        // One cell per player, in the same order as the header row.
        const cells = allTables.map((p) => {
            const i = p.order.indexOf(t.id);
            return { id: p.id, pos: i < 0 ? null : i + 1 };
        });
        const given = cells.map((c) => c.pos).filter((n) => n != null);
        return {
            teamId: t.id,
            name: t.name,
            cells,
            avg: given.length ? given.reduce((a, b) => a + b, 0) / given.length : null
        };
    })
        .sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99))
        // Consensus rank is fixed, so the CL/relegation tint on Avg keeps meaning
        // the group's verdict even when the grid is sorted by one player's column.
        .map((r, i) => ({ ...r, consensus: i + 1 }));

    // Summary-grid columns: club, consensus average, then one per player. All open
    // low-to-high, because every value is a league position.
    let sgSort = { key: 'avg', asc: true };
    // Declared up front so it can be typed; the player columns depend on allTables,
    // so the value itself is reactive.
    /** @type {Record<string, { asc: boolean, get: (r: any) => any }>} */
    let SG_COLS = {};
    $: SG_COLS = {
        club: { asc: true, get: (r) => r.name },
        avg: { asc: true, get: (r) => r.avg },
        ...Object.fromEntries(
            allTables.map((p) => [`p${p.id}`, { asc: true, get: (r) => (r.cells.find((c) => c.id === p.id) || {}).pos }])
        )
    };
    $: sgRows = sortRows(summaryRows, SG_COLS, sgSort);

    async function saveSeasonPredictions() {
        if (!user) { seasonStatus = 'Log in before saving.'; return; }
        if (!fanTeam) { seasonStatus = 'Pick your fan team first.'; return; }
        if (tableOrder.length !== 20) { seasonStatus = 'Order all 20 teams.'; return; }
        seasonSaving = true;
        seasonStatus = '';
        const res = await postJSON('/season', { fanTeam, tableOrder, displayName });
        seasonSaving = false;
        if (res.ok) {
            predictionsSaved = true;
            predictionsLocked = !!res.locked;
            seasonStatus = predictionsLocked ? 'Saved and locked for the season.' : 'Saved. You can still edit until the deadline.';
        } else {
            seasonStatus = res.error || 'Could not save.';
        }
    }

    // ---- Derived ----
    $: openCount = (matchweek?.fixtures || []).filter((f) => !kickoffPassed(f)).length;
    $: pickedCount = (matchweek?.fixtures || []).filter(
        (f) => !kickoffPassed(f) && (matchPicks[f.id] || fanSide(f, fanTeam, predictionsSaved))
    ).length;
    // `rank` is fixed by total and survives re-sorting, so the # column always
    // says where a player actually stands even when you sort by another column.
    $: ranked = [...leaderboard]
        .map((r) => ({ ...r, total: round1((r.matchPoints || 0) + (r.tablePoints || 0)) }))
        .sort((a, b) => b.total - a.total)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    // Uniform across rows — the highest matchweek with a finished match, which is
    // usually still in progress rather than complete.
    $: tableWeek = ranked[0]?.tableWeek || 0;

    // Leaderboard columns. Header labels carry both forms so the compact swap and
    // the sort button stay in one place.
    /** @type {Record<string, { label: string, short?: string, cls: string, title: string, asc: boolean, get: (r: any) => any }>} */
    const LB_COLS = {
        player: { label: 'Player', short: 'Player', cls: '', title: 'Display name', asc: true, get: (r) => r.player },
        fanTeam: { label: 'Team', short: 'T', cls: 'crest-col', title: 'Fan team', asc: true, get: (r) => (r.fanTeam && teamById[r.fanTeam] ? teamById[r.fanTeam].name : '') },
        correctPicks: { label: 'Correct', short: '✓', cls: 'num', title: 'Correct picks', asc: false, get: (r) => r.correctPicks || 0 },
        matchPoints: { label: 'Match', short: 'M', cls: 'num', title: 'Match points', asc: false, get: (r) => r.matchPoints || 0 },
        tablePoints: { label: 'Table', short: 'Tbl', cls: 'num', title: 'Table points', asc: false, get: (r) => r.tablePoints || 0 },
        currentTablePoints: { label: 'Live table', short: 'LT', cls: 'num', title: 'If this week ended with the standings exactly as they are now, the table score you would get for it', asc: false, get: (r) => r.currentTablePoints || 0 },
        total: { label: 'Total', short: 'Tot', cls: 'num hl', title: 'Total points', asc: false, get: (r) => r.total }
    };
    const LB_ORDER = ['player', 'fanTeam', 'correctPicks', 'matchPoints', 'tablePoints', 'currentTablePoints', 'total'];
    let lbSort = { key: 'total', asc: false };
    // Array.sort is stable, so ties keep their by-total order underneath.
    $: lbRows = sortRows(ranked, LB_COLS, lbSort);

    // Premier League table columns. Default is the delivered order, which is already
    // points-then-tiebreakers — sorting by points keeps that thanks to a stable sort.
    /** @type {Record<string, { label: string, short?: string, cls: string, title: string, asc: boolean, get: (r: any) => any }>} */
    const PL_COLS = {
        name: { label: 'Club', cls: '', title: 'Club', asc: true, get: (r) => r.name || r.teamId },
        played: { label: 'P', cls: 'num', title: 'Played', asc: false, get: (r) => r.played },
        won: { label: 'W', cls: 'num', title: 'Won', asc: false, get: (r) => r.won },
        drawn: { label: 'D', cls: 'num', title: 'Drawn', asc: false, get: (r) => r.drawn },
        lost: { label: 'L', cls: 'num', title: 'Lost', asc: false, get: (r) => r.lost },
        gd: { label: 'GD', cls: 'num', title: 'Goal difference', asc: false, get: (r) => r.gd },
        points: { label: 'Pts', cls: 'num hl', title: 'Points', asc: false, get: (r) => r.points },
        formPoints: { label: 'Last 5', cls: 'num', title: 'Points won in the last 5 matches, most recent first', asc: false, get: (r) => r.formPoints }
    };
    const PL_ORDER = ['name', 'played', 'won', 'drawn', 'lost', 'gd', 'points', 'formPoints'];
    let plSort = { key: 'points', asc: false };
    // `pos` is the real league position, so it stays put when you sort by GD or form.
    $: plRows = sortRows((standings || []).map((r, i) => ({ ...r, pos: i + 1 })), PL_COLS, plSort);
    // Club badges come from football-data via the standings route. They're absent
    // when that fetch falls back, so the crest cell degrades to a colour + code chip.
    let crestById = new Map();
    $: {
        const m = new Map();
        for (const s of standings || []) if (s.crest) m.set(s.teamId, s.crest);
        crestById = m;
    }

    // ---- Sortable tables ----
    // Shared by all three grids. A column config is { get, asc }: `get` pulls the
    // value, `asc` is the direction the FIRST click uses — points open high-to-low,
    // names and league positions open low-to-high. Clicking the active column flips.
    /** @param {{key: string, asc: boolean}} state @param {Record<string, any>} cols @param {string} key */
    function sortBy(state, cols, key) {
        if (!cols[key]) return state;
        return state.key === key ? { key, asc: !state.asc } : { key, asc: cols[key].asc };
    }

    // Rows missing a value sink to the bottom in BOTH directions — an unplayed club
    // or a player with no fan team shouldn't outrank anyone just because you flipped.
    /** @param {any[]} rows @param {Record<string, any>} cols @param {{key: string, asc: boolean}} state */
    function sortRows(rows, cols, state) {
        const col = cols[state.key];
        if (!col) return rows;
        const dir = state.asc ? 1 : -1;
        return [...rows].sort((a, b) => {
            const x = col.get(a);
            const y = col.get(b);
            const xm = x == null || x === '';
            const ym = y == null || y === '';
            if (xm || ym) return xm && ym ? 0 : xm ? 1 : -1;
            const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
            return d * dir;
        });
    }

    // Two places swap to a compact form rather than growing a horizontal scrollbar:
    // the standings headers (abbreviated + legend) and the tab row (a dropdown).
    let compactStandings = false;
    let compactTabs = false;

    // Builds an action that flips `apply` when the element's content is too wide.
    // The full-form width is remembered before switching, because once the compact
    // form renders the element fits — measuring again would say "expand", which
    // overflows again, and it would flip back and forth forever.
    /** @param {(compact: boolean) => void} apply */
    function widthFitter(apply) {
        /**
         * @param {HTMLElement} node
         * @param {unknown} deps - changing this re-measures; the value itself is unused
         */
        return function (node, deps) {
            void deps;
            let fullWidth = 0;
            let compact = false;
            function check() {
                if (!compact) {
                    fullWidth = node.scrollWidth;
                    // 1px of tolerance: sub-pixel rounding shouldn't trigger a swap.
                    if (fullWidth > node.clientWidth + 1) {
                        compact = true;
                        apply(true);
                    }
                } else if (fullWidth && node.clientWidth >= fullWidth) {
                    compact = false;
                    apply(false);
                }
            }
            const ro = new ResizeObserver(check);
            ro.observe(node);
            check();
            return {
                // Contents changed, so the remembered width is stale: re-measure from full.
                async update() {
                    fullWidth = 0;
                    compact = false;
                    apply(false);
                    await tick();
                    check();
                },
                destroy() {
                    ro.disconnect();
                }
            };
        };
    }
    const fitStandings = widthFitter((v) => (compactStandings = v));
    const fitTabs = widthFitter((v) => (compactTabs = v));

    // One definition of the tabs, rendered either as a button row or a dropdown.
    const TABS = [
        { id: 'matches', label: 'Match Predictions' },
        { id: 'table', label: 'Season predictions' },
        { id: 'results', label: 'Standings' },
        { id: 'pltable', label: 'PL Table' },
        { id: 'rules', label: 'Rules' }
    ];
    const FEATURES_OPTION = '__features';
    $: visibleTabs = isPickemAdmin ? [...TABS, { id: 'admin', label: 'Admin' }] : TABS;

    /** @param {Event & { currentTarget: HTMLSelectElement }} e */
    function onTabSelect(e) {
        const choice = e.currentTarget.value;
        if (choice === FEATURES_OPTION) {
            e.currentTarget.value = activeTab; // leave the picker on the real tab
            window.location.href = '/featureRequests';
            return;
        }
        activeTab = choice;
    }
</script>

<svelte:head>
    <title>Premier League Pickem</title>
    <meta name="description" content="Pick every match and predict the final table" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="page-background">
    <div class="container">
        <nav class="breadcrumb"><a href="/">&larr; Back to Home</a></nav>

        <main>
            <h1>Premier League Pickem</h1>
            <p class="lede">
                Call the winner of every match and predict where all 20 clubs finish the
                <b>{SEASON}</b> season. Log in, make your picks, and watch the leaderboard move as results come in.
            </p>

            <div class="auth">
                {#if user}
                    <span class="whoami">Logged in as <b>{user}</b></span>
                    {#if !joined}
                        <button class="save-btn small" on:click={joinCompetition} disabled={joining}>{joining ? 'Joining…' : 'Click to join this competition'}</button>
                    {:else}
                        <span class="joined-badge">✓ In the competition</span>
                    {/if}
                    <button class="link-btn" on:click={logout}>Log out</button>
                {:else}
                    <input class="auth-input" type="text" placeholder="Email or username" bind:value={loginName} />
                    <input class="auth-input" type="password" placeholder="Password" bind:value={loginCode} on:keydown={(e) => e.key === 'Enter' && doLogin()} />
                    <button class="save-btn small" on:click={doLogin} disabled={loggingIn}>{loggingIn ? 'Signing in…' : 'Sign in'}</button>
                    {#if loginError}<span class="status-msg err">{loginError}</span>{/if}
                    <span class="auth-note">Sign in with email or username. New here? You'll need an <a href="/account">invite link</a>.</span>
                {/if}
            </div>

            <div
                class="tabs"
                class:as-select={compactTabs}
                role={compactTabs ? undefined : 'tablist'}
                use:fitTabs={visibleTabs.length}
            >
                {#if compactTabs}
                    <select class="tab-select" aria-label="Choose a section" value={activeTab} on:change={onTabSelect}>
                        {#each visibleTabs as t}
                            <option value={t.id}>{t.label}</option>
                        {/each}
                        <option value={FEATURES_OPTION}>Feature Requests ↗</option>
                    </select>
                {:else}
                    {#each TABS as t}
                        <button class="tab" class:active={activeTab === t.id} on:click={() => (activeTab = t.id)}>{t.label}</button>
                    {/each}
                    <a class="tab tab-link" href="/featureRequests">Feature Requests ↗</a>
                    {#if isPickemAdmin}
                        <button class="tab" class:active={activeTab === 'admin'} on:click={() => (activeTab = 'admin')}>Admin</button>
                    {/if}
                {/if}
            </div>

            {#if activeTab === 'matches'}
                <div class="gate-wrap">
                {#if predictionsGate}
                    <div class="gate-overlay">
                        <div class="gate-msg">
                            {#if !user}
                                <p>In order to make predictions please sign in.</p>
                            {:else}
                                <p>Join the competition to make predictions.</p>
                                <button class="save-btn" on:click={joinCompetition} disabled={joining}>{joining ? 'Joining…' : 'Click to join this competition'}</button>
                            {/if}
                        </div>
                    </div>
                {/if}
                <section class="panel" class:blurred={predictionsGate}>
                    <div class="week-nav">
                        <button class="week-btn" on:click={() => goToWeek(currentWeek - 1)} disabled={currentWeek <= 1} aria-label="Previous matchweek">&lsaquo;</button>
                        <h2 class="week-title">Matchweek {currentWeek}</h2>
                        <button class="week-btn" on:click={() => goToWeek(currentWeek + 1)} disabled={currentWeek >= TOTAL_MATCHWEEKS} aria-label="Next matchweek">&rsaquo;</button>
                    </div>

                    {#if matchweek && matchweek.fixtures.length > 0}
                        <p class="progress">{pickedCount} / {openCount} picked</p>
                        <div class="fixtures">
                            {#each matchweek.fixtures as fixture (fixture.id)}
                                {@const home = teamById[fixture.homeId] || { name: fixture.homeName }}
                                {@const away = teamById[fixture.awayId] || { name: fixture.awayName }}
                                {@const locked = kickoffPassed(fixture)}
                                {@const choice = matchPicks[fixture.id]}
                                {@const homeMult = fmtOdds(fixture.multHome)}
                                {@const awayMult = fmtOdds(fixture.multAway)}
                                {@const homePct = pct(fixture.probHome)}
                                {@const awayPct = pct(fixture.probAway)}
                                {@const drawPct = pct(fixture.probDraw)}
                                {@const fanPick = fanSide(fixture, fanTeam, predictionsSaved)}
                                {@const eb = effectiveBase(fixture, fanTeam, predictionsSaved)}
                                {@const hl = cardHighlight(fixture, fanTeam, predictionsSaved)}
                                <div class="fixture" class:locked class:golden={fixture.bonus === 'GOLDEN'} class:silver={fixture.bonus === 'SILVER'} class:bronze={fixture.bonus === 'BRONZE'} class:hl={!!hl} style={hl ? `--hl-left:${hl.left}; --hl-right:${hl.right}` : ''}>
                                    <span class="base-badge" title={baseTooltip(eb)}>{eb.total} pts</span>
                                    <div class="fixture-time">
                                        {formatKickoff(fixture.kickoff)}
                                        {#if fixture.bonus === 'GOLDEN'}<span class="bonus-tag gold">★ Golden match</span>{/if}
                                        {#if fixture.bonus === 'SILVER'}<span class="bonus-tag slv">★ Silver match</span>{/if}
                                        {#if fixture.bonus === 'BRONZE'}<span class="bonus-tag brz">★ Bronze match</span>{/if}
                                        {#if fanPick}<span class="bonus-tag team" style={`--tc:${teamById[fanTeam]?.color || '#2c5aa0'}`}>★ Your team</span>{/if}
                                        {#if locked}<span class="lock-tag">Locked</span>{/if}
                                    </div>
                                    <div class="pick-row two" class:has-draw={homeMult}>
                                        <button
                                            class="pick home"
                                            class:selected={choice === 'HOME' || fanPick === 'HOME'}
                                            class:fan-locked={fanPick === 'HOME'}
                                            disabled={locked || fanPick !== null}
                                            title={fanPick === 'HOME' ? `Auto-picked to win — ${home.name} is your fan team, locked for the season.` : ''}
                                            on:click={() => pick(fixture.id, 'HOME')}
                                        >
                                            <span class="pick-text">
                                                <span class="team">{home.name}{#if fanPick === 'HOME'} <span class="fan-lock-icon" aria-hidden="true">🔒</span>{/if}</span>
                                                <span class="hint">{fanPick === 'HOME' ? 'Your team (locked)' : 'Home win'}</span>
                                            </span>
                                            {#if homeMult}<span class="odds">{homePct}%<span class="mult"> (×{homeMult})</span></span>{/if}
                                        </button>
                                        {#if homeMult}
                                            <div class="draw-box" aria-hidden="true">
                                                <span class="draw-pct">{drawPct}%</span>
                                                <span class="draw-label">Draw</span>
                                            </div>
                                        {/if}
                                        <button
                                            class="pick away"
                                            class:selected={choice === 'AWAY' || fanPick === 'AWAY'}
                                            class:fan-locked={fanPick === 'AWAY'}
                                            disabled={locked || fanPick !== null}
                                            title={fanPick === 'AWAY' ? `Auto-picked to win — ${away.name} is your fan team, locked for the season.` : ''}
                                            on:click={() => pick(fixture.id, 'AWAY')}
                                        >
                                            <span class="pick-text">
                                                <span class="team">{away.name}{#if fanPick === 'AWAY'} <span class="fan-lock-icon" aria-hidden="true">🔒</span>{/if}</span>
                                                <span class="hint">{fanPick === 'AWAY' ? 'Your team (locked)' : 'Away win'}</span>
                                            </span>
                                            {#if awayMult}<span class="odds">{awayPct}%<span class="mult"> (×{awayMult})</span></span>{/if}
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                        <div class="save-row">
                            <button class="save-btn" on:click={saveMatchPicks} disabled={matchSaving}>{matchSaving ? 'Saving…' : 'Save picks'}</button>
                            {#if matchStatus}<span class="status-msg">{matchStatus}</span>{/if}
                        </div>
                    {:else}
                        <div class="empty">No fixtures loaded for this matchweek yet.</div>
                    {/if}
                </section>
                </div>

            {:else if activeTab === 'table'}
                <div class="gate-wrap">
                {#if predictionsGate}
                    <div class="gate-overlay">
                        <div class="gate-msg">
                            {#if !user}
                                <p>In order to make predictions please sign in.</p>
                            {:else}
                                <p>Join the competition to make predictions.</p>
                                <button class="save-btn" on:click={joinCompetition} disabled={joining}>{joining ? 'Joining…' : 'Click to join this competition'}</button>
                            {/if}
                        </div>
                    </div>
                {/if}
                <section class="panel" class:blurred={predictionsGate}>
                    {#if predictionsLocked}
                        <p class="progress">Your season predictions are <b>locked</b> for the season.</p>
                    {:else if predictionsSaved}
                        <p class="progress">Saved — you can still edit until the deadline{#if seasonDeadline} ({new Date(seasonDeadline).toLocaleString()}){/if}.</p>
                    {:else}
                        <p class="progress">Set your fan team and predicted table, then save. Editable until {#if seasonDeadline}{new Date(seasonDeadline).toLocaleString()}{:else}kickoff{/if}; your first save after that locks them permanently.</p>
                    {/if}

                    <h2 class="week-title solo">Display name</h2>
                    <p class="disclosure">The name shown on the leaderboard. Leave blank to use your username (<b>{user || 'your account'}</b>). Locks with the rest of your season predictions.</p>
                    <input
                        class="fan-input"
                        style="max-width:360px; margin-bottom:1.25rem;"
                        type="text"
                        maxlength="40"
                        placeholder={user || 'Display name'}
                        bind:value={displayName}
                        disabled={predictionsLocked}
                    />

                    <h2 class="week-title solo">I'm a fan of…</h2>
                    <div class="fan-picker">
                        <input
                            class="fan-input"
                            type="text"
                            placeholder="Search teams…"
                            bind:value={fanQuery}
                            on:focus={() => (showFanList = true)}
                            on:input={() => (showFanList = true)}
                            disabled={predictionsLocked}
                        />
                        {#if showFanList && !predictionsLocked}
                            <ul class="fan-list">
                                {#each fanMatches as t}
                                    <li><button type="button" class="fan-option" class:sel={t.id === fanTeam} on:click={() => selectFan(t)}>{t.name}</button></li>
                                {:else}
                                    <li class="fan-none">No teams match.</li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                    <p class="disclosure">
                        You'll automatically pick this team to win all of their games this season (but you
                        get half of the points on a tie instead of 1/3 — I did the math, this makes the
                        expected value the same, so <b>just pick your favorite</b>).
                    </p>

                    <div class="table-head">
                        <h2 class="week-title solo">{tableTitle}</h2>
                        {#if canViewTables}
                            <select class="fan-input view-select" aria-label="Whose predicted table to show" bind:value={tableView}>
                                <option value="mine">My predicted table</option>
                                <option value="summary">Summary — everyone</option>
                                {#each allTables as p (p.id)}
                                    <option value={String(p.id)}>{p.name === myTableName ? `${p.name} (you)` : p.name}</option>
                                {/each}
                            </select>
                        {/if}
                    </div>
                    {#if canViewTables && !tablesRevealed}
                        <p class="note">Not published yet — only admins can see other players' tables. Turn it on from the Admin tab.</p>
                    {/if}

                    {#if tableView === 'mine'}
                        <p class="progress">Drag to reorder, or use the arrows. 1st at the top, 20th at the bottom.</p>
                        <ol class="table-predict">
                            {#each tableOrder as teamId, i (teamId)}
                                {@const team = teamById[teamId] || { name: teamId }}
                                <li class="predict-row" class:dragging={dragIndex === i} draggable={!predictionsLocked} on:dragstart={() => onDragStart(i)} on:dragover={onDragOver} on:drop={() => onDrop(i)}>
                                    <span class="pos" class:cl={i < 5} class:rel={i > 16}>{i + 1}</span>
                                    <span class="drag-handle" aria-hidden="true">&#10247;</span>
                                    <span class="predict-team">{team.name}</span>
                                    <span class="row-controls">
                                        <button class="move" on:click={() => moveUp(i)} disabled={i === 0 || predictionsLocked} aria-label="Move up">&#9650;</button>
                                        <button class="move" on:click={() => moveDown(i)} disabled={i === tableOrder.length - 1 || predictionsLocked} aria-label="Move down">&#9660;</button>
                                    </span>
                                </li>
                            {/each}
                        </ol>
                        <div class="save-row">
                            <button class="save-btn" on:click={saveSeasonPredictions} disabled={seasonSaving || predictionsLocked}>{seasonSaving ? 'Saving…' : 'Save my season predictions'}</button>
                            {#if seasonStatus}<span class="status-msg">{seasonStatus}</span>{/if}
                        </div>
                    {:else if tablesLoading}
                        <div class="empty">Loading predictions…</div>
                    {:else if tableView === 'summary'}
                        {#if allTables.length}
                            <p class="progress">Every club, and where each player placed it. Rows are ordered by the group's average call.</p>
                            <div class="table-wrapper">
                                <table class="grid-table summary-grid">
                                    <thead>
                                        <tr>
                                            <th>
                                                <button class="sort-btn" class:active={sgSort.key === 'club'} on:click={() => (sgSort = sortBy(sgSort, SG_COLS, 'club'))}>Club<span class="sort-arrow">{sgSort.key === 'club' ? (sgSort.asc ? '▲' : '▼') : ''}</span></button>
                                            </th>
                                            <th class="num" title="Average predicted position">
                                                <button class="sort-btn" class:active={sgSort.key === 'avg'} on:click={() => (sgSort = sortBy(sgSort, SG_COLS, 'avg'))}>Avg<span class="sort-arrow">{sgSort.key === 'avg' ? (sgSort.asc ? '▲' : '▼') : ''}</span></button>
                                            </th>
                                            {#each allTables as p (p.id)}
                                                <th class="num" title="Sort by where {p.name} placed each club">
                                                    <button class="sort-btn" class:active={sgSort.key === `p${p.id}`} on:click={() => (sgSort = sortBy(sgSort, SG_COLS, `p${p.id}`))}>{p.name}<span class="sort-arrow">{sgSort.key === `p${p.id}` ? (sgSort.asc ? '▲' : '▼') : ''}</span></button>
                                                </th>
                                            {/each}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each sgRows as row (row.teamId)}
                                            <tr>
                                                <td class="strong">{row.name}</td>
                                                <td class="num"><span class="pos-dot" class:cl={row.consensus <= 5} class:rel={row.consensus > 17}>{row.avg == null ? '—' : row.avg.toFixed(1)}</span></td>
                                                {#each row.cells as cell (cell.id)}
                                                    <td class="num">{cell.pos ?? '—'}</td>
                                                {/each}
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {:else}
                            <div class="empty">Nobody has saved a predicted table yet.</div>
                        {/if}
                    {:else if viewedPlayer}
                        <p class="progress">
                            {viewedPlayer.name}'s call for the final table.{#if viewedPlayer.fanTeam} Fan of <b>{(teamById[viewedPlayer.fanTeam] || { name: viewedPlayer.fanTeam }).name}</b> (★).{/if}{#if !viewedPlayer.saved} Not locked in yet.{/if}
                        </p>
                        <ol class="table-predict">
                            {#each viewedPlayer.order as teamId, i (teamId)}
                                {@const team = teamById[teamId] || { name: teamId }}
                                <li class="predict-row static">
                                    <span class="pos" class:cl={i < 5} class:rel={i > 16}>{i + 1}</span>
                                    <span class="predict-team">{team.name}</span>
                                    {#if teamId === viewedPlayer.fanTeam}<span class="fan-star" title="Their fan team">★</span>{/if}
                                </li>
                            {/each}
                        </ol>
                    {:else}
                        <div class="empty">That player's table isn't available.</div>
                    {/if}
                    <p class="legend"><span class="swatch cl"></span> Top 5 (Champions League) <span class="swatch rel"></span> Bottom 3 (relegation)</p>
                </section>
                </div>

            {:else if activeTab === 'results'}
                <section class="panel">
                    <h2 class="week-title solo">Leaderboard</h2>
                    <p class="progress">Everyone's running totals. Updates as results come in.</p>
                    <div class="table-wrapper" use:fitStandings={ranked}>
                        <table class="grid-table" class:compact={compactStandings}>
                            <thead>
                                <tr>
                                    <th title="Rank by total — stays put when you sort by another column">#</th>
                                    {#each LB_ORDER as key (key)}
                                        {@const col = LB_COLS[key]}
                                        <th class={col.cls} title={col.title}>
                                            <button class="sort-btn" class:active={lbSort.key === key} on:click={() => (lbSort = sortBy(lbSort, LB_COLS, key))}>
                                                {compactStandings ? col.short : col.label}<span class="sort-arrow">{lbSort.key === key ? (lbSort.asc ? '▲' : '▼') : ''}</span>
                                            </button>
                                        </th>
                                    {/each}
                                </tr>
                            </thead>
                            <tbody>
                                {#each lbRows as row (row.rank)}
                                    {@const fan = row.fanTeam ? teamById[row.fanTeam] : null}
                                    {@const crest = row.fanTeam ? crestById.get(row.fanTeam) : null}
                                    <tr class:you={row.player === user}>
                                        <td class="num">{row.rank}</td>
                                        <td class="strong">{row.player}</td>
                                        <td class="crest-col">
                                            {#if fan && crest}
                                                <img class="crest" src={crest} alt={fan.name} title={fan.name} loading="lazy" />
                                            {:else if fan}
                                                <span class="crest-chip" style="background:{fan.color}" title={fan.name}>{fan.code}</span>
                                            {:else}
                                                <span class="crest-none" title="No fan team locked in yet">—</span>
                                            {/if}
                                        </td>
                                        <td class="num">{row.correctPicks || 0}</td>
                                        <td class="num">{row.matchPoints || 0}</td>
                                        <td class="num">{row.tablePoints || 0}{#if row.tableProvisional}<span class="prov-star" title="Includes provisional weeks with games in hand — may change once postponed fixtures are played">*</span>{/if}</td>
                                        <td class="num">{#if tableWeek < 1}<span class="not-scored" title="No matchweek has completed yet, so there is nothing to score the table against">—</span>{:else}{row.currentTablePoints || 0}{#if row.currentTableProvisional}<span class="prov-star" title="Clubs still have games in hand, so this week's value can still move">*</span>{/if}{/if}</td>
                                        <td class="num hl">{row.total}</td>
                                    </tr>
                                {:else}
                                    <tr><td colspan="8" class="empty-cell">No players yet.</td></tr>
                                {/each}
                            </tbody>
                        </table>
                        {#if compactStandings}
                            <p class="note legend">
                                <span><b>T</b> Fan team</span>
                                <span><b>✓</b> Correct picks</span>
                                <span><b>M</b> Match points</span>
                                <span><b>Tbl</b> Table points</span>
                                <span><b>LT</b> Live table points</span>
                                <span><b>Tot</b> Total</span>
                            </p>
                        {/if}
                        {#if ranked.some((r) => r.tableProvisional)}
                            <p class="note">* Table points include provisional weeks (teams with games in hand); these may change once postponed fixtures are played.</p>
                        {/if}
                        {#if tableWeek >= 1}
                            <p class="note">"Live table" is what the standings are worth for matchweek {tableWeek}: <b>if the week ended exactly as it stands, that's the table score each player would take from it</b> — so it shows who's currently reading the table best. Nothing here is settled; it moves with every remaining game of the week. Table points only, and it's the in-progress week's running share of the Table column, so don't add it to Total.</p>
                        {:else}
                            <p class="note">"Live table" shows — until the first matchweek completes; there's no table to score predictions against yet.</p>
                        {/if}
                    </div>
                    <p class="note">Match points are {BASE_POINTS} base — plus any Golden/Silver/Bronze and fan-team bonus — times the odds multiplier and the result, rounded up to the next tenth. Table points are the matchweek number for an exact call, less a tenth of it per place out and nothing at {TABLE_REACH}+ places, summed over all 20 clubs every completed week. Full detail on the Rules tab.</p>
                </section>

            {:else if activeTab === 'pltable'}
                <section class="panel">
                    <h2 class="week-title solo">Premier League table</h2>
                    <p class="progress">Live standings for {SEASON}.</p>
                    <div class="table-wrapper">
                        <table class="grid-table">
                            <thead>
                                <tr>
                                    <th title="League position — stays put when you sort by another column">#</th>
                                    {#each PL_ORDER as key (key)}
                                        {@const col = PL_COLS[key]}
                                        <th class={col.cls} title={col.title}>
                                            <button class="sort-btn" class:active={plSort.key === key} on:click={() => (plSort = sortBy(plSort, PL_COLS, key))}>
                                                {col.label}<span class="sort-arrow">{plSort.key === key ? (plSort.asc ? '▲' : '▼') : ''}</span>
                                            </button>
                                        </th>
                                    {/each}
                                </tr>
                            </thead>
                            <tbody>
                                {#each plRows as row (row.teamId)}
                                    {@const team = teamById[row.teamId]}
                                    <tr>
                                        <td class="num"><span class="pos-dot" class:cl={row.pos <= 5} class:rel={row.pos > 17}>{row.pos}</span></td>
                                        <td class="strong">{row.name || (team ? team.name : row.teamId)}</td>
                                        <td class="num">{row.played}</td>
                                        <td class="num">{row.won}</td>
                                        <td class="num">{row.drawn}</td>
                                        <td class="num">{row.lost}</td>
                                        <td class="num">{row.gd > 0 ? '+' : ''}{row.gd}</td>
                                        <td class="num hl">{row.points}</td>
                                        <td class="num">
                                            {#if row.form && row.form.length}
                                                <span class="form-cell">
                                                    <span class="form-pts">{row.formPoints}</span>
                                                    <span class="form-run">
                                                        {#each row.form as r, k (k)}
                                                            <span class="pip" class:w={r === 'W'} class:d={r === 'D'} class:l={r === 'L'} class:latest={k === 0} title="{k === 0 ? 'Most recent — ' : ''}{r === 'W' ? 'Win' : r === 'D' ? 'Draw' : 'Loss'}">{r === 'W' ? '✓' : r === 'D' ? '–' : '✕'}</span>
                                                        {/each}
                                                    </span>
                                                </span>
                                            {:else}
                                                <span class="not-scored" title="No matches played yet">—</span>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    <p class="note">Pulled from football-data.org via the standings route. Zeroed until matches are played. <b>Last 5</b> is points won in the club's five most recent matches, newest first — the ringed result is the latest. Click any header to sort.</p>
                </section>

            {:else if activeTab === 'rules'}
                <section class="panel rules">
                    <h2 class="week-title solo">Rules</h2>

                    <div class="rule-block tldr">
                        <h3>TL;DR</h3>
                        <ul>
                            <li>Each week, <b>pick the winner of every match</b> (no draws). A correct pick scores <b>{BASE_POINTS} base points</b> multiplied by the match odds — closer games are worth more.</li>
                            <li><b>Predict where all 20 clubs finish.</b> You're scored every completed week on how close each club is to where you placed it.</li>
                            <li>Pick a <b>fan team</b> (you're locked into picking them to win every week; the bonuses offset that, so just take your favorite) and a <b>display name</b>. Both lock at <b>23:59 the day before the season</b>.</li>
                            <li>Three "matches of the week" carry bonus points — <span class="chip gold">Golden +{GOLDEN_BONUS}</span> <span class="chip slv">Silver +{SILVER_BONUS}</span> <span class="chip brz">Bronze +{BRONZE_BONUS}</span> — and your fan team's match is <b>+{FAN_BONUS}</b>. These <b>stack</b>.</li>
                            <li>Buy-in is <b>$10</b> a head, all of it toward <b>gear for the winner's club</b>. Nothing else to pay, on the day or otherwise.</li>
                            <li>The season closes with a <b>watch party on Super Sunday</b>, where the last games settle the table and the prize is handed over.</li>
                        </ul>
                    </div>

                    <div class="rule-block">
                        <h3>The competition & buy-in</h3>
                        <p><b>{money(BUYIN_PRIZE)} a person</b>, and every cent of it goes to the prize. The pot below updates live with the <b>{participants}</b> {participants === 1 ? 'player' : 'players'} who've joined so far.</p>
                        <div class="pot-grid single">
                            <div class="pot-card">
                                <span class="pot-label">🏆 Winner's prize</span>
                                <span class="pot-per">{money(perPrize)} / person</span>
                                <span class="pot-pool">Prize: <b>{money(prizePool)}</b></span>
                                <span class="pot-note">{money(BUYIN_PRIZE)} each, prize capped at {money(PRIZE_CAP)}</span>
                            </div>
                        </div>
                        <p class="pot-total">Your buy-in at {participants} {participants === 1 ? 'player' : 'players'}: <b>{money(perPrize)}</b></p>
                        <p class="note">The prize is <b>gear for your club</b> — kit, scarf, whatever you want — bought for the winner out of the pot. The pool caps at {money(PRIZE_CAP)}, so once {PRIZE_CAP / BUYIN_PRIZE} people have joined, each extra player lowers everyone's share rather than growing the prize. There's <b>no lights cost and nothing to pay on the day</b>.</p>
                    </div>

                    <div class="rule-block">
                        <h3>Super Sunday</h3>
                        <ul>
                            <li>The season ends with a <b>watch party on Super Sunday</b> — the final matchday, when all ten games kick off at the same time.</li>
                            <li>It's the last round of picks, and the week that settles the final table, so anything still <span class="prov-star">*</span> provisional resolves there.</li>
                            <li>The winner's gear gets handed over at the party. <b>Nothing to chip in on the day</b> — the {money(BUYIN_PRIZE)} buy-in is the only cost all season.</li>
                        </ul>
                    </div>

                    <div class="rule-block">
                        <h3>Full rules</h3>

                        <h4>Match picks</h4>
                        <ul>
                            <li>Pick <b>Home</b> or <b>Away</b> for every fixture — draws can't be picked. Each pick locks at that match's kickoff.</li>
                            <li>Score for a match = <b>base × odds multiplier × result</b>, where result is <b>1</b> for a correct winner, <b>0</b> for wrong, and <b>1/3</b> if the match ends in a draw.</li>
                            <li>Each match is then <b>rounded up to the next tenth of a point</b>. Nothing anywhere in the game is scored finer than <b>0.1</b>.</li>
                            <li>The <b>odds multiplier</b> is derived from the betting market (vig removed): a pick on a longer shot is worth more than a heavy favorite. It's shown on each match as <span class="chip">%  (×mult)</span>.</li>
                            <li>Base points are <b>{BASE_POINTS}</b>, before any bonuses.</li>
                        </ul>

                        <h4>Bonus matches</h4>
                        <ul>
                            <li>Each week three fixtures are flagged as the most interesting: <span class="chip gold">Golden +{GOLDEN_BONUS}</span>, <span class="chip slv">Silver +{SILVER_BONUS}</span>, <span class="chip brz">Bronze +{BRONZE_BONUS}</span> base points, for everyone.</li>
                            <li>They're chosen from how close the two sides are and — later in the season — how much the game matters to the top or bottom of the table. They're <b>established about two weeks out</b>; further-off weeks show none yet.</li>
                            <li>Bonuses <b>stack</b> with the fan-team bonus (e.g. your fan team in the Golden match is +{GOLDEN_BONUS} and +{FAN_BONUS}, so {BASE_POINTS + GOLDEN_BONUS + FAN_BONUS} base).</li>
                        </ul>

                        <h4>Fan team</h4>
                        <ul>
                            <li>Choose one club for the season. You're <b>locked into picking them to win</b> every one of their matches — you never get to pick against them, however the fixture looks.</li>
                            <li><b>To offset that</b>, their matches carry a <b>+{FAN_BONUS}</b> base bonus and their draws score <b>1/2</b> instead of 1/3.</li>
                            <li>That offset is the point: it cancels out the cost of the forced auto-pick, so <b>no club is a better choice than any other</b> — the expected value comes out even whoever you take. <b>Just pick your favorite.</b></li>
                        </ul>

                        <h4>Season predictions (order, fan team, name)</h4>
                        <ul>
                            <li>Set your <b>predicted final table</b>, your <b>fan team</b>, and your <b>display name</b> together in one save.</li>
                            <li>Freely editable until <b>23:59 the day before the season</b>. After that: if you've already saved, you're <b>locked</b>; if you never saved, your <b>first save locks permanently</b>.</li>
                            <li>You earn <b>no</b> table points, fan bonuses, or half-draw until you've saved at least once.</li>
                        </ul>

                        <h4>Table scoring</h4>
                        <ul>
                            <li>Every completed week, each of the 20 clubs <b>earns</b> you points based on <b>how far its real position is</b> from where you predicted it.</li>
                            <li>The rule is one line: in matchweek <i>W</i>, an exact call is worth <b>W</b>, and every place you're out costs <b>a tenth of W</b>. At <b>{TABLE_REACH} places or more</b> out, that club scores nothing that week.</li>
                            <li>So the table matters more and more as the season runs on — week 1 is worth almost nothing, week 38 is worth 38 times as much — and every score lands on a single decimal place.</li>
                            <li>Week 38 in full, by how many places you're out:
                                <div class="score-row">
                                    {#each distanceRow as d}
                                        <span class="score-cell"><b>{d}</b><span>{tableScoring(d, TOTAL_MATCHWEEKS)}</span></span>
                                    {/each}
                                </div>
                            </li>
                            <li>Your table score is the sum over <b>every club, every completed week</b>, so a club you've read correctly keeps paying out week after week.</li>
                            <li>Weeks where clubs still have games in hand are <b>provisional</b> (marked <span class="prov-star">*</span>) and can shift once postponed games are played.</li>
                        </ul>

                        <h4>Winning</h4>
                        <ul>
                            <li>Your total is <b>match points + table points</b>, updated live as results come in.</li>
                            <li>Highest total at the end of the season takes the pot, spent on <b>gear for the club of their choice</b>.</li>
                        </ul>
                    </div>
                </section>

            {:else if activeTab === 'admin'}
                <section class="panel">
                    <h2 class="week-title solo">Admin</h2>
                    <p class="progress">Pickem admin tools. These also run automatically on a schedule.</p>
                    <div class="admin-actions">
                        <button class="save-btn" on:click={() => runSync('sync-odds')} disabled={syncing}>Sync odds</button>
                        <button class="save-btn" on:click={() => runSync('sync-results')} disabled={syncing}>Sync results</button>
                    </div>
                    {#if syncing}<p class="note">Running…</p>{/if}
                    {#if syncStatus}<pre class="sync-out">{syncStatus}</pre>{/if}

                    <h2 class="week-title solo">Visibility</h2>
                    <label class="admin-toggle">
                        <input type="checkbox" checked={tablesRevealed} on:change={toggleRevealTables} disabled={revealSaving} />
                        <span>Publish everyone's predicted tables</span>
                    </label>
                    <p class="note">
                        {#if tablesRevealed}
                            On — every player in the competition can browse each other's predicted final tables from the Season predictions tab. Uncheck to hide them again.
                        {:else}
                            Off — only admins can see other players' tables. Leave this until after the prediction deadline.
                        {/if}
                    </p>
                </section>
            {/if}
        </main>
    </div>
</div>

<style>
    .page-background { min-height: 100vh; background-color: #4a9b9b; padding: 1rem 0; }
    .fan-picker { position: relative; max-width: 360px; margin-bottom: 0.75rem; }
    .fan-input { width: 100%; box-sizing: border-box; padding: 0.6rem 0.9rem; font-size: 1rem; border: 2px solid #e5e7eb; border-radius: 8px; }
    .fan-input:focus { outline: none; border-color: #2c5aa0; }
    .fan-input:disabled { background: #f3f4f6; color: #6b7280; }
    .fan-list { list-style: none; margin: 0.25rem 0 0; padding: 0.25rem; position: absolute; z-index: 10; background: white; border: 1px solid #e5e7eb; border-radius: 8px; width: 100%; box-sizing: border-box; max-height: 240px; overflow-y: auto; box-shadow: 0 6px 16px rgba(0,0,0,0.12); }
    .fan-option { display: block; width: 100%; text-align: left; padding: 0.5rem 0.7rem; background: none; border: none; border-radius: 6px; cursor: pointer; font-size: 0.95rem; }
    .fan-option:hover { background: #f0f9ff; }
    .fan-option.sel { background: #2c5aa0; color: white; }
    .fan-none { padding: 0.5rem 0.7rem; color: #9ca3af; font-size: 0.9rem; }
    .disclosure { color: #4b5563; font-size: 0.9rem; line-height: 1.6; margin: 0 0 1.5rem; max-width: 640px; }
    .prov-star { color: #f59e0b; font-weight: 700; margin-left: 1px; cursor: help; }
    /* Nothing to compute yet, as opposed to a genuine score of zero */
    .not-scored { color: #9ca3af; cursor: help; }
    /* Fan-team column on the standings table */
    .crest-col { width: 3.25rem; text-align: center; }
    .crest { width: 1.5rem; height: 1.5rem; object-fit: contain; vertical-align: middle; cursor: help; }
    .crest-chip { display: inline-block; min-width: 2.1rem; padding: 0.1rem 0.3rem; border-radius: 6px; color: #fff; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.02em; cursor: help; }
    .crest-none { color: #9ca3af; cursor: help; }
    /* Legend shown only when the standings headers are abbreviated to avoid a scrollbar */
    .legend { display: flex; flex-wrap: wrap; gap: 0.25rem 0.9rem; margin-top: 0.5rem; }
    .legend b { color: #2c5aa0; font-weight: 800; margin-right: 0.15rem; }
    .admin-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 0.5rem 0 1rem; }
    .admin-toggle { display: inline-flex; align-items: center; gap: 0.6rem; margin-top: 0.5rem; font-weight: 600; color: #1a1a1a; cursor: pointer; }
    .admin-toggle input { width: 1.05rem; height: 1.05rem; accent-color: #2c5aa0; cursor: pointer; }
    .sync-out { background: #0f172a; color: #cbd5e1; padding: 0.9rem 1rem; border-radius: 8px; font-size: 0.8rem; white-space: pre-wrap; word-break: break-word; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .breadcrumb { margin-bottom: 2rem; }
    .breadcrumb a { color: #666; text-decoration: none; font-size: 0.9rem; }
    .breadcrumb a:hover { color: #0066cc; }
    main { background: white; border-radius: 12px; padding: 3rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; color: #1a1a1a; }
    .lede { color: #444; line-height: 1.6; margin-bottom: 1.5rem; }
    .subsection { margin-left: 1.5rem; }
    .subsection h3 { color: #1a202c; margin-bottom: 0.5rem; }
    .note { font-size: 0.9rem; color: #6b7280; font-style: italic; margin-top: 1rem; }

    .auth { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin: 2rem 0 1.5rem; padding: 1rem; background: #f3f4f6; border-radius: 8px; }
    .auth-input { padding: 0.6rem 0.9rem; font-size: 0.95rem; border: 2px solid #e5e7eb; border-radius: 8px; }
    .auth-input:focus { outline: none; border-color: #2c5aa0; }
    .whoami { color: #1a1a1a; }
    .auth-note { color: #6b7280; font-size: 0.85rem; font-style: italic; }
    .link-btn { background: none; border: none; color: #2c5aa0; cursor: pointer; text-decoration: underline; font: inherit; }

    .tabs { display: flex; gap: 0.25rem; border-bottom: 2px solid #e5e7eb; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .tab { padding: 0.75rem 1.1rem; background: none; border: none; border-bottom: 3px solid transparent; margin-bottom: -2px; font-size: 1rem; font-weight: 600; color: #6b7280; cursor: pointer; transition: all 0.2s; }
    .tab:hover { color: #2c5aa0; }
    .tab.active { color: #2c5aa0; border-bottom-color: #2c5aa0; }

    .panel { animation: fade 0.25s ease-out; }
    @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    .week-nav { display: flex; align-items: center; justify-content: center; gap: 1.5rem; margin-bottom: 0.5rem; }
    .week-title { margin: 0; color: #1a1a1a; font-size: 1.75rem; min-width: 12rem; text-align: center; }
    .week-title.solo { text-align: left; min-width: 0; }
    .week-btn { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #2c5aa0; background: white; color: #2c5aa0; font-size: 1.4rem; line-height: 1; cursor: pointer; transition: all 0.2s; }
    .week-btn:hover:not(:disabled) { background: #2c5aa0; color: white; }
    .week-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .progress { text-align: center; color: #6b7280; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .week-title.solo + .progress { text-align: left; }

    .fixtures { display: flex; flex-direction: column; gap: 0.75rem; }
    .fixture { position: relative; border: 1px solid #e5e7eb; border-radius: 10px; padding: 0.75rem 1rem 1rem; background: #fafbfc; }
    .fixture.locked { opacity: 0.6; }
    /* Unified highlight: gradient border + light wash. When split, left/right use
       different colours (fan-team side vs bonus side). Respects border-radius. */
    .fixture.hl {
        border: 2px solid transparent;
        background:
            linear-gradient(to right, color-mix(in srgb, var(--hl-left) 14%, #ffffff) 0 50%, color-mix(in srgb, var(--hl-right) 14%, #ffffff) 50% 100%) padding-box,
            linear-gradient(to right, var(--hl-left) 0 50%, var(--hl-right) 50% 100%) border-box;
    }
    /* Effective base-points badge, top-right */
    .base-badge { position: absolute; top: 0.55rem; right: 0.6rem; background: #eef2f7; color: #2c5aa0; border: 1px solid #d7e0ec; border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.72rem; font-weight: 700; cursor: help; }
    .fixture.golden .base-badge { background: #fbf3d6; color: #8a6d1a; border-color: #e6cf7a; }
    .fixture.silver .base-badge { background: #eef1f4; color: #556; border-color: #c7ced6; }
    .fixture.bronze .base-badge { background: #f6e7da; color: #7a4a24; border-color: #ddb595; }
    .bonus-tag { border-radius: 10px; padding: 0.1rem 0.5rem; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .bonus-tag.gold { background: #d4af37; color: #3d2f00; }
    .bonus-tag.slv { background: #9aa3ad; color: #1f242b; }
    .bonus-tag.brz { background: #c08457; color: #2e1a0c; }
    .bonus-tag.team { background: #fff; color: var(--tc); border: 1.5px solid var(--tc); }
    .joined-badge { color: #059669; font-size: 0.85rem; font-weight: 600; }
    .tab-link { text-decoration: none; display: inline-flex; align-items: center; }
    /* Too many tabs to fit in one row: swap the row for a native picker, which
       gets the OS wheel/sheet on a phone instead of a fiddly horizontal scroll. */
    .tabs.as-select { display: block; overflow: visible; border-bottom: none; padding-bottom: 0.25rem; }
    .tab-select { width: 100%; padding: 0.65rem 0.75rem; font-size: 1rem; font-weight: 600; color: #2c5aa0; background: #fff; border: 1px solid #d7e0ec; border-radius: 8px; }
    .tab-select:focus { outline: 2px solid #2c5aa0; outline-offset: 1px; }
    /* Rules tab */
    .rules .rule-block { margin-bottom: 2rem; }
    .rules h3 { font-size: 1.35rem; color: #1a202c; margin: 0 0 0.75rem; }
    .rules h4 { font-size: 1.02rem; color: #2c5aa0; margin: 1.25rem 0 0.4rem; }
    .rules ul { margin: 0.4rem 0 0; padding-left: 1.25rem; }
    .rules li { margin-bottom: 0.5rem; line-height: 1.55; }
    .rule-block.tldr { background: #f3f7fc; border: 1px solid #d7e3f2; border-radius: 12px; padding: 1.25rem 1.5rem; }
    .chip { display: inline-block; border-radius: 8px; padding: 0.02rem 0.4rem; font-size: 0.8rem; font-weight: 700; background: #eef2f7; color: #2c5aa0; border: 1px solid #d7e0ec; }
    .chip.gold { background: #d4af37; color: #3d2f00; border-color: #c39c1f; }
    .chip.slv { background: #9aa3ad; color: #1f242b; border-color: #868f99; }
    .chip.brz { background: #c08457; color: #2e1a0c; border-color: #a86e42; }
    .pot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1rem 0; }
    /* One bucket left in the pot — keep the card from stretching the full width. */
    .pot-grid.single { grid-template-columns: minmax(200px, 320px); }
    /* "places out -> points" strip in the table-scoring rules */
    .score-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.5rem 0 0.25rem; }
    .score-cell { display: flex; flex-direction: column; align-items: center; min-width: 3rem; padding: 0.3rem 0.4rem; background: #f7f9fc; border: 1px solid #d7e0ec; border-radius: 8px; line-height: 1.25; }
    .score-cell b { font-size: 0.72rem; color: #6b7280; font-weight: 700; }
    .score-cell span { font-size: 0.95rem; color: #1f3a63; font-weight: 700; }
    .pot-card { display: flex; flex-direction: column; gap: 0.2rem; background: #fafbfc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1rem 1.1rem; }
    .pot-label { font-weight: 700; color: #1a202c; }
    .pot-per { font-size: 1.5rem; font-weight: 800; color: #2c5aa0; }
    .pot-pool { font-size: 0.9rem; color: #374151; }
    .pot-note { font-size: 0.78rem; color: #6b7280; }
    .pot-total { font-size: 1.05rem; margin: 0.5rem 0 0.25rem; }
    /* Sign-in / join gate over the prediction panels */
    .gate-wrap { position: relative; }
    .gate-wrap .panel.blurred { filter: blur(3px); pointer-events: none; user-select: none; }
    .gate-overlay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.35); border-radius: 12px; }
    .gate-msg { background: rgba(255, 255, 255, 0.95); border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.5rem 2rem; text-align: center; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); max-width: 90%; }
    .gate-msg p { margin: 0 0 0.75rem; font-size: 1.05rem; color: #1a202c; font-weight: 600; }
    .gate-msg p:last-child { margin-bottom: 0; }
    .pick.fan-locked { background: #2c5aa0; border-color: #2c5aa0; cursor: not-allowed; }
    .pick.fan-locked .team, .pick.fan-locked .hint, .pick.fan-locked .odds { color: white; }
    .fan-lock-icon { font-size: 0.75rem; }
    .fixture-time { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.6rem; padding-right: 3.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .lock-tag { background: #6b7280; color: white; border-radius: 10px; padding: 0.1rem 0.5rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .pick-row.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; align-items: stretch; }
    .pick-row.two.has-draw { grid-template-columns: 1fr auto 1fr; }
    .draw-box { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 3.4rem; padding: 0.3rem 0.55rem; border: 1px solid #e5e7eb; border-radius: 8px; background: #f8fafc; }
    .draw-pct { font-weight: 700; font-size: 0.9rem; color: #4b5563; font-variant-numeric: tabular-nums; line-height: 1.1; }
    .draw-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; }
    .pick { border: 2px solid #e5e7eb; background: white; border-radius: 8px; padding: 0.6rem 0.9rem; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; font: inherit; }
    .pick.home { flex-direction: row; text-align: left; }
    .pick.away { flex-direction: row-reverse; text-align: right; }
    .pick-text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
    .pick.home .pick-text { align-items: flex-start; }
    .pick.away .pick-text { align-items: flex-end; }
    .pick .team { font-weight: 600; color: #1a1a1a; line-height: 1.15; }
    .pick .hint { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; }
    .pick .odds { font-weight: 700; font-size: 0.9rem; color: #2c5aa0; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .pick .odds .mult { font-size: 0.72rem; font-weight: 500; opacity: 0.7; margin-left: 0.2rem; }
    .pick:hover:not(:disabled) { border-color: #2c5aa0; }
    .pick.selected { background: #2c5aa0; border-color: #2c5aa0; }
    .pick.selected .team, .pick.selected .hint, .pick.selected .odds { color: white; }
    .pick:disabled { cursor: not-allowed; }

    .save-row { display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
    .save-btn { padding: 0.75rem 1.75rem; background: #2c5aa0; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .save-btn.small { padding: 0.6rem 1.1rem; font-size: 0.9rem; }
    .save-btn:hover:not(:disabled) { background: #1e4080; transform: translateY(-1px); }
    .save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .status-msg { color: #059669; font-size: 0.9rem; }
    .status-msg.err { color: #dc2626; }
    .empty { text-align: center; padding: 2rem; color: #6b7280; background: #f9fafb; border-radius: 8px; }
    .empty-cell { text-align: center; color: #6b7280; padding: 1.5rem; }

    /* Heading + "whose table" picker, side by side until the row runs out of room */
    .table-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .view-select { max-width: 260px; padding: 0.5rem 0.75rem; font-size: 0.95rem; font-weight: 600; color: #2c5aa0; background: white; }
    /* One column per player, so this is the one table that genuinely needs to scroll */
    .summary-grid { min-width: 0; }
    .summary-grid th, .summary-grid td { padding-left: 0.5rem; padding-right: 0.5rem; }

    .table-predict { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .predict-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.55rem 0.85rem; background: white; border: 1px solid #e5e7eb; border-radius: 8px; cursor: grab; }
    .predict-row.dragging { opacity: 0.4; }
    /* Someone else's table: read-only, so no grab cursor and no drag handle */
    .predict-row.static { cursor: default; }
    .fan-star { color: #d4af37; font-size: 0.95rem; cursor: help; }
    .pos { width: 1.8rem; text-align: center; font-weight: 700; color: #6b7280; border-radius: 4px; }
    .pos.cl, .pos-dot.cl { background: rgba(44,90,160,0.12); color: #2c5aa0; }
    .pos.rel, .pos-dot.rel { background: #fee2e2; color: #dc2626; }
    .drag-handle { color: #cbd5e1; font-size: 1.1rem; }
    .predict-team { flex: 1; font-weight: 600; color: #1a1a1a; }
    .row-controls { display: flex; gap: 0.25rem; }
    .move { width: 30px; height: 30px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; color: #4b5563; cursor: pointer; font-size: 0.7rem; transition: all 0.15s; }
    .move:hover:not(:disabled) { background: #2c5aa0; color: white; border-color: #2c5aa0; }
    .move:disabled { opacity: 0.3; cursor: not-allowed; }
    .legend { margin-top: 1rem; font-size: 0.85rem; color: #6b7280; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin-left: 0.75rem; }
    .swatch.cl { background: rgba(44,90,160,0.5); }
    .swatch.rel { background: #fca5a5; }

    .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .grid-table { width: 100%; min-width: 480px; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    /* Abbreviated standings: drop the 480px floor, which is what was both forcing the
       scrollbar and padding the Player column out with the leftover width. */
    .grid-table.compact { min-width: 0; }
    .grid-table.compact th, .grid-table.compact td { padding-left: 0.4rem; padding-right: 0.4rem; }
    .grid-table th { background: #2c5aa0; color: white; padding: 0.75rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
    .grid-table th.num, .grid-table td.num { text-align: center; }
    .grid-table th.hl { background: #1e4080; }
    .grid-table td { padding: 0.7rem 0.75rem; border-bottom: 1px solid #e5e7eb; }
    .grid-table tbody tr:last-child td { border-bottom: none; }
    .grid-table tbody tr:hover { background: #f0f9ff; }
    .grid-table td.strong { font-weight: 600; color: #1a1a1a; }
    .grid-table td.hl { background: rgba(44,90,160,0.08); font-weight: 700; }
    .grid-table tr.you { background: #fef3c7; }
    .pos-dot { display: inline-block; min-width: 1.5rem; padding: 0.1rem 0.3rem; border-radius: 4px; font-weight: 700; }

    /* Sortable headers. The button inherits the th's colour and casing so the row
       still reads as a header rather than a strip of controls. */
    .sort-btn { display: inline-flex; align-items: center; gap: 0.1rem; background: none; border: none; padding: 0; margin: 0; font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; white-space: nowrap; }
    .sort-btn:hover { text-decoration: underline; }
    .sort-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .sort-btn.active { text-decoration: underline; }
    /* Fixed width whether or not an arrow is showing, so toggling the sort can't
       change column widths and set the compact-header fitter oscillating. */
    .sort-arrow { display: inline-block; width: 0.8em; font-size: 0.7em; line-height: 1; }

    /* Last-5 form guide: points won, then one pip per match, most recent first */
    .form-cell { display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
    .form-pts { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 1ch; }
    .form-run { display: inline-flex; gap: 0.3rem; }
    .pip { width: 1.05rem; height: 1.05rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 800; line-height: 1; color: #fff; cursor: help; }
    .pip.w { background: #16a34a; }
    .pip.d { background: #9ca3af; }
    .pip.l { background: #dc2626; }
    /* The most recent result, ringed. box-shadow rather than a border so the pip
       keeps its size and the row doesn't shift. */
    .pip.latest { box-shadow: 0 0 0 1.5px #fff, 0 0 0 3px #1f2937; }

    @media (max-width: 768px) {
        .container { padding: 1rem; }
        main { padding: 1.5rem; }
        h1 { font-size: 1.75rem; }
        .auth { flex-direction: column; align-items: stretch; }
        .auth-input { width: 100%; }
        .pick .team { font-size: 0.85rem; }
        .week-title { font-size: 1.35rem; min-width: 8rem; }

        /* Tabs: scroll horizontally as a single row instead of wrapping into
           several rows of pill buttons. */
        .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .tab, .tab-link { flex: 0 0 auto; white-space: nowrap; padding: 0.6rem 0.85rem; font-size: 0.9rem; }

        /* Match cards: stack Home / Draw / Away instead of a cramped 3-up row
           that forces horizontal scrolling on narrow screens. */
        .pick-row.two, .pick-row.two.has-draw { grid-template-columns: 1fr; gap: 0.5rem; }
        .pick.home, .pick.away { flex-direction: row; text-align: left; }
        .pick.home .pick-text, .pick.away .pick-text { align-items: flex-start; }
        .draw-box { flex-direction: row; justify-content: center; gap: 0.5rem; min-width: 0; padding: 0.4rem 0.75rem; }
    }
</style>