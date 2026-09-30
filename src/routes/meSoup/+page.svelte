<!-- src/routes/meSoup/+page.svelte -->
<!--
	meSoup — everywhere I've got in the water.

	The map is WorldMap.svelte; this page owns the data, the filters and the list.
	Selection is shared state rather than something each half tracks: click a dot
	and its row highlights, click a row and the map's tooltip opens on it.

	Like every page here it is prerendered (src/routes/+layout.js), so the spots
	arrive from /meSoup/api/spots in the browser and an unreachable API costs the
	dots, not the page.
-->
<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import WorldMap from './WorldMap.svelte';
	import { WATER_TYPES, waterType, summarize, formatDate, formatCoords } from '$lib/swimSpots';
	import type { SwimSpot } from '$lib/swimSpots';

	let spots: SwimSpot[] = [];
	let loading = true;
	let loadFailed = false;
	let isAdmin = false;
	let selectedId: number | null = null;

	// Water types the reader has switched off. Empty means everything shows —
	// this is a hide-list rather than a show-list so that a type added later
	// appears by default instead of silently missing from the map. An array
	// rather than a Set: it holds at most one entry per water type, and a Set
	// here would have to be a SvelteSet to stay reactive in a runes file.
	let hidden: string[] = [];

	onMount(() => {
		loadSpots();
		checkAdmin();
	});

	async function loadSpots() {
		try {
			const res = await fetch('/meSoup/api/spots');
			if (!res.ok) throw new Error(String(res.status));
			const data = await res.json();
			spots = data.spots ?? [];
		} catch {
			loadFailed = true;
		} finally {
			loading = false;
		}
	}

	// Only to decide whether to show the admin link. The endpoints do the real
	// gating, so being wrong here reveals nothing.
	async function checkAdmin() {
		try {
			const me = await fetch('/api/auth/me').then((r) => r.json());
			const roles = me.roles ?? [];
			isAdmin =
				Boolean(me.user) && (roles.includes('site:admin') || roles.includes('mesoup:admin'));
		} catch {
			isAdmin = false;
		}
	}

	function toggleType(id: string) {
		hidden = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
	}

	function showAll() {
		hidden = [];
	}

	// Only the types actually swum get a chip — a legend full of zeroes says
	// nothing about where I've been.
	$: counts = spots.reduce<Record<string, number>>((acc, s) => {
		acc[s.waterType] = (acc[s.waterType] ?? 0) + 1;
		return acc;
	}, {});
	$: present = WATER_TYPES.filter((t) => counts[t.id]);

	$: visible = spots.filter((s) => !hidden.includes(s.waterType));
	$: summary = summarize(visible);

	// A filtered-out spot must not stay selected, or the map holds a tooltip on a
	// dot it is no longer drawing.
	$: if (selectedId !== null && !visible.some((s) => s.id === selectedId)) selectedId = null;

	function place(spot: SwimSpot) {
		return [spot.region, spot.country].filter(Boolean).join(', ');
	}
</script>

<svelte:head>
	<title>meSoup</title>
	<meta name="description" content="A map of everywhere in the world I have swum." />
</svelte:head>

