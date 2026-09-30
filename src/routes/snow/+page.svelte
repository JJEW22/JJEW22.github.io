<!-- src/routes/snow/+page.svelte -->
<!--
	First-snow predictions.

	The page has two faces, decided by whether the season has locked:

	  running  — you see your own pick and nothing but names for everyone else.
	             The dates aren't merely hidden here; the server never sends them
	             (see $lib/server/snow). Otherwise the last person to submit
	             could read the field and pick the gap.
	  locked   — the deadline has passed or the snow has fallen, everything is
	             revealed, and the leader (or winner) and winning ranges appear.

	Everything that used to be hardcoded in this file — the prediction list, the
	snow date, the winner — now comes from the database, so past seasons stay on
	the page instead of being overwritten each November.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import '../../app.css';
	import {
		daysBetween,
		daysText,
		formatDay,
		formatRange,
		rankPredictions,
		winningRanges,
		type Ranked,
		type SnowPrediction,
		type SnowSeason,
		type WinRange
	} from '$lib/snow';

	type SeasonTab = SnowSeason & { locked: boolean };
	type ActiveSeason = SeasonTab & { revealed: boolean };

	interface Viewer {
		username: string | null;
		isAdmin: boolean;
		hasSubmitted: boolean;
		canEditOwn: boolean;
		canManageOthers: boolean;
		myPredictionId: number | null;
	}

	let seasons: SeasonTab[] = [];
	let season: ActiveSeason | null = null;
	let predictions: SnowPrediction[] = [];
	let viewer: Viewer = {
		username: null,
		isAdmin: false,
		hasSubmitted: false,
		canEditOwn: false,
		canManageOthers: false,
		myPredictionId: null
	};
	let today = '';

	let loading = true;
	let loadFailed = false;
	let busy = false;
	let msg = '';
	let error = '';

	// The form. Seeded from your existing pick once the state arrives, so the
	// date input opens on what you already chose rather than blank.
	let formDate = '';
	let formName = '';
	let formReady = false;

	onMount(() => {
		const fromUrl = new URLSearchParams(location.search).get('season');
		load(fromUrl ?? undefined);
	});

	async function load(slug?: string) {
		loading = true;
		try {
			const qs = slug ? `?season=${encodeURIComponent(slug)}` : '';
			const res = await fetch(`/snow/api/state${qs}`);
			if (!res.ok) throw new Error(String(res.status));
			apply(await res.json());
			loadFailed = false;
		} catch {
			loadFailed = true;
		} finally {
			loading = false;
		}
	}

	// Every endpoint answers with the whole redacted state, so applying a write's
	// response and applying a fresh load are the same operation.
	function apply(data: {
		seasons?: SeasonTab[];
		season?: ActiveSeason | null;
		predictions?: SnowPrediction[];
		viewer?: Viewer;
		today?: string;
	}) {
		seasons = data.seasons ?? [];
		season = data.season ?? null;
		predictions = data.predictions ?? [];
		if (data.viewer) viewer = data.viewer;
		today = data.today ?? today;

		const mine = predictions.find((p) => p.isYou);
		formDate = mine?.date ?? '';
		formName = mine?.name ?? viewer.username ?? '';
		formReady = true;
	}

	function pickSeason(slug: string) {
		if (season?.slug === slug) return;
		msg = '';
		error = '';
		// Plain history rather than goto(): the tab is a view of one page, the URL
		// is only here so a season can be linked to, and this page is prerendered.
		const url = new URL(location.href);
		url.searchParams.set('season', slug);
		history.replaceState(history.state, '', url);
		load(slug);
	}

	async function send(path: string, method: string, body: Record<string, unknown>) {
		if (!season) return;
		busy = true;
		msg = '';
		error = '';
		try {
			const res = await fetch(path, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ season: season.slug, ...body })
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				error = data?.error || `That didn't work (${res.status}).`;
				return false;
			}
			apply(data);
			return true;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			return false;
		} finally {
			busy = false;
		}
	}

	async function submit() {
		const had = Boolean(mine);
		if (await send('/snow/api/predict', 'POST', { date: formDate, name: formName })) {
			msg = had ? 'Prediction updated.' : 'Prediction locked in.';
		}
	}

	async function withdraw() {
		if (!confirm('Withdraw your prediction for this season?')) return;
		if (await send('/snow/api/predict', 'DELETE', {})) msg = 'Prediction withdrawn.';
	}

	// --- derived ---

	$: revealed = season?.revealed ?? false;
	$: snowed = Boolean(season?.firstSnow);
	// Before the snow falls, "who is winning" is the same question as "who would
	// win if it snowed today", so the two cases share one ranking.
	$: target = season?.firstSnow ?? today;
	$: ranked = revealed && target ? rankPredictions(predictions, target) : ([] as Ranked[]);
	$: ranges = revealed ? winningRanges(predictions) : new Map<number, WinRange>();
	$: leaders = ranked.filter((r) => r.rank === 1);
	$: runnerUp = ranked.find((r) => r.rank > 1) ?? null;

	$: mine = predictions.find((p) => p.isYou) ?? null;
	$: deadlineDays = season?.deadline && today ? daysBetween(today, season.deadline) : null;
	$: canSubmit = Boolean(viewer.username) && viewer.canEditOwn;
	// An admin who hasn't picked yet: the reason the rest of the field is still
	// hidden from them is worth saying out loud.
	$: adminMustSubmit = viewer.isAdmin && !viewer.hasSubmitted && !season?.locked;

	function rangeFor(id: number): WinRange | undefined {
		return ranges.get(id);
	}

	function offBy(r: Ranked): string {
		if (r.daysOff === 0) return 'Exact';
		return `${r.daysOff} ${r.daysOff === 1 ? 'day' : 'days'} ${r.signedDays < 0 ? 'early' : 'late'}`;
	}
