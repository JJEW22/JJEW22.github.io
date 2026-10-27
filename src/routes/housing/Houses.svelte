<!-- src/routes/housing/Houses.svelte -->
<!--
	The houses tab: the shared list of houses being considered, added by Zillow
	link, and the cost analysis for whichever one is selected.

	Only the link is required. The address and zpid are read out of the link
	itself; price, beds, baths and square feet are typed in, because Zillow
	blocks automated requests to its listing pages.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import HouseAnalysis from './HouseAnalysis.svelte';
	import { formatDollars, parseZillowUrl, type Assumptions, type House } from '$lib/housing';

	export let marketRate: number | null = null;

	let houses: House[] = [];
	let selectedId: number | null = null;
	let loading = true;
	let busy = false;
	let msg = '';
	let error = '';

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

	onMount(async () => {
		await send('GET');
		loading = false;
	});

	$: preview = url.trim() ? parseZillowUrl(url) : null;
	$: selected = houses.find((h) => h.id === selectedId) ?? null;
	$: if (selected && selected.id !== editingFor) syncEdit(selected);

	function syncEdit(h: House) {
		editingFor = h.id;
		eAddress = h.address ?? '';
		ePrice = h.price;
		eBeds = h.beds;
		eBaths = h.baths;
		eSqft = h.sqft;
		eNotes = h.notes;
	}

	async function send(method: string, body?: Record<string, unknown>): Promise<boolean> {
		busy = true;
		error = '';
		try {
			const res = await fetch('/housing/api/houses', {
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
			msg = 'Added.';
			url = '';
			price = beds = baths = sqft = null;
			selectedId = houses[0]?.id ?? null;
		}
	}

	async function saveDetails() {
		if (!selected) return;
		msg = '';
		const ok = await send('PATCH', {
			id: selected.id,
			address: eAddress,
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

	async function remove(h: House) {
		if (!confirm(`Remove ${h.address ?? 'this house'} from the list?`)) return;
		msg = '';
		if (await send('DELETE', { id: h.id })) {
			if (selectedId === h.id) selectedId = null;
			msg = 'Removed.';
		}
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
			<input type="number" min="0" step="10" bind:value={sqft} />
		</label>
		<button type="submit" disabled={busy || !preview}>Add</button>
	</form>
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
	<ul class="houses">
		{#each houses as h (h.id)}
			<li class:selected={h.id === selectedId}>
				<button type="button" class="pick" on:click={() => (selectedId = h.id)}>
					<span class="name">{title(h)}</span>
					<span class="price">{h.price !== null ? formatDollars(h.price) : 'No price yet'}</span>
					{#if facts(h)}<span class="facts">{facts(h)}</span>{/if}
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

{#if selected}
	<section class="panel detail">
		<h2>{title(selected)}</h2>
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
				<input type="number" min="0" step="10" bind:value={eSqft} />
			</label>
			<label class="full">
				<span>Notes</span>
				<textarea rows="3" bind:value={eNotes}></textarea>
			</label>
			<div class="buttons">
				<button type="submit" disabled={busy}>Save details</button>
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
	}
</style>