<div class="container">
	<nav class="breadcrumb">
		<a href="/me">← Back to Me</a>
		{#if isAdmin}<a class="admin-link" href="/meSoup/admin">Admin</a>{/if}
	</nav>

	<main>
		<header class="head">
			<h1>meSoup</h1>
			<p class="intro">
				Every body of water I've managed to get into, plotted. Hover a dot — or tap one on a phone —
				for what it was and when.
			</p>
		</header>

		<section class="stats" aria-label="Totals">
			<div class="stat"><span class="n">{summary.spots}</span><span class="l">spots</span></div>
			<div class="stat">
				<span class="n">{summary.countries}</span><span class="l">countries</span>
			</div>
			<div class="stat">
				<span class="n">{summary.waterTypes}</span><span class="l">kinds of water</span>
			</div>
			{#if summary.firstYear}
				<div class="stat">
					<span class="n">{summary.firstYear}–{summary.latestYear}</span>
					<span class="l">years covered</span>
				</div>
			{/if}
		</section>

		{#if present.length}
			<section class="legend" aria-label="Filter by kind of water">
				{#each present as t (t.id)}
					<button
						type="button"
						class="chip"
						class:off={hidden.includes(t.id)}
						aria-pressed={!hidden.includes(t.id)}
						on:click={() => toggleType(t.id)}
					>
						<span class="swatch" style:background={t.color}></span>
						{t.label}
						<span class="chip-n">{counts[t.id]}</span>
					</button>
				{/each}
				{#if hidden.length}
					<button type="button" class="chip clear" on:click={showAll}>Show all</button>
				{/if}
			</section>
		{/if}

		<WorldMap spots={visible} bind:selectedId />

		{#if loading}
			<p class="note">Loading spots…</p>
		{:else if loadFailed}
			<p class="note warn">
				Couldn't reach the spot list, so the map is empty. The map itself is fine — try a reload.
			</p>
		{:else if !spots.length}
			<p class="note">
				No spots yet.{#if isAdmin}
					<a href="/meSoup/admin">Add the first one.</a>
				{/if}
			</p>
		{:else}
			<section class="list" aria-label="Swim spots">
				<h2>Where</h2>
				<ul>
					{#each visible as spot (spot.id)}
						<li>
							<button
								type="button"
								class="row"
								class:on={spot.id === selectedId}
								on:click={() => (selectedId = selectedId === spot.id ? null : spot.id)}
							>
								<span class="swatch" style:background={waterType(spot.waterType).color}></span>
								<span class="row-main">
									<span class="row-name">{spot.name}</span>
									{#if place(spot)}<span class="row-place">{place(spot)}</span>{/if}
									{#if spot.note}<span class="row-note">{spot.note}</span>{/if}
								</span>
								<span class="row-meta">
									<span>{formatDate(spot.swumOn)}</span>
									<span class="row-coords">{formatCoords(spot.lat, spot.lon)}</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</main>
</div>

<style>
	.container {
		max-width: 1100px;
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
		padding: 2.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	h1 {
		font-size: 2.5rem;
		margin: 0 0 0.5rem 0;
		color: #1a1a1a;
	}

	.intro {
		max-width: 46rem;
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.7;
		color: #555;
	}

	.head {
		margin-bottom: 1.75rem;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 2.5rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid #eee;
	}

	.stat {
		display: flex;
		flex-direction: column;
	}

	.stat .n {
		font-size: 1.9rem;
		font-weight: 600;
		line-height: 1.1;
		color: #0b62a4;
		font-variant-numeric: tabular-nums;
	}

	.stat .l {
		font-size: 0.85rem;
		color: #666;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.7rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		font-size: 0.85rem;
		color: #333;
		cursor: pointer;
		transition:
			opacity 0.15s,
			border-color 0.15s;
	}

	.chip:hover {
		border-color: #0066cc;
	}

	.chip.off {
		opacity: 0.4;
	}

	.chip-n {
		color: #888;
		font-variant-numeric: tabular-nums;
	}

	.chip.clear {
		color: #0066cc;
	}

	.swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		flex: none;
	}

	.note {
		margin: 1.25rem 0 0 0;
		color: #666;
		font-size: 0.95rem;
	}

	.note.warn {
		color: #8a6a55;
	}

	.list h2 {
		font-size: 1.35rem;
		margin: 2rem 0 1rem 0;
		color: #333;
	}

	.list ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.row {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		width: 100%;
		padding: 0.7rem 0.75rem;
		background: none;
		border: 1px solid transparent;
		border-bottom-color: #f0f0f0;
		border-radius: 8px;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.row:hover {
		background: #f9fafb;
	}

	.row.on {
		background: #f0f7ff;
		border-color: #cfe3f7;
	}

	.row .swatch {
		margin-top: 0.35rem;
	}

	.row-main {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
		min-width: 0;
	}

	.row-name {
		font-weight: 500;
		color: #1a1a1a;
	}

	.row-place {
		font-size: 0.85rem;
		color: #666;
	}

	.row-note {
		font-size: 0.85rem;
		color: #888;
		font-style: italic;
	}

	.row-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
		flex: none;
		font-size: 0.85rem;
		color: #666;
	}

	.row-coords {
		color: #9aa5b1;
		font-variant-numeric: tabular-nums;
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

		.stats {
			gap: 1.5rem;
		}

		.stat .n {
			font-size: 1.5rem;
		}

		.row {
			flex-wrap: wrap;
		}

		.row-meta {
			align-items: flex-start;
			flex-direction: row;
			gap: 0.6rem;
			width: 100%;
			padding-left: 1.45rem;
		}
	}
</style>
