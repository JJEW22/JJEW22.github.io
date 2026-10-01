<!-- src/routes/meSoup/+page.svelte -->
<!--
	meSoup — everywhere I've got in the water.

	The map is WorldMap.svelte; this page owns the data, the filters and the list.
	Selection is shared state rather than something each half tracks: click a dot
	and its row highlights, click a row and the map's tooltip opens on it.

	Like every page here it is prerendered (src/routes/+layout.js), so the spots
	arrive from /meSoup/api/spots in the browser and an unreachable API costs the
	dots, not the page.

	What you see depends on who you are, and the API decides, not this page.
	Three kinds of view, each with its own name:
	  usSoup      everyone's spots, anonymized (no names, dates, notes or people,
	              no list) -- what a signed-out visitor sees, and ?view=everyone
	  meSoup      signed in: your spots plus the ones you've accepted a tag on
	  <Name>Soup  signed in, ?user=Name: Name's whole map if Name shared it with
	              you, otherwise just Name's swims you're tagged on
	A dropdown lists every view open to you. The server decides what each one
	may contain; the view lives in the query string so it survives a reload or
	a shared link.

	Tags need the tagged person's say-so. Anything waiting on you shows in a
	banner at the top; accept and the spot joins your map, decline and it
	doesn't (and won't ask again).
