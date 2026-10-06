<!-- src/routes/snow/admin/+page.svelte -->
<!--
	Season management and entering predictions for other people.

	Every page in this app is prerendered (see src/routes/+layout.js), so there is
	no server load to gate on: the page renders for anyone and shows a denied
	state, while /snow/api/admin/* is what enforces the role. Same pattern as
	/admin, /pizzaBracket/admin and /meSoup/admin.

	Two things this page cannot do, and both are refused by the server as well as
	hidden here: enter anyone's prediction before the admin's own is in, and touch
	the admin's own row. The first is what keeps the field genuinely sealed — an
	admin who could read everyone's picks and then submit would just pick the gap.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import '../../../app.css';
	import { formatDay, type SnowPrediction, type SnowSeason } from '$lib/snow';

	type SeasonTab = SnowSeason & { locked: boolean };
	type ActiveSeason = SeasonTab & { revealed: boolean };

	interface Account {
		id: number;
		username: string;
		name: string | null; // users.real_name
	}

	interface Viewer {
		username: string | null;
		isAdmin: boolean;
		hasSubmitted: boolean;
		canEditOwn: boolean;
		canManageOthers: boolean;
		myPredictionId: number | null;
	}

	let status = 'loading'; // loading | denied | ready
	let seasons: SeasonTab[] = [];
	let season: ActiveSeason | null = null;
	let predictions: SnowPrediction[] = [];
	let accounts: Account[] = [];
	let viewer: Viewer = {
		username: null,
		isAdmin: false,
		hasSubmitted: false,
		canEditOwn: false,
		canManageOthers: false,
		myPredictionId: null
	};

	let busy = false;
	let msg = '';
	let error = '';

	// Prediction form
	let pName = '';
	let pDate = '';
	let pUserId = '';
	let editingId: number | null = null;

	// Season form
	let sSlug = '';
	let sLabel = '';
	let sDeadline = '';
	let sFirstSnow = '';
	let sCurrent = false;
	let creatingSeason = false;

	onMount(() => load());

	async function load(slug?: string) {
		try {
			const qs = slug ? `?season=${encodeURIComponent(slug)}` : '';
			const res = await fetch(`/snow/api/state${qs}`);
			if (!res.ok) throw new Error(String(res.status));
			const data = await res.json();
			apply(data);
			status = viewer.isAdmin ? 'ready' : 'denied';
		} catch {
			error = 'Could not load the seasons.';
			status = 'denied';
		}
	}

	function apply(data: {
		seasons?: SeasonTab[];
		season?: ActiveSeason | null;
		predictions?: SnowPrediction[];
		viewer?: Viewer;
		accounts?: Account[];
	}) {
		seasons = data.seasons ?? [];
		season = data.season ?? null;
		predictions = data.predictions ?? [];
		if (data.viewer) viewer = data.viewer;
		if (data.accounts) accounts = data.accounts;
		syncSeasonForm();
	}

	// The season form always mirrors whichever season is selected, unless a new
	// one is being drafted.
	function syncSeasonForm() {
		if (creatingSeason || !season) return;
		sSlug = season.slug;
		sLabel = season.label;
		sDeadline = season.deadline ?? '';
		sFirstSnow = season.firstSnow ?? '';
		sCurrent = season.isCurrent;
	}

	function pickSeason(slug: string) {
		if (season?.slug === slug) return;
		msg = '';
		error = '';
		creatingSeason = false;
		cancelEdit();
		load(slug);
	}

	function startNewSeason() {
		creatingSeason = true;
		sSlug = '';
		sLabel = '';
		sDeadline = '';
		sFirstSnow = '';
		sCurrent = false;
		msg = '';
		error = '';
	}

	function cancelNewSeason() {
		creatingSeason = false;
		syncSeasonForm();
	}

	async function send(path: string, method: string, body: Record<string, unknown>) {
		busy = true;
		msg = '';
		error = '';
		try {
			const res = await fetch(path, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
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

	// --- predictions ---

	function startEdit(p: SnowPrediction) {
		editingId = p.id;
		pName = p.name;
		pDate = p.date ?? '';
		pUserId = p.userId === null ? '' : String(p.userId);
		msg = '';
		error = '';
	}

	function cancelEdit() {
		editingId = null;
		pName = '';
		pDate = '';
		pUserId = '';
	}

	async function savePrediction() {
		if (!season) return;
		const was = editingId;
		const ok = await send('/snow/api/admin/prediction', 'POST', {
			season: season.slug,
			id: editingId,
			name: pName,
			date: pDate,
			userId: pUserId === '' ? null : Number(pUserId)
		});
		if (ok) {
			msg = was ? `Updated ${pName}.` : `Added ${pName}.`;
			cancelEdit();
		}
	}

	async function removePrediction(p: SnowPrediction) {
		if (!season) return;
		if (!confirm(`Delete ${p.name}'s prediction?`)) return;
		if (await send('/snow/api/admin/prediction', 'DELETE', { season: season.slug, id: p.id })) {
			msg = `Deleted ${p.name}.`;
			if (editingId === p.id) cancelEdit();
		}
	}

	// --- season ---

	async function saveSeason() {
		const ok = await send('/snow/api/admin/season', 'POST', {
			slug: sSlug,
			label: sLabel,
			deadline: sDeadline || null,
			firstSnow: sFirstSnow || null,
			isCurrent: sCurrent
		});
		if (ok) {
			msg = creatingSeason ? `Created ${sLabel}.` : `Saved ${sLabel}.`;
			creatingSeason = false;
		}
	}

	$: mine = predictions.find((p) => p.isYou) ?? null;
	$: others = predictions.filter((p) => !p.isYou);
	// The server refuses on-behalf writes for exactly these reasons; the page
	// says which one applies rather than letting a click fail.
	$: blockedBecause = !season
		? 'No season selected.'
		: season.locked
			? 'This season is locked — its predictions are final. Move the deadline below to reopen it.'
			: !viewer.hasSubmitted
				? 'Submit your own prediction first.'
				: '';
	$: canManage = blockedBecause === '';
</script>

<svelte:head>
	<title>Snow admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<nav class="breadcrumb"><a href={resolve('/snow')}>← Back to the predictions</a></nav>

	<main>
		{#if status === 'loading'}
			<p class="note">Checking…</p>
		{:else if status === 'denied'}
			<h1>Not an admin</h1>
			<p class="note">
				This page needs the <code>snow:admin</code> role. Sign in with an account that has it, or go
				back to <a href={resolve('/snow')}>the predictions</a>.
			</p>
		{:else}
			<h1>❄️ Snow admin</h1>

			{#if seasons.length}
				<div class="tabs">
					{#each seasons as s (s.slug)}
						<button
							type="button"
							class="tab"
							class:active={season?.slug === s.slug}
							on:click={() => pickSeason(s.slug)}
						>
							{s.label}
							{#if s.locked}<span class="tab-flag">locked</span>{/if}
						</button>
					{/each}
					<button type="button" class="tab new" on:click={startNewSeason}>+ New season</button>
				</div>
			{/if}

			{#if msg}<p class="banner ok">{msg}</p>{/if}
			{#if error}<p class="banner bad">{error}</p>{/if}

			<!-- season -->
			<section class="panel">
				<h2>{creatingSeason ? 'New season' : `Season: ${season?.label ?? '—'}`}</h2>
				<form class="grid" on:submit|preventDefault={saveSeason}>
					<label>
						<span>Slug</span>
						<input bind:value={sSlug} placeholder="2026-27" disabled={!creatingSeason} />
					</label>
					<label>
						<span>Label</span>
						<input bind:value={sLabel} placeholder="2026–27" />
					</label>
					<label>
						<span>Deadline</span>
						<input type="date" bind:value={sDeadline} />
					</label>
					<label>
						<span>First snow</span>
						<input type="date" bind:value={sFirstSnow} />
					</label>
					<label class="check">
						<input type="checkbox" bind:checked={sCurrent} />
						<span>Current season</span>
					</label>
					<div class="actions">
						<button type="submit" class="primary" disabled={busy || !sSlug || !sLabel}>
							{creatingSeason ? 'Create' : 'Save season'}
						</button>
						{#if creatingSeason}
							<button type="button" on:click={cancelNewSeason} disabled={busy}>Cancel</button>
						{/if}
					</div>
				</form>
				<p class="note hint">
					Leave the deadline empty to keep a season open until the snow is recorded. Setting
					<strong>first snow</strong> ends the season and reveals everything. Season settings stay editable
					after a lock — moving the deadline forward is the only way to reopen a season whose predictions
					need changing.
				</p>
			</section>

			<!-- your own pick, the gate -->
			<section class="panel" class:blocked={!viewer.hasSubmitted && !season?.locked}>
				<h2>Your prediction</h2>
				{#if mine}
					<p class="note">
						<span class="locked-label">Locked in</span>
						<strong>{formatDay(mine.date)}</strong> as {mine.name}. This can't be changed —
						submitting it is what opened everyone else's picks to you.
					</p>
				{:else if season?.locked}
					<p class="note">You didn't predict this season.</p>
				{:else}
					<p class="note">
						You haven't predicted yet, so the rest of the field is sealed from you too.
						<a href={resolve('/snow')}>Make your pick →</a> Once it's in it's final, and you'll be able to enter
						predictions for other people here.
					</p>
				{/if}
			</section>

			<!-- predictions -->
			<section class="panel">
				<h2>Predictions ({predictions.length})</h2>

				{#if !canManage}
					<p class="banner warn">{blockedBecause}</p>
				{:else}
					<form class="grid" on:submit|preventDefault={savePrediction}>
						<label class="wide">
							<span>Name</span>
							<input bind:value={pName} placeholder="Vedant & Dina" maxlength="60" />
						</label>
						<label>
							<span>Predicted date</span>
							<input type="date" bind:value={pDate} />
						</label>
						<label>
							<span>Linked account</span>
							<select bind:value={pUserId}>
								<option value="">— none —</option>
								{#each accounts as a (a.id)}
									<option value={String(a.id)}>{a.username}{a.name ? ` (${a.name})` : ''}</option>
								{/each}
							</select>
						</label>
						<div class="actions">
							<button type="submit" class="primary" disabled={busy || !pName || !pDate}>
								{editingId ? 'Save' : 'Add prediction'}
							</button>
							{#if editingId}
								<button type="button" on:click={cancelEdit} disabled={busy}>Cancel</button>
							{/if}
						</div>
					</form>
					<p class="note hint">
						Linking an account means that person sees the entry as theirs on /snow. Leave it
						unlinked for anyone without a login.
					</p>
				{/if}

				{#if predictions.length}
					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Date</th>
								<th>Account</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#if mine}
								<tr class="is-you">
									<td>{mine.name} <span class="you-flag">you</span></td>
									<td>{mine.date ?? '—'}</td>
									<td class="sub">{viewer.username}</td>
									<td class="row-actions"><span class="sub">locked</span></td>
								</tr>
							{/if}
							{#each others as p (p.id)}
								<tr class:editing={p.id === editingId}>
									<td>{p.name}</td>
									<td>{p.date ?? '🔒 sealed'}</td>
									<td class="sub">
										{accounts.find((a) => a.id === p.userId)?.username ?? '—'}
									</td>
									<td class="row-actions">
										{#if canManage}
											<button type="button" on:click={() => startEdit(p)} disabled={busy}>
												Edit
											</button>
											<button
												type="button"
												class="danger"
												on:click={() => removePrediction(p)}
												disabled={busy}
											>
												Delete
											</button>
										{:else}
											<span class="sub">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="note">No predictions in this season yet.</p>
				{/if}
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
		color: #0066cc;
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
		color: #1a1a1a;
	}

	h2 {
		font-size: 1.2rem;
		margin: 0 0 1rem 0;
		color: #333;
	}

	code {
		padding: 0.1rem 0.35rem;
		background: #f3f4f6;
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
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		font: inherit;
		font-size: 0.9rem;
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

	.tab.new {
		border-style: dashed;
	}

	.tab-flag {
		padding: 0.05rem 0.4rem;
		background: rgba(0, 0, 0, 0.08);
		border-radius: 10px;
		font-size: 0.7rem;
		text-transform: uppercase;
	}

	.tab.active .tab-flag {
		background: rgba(255, 255, 255, 0.25);
	}

	.panel {
		margin-bottom: 1.75rem;
		padding: 1.25rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
	}

	.panel.blocked {
		background: #fff7e6;
		border-color: #f0dcae;
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
		color: #666;
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
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		min-width: 0;
	}

	input:disabled {
		background: #f1f3f5;
		color: #888;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: #0066cc;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	button {
		padding: 0.45rem 0.9rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
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
		border-bottom: 1px solid #eee;
		text-align: left;
	}

	th {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #888;
		font-weight: 600;
	}

	tr.editing {
		background: #f0f7ff;
	}

	tr.is-you {
		background: #eef4fb;
	}

	.sub {
		color: #777;
		font-size: 0.85em;
	}

	.you-flag {
		margin-left: 0.3rem;
		padding: 0.05rem 0.4rem;
		background: #e0ecfa;
		border-radius: 10px;
		font-size: 0.7rem;
		text-transform: uppercase;
		color: #0b62a4;
	}

	.locked-label {
		display: inline-block;
		margin-right: 0.4rem;
		padding: 0.15rem 0.55rem;
		background: #e0ecfa;
		border-radius: 12px;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #0b62a4;
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

	.note {
		margin: 0 0 0.5rem 0;
		color: #666;
		font-size: 0.95rem;
	}

	.note.hint {
		margin: 1rem 0 0 0;
		font-size: 0.85rem;
		color: #888;
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
			white-space: nowrap;
		}
	}
</style>