</script>

<svelte:head>
	<title>First Snow Predictions</title>
	<meta name="description" content="Predicting the first snow of the season" />
</svelte:head>

<div class="container">
	<nav class="breadcrumb">
		<a href="/">← Back to Home</a>
		{#if viewer.isAdmin}<a class="admin-link" href="/snow/admin">Admin</a>{/if}
	</nav>

	<main>
		<h1>❄️ First Snow Predictions ❄️</h1>

		{#if seasons.length > 1}
			<div class="tabs" role="tablist" aria-label="Season">
				{#each seasons as s (s.slug)}
					<button
						type="button"
						role="tab"
						class="tab"
						class:active={season?.slug === s.slug}
						aria-selected={season?.slug === s.slug}
						on:click={() => pickSeason(s.slug)}
					>
						{s.label}
						{#if s.isCurrent}<span class="tab-flag">now</span>{/if}
					</button>
				{/each}
			</div>
		{/if}

		{#if loading && !season}
			<p class="note">Loading…</p>
		{:else if loadFailed}
			<p class="note warn">Couldn't reach the predictions. Try a reload.</p>
		{:else if !season}
			<p class="note">No seasons yet.</p>
		{:else}
			{#if msg}<p class="banner ok">{msg}</p>{/if}
			{#if error}<p class="banner bad">{error}</p>{/if}

			<div class="info-section">
				{#if snowed}
					<div class="winner-card final">
						<h2>🎉 {leaders.length > 1 ? 'Joint winners!' : 'Final winner!'}</h2>
						<div class="winner-content">
							<div class="winner-name">
								{leaders.map((l) => l.name).join(' & ') || '—'}
							</div>
							{#if leaders.length === 1}
								<div class="winner-prediction">
									Predicted: {formatDay(leaders[0].date)}
								</div>
							{/if}
							<div class="winner-prediction">
								Actually snowed: {formatDay(season.firstSnow)}
							</div>
							{#if leaders.length}
								<div class="winner-status">
									{leaders[0].daysOff === 0
										? 'Called it to the day!'
										: `Off by ${leaders[0].daysOff} ${leaders[0].daysOff === 1 ? 'day' : 'days'}`}
								</div>
							{/if}
						</div>
					</div>
				{:else if revealed}
					<div class="winner-card">
						<h2>Current leader</h2>
						<div class="winner-content">
							{#if leaders.length}
								<div class="winner-name">{leaders.map((l) => l.name).join(' & ')}</div>
								<div class="winner-prediction">Predicted: {formatDay(leaders[0].date)}</div>
								<div class="winner-status">{daysText(leaders[0].signedDays)}</div>
								{#if runnerUp}
									<div class="win-duration">
										<span class="next-leader">
											Next closest: {runnerUp.name} ({formatDay(runnerUp.date, 'short')})
										</span>
									</div>
								{/if}
							{:else}
								<div class="winner-prediction">Nobody predicted this season.</div>
							{/if}
						</div>
					</div>
				{:else}
					<!-- Season still running: no leader, because saying who is leading
					     would give away a date. -->
					<div class="sealed-card">
						<div class="sealed-count">{predictions.length}</div>
						<div class="sealed-label">
							{predictions.length === 1 ? 'prediction in' : 'predictions in'}, sealed until the
							deadline
						</div>
						{#if season.deadline}
							<div class="sealed-deadline">
								{#if deadlineDays !== null && deadlineDays > 0}
									Closes {formatDay(season.deadline)} — {deadlineDays}
									{deadlineDays === 1 ? 'day' : 'days'} left
								{:else}
									Closes {formatDay(season.deadline)}
								{/if}
							</div>
						{:else}
							<div class="sealed-deadline">Open until the first snow is recorded</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if !season.locked}
				<section class="submit">
					<h2>Your prediction</h2>

					{#if !viewer.username}
						<p class="note">
							<a href="/account">Sign in</a> to log a prediction. You'll see your own pick right
							away; everyone else's stays sealed until
							{season.deadline ? formatDay(season.deadline) : 'the snow falls'}.
						</p>
					{:else if canSubmit && formReady}
						<form class="pick-form" on:submit|preventDefault={submit}>
							<label>
								<span>Date of first snow</span>
								<input type="date" bind:value={formDate} required />
							</label>
							<label>
								<span>Shown as</span>
								<input bind:value={formName} placeholder={viewer.username} maxlength="60" />
							</label>
							<div class="pick-actions">
								<button type="submit" class="primary" disabled={busy || !formDate}>
									{mine ? 'Update' : 'Lock it in'}
								</button>
								{#if mine}
									<button type="button" on:click={withdraw} disabled={busy}>Withdraw</button>
								{/if}
							</div>
						</form>
						{#if viewer.isAdmin}
							<p class="note admin-note">
								You're an admin: once you submit, your pick is final and the rest of the field opens
								up so you can enter predictions for other people.
							</p>
						{/if}
					{:else if mine}
						<div class="locked-pick">
							<div>
								<span class="locked-label">Locked in</span>
								<strong>{formatDay(mine.date)}</strong>
								<span class="locked-as">as {mine.name}</span>
							</div>
							<p class="note">
								{#if viewer.isAdmin}
									Admins can't change their pick — submitting it is what opened everyone else's to
									you.
									<a href="/snow/admin">Enter someone else's →</a>
								{:else}
									This season is locked.
								{/if}
							</p>
						</div>
					{:else}
						<p class="note">This season is closed to new predictions.</p>
					{/if}

					{#if adminMustSubmit && !mine}
						<p class="banner warn">
							Everyone else's dates are hidden from you too, until your own is in.
						</p>
					{/if}
				</section>
			{/if}

			<h2>{revealed ? 'All predictions' : "Who's in"}</h2>

			{#if !predictions.length}
				<p class="note">Nobody has predicted yet.</p>
			{:else if !revealed}
				<ul class="roster">
					{#each predictions as p (p.id)}
						<li class:you={p.isYou}>
							<span class="roster-name">{p.name}</span>
							{#if p.isYou}
								<span class="roster-date">{formatDay(p.date)}</span>
							{:else}
								<span class="roster-sealed">🔒 sealed</span>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<div class="table-wrapper">
					<table class="predictions-table">
						<thead>
							<tr>
								<th>Rank</th>
								<th>Name</th>
								<th>Predicted date</th>
								<th>Winning range</th>
								<th>{snowed ? 'Accuracy' : 'Status'}</th>
							</tr>
						</thead>
						<tbody>
							{#each ranked as p (p.id)}
								<tr class:winner={p.rank === 1} class:you={p.isYou}>
									<td class="rank-cell">
										{#if p.rank === 1}<span class="medal">🏆</span>{:else}{p.rank}{/if}
									</td>
									<td class="name-cell">
										{p.name}{#if p.isYou}<span class="you-flag">you</span>{/if}
									</td>
									<td class="date-cell">{formatDay(p.date)}</td>
									<td class="range-cell">{formatRange(rangeFor(p.id))}</td>
									<td class="status-cell">
										{#if snowed}
											{offBy(p)}
										{:else}
											<span
												class:status-past={p.signedDays < 0}
												class:status-today={p.signedDays === 0}
												class:status-future={p.signedDays > 0}
											>
												{daysText(p.signedDays)}
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
	}

	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.breadcrumb a:hover {
		color: #0066cc;
	}

	.admin-link {
		padding: 0.25rem 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
	}

	main {
		background: white;
		border-radius: 12px;
		padding: 3rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 1.5rem;
		color: #1a1a1a;
		text-align: center;
	}

	h2 {
		font-size: 1.5rem;
		margin: 2rem 0 1rem 0;
		color: #333;
	}

	/* tabs */

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
		margin-bottom: 2rem;
		padding-bottom: 1.25rem;
		border-bottom: 1px solid #eee;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 1rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		font: inherit;
		font-size: 0.95rem;
		color: #4b5563;
		cursor: pointer;
	}

	.tab:hover {
		border-color: #0066cc;
		color: #0066cc;
	}

	.tab.active {
		background: #0066cc;
		border-color: #0066cc;
		color: #fff;
	}

	.tab-flag {
		padding: 0.05rem 0.4rem;
		background: rgba(0, 0, 0, 0.08);
		border-radius: 10px;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.tab.active .tab-flag {
		background: rgba(255, 255, 255, 0.25);
	}

	/* cards */

	.info-section {
		margin-bottom: 2.5rem;
	}

	.winner-card {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
	}

	.winner-card.final {
		background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
	}

	.winner-card h2 {
		margin: 0 0 1.5rem 0;
		color: white;
		text-align: center;
		font-size: 1.75rem;
	}

	.winner-content {
		text-align: center;
	}

	.winner-name {
		font-size: 2.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
	}

	.winner-prediction {
		font-size: 1.25rem;
		margin-bottom: 0.5rem;
		opacity: 0.95;
	}

	.winner-status {
		font-size: 1.5rem;
		font-weight: 600;
		margin-top: 1rem;
	}

	.win-duration {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.3);
		font-size: 1rem;
		opacity: 0.9;
	}

	.next-leader {
		font-size: 0.9rem;
		opacity: 0.85;
	}

	.sealed-card {
		padding: 2rem;
		background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%);
		color: #fff;
		border-radius: 12px;
		text-align: center;
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
	}

	.sealed-count {
		font-size: 3rem;
		font-weight: 700;
		line-height: 1;
	}

	.sealed-label {
		margin-top: 0.5rem;
		font-size: 1.05rem;
		opacity: 0.9;
	}

	.sealed-deadline {
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid rgba(255, 255, 255, 0.3);
		font-size: 0.95rem;
		opacity: 0.9;
	}

	/* the form */

	.submit {
		margin-bottom: 2.5rem;
		padding: 1.5rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
	}

	.submit h2 {
		margin-top: 0;
	}

	.pick-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	label span {
		font-size: 0.8rem;
		color: #666;
	}

	input {
		padding: 0.5rem 0.6rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.95rem;
		min-width: 0;
	}

	input:focus {
		outline: none;
		border-color: #0066cc;
	}

	.pick-actions {
		display: flex;
		gap: 0.5rem;
	}

	button {
		padding: 0.5rem 1rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.95rem;
		color: #333;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: #0066cc;
		color: #0066cc;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button.primary {
		background: #0066cc;
		border-color: #0066cc;
		color: #fff;
	}

	button.primary:hover:not(:disabled) {
		background: #0052a3;
		color: #fff;
	}

	.locked-pick {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.locked-label {
		display: inline-block;
		margin-right: 0.5rem;
		padding: 0.15rem 0.55rem;
		background: #e0ecfa;
		border-radius: 12px;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #0b62a4;
	}

	.locked-as {
		margin-left: 0.4rem;
		color: #777;
		font-size: 0.9rem;
	}

	.admin-note {
		margin-top: 1rem;
		margin-bottom: 0;
	}

	/* roster (season still running) */

	.roster {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.5rem;
		margin: 0 0 2rem 0;
		padding: 0;
		list-style: none;
	}

	.roster li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.6rem 0.8rem;
		background: #f9fafb;
		border: 1px solid #eee;
		border-radius: 8px;
	}

	.roster li.you {
		background: #f0f7ff;
		border-color: #cfe3f7;
	}

	.roster-name {
		font-weight: 500;
		color: #1a1a1a;
	}

	.roster-date {
		font-weight: 600;
		color: #0b62a4;
	}

	.roster-sealed {
		font-size: 0.85rem;
		color: #9aa5b1;
	}

	/* table (revealed) */

	.table-wrapper {
		overflow-x: auto;
		margin-bottom: 2rem;
	}

	.predictions-table {
		width: 100%;
		border-collapse: collapse;
		background: white;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.predictions-table thead {
		background: #4a5568;
	}

	.predictions-table th {
		color: white;
		padding: 1rem;
		text-align: left;
		font-weight: 600;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.predictions-table td {
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.predictions-table tbody tr:last-child td {
		border-bottom: none;
	}

	.predictions-table tbody tr:hover {
		background: #f9fafb;
	}

	.predictions-table tr.winner {
		background: #fef3c7;
		font-weight: 600;
	}

	.predictions-table tr.winner:hover {
		background: #fde68a;
	}

	.predictions-table tr.you .name-cell {
		color: #0b62a4;
	}

	.you-flag {
		margin-left: 0.4rem;
		padding: 0.05rem 0.4rem;
		background: #e0ecfa;
		border-radius: 10px;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #0b62a4;
	}

	.rank-cell {
		text-align: center;
		font-weight: 600;
		width: 80px;
	}

	.medal {
		font-size: 1.5rem;
	}

	.name-cell {
		font-weight: 600;
		color: #1a1a1a;
	}

	.date-cell {
		color: #4b5563;
	}

	.range-cell {
		color: #6b7280;
		font-size: 0.9rem;
		font-style: italic;
	}

	.status-cell {
		text-align: center;
	}

	.status-past {
		color: #dc2626;
		font-weight: 500;
	}

	.status-today {
		color: #059669;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.status-future {
		color: #0066cc;
		font-weight: 500;
	}

	/* notes */

	.note {
		margin: 0 0 0.5rem 0;
		color: #666;
		font-size: 0.95rem;
	}

	.note.warn {
		color: #8a6a55;
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
		margin-top: 1rem;
		margin-bottom: 0;
		background: #fff7e6;
		color: #8a6a1f;
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		main {
			padding: 1.5rem;
		}

		h1 {
			font-size: 1.75rem;
		}

		.winner-name {
			font-size: 2rem;
		}

		.pick-form label {
			width: 100%;
		}

		.predictions-table {
			font-size: 0.85rem;
		}

		.predictions-table th,
		.predictions-table td {
			padding: 0.75rem 0.5rem;
		}
	}
</style>
