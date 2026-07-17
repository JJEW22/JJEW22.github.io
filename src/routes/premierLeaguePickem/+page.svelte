<!-- src/routes/premierLeaguePickem/+page.svelte -->
<script>
    import Collapsible from '$lib/Collapsible.svelte';
    import { onMount } from 'svelte';
    import { TEAMS, teamById } from '$lib/plTeams';

    const SEASON = '2026-27';
    const TOTAL_MATCHWEEKS = 38;
    const API = '/premierLeaguePickem/api';

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
        return TEAMS.map((t) => ({ teamId: t.id, name: t.name, played: 0, won: 0, drawn: 0, lost: 0, gd: 0, points: 0 }));
    }

    // ============================================================
    //  STATE
    // ============================================================
    let activeTab = 'matches';

    let user = '';
    let roles = [];
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
    let tableStatus = '';
    let tableSaving = false;
    let dragIndex = null;

    let leaderboard = [];
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
            matchPicks = me.matchPicks || {};
            if (me.tableOrder) tableOrder = me.tableOrder;
        }
    }

    // pickem:admin (or site:admin) sees the Admin tab.
    $: isPickemAdmin = roles.includes('site:admin') || roles.includes('pickem:admin');

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
        matchPicks = {};
        tableOrder = TEAMS.map((t) => t.id);
        matchStatus = '';
        tableStatus = '';
    }

    // ---- Matches ----
    function kickoffPassed(fixture) {
        return new Date(fixture.kickoff).getTime() <= Date.now();
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
    async function saveTablePrediction() {
        if (!user) { tableStatus = 'Log in before saving.'; return; }
        tableSaving = true;
        tableStatus = '';
        const res = await postJSON('/table', { order: tableOrder });
        tableSaving = false;
        tableStatus = res.ok ? 'Table saved.' : (res.error || 'Could not save.');
    }

    // ---- Derived ----
    $: openCount = (matchweek?.fixtures || []).filter((f) => !kickoffPassed(f)).length;
    $: pickedCount = (matchweek?.fixtures || []).filter((f) => !kickoffPassed(f) && matchPicks[f.id]).length;
    $: ranked = [...leaderboard]
        .map((r) => ({ ...r, total: (r.matchPoints || 0) + (r.tablePoints || 0) }))
        .sort((a, b) => b.total - a.total);
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

            <Collapsible id="how-it-works" title="How scoring works" variant="minimal" titleSize="1.75rem" titleWeight="300" titleColor="#1a202c" iconType="arrow">
                <div class="subsection">
                    <h3>Match picks</h3>
                    <ul>
                        <li>Pick a winner for each fixture &mdash; no draws.</li>
                        <li>Correct winner: <b>1 point</b>. Wrong: <b>0</b>.</li>
                        <li>Each pick locks at that match's kickoff.</li>
                    </ul>
                    <h3>Table prediction</h3>
                    <ul>
                        <li>Set the finishing order once, before the season starts.</li>
                        <li>Scored on how close each club lands to where you placed it, updated live.</li>
                    </ul>
                    <p class="note">
                        Open question for the scoring rules: since a draw can't be picked, decide what a
                        pick earns when the real match ends level. Numbers above are provisional.
                    </p>
                </div>
            </Collapsible>

            <div class="auth">
                {#if user}
                    <span class="whoami">Logged in as <b>{user}</b></span>
                    <button class="link-btn" on:click={logout}>Log out</button>
                {:else}
                    <input class="auth-input" type="text" placeholder="Email or username" bind:value={loginName} />
                    <input class="auth-input" type="password" placeholder="Password" bind:value={loginCode} on:keydown={(e) => e.key === 'Enter' && doLogin()} />
                    <button class="save-btn small" on:click={doLogin} disabled={loggingIn}>{loggingIn ? 'Signing in…' : 'Sign in'}</button>
                    {#if loginError}<span class="status-msg err">{loginError}</span>{/if}
                    <span class="auth-note">Sign in with email or username. New here? You'll need an <a href="/account">invite link</a>.</span>
                {/if}
            </div>

            <div class="tabs" role="tablist">
                <button class="tab" class:active={activeTab === 'matches'} on:click={() => (activeTab = 'matches')}>Matches</button>
                <button class="tab" class:active={activeTab === 'table'} on:click={() => (activeTab = 'table')}>Predict Table</button>
                <button class="tab" class:active={activeTab === 'results'} on:click={() => (activeTab = 'results')}>Results</button>
                <button class="tab" class:active={activeTab === 'pltable'} on:click={() => (activeTab = 'pltable')}>PL Table</button>
                {#if isPickemAdmin}
                    <button class="tab" class:active={activeTab === 'admin'} on:click={() => (activeTab = 'admin')}>Admin</button>
                {/if}
            </div>

            {#if activeTab === 'matches'}
                <section class="panel">
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
                                <div class="fixture" class:locked>
                                    <div class="fixture-time">
                                        {formatKickoff(fixture.kickoff)}
                                        {#if locked}<span class="lock-tag">Locked</span>{/if}
                                    </div>
                                    <div class="pick-row two" class:has-draw={homeMult}>
                                        <button class="pick home" class:selected={choice === 'HOME'} disabled={locked} on:click={() => pick(fixture.id, 'HOME')}>
                                            <span class="pick-text">
                                                <span class="team">{home.name}</span>
                                                <span class="hint">Home win</span>
                                            </span>
                                            {#if homeMult}<span class="odds">{homePct}%<span class="mult"> (×{homeMult})</span></span>{/if}
                                        </button>
                                        {#if homeMult}
                                            <div class="draw-box" aria-hidden="true">
                                                <span class="draw-pct">{drawPct}%</span>
                                                <span class="draw-label">Draw</span>
                                            </div>
                                        {/if}
                                        <button class="pick away" class:selected={choice === 'AWAY'} disabled={locked} on:click={() => pick(fixture.id, 'AWAY')}>
                                            <span class="pick-text">
                                                <span class="team">{away.name}</span>
                                                <span class="hint">Away win</span>
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

            {:else if activeTab === 'table'}
                <section class="panel">
                    <h2 class="week-title solo">Your predicted final table</h2>
                    <p class="progress">Drag to reorder, or use the arrows. 1st at the top, 20th at the bottom.</p>
                    <ol class="table-predict">
                        {#each tableOrder as teamId, i (teamId)}
                            {@const team = teamById[teamId] || { name: teamId }}
                            <li class="predict-row" class:dragging={dragIndex === i} draggable="true" on:dragstart={() => onDragStart(i)} on:dragover={onDragOver} on:drop={() => onDrop(i)}>
                                <span class="pos" class:cl={i < 5} class:rel={i > 16}>{i + 1}</span>
                                <span class="drag-handle" aria-hidden="true">&#10247;</span>
                                <span class="predict-team">{team.name}</span>
                                <span class="row-controls">
                                    <button class="move" on:click={() => moveUp(i)} disabled={i === 0} aria-label="Move up">&#9650;</button>
                                    <button class="move" on:click={() => moveDown(i)} disabled={i === tableOrder.length - 1} aria-label="Move down">&#9660;</button>
                                </span>
                            </li>
                        {/each}
                    </ol>
                    <div class="save-row">
                        <button class="save-btn" on:click={saveTablePrediction} disabled={tableSaving}>{tableSaving ? 'Saving…' : 'Save table prediction'}</button>
                        {#if tableStatus}<span class="status-msg">{tableStatus}</span>{/if}
                    </div>
                    <p class="legend"><span class="swatch cl"></span> Top 5 (Champions League) <span class="swatch rel"></span> Bottom 3 (relegation)</p>
                </section>

            {:else if activeTab === 'results'}
                <section class="panel">
                    <h2 class="week-title solo">Leaderboard</h2>
                    <p class="progress">Everyone's running totals. Updates as results come in.</p>
                    <div class="table-wrapper">
                        <table class="grid-table">
                            <thead>
                                <tr><th>#</th><th>Player</th><th class="num">Match</th><th class="num">Table</th><th class="num hl">Total</th></tr>
                            </thead>
                            <tbody>
                                {#each ranked as row, i}
                                    <tr class:you={row.player === user}>
                                        <td class="num">{i + 1}</td>
                                        <td class="strong">{row.player}</td>
                                        <td class="num">{row.matchPoints || 0}</td>
                                        <td class="num">{row.tablePoints || 0}{#if row.tableProvisional}<span class="prov-star" title="Includes provisional weeks with games in hand — may change once postponed fixtures are played">*</span>{/if}</td>
                                        <td class="num hl">{row.total}</td>
                                    </tr>
                                {:else}
                                    <tr><td colspan="5" class="empty-cell">No players yet.</td></tr>
                                {/each}
                            </tbody>
                        </table>
                        {#if ranked.some((r) => r.tableProvisional)}
                            <p class="note">* Table points include provisional weeks (teams with games in hand); these may change once postponed fixtures are played.</p>
                        {/if}
                    </div>
                    <p class="note">Match scoring is provisional (1 for a correct winner); table scoring is still to be wired.</p>
                </section>

            {:else if activeTab === 'pltable'}
                <section class="panel">
                    <h2 class="week-title solo">Premier League table</h2>
                    <p class="progress">Live standings for {SEASON}.</p>
                    <div class="table-wrapper">
                        <table class="grid-table">
                            <thead>
                                <tr><th>#</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GD</th><th class="num hl">Pts</th></tr>
                            </thead>
                            <tbody>
                                {#each standings as row, i}
                                    {@const team = teamById[row.teamId]}
                                    <tr>
                                        <td class="num"><span class="pos-dot" class:cl={i < 5} class:rel={i > 16}>{i + 1}</span></td>
                                        <td class="strong">{row.name || (team ? team.name : row.teamId)}</td>
                                        <td class="num">{row.played}</td>
                                        <td class="num">{row.won}</td>
                                        <td class="num">{row.drawn}</td>
                                        <td class="num">{row.lost}</td>
                                        <td class="num">{row.gd > 0 ? '+' : ''}{row.gd}</td>
                                        <td class="num hl">{row.points}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    <p class="note">Pulled from football-data.org via the standings route. Zeroed until matches are played.</p>
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
                </section>
            {/if}
        </main>
    </div>
</div>

<style>
    .page-background { min-height: 100vh; background-color: #4a9b9b; padding: 1rem 0; }
    .prov-star { color: #f59e0b; font-weight: 700; margin-left: 1px; cursor: help; }
    .admin-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 0.5rem 0 1rem; }
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
    .fixture { border: 1px solid #e5e7eb; border-radius: 10px; padding: 0.75rem 1rem 1rem; background: #fafbfc; }
    .fixture.locked { opacity: 0.6; }
    .fixture-time { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.6rem; display: flex; gap: 0.5rem; align-items: center; }
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

    .table-predict { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .predict-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.55rem 0.85rem; background: white; border: 1px solid #e5e7eb; border-radius: 8px; cursor: grab; }
    .predict-row.dragging { opacity: 0.4; }
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

    @media (max-width: 768px) {
        .container { padding: 1rem; }
        main { padding: 1.5rem; }
        h1 { font-size: 1.75rem; }
        .auth { flex-direction: column; align-items: stretch; }
        .auth-input { width: 100%; }
        .pick .team { font-size: 0.85rem; }
        .week-title { font-size: 1.35rem; min-width: 8rem; }
    }
</style>