-->
<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import WorldMap from './WorldMap.svelte';
	import {
		WATER_TYPES,
		waterType,
		summarize,
		formatDate,
		formatSwims,
		formatCoords
	} from '$lib/swimSpots';
	import type { PendingTag, Sharer, SwimSpot, WaterTypeMeta } from '$lib/swimSpots';

	// What the API sent: anonymized for usSoup, your full list otherwise.
	let loaded: SwimSpot[] = [];
	// Built-ins until the API answers with the custom types added in the admin.
	let waterTypes: WaterTypeMeta[] = WATER_TYPES;
	let loading = true;
	let loadFailed = false;
	// Signed out until the API says otherwise; `me` is the signed-in username.
	let anonymous = true;
	let me: string | null = null;
	let pending: PendingTag[] = [];
	// People who've shared their map, or a swim, with you -- one view each.
	let sharers: Sharer[] = [];
	// The dropdown's value: 'everyone' (usSoup), 'mine' (meSoup), or
	// 'user:<name>' (<Name>Soup). Prefixed so a user called "mine" is no problem.
	let view = 'mine';
	// Whose map is showing, as the server spelled it, when it's someone else's.
	let person: Sharer | null = null;
	// The tag being answered, so its buttons can't be pressed twice.
	let answering: number | null = null;
	let tagError = '';
	let selectedId: number | null = null;

	// Water types the reader has switched off. Empty means everything shows —
	// this is a hide-list rather than a show-list so that a type added later
	// appears by default instead of silently missing from the map. An array
	// rather than a Set: it holds at most one entry per water type, and a Set
	// here would have to be a SvelteSet to stay reactive in a runes file.
	let hidden: string[] = [];

	onMount(() => {
		const params = new URLSearchParams(location.search);
		const who = params.get('user')?.trim();
		view = params.get('view') === 'everyone' ? 'everyone' : who ? `user:${who}` : 'mine';
		loadSpots();
	});

	async function loadSpots() {
		try {
			const query =
				view === 'everyone'
					? '?view=everyone'
					: view.startsWith('user:')
						? `?user=${encodeURIComponent(view.slice(5))}`
						: '';
			const res = await fetch(`/meSoup/api/spots${query}`);
			// Someone who hasn't shared anything with you (any more): fall back to
			// your own map rather than an error page.
			if (res.status === 404 && view.startsWith('user:')) {
				view = 'mine';
				syncUrl();
				return loadSpots();
			}
			if (!res.ok) throw new Error(String(res.status));
			const data = await res.json();
			anonymous = data.anonymous !== false;
			me = data.me ?? null;
			loaded = data.spots ?? [];
			pending = data.pending ?? [];
			sharers = data.sharers ?? [];
			person = data.person ?? null;
			waterTypes = data.waterTypes?.length ? data.waterTypes : WATER_TYPES;
			// ?user= in whatever case it was typed, settled on the real spelling.
			if (person) {
				view = `user:${person.username}`;
				syncUrl();
			}
		} catch {
			loadFailed = true;
		} finally {
			loading = false;
		}
	}

	async function answer(tag: PendingTag, accept: boolean) {
		answering = tag.spotId;
		tagError = '';
		try {
			const r = await fetch('/meSoup/api/tags', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ spotId: tag.spotId, accept })
			});
			const data = await r.json().catch(() => null);
			if (!r.ok) {
				tagError = data?.error || `Couldn't answer that tag (${r.status}).`;
				// Already answered elsewhere, or the owner took it back: a fresh
				// list is the honest state either way.
				if (r.status === 404) await loadSpots();
				return;
			}
			pending = data.pending ?? [];
			// Accepting puts a new dot on the map; declining changes nothing there.
			if (accept) await loadSpots();
		} catch (err) {
			tagError = `Couldn't answer that tag: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			answering = null;
		}
	}

	// Every view is its own fetch: the server is what decides how much of
	// someone's map you may see, so nothing is filtered down in the browser.
	async function changeView() {
		selectedId = null;
		hidden = [];
		syncUrl();
		loading = true;
		await loadSpots();
	}

	function syncUrl() {
		const query =
			view === 'everyone'
				? 'view=everyone'
				: view.startsWith('user:')
					? `user=${encodeURIComponent(view.slice(5))}`
					: '';
		replaceState(query ? `${resolve('/meSoup')}?${query}` : resolve('/meSoup'), {});
	}

	function tagWhere(tag: PendingTag): string {
		return [tag.region, tag.country].filter(Boolean).join(', ');
	}

	$: spots = loaded;
	$: sharedCount = loaded.filter((s) => s.owner && s.owner !== me).length;

	// Everyone's swims together are "us"; your own are "me"; someone else's
	// are theirs.
	$: title = anonymous ? 'usSoup' : person ? `${person.username}Soup` : 'meSoup';

	// "with Alex, Sam" -- everyone at the swim but you, owner included when it
	// isn't you.
	function company(spot: SwimSpot): string {
		// On someone's own map their name on every row says nothing.
		const people = [spot.owner, ...(spot.tagged ?? [])].filter(
			(p): p is string => Boolean(p) && p !== me && p !== person?.username
		);
		return people.length ? `with ${people.join(', ')}` : '';
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
	$: present = waterTypes.filter((t) => counts[t.id]);

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
	<title>{title}</title>
	<meta name="description" content="A map of everywhere people on this site have swum." />
</svelte:head>

<div class="container">
	<nav class="breadcrumb">
		<a href="/me">← Back to Me</a>
		{#if me}
			<a class="admin-link" href="/meSoup/admin">Edit my spots</a>
		{:else if !loading}
			<a class="admin-link" href="/account?redirect=/meSoup">Sign in</a>
		{/if}
	</nav>

	<main>
		{#if pending.length}
			<section class="tags-waiting" aria-label="Tags waiting for you">
				<h2>
					You've been tagged in {pending.length === 1 ? 'a swim' : `${pending.length} swims`}
				</h2>
				{#if tagError}<p class="tag-error">{tagError}</p>{/if}
				<ul>
					{#each pending as tag (tag.spotId)}
						<li>
							<div class="tag-what">
								<strong>{tag.owner}</strong> says you were at <strong>{tag.name}</strong>
								<span class="tag-meta">
									{tag.waterLabel}{#if tagWhere(tag)}
										· {tagWhere(tag)}{/if}{#if tag.swumOn}
										· {formatDate(tag.swumOn)}{/if}
								</span>
							</div>
							<div class="tag-actions">
								<button
									type="button"
									class="accept"
									disabled={answering !== null}
									on:click={() => answer(tag, true)}
								>
									Accept
								</button>
								<button
									type="button"
									disabled={answering !== null}
									on:click={() => answer(tag, false)}
								>
									Decline
								</button>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<header class="head">
			<h1>{title}</h1>
			{#if anonymous}
				<p class="intro">
					Everywhere people on this site have got in the water, with the people taken out — no
					names, dates or who was there.
					{#if !me}
						<a href="/account?redirect=/meSoup">Sign in</a> to see your own swims and the ones you've
						been tagged in.
					{/if}
				</p>
			{:else if person?.fullMap}
				<p class="intro">
					Everywhere {person.username} has got in the water — they've shared their whole map with you.
					Hover a dot — or tap one on a phone — for what it was, when, and who was there.
				</p>
			{:else if person}
				<p class="intro">
					The swims {person.username} tagged you in, plotted. Hover a dot — or tap one on a phone — for
					what it was, when, and who was there.
				</p>
			{:else}
				<p class="intro">
					Your swims{sharedCount ? ', and the ones other people tagged you in' : ''}, plotted. Hover
					a dot — or tap one on a phone — for what it was, when, and who was there.
				</p>
			{/if}
		</header>

		{#if me}
			<label class="views">
				<span>Viewing</span>
				<select bind:value={view} on:change={changeView}>
					<option value="everyone">Everyone — usSoup</option>
					<option value="mine">Mine — meSoup</option>
					{#if sharers.length}
						<optgroup label="Shared with me">
							{#each sharers as p (p.username)}
								<option value="user:{p.username}">
									{p.username}Soup — {p.fullMap ? 'whole map' : "swims you're tagged in"}
								</option>
							{/each}
						</optgroup>
					{/if}
				</select>
			</label>
		{/if}

		<section class="stats" aria-label="Totals">
			<div class="stat"><span class="n">{summary.spots}</span><span class="l">spots</span></div>
			{#if summary.swims > summary.spots}
				<div class="stat"><span class="n">{summary.swims}</span><span class="l">swims</span></div>
			{/if}
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

		<WorldMap spots={visible} {waterTypes} {anonymous} bind:selectedId />

		{#if loading}
			<p class="note">Loading spots…</p>
		{:else if loadFailed}
			<p class="note warn">
				Couldn't reach the spot list, so the map is empty. The map itself is fine — try a reload.
			</p>
		{:else if !spots.length}
			<p class="note">
				No spots yet.{#if me && !anonymous && !person}
					<a href="/meSoup/admin">Add your first one.</a>
				{/if}
			</p>
		{:else if !anonymous}
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
								<span class="swatch" style:background={waterType(spot.waterType, waterTypes).color}
								></span>
								<span class="row-main">
									<span class="row-name">{spot.name}</span>
									{#if place(spot)}<span class="row-place">{place(spot)}</span>{/if}
									{#if company(spot)}<span class="row-people">{company(spot)}</span>{/if}
									{#if spot.note}<span class="row-note">{spot.note}</span>{/if}
								</span>
								<span class="row-meta">
									<span>{formatSwims(spot.dates)}</span>
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

	.views {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
		color: #666;
	}

	.views select {
		padding: 0.4rem 0.6rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		color: #1a1a1a;
		max-width: 100%;
	}

	.views select:focus {
		outline: none;
		border-color: #0066cc;
	}

	.tags-waiting {
		margin-bottom: 1.75rem;
		padding: 1rem 1.25rem;
		background: #f0f7ff;
		border: 1px solid #cfe3f7;
		border-radius: 10px;
	}

	.tags-waiting h2 {
		margin: 0 0 0.75rem 0;
		font-size: 1.05rem;
		color: #0b4f8a;
	}

	.tags-waiting ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.tags-waiting li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.6rem 0.75rem;
		background: #fff;
		border-radius: 8px;
	}

	.tag-what {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.95rem;
		color: #333;
	}

	.tag-meta {
		font-size: 0.85rem;
		color: #666;
	}

	.tag-actions {
		display: flex;
		gap: 0.5rem;
	}

	.tag-actions button {
		padding: 0.35rem 0.85rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.85rem;
		color: #333;
		cursor: pointer;
	}

	.tag-actions button:hover:not(:disabled) {
		border-color: #0066cc;
		color: #0066cc;
	}

	.tag-actions button.accept {
		background: #0066cc;
		border-color: #0066cc;
		color: #fff;
	}

	.tag-actions button.accept:hover:not(:disabled) {
		background: #0052a3;
		color: #fff;
	}

	.tag-actions button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.tag-error {
		margin: 0 0 0.6rem 0;
		font-size: 0.85rem;
		color: #9a2c2c;
	}

	.row-people {
		font-size: 0.85rem;
		color: #0b62a4;
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
