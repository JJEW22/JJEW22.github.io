<!-- src/routes/jpFlicks/admin/+page.svelte -->
<!--
	Season setup. This is what replaces editing jpFlicksSeason*.xlsx.

	Create a season, add each team with its two players, link those players to
	accounts, then generate the fixture grid. Generating works out which pairs
	can't meet — two teams sharing a player — from the rosters, which the
	spreadsheet recorded by hand as XXX and got wrong at least once.

	Every page in this app is prerendered (see src/routes/+layout.js), so there
	is no server load to gate on: the page renders for anyone and shows a denied
	state, while /jpFlicks/api/admin/setup enforces the role.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import '../../../app.css';
	import type { Match, Season, Team, Viewer } from '$lib/jpFlicks';

	type LiveMatch = Match & { canSubmit: boolean; canApprove: boolean };
	interface Account {
		id: number;
		username: string;
	}

	const API = '/jpFlicks/api/admin/setup';

	let status = 'loading'; // loading | denied | ready
	let seasons: Season[] = [];
	let season: Season | null = null;
	let teams: Team[] = [];
	let matches: LiveMatch[] = [];
	let accounts: Account[] = [];
	let viewer: Viewer = { userId: null, username: null, isAdmin: false, teamIds: [] };

	let busy = false;
	let msg = '';
	let error = '';

	// Season form
	let sSlug = '';
	let sLabel = '';
	let sNumber = 3;
	let sHome = 'Council';
	let sAway = 'Anish';
	let sCurrent = false;
	let sPublished = false;
	let creatingSeason = false;

	// Team form
	let tId: number | null = null;
	let tName = '';
	let tPoints = '0';
	let p1Name = '';
	let p1User = '';
	let p2Name = '';
	let p2User = '';

	onMount(() => load());

	async function load(slug?: string) {
		try {
			const qs = slug ? `?season=${encodeURIComponent(slug)}` : '';
			const res = await fetch(`/jpFlicks/api/season${qs}`);
			if (!res.ok) throw new Error(String(res.status));
			apply(await res.json());
			status = viewer.isAdmin ? 'ready' : 'denied';
		} catch {
			error = 'Could not load the league.';
			status = 'denied';
		}
	}

	function apply(data: {
		seasons?: Season[];
		season?: Season | null;
		teams?: Team[];
		matches?: LiveMatch[];
		accounts?: Account[];
		viewer?: Viewer;
	}) {
		seasons = data.seasons ?? [];
		season = data.season ?? null;
		teams = data.teams ?? [];
		matches = data.matches ?? [];
		if (data.accounts) accounts = data.accounts;
		if (data.viewer) viewer = data.viewer;
		syncSeasonForm();
	}

	function syncSeasonForm() {
		if (creatingSeason || !season) return;
		sSlug = season.slug;
		sLabel = season.label;
		sNumber = season.seasonNumber;
		sHome = season.homeVenue;
		sAway = season.awayVenue;
		sCurrent = season.isCurrent;
		sPublished = season.isPublished;
	}

	function pickSeason(slug: string) {
		if (season?.slug === slug) return;
		msg = '';
		error = '';
		creatingSeason = false;
		cancelTeam();
		load(slug);
	}

	function startNewSeason() {
		creatingSeason = true;
		// Guess the next number from what exists, so the common case is one click.
		const highest = seasons.reduce((n, s) => Math.max(n, s.seasonNumber), 0);
		sNumber = highest + 1;
		sSlug = `season-${sNumber}`;
		sLabel = `Season ${sNumber}`;
		sHome = 'Council';
		sAway = 'Anish';
		sCurrent = true;
		// New seasons start unpublished: you set one up over several sittings,
		// and it should not appear on the league page until it is ready.
		sPublished = false;
		msg = '';
		error = '';
	}

	async function send(body: Record<string, unknown>) {
		busy = true;
		msg = '';
		error = '';
		try {
			const res = await fetch(API, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ season: season?.slug, ...body })
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				error = data?.error || `That didn't work (${res.status}).`;
				return null;
			}
			apply(data);
			return data;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			return null;
		} finally {
			busy = false;
		}
	}

	async function saveSeason() {
		const data = await send({
			action: 'season',
			slug: sSlug,
			label: sLabel,
			seasonNumber: sNumber,
			homeVenue: sHome,
			awayVenue: sAway,
			isCurrent: sCurrent,
			isPublished: sPublished
		});
		if (data) {
			msg = creatingSeason ? `Created ${sLabel}.` : `Saved ${sLabel}.`;
			creatingSeason = false;
			await load(sSlug);
		}
	}

	// --- teams ---

	function editTeam(t: Team) {
		tId = t.id;
		tName = t.name;
		tPoints = String(t.tournamentPoints);
		const one = t.players.find((p) => p.slot === 1);
		const two = t.players.find((p) => p.slot === 2);
		p1Name = one?.name ?? '';
		p1User = one?.userId === undefined || one?.userId === null ? '' : String(one.userId);
		p2Name = two?.name ?? '';
		p2User = two?.userId === undefined || two?.userId === null ? '' : String(two.userId);
		msg = '';
		error = '';
	}

	function cancelTeam() {
		tId = null;
		tName = '';
		tPoints = '0';
		p1Name = '';
		p1User = '';
		p2Name = '';
		p2User = '';
	}

	async function saveTeam() {
		const was = tId;
		const data = await send({
			action: 'team',
			id: tId,
			name: tName,
			tournamentPoints: Number(tPoints || 0),
			players: [
				{ name: p1Name, userId: p1User === '' ? null : Number(p1User) },
				{ name: p2Name, userId: p2User === '' ? null : Number(p2User) }
			]
		});
		if (data) {
			msg = was ? `Saved ${tName}.` : `Added ${tName}. Generate fixtures once every team is in.`;
			cancelTeam();
		}
	}

	async function removeTeam(t: Team) {
		if (!confirm(`Delete ${t.name}? Its fixtures and results go with it.`)) return;
		if (await send({ action: 'delete', id: t.id })) {
			msg = `Deleted ${t.name}.`;
			if (tId === t.id) cancelTeam();
		}
	}

	async function generate() {
		if (!confirm('Generate the fixture grid for this season? Played games are left alone.')) {
			return;
		}
		const data = await send({ action: 'fixtures' });
		if (data?.report) {
			const r = data.report;
			msg = `${r.created} new fixtures, ${r.kept} left alone, ${r.disallowed} blocked by a shared player.`;
		}
	}

	$: playedCount = matches.filter((m) => m.status === 'final').length;
	$: pendingCount = matches.filter((m) => m.status === 'pending').length;
	$: disallowedCount = matches.filter((m) => m.status === 'disallowed').length;
	$: expectedFixtures = teams.length * (teams.length - 1); // n(n-1)/2 pairs × 2 venues
	$: fixturesMissing = expectedFixtures - matches.length;

	function accountName(id: number | null): string {
		if (id === null) return '—';
		return accounts.find((a) => a.id === id)?.username ?? `#${id}`;
	}
