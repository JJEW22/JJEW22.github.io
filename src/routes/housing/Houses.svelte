<!-- src/routes/housing/Houses.svelte -->
<!--
	The houses tab: the shared list of houses being considered, added by Zillow
	link, on a map and as cards; each admin's 1-10 rating of each, with
	"wouldn't buy" / "wouldn't rent" toggles beside the score; and the cost
	analysis for whichever one is selected.

	Only the link is required. The address and zpid are read out of the link
	itself. Zillow blocks automated requests to its listing pages, so price,
	beds, baths and square feet come from RentCast instead, looked up by that
	address when the house is added (when RENTCAST_API_KEY is set). Anything
	typed in wins over what RentCast says.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import HouseAnalysis from './HouseAnalysis.svelte';
	import HouseMap from './HouseMap.svelte';
	import {
		HOUSE_SORTS,
		RATING_FLAGS,
		RATING_MAX,
		averageRating,
		flagSummary,
		formatDollars,
		housePeople,
		myScore as scoreBy,
		parseZillowUrl,
		pricePerPerson,
		pricePerSqft,
		sortHouses,
		type Assumptions,
		type House,
		type HouseSort
	} from '$lib/housing';

	export let marketRate: number | null = null;

	let houses: House[] = [];
	let selectedId: number | null = null;
	let loading = true;
	let busy = false;
	let msg = '';
	let error = '';
	let usage: {
		used: number;
		limit: number;
		stopAt: number;
		paused: boolean;
		configured: boolean;
	} | null = null;
	// The signed-in admin's id, from the server, to find their own rating.
	let me: number | null = null;
	let detailEl: HTMLElement;

	// Add form
	// Number inputs bind as number, or null when empty.
	let url = '';
	let price: number | null = null;
	let beds: number | null = null;
	let baths: number | null = null;
	let sqft: number | null = null;

	// Edit form, mirroring the selected house
	let eAddress = '';
	let ePrice: number | null = null;
	let eBeds: number | null = null;
	let eBaths: number | null = null;
	let eSqft: number | null = null;
	let eNotes = '';
	let editingFor: number | null = null;

	// Your rating of the selected house
	let myScore: number | null = null;
	let myFlags = { wouldntBuy: false, wouldntRent: false };
	let myComment = '';
	const SCORES = Array.from({ length: RATING_MAX }, (_, i) => i + 1);

	// How the list is shown. Remembered per browser: a convenience, so a
	// browser that won't store it just starts on the defaults.
	const VIEW_KEY = 'housing.houses.view';
	let view: 'cards' | 'table' = 'cards';
	let sortKey: HouseSort = 'newest';
	let sortDir: 'asc' | 'desc' = 'desc';

	onMount(async () => {
		try {
			const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
			if (saved?.view === 'cards' || saved?.view === 'table') view = saved.view;
			if (HOUSE_SORTS.some((s) => s.key === saved?.sortKey)) sortKey = saved.sortKey;
			if (saved?.sortDir === 'asc' || saved?.sortDir === 'desc') sortDir = saved.sortDir;
		} catch {
			/* no storage: defaults */
		}
		await send('GET');
		loading = false;
	});

	function remember() {
		try {
			localStorage.setItem(VIEW_KEY, JSON.stringify({ view, sortKey, sortDir }));
		} catch {
			/* no storage: nothing to remember */
		}
	}

	function setView(v: 'cards' | 'table') {
		view = v;
		remember();
	}

	// Picking a sort starts it in its natural direction; picking the one
	// already on flips it (a table header clicked twice).
	function sortBy(key: HouseSort) {
		const def = HOUSE_SORTS.find((s) => s.key === key)?.dir ?? 'asc';
		sortDir = key === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : def;
		sortKey = key;
		remember();
	}

	$: sortHasDir = HOUSE_SORTS.find((s) => s.key === sortKey)?.dir !== null;

	// The sort state is passed in, not read from the component, so the
	// template re-runs these whenever it changes.
	function arrow(key: HouseSort, current: HouseSort, dir: 'asc' | 'desc'): string {
		if (key !== current || !HOUSE_SORTS.find((s) => s.key === key)?.dir) return '';
		return dir === 'asc' ? ' ▲' : ' ▼';
	}

	function ariaSort(
		key: HouseSort,
		current: HouseSort,
		dir: 'asc' | 'desc'
	): 'ascending' | 'descending' | 'none' {
		if (key !== current || !HOUSE_SORTS.find((s) => s.key === key)?.dir) return 'none';
		return dir === 'asc' ? 'ascending' : 'descending';
	}

	function perPersonText(h: House): string {
		const per = pricePerPerson(h);
		const people = housePeople(h);
		return per !== null && people ? `${formatDollars(per)} per person · ${people} splitting` : '';
	}

	$: preview = url.trim() ? parseZillowUrl(url) : null;
	$: selected = houses.find((h) => h.id === selectedId) ?? null;
	// Eliminated houses leave the map and the main list; they're still here,
	// behind "Show eliminated", and can be restored.
	$: activeHouses = sortHouses(
		houses.filter((h) => !h.eliminatedAt),
		sortKey,
		sortDir,
		me
	);
	$: eliminatedHouses = sortHouses(
		houses.filter((h) => h.eliminatedAt),
		sortKey,
		sortDir,
		me
	);
	let showEliminated = false;

	async function setEliminated(h: House, eliminated: boolean) {
		msg = '';
		await send('PATCH', { id: h.id, eliminated });
	}
	$: if (selected && selected.id !== editingFor) syncEdit(selected);

	function syncEdit(h: House) {
		editingFor = h.id;
		eAddress = h.address ?? '';
		ePrice = h.price;
		eBeds = h.beds;
		eBaths = h.baths;
		eSqft = h.sqft;
		eNotes = h.notes;
		const mine = h.ratings.find((r) => r.userId === me);
		myScore = mine?.score ?? null;
		myFlags = { wouldntBuy: mine?.wouldntBuy ?? false, wouldntRent: mine?.wouldntRent ?? false };
		myComment = mine?.comment ?? '';
	}

	$: myRating = selected?.ratings.find((r) => r.userId === me) ?? null;
	$: ratingDirty =
		myScore !== (myRating?.score ?? null) ||
		myFlags.wouldntBuy !== (myRating?.wouldntBuy ?? false) ||
		myFlags.wouldntRent !== (myRating?.wouldntRent ?? false) ||
		myComment.trim() !== (myRating?.comment ?? '');

	async function pick(id: number, scroll = false) {
		selectedId = id;
		if (!scroll) return;
		await tick();
		detailEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function saveRating() {
		if (!selected) return;
		msg = '';
		await send(
			'POST',
			{ id: selected.id, score: myScore, ...myFlags, comment: myComment },
			'/housing/api/houses/rating'
		);
	}

	// "Wouldn't buy or rent" when both toggles are on; one label otherwise.
	function flagText(r: { wouldntBuy: boolean; wouldntRent: boolean }): string {
		if (r.wouldntBuy && r.wouldntRent) return "Wouldn't buy or rent";
		return r.wouldntBuy ? "Wouldn't buy" : r.wouldntRent ? "Wouldn't rent" : '';
	}

	async function send(
		method: string,
		body?: Record<string, unknown>,
		path = '/housing/api/houses'
	): Promise<boolean> {
		busy = true;
		error = '';
		try {
			const res = await fetch(path, {
				method,
				headers: body ? { 'content-type': 'application/json' } : undefined,
				body: body ? JSON.stringify(body) : undefined
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				error = data?.error || data?.message || `That didn't work (${res.status}).`;
				return false;
			}
			houses = data.houses ?? [];
			usage = data.rentcast ?? usage;
			me = data.me ?? me;
			if (data.message) msg = data.message;
			return true;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			return false;
		} finally {
			busy = false;
		}
	}

	async function add() {
		msg = '';
		if (!preview) {
			error = 'Paste a zillow.com link.';
			return;
		}
		const ok = await send('POST', { url, price, beds, baths, sqft });
		if (ok) {
			url = '';
			price = beds = baths = sqft = null;
			selectedId = houses[0]?.id ?? null;
		}
	}

	async function saveDetails() {
		if (!selected) return;
		msg = '';
		// The address only goes when it changed: changing it re-places the house
		// on the map, which a save of the price shouldn't do.
		const ok = await send('PATCH', {
			id: selected.id,
			...(eAddress.trim() !== (selected.address ?? '') ? { address: eAddress } : {}),
			price: ePrice,
			beds: eBeds,
			baths: eBaths,
			sqft: eSqft,
			notes: eNotes
		});
		if (ok) msg = 'Saved.';
	}

	async function saveAssumptions(e: CustomEvent<Partial<Assumptions> | null>) {
		if (!selected) return;
		msg = '';
		const ok = await send('PATCH', { id: selected.id, assumptions: e.detail });
		if (ok) msg = e.detail ? 'Assumptions saved.' : 'Assumptions reset to the defaults.';
	}

	async function lookup(h: House) {
		const ask =
			`Look ${h.address} up on RentCast again? This uses 3-4 of the month's ` +
			`${usage?.limit ?? 50} free requests (${usage?.used ?? 0} used so far; autofill ` +
			`pauses at ${usage?.stopAt ?? 40}) and replaces the price, beds, baths and sqft ` +
			'with what RentCast has.';
		if (!confirm(ask)) return;
		msg = '';
		if (await send('POST', { id: h.id, overwrite: true }, '/housing/api/houses/lookup')) {
			editingFor = null; // re-mirror the edit form from the updated house
		}
	}

	async function remove(h: House) {
		if (!confirm(`Remove ${h.address ?? 'this house'} from the list?`)) return;
		msg = '';
		if (await send('DELETE', { id: h.id })) {
			if (selectedId === h.id) selectedId = null;
			msg = 'Removed.';
		}
	}

	function range(r: { low: number | null; high: number | null }): string {
		return r.low && r.high ? ` (${formatDollars(r.low)}–${formatDollars(r.high)})` : '';
	}

	function title(h: House): string {
		return h.address ?? (h.zpid ? `Zillow listing ${h.zpid}` : 'Zillow listing');
	}

	function facts(h: House): string {
		return [
			h.beds !== null ? `${h.beds} bd` : '',
			h.baths !== null ? `${h.baths} ba` : '',
			h.sqft !== null ? `${h.sqft.toLocaleString('en-US')} sqft` : ''
		]
			.filter(Boolean)
			.join(' · ');
	}
</script>

{#if msg}<p class="banner ok">{msg}</p>{/if}
{#if error}<p class="banner bad">{error}</p>{/if}

<section class="panel">
	<h2>Add a house</h2>
	<form class="add" on:submit|preventDefault={add}>
		<label class="wide">
			<span>Zillow link</span>
			<input
				bind:value={url}
				placeholder="https://www.zillow.com/homedetails/…_zpid/"
				inputmode="url"
				autocomplete="off"
			/>
		</label>
		<label>
			<span>Price $</span>
			<input type="number" min="0" step="1000" bind:value={price} />
		</label>
		<label>
			<span>Beds</span>
			<input type="number" min="0" step="1" bind:value={beds} />
		</label>
		<label>
			<span>Baths</span>
			<input type="number" min="0" step="0.5" bind:value={baths} />
		</label>
		<label>
			<span>Sqft</span>
			<input type="number" min="0" step="1" bind:value={sqft} />
		</label>
		<button type="submit" disabled={busy || !preview}>{busy ? 'Adding…' : 'Add'}</button>
	</form>
	<p class="note">
		{#if usage?.configured && usage.paused}
			<span class="paused">
				⚠ RentCast autofill is paused until next month ({usage.used} of {usage.limit} free requests
				used; it stops at {usage.stopAt} to stay on the free plan). Fill in the numbers by hand.
			</span>
		{:else if usage?.configured}
			Leave the numbers blank to fill them from RentCast · {usage.used} of {usage.limit} free requests
			used this month, 3–4 per house; autofill pauses at {usage.stopAt}.
		{:else if usage}
			Add <code>RENTCAST_API_KEY</code> to fill these in automatically.
		{/if}
	</p>
	{#if url.trim()}
		<p class="note">
			{#if !preview}
				That doesn't look like a zillow.com link.
			{:else if preview.address}
				Reads as <strong>{preview.address}</strong>{preview.zpid ? ` (zpid ${preview.zpid})` : ''}.
			{:else}
				No address in this link. You can type one in after adding it.
			{/if}
		</p>
	{/if}
</section>

<h2>Being considered</h2>
{#if loading}
	<p class="note">Loading…</p>
{:else if !houses.length}
	<p class="note">No houses yet. Add one with its Zillow link above.</p>
{:else}
	<HouseMap houses={activeHouses} {selectedId} on:select={(e) => pick(e.detail, true)} />
	{#if !activeHouses.length}
		<p class="note">Every house has been eliminated. Add another, or restore one below.</p>
	{/if}

	<div class="list-controls">
		<span class="seg" role="group" aria-label="Show houses as">
			<button
				type="button"
				class:on={view === 'cards'}
				aria-pressed={view === 'cards'}
				on:click={() => setView('cards')}>Cards</button
			>
			<button
				type="button"
				class:on={view === 'table'}
				aria-pressed={view === 'table'}
				on:click={() => setView('table')}>Table</button
			>
		</span>
		<label class="sort">
			<span>Sort by</span>
			<select value={sortKey} on:change={(e) => sortBy(e.currentTarget.value as HouseSort)}>
				{#each HOUSE_SORTS as s (s.key)}
					<option value={s.key}>{s.label}</option>
				{/each}
			</select>
		</label>
		{#if sortHasDir}
			<button
				type="button"
				class="secondary dir"
				on:click={() => sortBy(sortKey)}
				aria-label="Sort {sortDir === 'asc' ? 'ascending' : 'descending'}; switch direction"
			>
				{sortDir === 'asc' ? '▲ Low to high' : '▼ High to low'}
			</button>
		{/if}
	</div>

	{#if view === 'table'}
		<div class="table-scroll">
			<table class="house-table">
				<thead>
					<tr>
						<th>House</th>
						<th aria-sort={ariaSort('price', sortKey, sortDir)}>
							<button type="button" on:click={() => sortBy('price')}
								>Price{arrow('price', sortKey, sortDir)}</button
							>
						</th>
						<th aria-sort={ariaSort('perPerson', sortKey, sortDir)}>
							<button type="button" on:click={() => sortBy('perPerson')}
								>Per person{arrow('perPerson', sortKey, sortDir)}</button
							>
						</th>
						<th>Beds</th>
						<th>Baths</th>
						<th aria-sort={ariaSort('sqft', sortKey, sortDir)}>
							<button type="button" on:click={() => sortBy('sqft')}
								>Sq ft{arrow('sqft', sortKey, sortDir)}</button
							>
						</th>
						<th aria-sort={ariaSort('perSqft', sortKey, sortDir)}>
							<button type="button" on:click={() => sortBy('perSqft')}
								>$ / sq ft{arrow('perSqft', sortKey, sortDir)}</button
							>
						</th>
						<th aria-sort={ariaSort('rating', sortKey, sortDir)}>
							<button type="button" on:click={() => sortBy('rating')}
								>Rating{arrow('rating', sortKey, sortDir)}</button
							>
						</th>
						<th>
							<button type="button" on:click={() => sortBy('unrated')}>You</button>
						</th>
						<th>Flags</th>
						<th aria-sort={ariaSort('newest', sortKey, sortDir)}>
							<button type="button" on:click={() => sortBy('newest')}
								>Added{arrow('newest', sortKey, sortDir)}</button
							>
						</th>
						<th><span class="sr-only">Zillow</span></th>
					</tr>
				</thead>
				<tbody>
					{#each activeHouses as h (h.id)}
						{@const avg = averageRating(h)}
						{@const mine = scoreBy(h, me)}
						<tr class:selected={h.id === selectedId}>
							<td class="house-cell">
								<button type="button" class="link" on:click={() => pick(h.id, true)}>
									{title(h)}
								</button>
							</td>
							<td>{h.price !== null ? formatDollars(h.price) : '—'}</td>
							<td>
								{pricePerPerson(h) !== null ? formatDollars(pricePerPerson(h) ?? 0) : '—'}
								{#if housePeople(h)}<span class="sub">÷ {housePeople(h)}</span>{/if}
							</td>
							<td>{h.beds ?? '—'}</td>
							<td>{h.baths ?? '—'}</td>
							<td>{h.sqft !== null ? h.sqft.toLocaleString('en-US') : '—'}</td>
							<td>{pricePerSqft(h) !== null ? formatDollars(pricePerSqft(h) ?? 0) : '—'}</td>
							<td>
								{#if avg !== null}{avg.toFixed(1)}<span class="sub">
										/{RATING_MAX} · {h.ratings.length}</span
									>{:else}—{/if}
							</td>
							<td
								>{#if mine !== null}{mine}{:else}<span class="todo">Not yet</span>{/if}</td
							>
							<td class="flags-cell">{flagSummary(h) || '—'}</td>
							<td>{new Date(h.createdAt).toLocaleDateString('en-US')}</td>
							<td>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
								<a href={h.url} target="_blank" rel="noopener noreferrer">Zillow ↗</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<ul class="houses">
			{#each activeHouses as h (h.id)}
				<li class:selected={h.id === selectedId}>
					<button type="button" class="pick" on:click={() => pick(h.id, true)}>
						<span class="name">{title(h)}</span>
						<span class="price">{h.price !== null ? formatDollars(h.price) : 'No price yet'}</span>
						{#if perPersonText(h)}<span class="per-person">{perPersonText(h)}</span>{/if}
						{#if facts(h)}<span class="facts">{facts(h)}</span>{/if}
						{#if averageRating(h) !== null}
							{@const avg = averageRating(h) ?? 0}
							<span class="rating" title="{avg.toFixed(1)} out of {RATING_MAX}">
								<span class="avg">{avg.toFixed(1)}</span>/{RATING_MAX} · {h.ratings.length}
								{h.ratings.length === 1 ? 'rating' : 'ratings'}
							</span>
							{#if flagSummary(h)}<span class="rating flagged">{flagSummary(h)}</span>{/if}
						{:else}
							<span class="rating none">Not rated yet</span>
						{/if}
						<span class="by">
							Added {new Date(h.createdAt).toLocaleDateString('en-US')}{h.addedBy
								? ` by ${h.addedBy}`
								: ''}{h.assumptions ? ' · assumptions saved' : ''}
						</span>
					</button>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
					<a href={h.url} target="_blank" rel="noopener noreferrer">Open on Zillow ↗</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if eliminatedHouses.length}
		<button
			type="button"
			class="secondary show-eliminated"
			aria-expanded={showEliminated}
			on:click={() => (showEliminated = !showEliminated)}
		>
			{showEliminated ? 'Hide' : 'Show'} eliminated ({eliminatedHouses.length})
		</button>
		{#if showEliminated}
			<ul class="houses eliminated">
				{#each eliminatedHouses as h (h.id)}
					<li class:selected={h.id === selectedId}>
						<button type="button" class="pick" on:click={() => pick(h.id, true)}>
							<span class="name">{title(h)}</span>
							<span class="price">{h.price !== null ? formatDollars(h.price) : 'No price yet'}</span
							>
							{#if perPersonText(h)}<span class="per-person">{perPersonText(h)}</span>{/if}
							{#if facts(h)}<span class="facts">{facts(h)}</span>{/if}
							{#if averageRating(h) !== null}
								{@const avg = averageRating(h) ?? 0}
								<span class="rating" title="{avg.toFixed(1)} out of {RATING_MAX}">
									<span class="avg">{avg.toFixed(1)}</span>/{RATING_MAX} · {h.ratings.length}
									{h.ratings.length === 1 ? 'rating' : 'ratings'}
								</span>
								{#if flagSummary(h)}<span class="rating flagged">{flagSummary(h)}</span>{/if}
							{:else}
								<span class="rating none">No one rated it</span>
							{/if}
							<span class="by">
								Eliminated {new Date(h.eliminatedAt ?? '').toLocaleDateString(
									'en-US'
								)}{h.eliminatedBy ? ` by ${h.eliminatedBy}` : ''}
							</span>
						</button>
						<div class="card-actions">
							<button
								type="button"
								class="secondary mini"
								on:click={() => setEliminated(h, false)}
								disabled={busy}
							>
								Restore
							</button>
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
							<a href={h.url} target="_blank" rel="noopener noreferrer">Open on Zillow ↗</a>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
{/if}

{#if selected}
	<section class="panel detail" class:is-eliminated={selected.eliminatedAt} bind:this={detailEl}>
		<h2>{title(selected)}</h2>
		{#if selected.eliminatedAt}
			<p class="banner warn">
				Eliminated {new Date(selected.eliminatedAt).toLocaleDateString(
					'en-US'
				)}{selected.eliminatedBy ? ` by ${selected.eliminatedBy}` : ''}. It's off the main list and
				the map, and RentCast won't sync it.
			</p>
		{/if}
		<form class="edit" on:submit|preventDefault={saveDetails}>
			<label class="wide">
				<span>Address</span>
				<input bind:value={eAddress} />
			</label>
			<label>
				<span>Price $</span>
				<input type="number" min="0" step="1000" bind:value={ePrice} />
			</label>
			<label>
				<span>Beds</span>
				<input type="number" min="0" step="1" bind:value={eBeds} />
			</label>
			<label>
				<span>Baths</span>
				<input type="number" min="0" step="0.5" bind:value={eBaths} />
			</label>
			<label>
				<span>Sqft</span>
				<input type="number" min="0" step="1" bind:value={eSqft} />
			</label>
			<label class="full">
				<span>Notes</span>
				<textarea rows="3" bind:value={eNotes}></textarea>
			</label>
			<div class="buttons">
				<button type="submit" disabled={busy}>Save details</button>
				<label class="eliminate">
					<input
						type="checkbox"
						checked={Boolean(selected.eliminatedAt)}
						disabled={busy}
						on:change={(e) => selected && setEliminated(selected, e.currentTarget.checked)}
					/>
					Eliminated
				</label>
				<button
					type="button"
					class="danger"
					on:click={() => selected && remove(selected)}
					disabled={busy}
				>
					Remove
				</button>
			</div>
		</form>

		<div class="ratings">
			<h3>How everyone feels</h3>
			{#if selected.eliminatedAt}
				<!-- Frozen as it stood when the house was eliminated: everyone's
				     rating, yours included, as a list. Restoring it brings the
				     controls back. -->
				{#if selected.ratings.length}
					{@const avg = averageRating(selected) ?? 0}
					<p class="note">
						Average {avg.toFixed(1)}/{RATING_MAX} from {selected.ratings.length}
						{selected.ratings.length === 1 ? 'rating' : 'ratings'}{flagSummary(selected)
							? ` · ${flagSummary(selected)}`
							: ''}. Restore the house to change a rating.
					</p>
					<ul class="others frozen">
						{#each selected.ratings as r (r.userId)}
							<li>
								<span class="who">{r.userId === me ? 'You' : r.name}</span>
								<span class="their-score">{r.score}/{RATING_MAX}</span>
								{#if flagText(r)}<span class="their-flags">{flagText(r)}</span>{/if}
								{#if r.comment}<span class="their-comment">“{r.comment}”</span>{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="note">No one rated this house before it was eliminated.</p>
				{/if}
			{:else}
				<div class="mine">
					<span class="who">You</span>
					<div class="scale" role="radiogroup" aria-label="Your score, 1 to {RATING_MAX}">
						{#each SCORES as n (n)}
							<button
								type="button"
								role="radio"
								aria-checked={myScore === n}
								class="score"
								class:on={myScore === n}
								on:click={() => (myScore = myScore === n ? null : n)}
							>
								{n}
							</button>
						{/each}
					</div>
					<div class="toggles">
						{#each RATING_FLAGS as f (f.key)}
							<button
								type="button"
								class="toggle"
								class:on={myFlags[f.key]}
								aria-pressed={myFlags[f.key]}
								on:click={() => (myFlags = { ...myFlags, [f.key]: !myFlags[f.key] })}
							>
								<span class="box" aria-hidden="true">{myFlags[f.key] ? '✕' : ''}</span>
								{f.label}
							</button>
						{/each}
					</div>
					<input
						class="comment"
						bind:value={myComment}
						placeholder="Why? (optional)"
						maxlength="1000"
					/>
					<button
						type="button"
						on:click={saveRating}
						disabled={busy || !ratingDirty || me === null || (myScore === null && !myRating)}
					>
						{myScore === null && myRating ? 'Remove rating' : 'Save rating'}
					</button>
				</div>
				{#if myScore === null && (myFlags.wouldntBuy || myFlags.wouldntRent)}
					<p class="note">
						Pick a score too: the toggles go alongside a score, not instead of one.
					</p>
				{/if}
				{#if selected.ratings.filter((r) => r.userId !== me).length}
					<ul class="others">
						{#each selected.ratings.filter((r) => r.userId !== me) as r (r.userId)}
							<li>
								<span class="who">{r.name}</span>
								<span class="their-score">{r.score}/{RATING_MAX}</span>
								{#if flagText(r)}<span class="their-flags">{flagText(r)}</span>{/if}
								{#if r.comment}<span class="their-comment">“{r.comment}”</span>{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="note">No one else has rated this house yet.</p>
				{/if}
			{/if}
		</div>

		{#if selected.rentcast}
			{@const rc = selected.rentcast}
			<div class="rentcast">
				<h3>RentCast</h3>
				<dl>
					{#if rc.listing}
						<dt>Asking price</dt>
						<dd>
							{formatDollars(rc.listing.price)}{rc.listing.listedDate
								? ` · listed ${new Date(rc.listing.listedDate).toLocaleDateString('en-US')}`
								: ''}
						</dd>
					{/if}
					{#if rc.valueEstimate}
						<dt>Value estimate</dt>
						<dd>{formatDollars(rc.valueEstimate.price)}{range(rc.valueEstimate)}</dd>
					{/if}
					{#if rc.rentEstimate}
						<dt>Rent estimate</dt>
						<dd>
							{formatDollars(rc.rentEstimate.rent)}/mo{range({
								low: rc.rentEstimate.low,
								high: rc.rentEstimate.high
							})}
						</dd>
					{/if}
					{#if rc.propertyType}<dt>Type</dt>
						<dd>{rc.propertyType}</dd>{/if}
					{#if rc.yearBuilt}<dt>Built</dt>
						<dd>{rc.yearBuilt}</dd>{/if}
					{#if rc.lotSize}<dt>Lot</dt>
						<dd>{rc.lotSize.toLocaleString('en-US')} sqft</dd>{/if}
					{#if rc.lastSale}
						<dt>Last sold</dt>
						<dd>
							{formatDollars(rc.lastSale.price)}{rc.lastSale.date
								? ` · ${new Date(rc.lastSale.date).toLocaleDateString('en-US')}`
								: ''}
						</dd>
					{/if}
					{#if rc.annualTax}
						<dt>Property tax</dt>
						<dd>{formatDollars(rc.annualTax.total)} ({rc.annualTax.year})</dd>
					{/if}
					{#if rc.hoaMonthly}<dt>HOA</dt>
						<dd>{formatDollars(rc.hoaMonthly)}/mo</dd>{/if}
					{#if rc.matchedAddress}<dt>Matched</dt>
						<dd>{rc.matchedAddress}</dd>{/if}
				</dl>
				{#if rc.errors.length}
					<p class="note bad-text">Some lookups failed: {rc.errors.join('; ')}</p>
				{/if}
				{#if rc.listingCheckedAt && rc.listingUnmatched}
					<p class="note">
						The weekly check couldn't find this address among RentCast's active listings for its ZIP
						code, so its asking price wasn't refreshed. Check the address matches the listing's.
					</p>
				{:else if rc.listingCheckedAt && !rc.listing}
					<p class="note bad-text">
						Not listed for sale as of {new Date(rc.listingCheckedAt).toLocaleDateString('en-US')}.
					</p>
				{/if}
				{#if (rc.priceHistory?.length ?? 0) > 1}
					<p class="note">
						Asking price history: {(rc.priceHistory ?? [])
							.map(
								(p) => `${formatDollars(p.price)} (${new Date(p.date).toLocaleDateString('en-US')})`
							)
							.join(' → ')}
					</p>
				{/if}
				<p class="note">
					Looked up {new Date(rc.lookedUpAt).toLocaleString('en-US')}{rc.listingCheckedAt
						? `; asking price last checked ${new Date(rc.listingCheckedAt).toLocaleDateString('en-US')}`
						: ''}. The asking price is re-checked weekly. RentCast's data can lag Zillow's, so check
					the numbers against the listing.
				</p>
			</div>
		{/if}
		{#if usage?.configured && selected.address && !selected.eliminatedAt}
			<button
				type="button"
				class="secondary"
				on:click={() => selected && lookup(selected)}
				disabled={busy || usage.paused}
				title={usage.paused ? 'Paused for the month to stay on RentCast’s free plan' : undefined}
			>
				{selected.rentcast ? 'Update from RentCast' : 'Look up on RentCast'}
			</button>
			{#if usage.paused}
				<span class="paused small"
					>⚠ Paused until next month: {usage.used} of {usage.limit} used.</span
				>
			{/if}
		{/if}

		{#if selected.price}
			<HouseAnalysis
				house={selected}
				price={selected.price}
				{marketRate}
				{busy}
				on:save={saveAssumptions}
			/>
		{:else}
			<p class="note">Enter the price above to run the cost analysis.</p>
		{/if}
	</section>
{/if}

<style>
	h2 {
		font-size: 1.2rem;
		margin: 2rem 0 1rem 0;
		color: #333;
	}

	.panel h2 {
		margin-top: 0;
	}

	.panel {
		margin-top: 1.5rem;
		padding: 1.25rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
	}

	.note {
		color: #666;
		font-size: 0.9rem;
	}

	.banner {
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.banner.ok {
		background: #ecfdf3;
		color: #006300;
	}

	.banner.bad {
		background: #fef2f2;
		color: #b42318;
	}

	form {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 0.75rem;
		align-items: end;
	}

	.wide {
		grid-column: span 3;
	}

	.full {
		grid-column: 1 / -1;
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

	input,
	textarea {
		padding: 0.45rem 0.55rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		min-width: 0;
	}

	.buttons {
		display: flex;
		gap: 0.6rem;
		grid-column: 1 / -1;
	}

	button {
		padding: 0.5rem 1rem;
		background: #0066cc;
		border: none;
		border-radius: 6px;
		color: #fff;
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
	}

	button.secondary {
		margin-bottom: 0.5rem;
		background: #fff;
		border: 1px solid #d5dae1;
		color: #333;
	}

	.rating {
		color: #52514e;
		font-size: 0.82rem;
	}

	.rating.none {
		color: #898781;
	}

	.rating .avg {
		font-weight: 600;
		color: #0b0b0b;
	}

	.flagged,
	.their-flags {
		color: #b42318;
		font-weight: 600;
	}

	.ratings {
		margin: 1.25rem 0 0.75rem;
		padding: 0.9rem 1rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.ratings h3 {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
		color: #333;
	}

	.mine {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.who {
		min-width: 4rem;
		font-weight: 600;
		font-size: 0.88rem;
		color: #0b0b0b;
	}

	.scale,
	.toggles {
		display: flex;
		gap: 0.25rem;
	}

	.score {
		min-width: 2.25rem;
		padding: 0.4rem 0;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 8px;
		color: #374151;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.score.on {
		background: #0066cc;
		border-color: #0066cc;
		color: #fff;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.7rem;
		background: #fff;
		border: 1px solid #e3a39d;
		border-radius: 8px;
		color: #8a3a33;
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.toggle .box {
		display: inline-grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border: 1px solid currentColor;
		border-radius: 3px;
		font-size: 0.7rem;
		line-height: 1;
	}

	.toggle.on {
		background: #b42318;
		border-color: #b42318;
		color: #fff;
	}

	.comment {
		flex: 1;
		min-width: 12rem;
	}

	.others {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin: 0.9rem 0 0;
		padding: 0.75rem 0 0;
		border-top: 1px solid #f0f0f0;
		list-style: none;
		font-size: 0.88rem;
	}

	.others li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.75rem;
	}

	.others.frozen {
		margin-top: 0.25rem;
		padding-top: 0;
		border-top: none;
	}

	.their-score {
		color: #374151;
	}

	.their-comment {
		color: #6b7280;
	}

	.list-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 0.9rem;
		margin: 1rem 0 0.85rem;
	}

	.seg {
		display: inline-flex;
		border: 1px solid #d5dae1;
		border-radius: 8px;
		overflow: hidden;
	}

	.seg button {
		margin: 0;
		padding: 0.4rem 0.9rem;
		background: #fff;
		border: none;
		border-radius: 0;
		color: #374151;
		font-size: 0.88rem;
	}

	.seg button + button {
		border-left: 1px solid #d5dae1;
	}

	.seg button.on {
		background: #0066cc;
		color: #fff;
	}

	.sort {
		flex-direction: row;
		align-items: center;
		gap: 0.45rem;
	}

	.sort select {
		padding: 0.4rem 0.5rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.88rem;
	}

	button.dir {
		margin: 0;
		padding: 0.4rem 0.75rem;
		font-size: 0.85rem;
	}

	.per-person {
		color: #374151;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.table-scroll {
		/* Positioned, so the visually-hidden header label is placed (and
		   clipped) inside the scroll box instead of stretching the page. */
		position: relative;
		overflow-x: auto;
		border: 1px solid rgba(11, 11, 11, 0.1);
		border-radius: 10px;
		background: #fcfcfb;
	}

	.house-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
		font-variant-numeric: tabular-nums;
	}

	.house-table th,
	.house-table td {
		padding: 0.5rem 0.65rem;
		border-bottom: 1px solid #e1e0d9;
		text-align: right;
		white-space: nowrap;
	}

	.house-table th:first-child,
	.house-table td:first-child,
	.house-table .flags-cell {
		text-align: left;
	}

	.house-table thead th {
		background: #fff;
		color: #52514e;
		font-weight: 600;
	}

	.house-table th button {
		margin: 0;
		padding: 0;
		background: none;
		border: none;
		border-radius: 0;
		color: inherit;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.house-table th button:hover {
		color: #0066cc;
	}

	.house-table tbody tr:last-child td {
		border-bottom: none;
	}

	.house-table tr.selected td {
		background: #eef5ff;
	}

	.house-cell {
		max-width: 18rem;
		white-space: normal;
	}

	button.link {
		margin: 0;
		padding: 0;
		background: none;
		border: none;
		border-radius: 0;
		color: #0b0b0b;
		font: inherit;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	button.link:hover {
		color: #0066cc;
		text-decoration: underline;
	}

	.sub {
		margin-left: 0.2rem;
		color: #898781;
		font-size: 0.78rem;
	}

	.todo {
		color: #8a5a00;
	}

	.flags-cell {
		color: #b42318;
		white-space: normal;
		min-width: 9rem;
	}

	.house-table a {
		color: #0066cc;
		text-decoration: none;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.banner.warn {
		background: #fff7e6;
		color: #8a5a00;
	}

	.is-eliminated h2 {
		color: #6b7280;
		text-decoration: line-through;
	}

	.eliminate {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		margin-left: auto;
		font-size: 0.9rem;
		color: #374151;
		cursor: pointer;
	}

	.eliminate input {
		width: 1rem;
		height: 1rem;
	}

	.show-eliminated {
		margin-top: 1rem;
	}

	.houses.eliminated {
		margin-top: 0.85rem;
	}

	.houses.eliminated li {
		opacity: 0.75;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 1rem 0.8rem;
	}

	.card-actions a {
		padding: 0;
	}

	button.mini {
		margin: 0;
		padding: 0.25rem 0.7rem;
		font-size: 0.82rem;
	}

	.paused {
		display: inline-block;
		padding: 0.35rem 0.6rem;
		background: #fff7e6;
		border: 1px solid #f0dcae;
		border-radius: 6px;
		color: #8a5a00;
	}

	.paused.small {
		margin-left: 0.5rem;
		padding: 0.2rem 0.5rem;
		font-size: 0.8rem;
	}

	.rentcast {
		margin: 1.25rem 0 0.75rem;
		padding: 0.9rem 1rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.rentcast h3 {
		margin: 0 0 0.6rem;
		font-size: 0.95rem;
		color: #333;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.3rem 1rem;
		margin: 0;
		font-size: 0.88rem;
	}

	dt {
		color: #666;
	}

	dd {
		margin: 0;
		color: #0b0b0b;
	}

	.bad-text {
		color: #b42318;
	}

	code {
		padding: 0.1rem 0.35rem;
		background: #f3f4f6;
		border-radius: 4px;
		font-size: 0.9em;
	}

	button.danger {
		background: #fff;
		border: 1px solid #f0c4c0;
		color: #b42318;
	}

	button:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.houses {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 0.85rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.houses li {
		display: flex;
		flex-direction: column;
		background: #fcfcfb;
		border: 1px solid rgba(11, 11, 11, 0.1);
		border-radius: 10px;
		overflow: hidden;
	}

	.houses li.selected {
		border-color: #0066cc;
		box-shadow: 0 0 0 1px #0066cc;
	}

	.pick {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		padding: 0.9rem 1rem 0.5rem;
		background: none;
		border-radius: 0;
		color: inherit;
		text-align: left;
	}

	.pick .name {
		font-weight: 600;
		color: #0b0b0b;
	}

	.pick .price {
		font-size: 1.2rem;
		font-weight: 600;
		color: #0b0b0b;
	}

	.pick .facts {
		color: #52514e;
		font-size: 0.85rem;
	}

	.pick .by {
		color: #898781;
		font-size: 0.78rem;
	}

	.houses a {
		padding: 0 1rem 0.8rem;
		color: #0066cc;
		font-size: 0.85rem;
		text-decoration: none;
	}

	.houses a:hover {
		text-decoration: underline;
	}

	@media (max-width: 768px) {
		.wide {
			grid-column: 1 / -1;
		}

		.scale,
		.toggles {
			flex-basis: 100%;
			flex-wrap: wrap;
		}

		/* Ten scores in two rows of five on a phone. */
		.score {
			flex: 1 0 calc(20% - 0.25rem);
			min-width: 0;
		}

		.toggle {
			flex: 1;
			justify-content: center;
		}
	}
</style>