</script>

<svelte:head>
	<title>JP Flicks admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<nav class="breadcrumb"><a href="/jpFlicks">← Back to the league</a></nav>

	<main>
		{#if status === 'loading'}
			<p class="note">Checking…</p>
		{:else if status === 'denied'}
			<h1>Not an admin</h1>
			<p class="note">
				This page needs the <code>jpflicks:admin</code> role. Sign in with an account that has it,
				or go back to <a href="/jpFlicks">the league</a>.
			</p>
		{:else}
			<h1>JP Flicks admin</h1>

			<div class="tabs">
				{#each seasons as s (s.slug)}
					<button
						type="button"
						class="tab"
						class:active={season?.slug === s.slug}
						on:click={() => pickSeason(s.slug)}
					>
						{s.label}
						{#if s.isCurrent}<span class="flag">now</span>{/if}
						{#if !s.isPublished}<span class="flag hidden-flag">hidden</span>{/if}
					</button>
				{/each}
				<button type="button" class="tab new" on:click={startNewSeason}>+ New season</button>
			</div>

			{#if msg}<p class="banner ok">{msg}</p>{/if}
			{#if error}<p class="banner bad">{error}</p>{/if}

			<!-- season -->
			<section class="panel">
				<h2>{creatingSeason ? 'New season' : `Season: ${season?.label ?? '—'}`}</h2>
				<form class="grid" on:submit|preventDefault={saveSeason}>
					<label>
						<span>Slug</span>
						<input bind:value={sSlug} placeholder="season-3" disabled={!creatingSeason} />
					</label>
					<label>
						<span>Label</span>
						<input bind:value={sLabel} placeholder="Season 3" />
					</label>
					<label>
						<span>Number</span>
						<input type="number" bind:value={sNumber} min="1" />
					</label>
					<label>
						<span>Home venue</span>
						<input bind:value={sHome} placeholder="Council" />
					</label>
					<label>
						<span>Away venue</span>
						<input bind:value={sAway} placeholder="Anish" />
					</label>
					<label class="check">
						<input type="checkbox" bind:checked={sCurrent} />
						<span>Current season</span>
					</label>
					<label class="check">
						<input type="checkbox" bind:checked={sPublished} />
						<span>Published</span>
					</label>
					<div class="actions">
						<button type="submit" class="primary" disabled={busy || !sSlug || !sLabel}>
							{creatingSeason ? 'Create' : 'Save'}
						</button>
						{#if creatingSeason}
							<button
								type="button"
								disabled={busy}
								on:click={() => {
									creatingSeason = false;
									syncSeasonForm();
								}}
							>
								Cancel
							</button>
						{/if}
					</div>
				</form>
				<p class="note hint">
					The two venues are the names the results grid uses for the home and away halves of the
					double round robin. Only the current season accepts results from players; past seasons
					stay editable by an admin.
				</p>
				<p class="note hint">
					<b>Published</b> controls who can find a season, not who can use it. An unpublished season
					is missing from the tabs on the league page and is never the season a visitor lands on —
					but it still opens for anyone given the direct link
					{#if season && !season.isPublished}
						(<a href="/jpFlicks?season={season.slug}">this one's</a>),
					{:else}
						,
					{/if}
					and results work in it exactly as normal.
				</p>
			</section>

			<!-- teams -->
			<section class="panel">
				<h2>Teams ({teams.length})</h2>

				<form class="grid" on:submit|preventDefault={saveTeam}>
					<label class="wide">
						<span>Team name</span>
						<input bind:value={tName} placeholder="Crok Messieurs" maxlength="60" />
					</label>
					<label>
						<span>Tournament pts</span>
						<input bind:value={tPoints} inputmode="decimal" placeholder="0" />
					</label>
					<div></div>

					<label>
						<span>Player 1</span>
						<input bind:value={p1Name} placeholder="Jack" maxlength="60" />
					</label>
					<label>
						<span>…account</span>
						<select bind:value={p1User}>
							<option value="">— none —</option>
							{#each accounts as a (a.id)}
								<option value={String(a.id)}>{a.username}</option>
							{/each}
						</select>
					</label>
					<label>
						<span>Player 2</span>
						<input bind:value={p2Name} placeholder="Vedant" maxlength="60" />
					</label>
					<label>
						<span>…account</span>
						<select bind:value={p2User}>
							<option value="">— none —</option>
							{#each accounts as a (a.id)}
								<option value={String(a.id)}>{a.username}</option>
							{/each}
						</select>
					</label>

					<div class="actions">
						<button type="submit" class="primary" disabled={busy || !tName || !p1Name || !p2Name}>
							{tId ? 'Save team' : 'Add team'}
						</button>
						{#if tId}
							<button type="button" on:click={cancelTeam} disabled={busy}>Cancel</button>
						{/if}
					</div>
				</form>
				<p class="note hint">
					A linked account is what lets that person enter and approve their team's scores. Leave it
					unlinked for anyone without a login — an admin records their results.
				</p>

				{#if teams.length}
					<table>
						<thead>
							<tr>
								<th>Team</th>
								<th>Player 1</th>
								<th>Player 2</th>
								<th class="num">TP</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each teams as t (t.id)}
								{@const one = t.players.find((p) => p.slot === 1)}
								{@const two = t.players.find((p) => p.slot === 2)}
								<tr class:editing={t.id === tId}>
									<td class="team-name">{t.name}</td>
									<td>
										{one?.name ?? '—'}
										<div class="sub">{accountName(one?.userId ?? null)}</div>
									</td>
									<td>
										{two?.name ?? '—'}
										<div class="sub">{accountName(two?.userId ?? null)}</div>
									</td>
									<td class="num">{t.tournamentPoints}</td>
									<td class="row-actions">
										<button type="button" on:click={() => editTeam(t)} disabled={busy}>
											Edit
										</button>
										<button
											type="button"
											class="danger"
											on:click={() => removeTeam(t)}
											disabled={busy}
										>
											Delete
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="note">No teams yet. Add them above, then generate the fixtures.</p>
				{/if}
			</section>

			<!-- fixtures -->
			<section class="panel">
				<h2>Fixtures</h2>
				<div class="counts">
					<div><span class="n">{matches.length}</span><span class="l">fixtures</span></div>
					<div><span class="n">{playedCount}</span><span class="l">recorded</span></div>
					<div><span class="n">{pendingCount}</span><span class="l">awaiting approval</span></div>
					<div><span class="n">{disallowedCount}</span><span class="l">shared player</span></div>
				</div>

				{#if teams.length > 1 && fixturesMissing > 0}
					<p class="banner warn">
						{fixturesMissing} of the {expectedFixtures} fixtures for {teams.length} teams don't exist
						yet. Generate them.
					</p>
				{/if}

				<div class="actions">
					<button
						type="button"
						class="primary"
						disabled={busy || teams.length < 2}
						on:click={generate}
					>
						Generate fixtures
					</button>
				</div>
				<p class="note hint">
					Every pair of teams, at both venues. Pairs that share a player are marked as not played —
					worked out from the rosters rather than entered by hand. Safe to re-run: anything already
					recorded or awaiting approval is left exactly as it is, so adding a team mid-season
					doesn't disturb the games already played.
					{#if season}
						Enter and correct individual results on
						<a href="/jpFlicks?season={season.slug}#results">the league page</a>.
					{/if}
				</p>
			</section>
		{/if}
	</main>
</div>

<style>
	.container {
		max-width: 1000px;
		margin: 0 auto;
		padding: 2rem;
	}

	.breadcrumb {
		margin-bottom: 2rem;
	}

	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.breadcrumb a:hover {
		color: #8a6a4a;
	}

	main {
		background: white;
		border-radius: 12px;
		padding: 2.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	h1 {
		font-size: 2rem;
		margin: 0 0 1.5rem 0;
		color: #2a2118;
	}

	h2 {
		font-size: 1.2rem;
		margin: 0 0 1rem 0;
		color: #4a3a2a;
	}

	code {
		padding: 0.1rem 0.35rem;
		background: #f3f0ea;
		border-radius: 4px;
		font-size: 0.9em;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.9rem;
		background: #fff;
		border: 1px solid #d9cdbf;
		border-radius: 20px;
		font: inherit;
		font-size: 0.9rem;
		color: #6b5844;
		cursor: pointer;
	}

	.tab:hover {
		border-color: #8a6a4a;
	}

	.tab.active {
		background: #6b5844;
		border-color: #6b5844;
		color: #fff;
	}

	.tab.new {
		border-style: dashed;
	}

	.flag {
		padding: 0.05rem 0.4rem;
		background: rgba(0, 0, 0, 0.08);
		border-radius: 10px;
		font-size: 0.7rem;
		text-transform: uppercase;
	}

	.tab.active .flag {
		background: rgba(255, 255, 255, 0.25);
	}

	.flag.hidden-flag {
		background: #f0e0c8;
		color: #8a6a1f;
	}

	.tab.active .flag.hidden-flag {
		background: rgba(255, 255, 255, 0.3);
		color: #fff;
	}

	.panel {
		margin-bottom: 1.75rem;
		padding: 1.25rem;
		background: #fdfaf5;
		border: 1px solid #e8dfd3;
		border-radius: 10px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.85rem;
		align-items: end;
	}

	.grid .wide {
		grid-column: span 2;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	label span {
		font-size: 0.8rem;
		color: #8a7a68;
	}

	label.check {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
	}

	label.check input {
		width: auto;
	}

	input,
	select {
		padding: 0.45rem 0.55rem;
		background: #fff;
		border: 1px solid #d9cdbf;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		min-width: 0;
	}

	input:disabled {
		background: #f1eee8;
		color: #8a7a68;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: #8a6a4a;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	button {
		padding: 0.45rem 0.9rem;
		background: #fff;
		border: 1px solid #d9cdbf;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		color: #4a3a2a;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: #8a6a4a;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button.primary {
		background: #6b5844;
		border-color: #6b5844;
		color: #fff;
	}

	button.primary:hover:not(:disabled) {
		background: #4a3a2a;
	}

	button.danger:hover:not(:disabled) {
		border-color: #c0392b;
		color: #c0392b;
	}

	table {
		width: 100%;
		margin-top: 1.25rem;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th,
	td {
		padding: 0.55rem 0.6rem;
		border-bottom: 1px solid #efe7db;
		text-align: left;
		vertical-align: top;
	}

	th {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #9a8d7d;
		font-weight: 600;
	}

	.team-name {
		font-weight: 600;
		color: #2a2118;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.sub {
		color: #9a8d7d;
		font-size: 0.85em;
	}

	tr.editing {
		background: #f6efe3;
	}

	.row-actions {
		display: flex;
		gap: 0.35rem;
		justify-content: flex-end;
	}

	.row-actions button {
		padding: 0.25rem 0.55rem;
		font-size: 0.8rem;
	}

	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 2rem;
		margin-bottom: 1rem;
	}

	.counts div {
		display: flex;
		flex-direction: column;
	}

	.counts .n {
		font-size: 1.6rem;
		font-weight: 600;
		line-height: 1.1;
		color: #6b5844;
		font-variant-numeric: tabular-nums;
	}

	.counts .l {
		font-size: 0.8rem;
		color: #9a8d7d;
	}

	.note {
		margin: 0 0 0.5rem 0;
		color: #6b5844;
		font-size: 0.95rem;
	}

	.note.hint {
		margin: 1rem 0 0 0;
		font-size: 0.85rem;
		color: #9a8d7d;
	}

	.banner {
		margin: 0 0 1rem 0;
		padding: 0.6rem 0.85rem;
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.banner.ok {
		background: #eaf7ee;
		color: #1e6b36;
	}

	.banner.bad {
		background: #fdeeee;
		color: #9a2c2c;
	}

	.banner.warn {
		background: #fff7e6;
		color: #8a6a1f;
	}

	@media (max-width: 860px) {
		.grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		main {
			padding: 1.5rem;
		}

		.grid {
			grid-template-columns: 1fr;
		}

		.grid .wide {
			grid-column: span 1;
		}

		table {
			display: block;
			overflow-x: auto;
		}
	}
</style>
