<!-- src/routes/meSoup/admin/+page.svelte -->
<!--
	Add and edit your own swim spots. Anyone signed in gets a map of their own;
	nobody sees or edits anyone else's here.

	Every page in this app is prerendered (see src/routes/+layout.js), so there is
	no server load to gate on: the page renders for anyone and shows a signed-out
	state, while /meSoup/api/admin/spots is what actually scopes every read and
	write to the signed-in user.

	The draft is validated with normalizeSpot() from $lib/swimSpots — the same
	function the endpoint validates with — so the form can never call something
	valid that the server then rejects, or the other way round.

	The map is the real one, with the draft drawn into it as you type. A typo in a
	coordinate is invisible in a text field and obvious as a dot in the wrong sea.
-->
<script lang="ts">
	import '../../../app.css';
	import { onMount } from 'svelte';
	import WorldMap from '../WorldMap.svelte';
	import {
		WATER_TYPES,
		DEFAULT_WATER_TYPE,
		normalizeSpot,
		waterType,
		dmsToDecimal,
		decimalToDms,
		formatDms
	} from '$lib/swimSpots';
	import type { SwimSpot, WaterTypeMeta, Dms } from '$lib/swimSpots';

	const API = '/meSoup/api/admin/spots';
	// The draft dot needs an id the map can key on that no real row can collide
	// with; ids come from an identity column, so nothing is ever negative.
	const DRAFT_ID = -1;
	const DMS_PREF_KEY = 'mesoup:admin:dms';

	let status = 'loading'; // loading | denied | ready
	let username = '';
	let spots: SwimSpot[] = [];
	let waterTypes: WaterTypeMeta[] = WATER_TYPES;
	let msg = '';
	let error = '';
	let busy = false;
	let selectedId: number | null = null;

	let draft = blank();
	// The id being edited, or null for a new spot.
	let editingId: number | null = null;

	// Degrees/minutes/seconds entry. The decimal fields in `draft` stay the
	// record; the DMS fields are converted into them on the way to validation,
	// and the two are synced whenever the checkbox flips.
	let useDms = false;
	let latDms = blankDms('N');
	let lonDms = blankDms('W');

	function blank() {
		return {
			name: '',
			lat: '',
			lon: '',
			swumOn: '',
			waterType: DEFAULT_WATER_TYPE,
			// What was typed beside "Other"; the server turns it into a new type.
			otherLabel: '',
			country: '',
			region: '',
			note: ''
		};
	}

	function blankDms(hemi: string): Dms {
		return { d: '', m: '', s: '', hemi };
	}

	function fillDms(lat: string, lon: string) {
		latDms =
			lat.trim() !== '' && Number.isFinite(Number(lat))
				? decimalToDms(Number(lat), 'Latitude')
				: blankDms(latDms.hemi);
		lonDms =
			lon.trim() !== '' && Number.isFinite(Number(lon))
				? decimalToDms(Number(lon), 'Longitude')
				: blankDms(lonDms.hemi);
	}

	function toggleDms() {
		if (useDms) {
			fillDms(draft.lat, draft.lon);
		} else {
			// Carry over whatever converts; a half-typed DMS field just stays as
			// the decimal it was.
			const lat = dmsToDecimal(latDms, 'Latitude');
			const lon = dmsToDecimal(lonDms, 'Longitude');
			if (lat.ok) draft.lat = String(+lat.value.toFixed(6));
			if (lon.ok) draft.lon = String(+lon.value.toFixed(6));
		}
		try {
			localStorage.setItem(DMS_PREF_KEY, useDms ? '1' : '0');
		} catch {
			// No storage (private window): the box just forgets on reload.
		}
	}

	onMount(async () => {
		try {
			useDms = localStorage.getItem(DMS_PREF_KEY) === '1';
		} catch {
			useDms = false;
		}
		const me = await fetch('/api/auth/me')
			.then((r) => r.json())
			.catch(() => ({ user: null }));
		if (!me.user) {
			status = 'denied';
			return;
		}
		username = me.user;
		await load();
	});

	async function load() {
		const r = await fetch(API);
		const data = await r.json().catch(() => null);
		if (!r.ok) {
			error = data?.error || data?.message || `Could not load the spots (${r.status}).`;
			status = r.status === 401 ? 'denied' : 'ready';
			return;
		}
		spots = data.spots ?? [];
		if (data.waterTypes?.length) waterTypes = data.waterTypes;
		status = 'ready';
	}

	// --- the draft ---

	$: latParsed = useDms ? dmsToDecimal(latDms, 'Latitude') : null;
	$: lonParsed = useDms ? dmsToDecimal(lonDms, 'Longitude') : null;
	$: dmsError =
		(latParsed && !latParsed.ok && latParsed.error) ||
		(lonParsed && !lonParsed.ok && lonParsed.error) ||
		'';
	$: coords = useDms
		? {
				// As fixed-point strings: normalizeSpot strips letters, so a tiny
				// value's '1e-7' would otherwise come out as '1-7'.
				lat: latParsed?.ok ? latParsed.value.toFixed(6) : '',
				lon: lonParsed?.ok ? lonParsed.value.toFixed(6) : ''
			}
		: { lat: draft.lat, lon: draft.lon };

	$: isOther = draft.waterType === DEFAULT_WATER_TYPE;
	$: checked = normalizeSpot({ ...draft, ...coords }, waterTypes);
	// Only complain once there is something to complain about. An untouched form
	// should not be shouting "a spot needs a name" at you.
	$: touched = useDms
		? draft.name.trim() !== '' || latDms.d.trim() !== '' || lonDms.d.trim() !== ''
		: draft.name.trim() !== '' || String(draft.lat) !== '' || String(draft.lon) !== '';
	// A name is checked before coordinates in normalizeSpot, so it goes first
	// here too; after that the DMS message is more specific than "must be a
	// number between -90 and 90".
	$: draftError = !touched
		? ''
		: !draft.name.trim() && !checked.ok
			? checked.error
			: dmsError || (!checked.ok ? checked.error : '');

	// The draft as the map would draw it, so the pin moves while you type.
	$: draftSpot = checked.ok ? { id: DRAFT_ID, ...checked.spot } : null;
	// Editing an existing spot hides its saved dot, or the old and new positions
	// sit on the map at once and you can't tell which is which.
	$: mapSpots = [...spots.filter((s) => s.id !== editingId), ...(draftSpot ? [draftSpot] : [])];

	function startEdit(spot: SwimSpot) {
		editingId = spot.id;
		draft = {
			name: spot.name,
			lat: String(spot.lat),
			lon: String(spot.lon),
			swumOn: spot.swumOn ?? '',
			waterType: spot.waterType,
			otherLabel: '',
			country: spot.country ?? '',
			region: spot.region ?? '',
			note: spot.note ?? ''
		};
		fillDms(draft.lat, draft.lon);
		selectedId = DRAFT_ID;
		msg = '';
		error = '';
	}

	function reset() {
		draft = blank();
		latDms = blankDms(latDms.hemi);
		lonDms = blankDms(lonDms.hemi);
	}

	function cancelEdit() {
		editingId = null;
		reset();
		selectedId = null;
		msg = '';
		error = '';
	}

	async function save() {
		if (dmsError || !checked.ok) {
			error = dmsError || (checked.ok ? '' : checked.error);
			return;
		}
		busy = true;
		msg = '';
		error = '';
		try {
			const payload: Record<string, unknown> = { ...checked.spot };
			if (editingId !== null) payload.id = editingId;
			if (isOther && draft.otherLabel.trim()) payload.otherLabel = draft.otherLabel.trim();
			const r = await fetch(API, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await r.json().catch(() => null);
			if (!r.ok) {
				error = data?.error || `Save failed (${r.status}).`;
				return;
			}
			spots = data.spots ?? [];
			if (data.waterTypes?.length) waterTypes = data.waterTypes;
			msg = editingId === null ? `Added ${checked.spot.name}.` : `Saved ${checked.spot.name}.`;
			editingId = null;
			reset();
			selectedId = null;
		} catch (err) {
			error = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			busy = false;
		}
	}

	async function remove(spot: SwimSpot) {
		if (!confirm(`Delete ${spot.name}? This can't be undone.`)) return;
		busy = true;
		msg = '';
		error = '';
		try {
			const r = await fetch(API, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: spot.id })
			});
			const data = await r.json().catch(() => null);
			if (!r.ok) {
				error = data?.error || `Delete failed (${r.status}).`;
				return;
			}
			spots = data.spots ?? [];
			if (data.waterTypes?.length) waterTypes = data.waterTypes;
			msg = `Deleted ${spot.name}.`;
			if (editingId === spot.id) cancelEdit();
		} catch (err) {
			error = `Delete failed: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>meSoup admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<nav class="breadcrumb">
		<a href={username ? `/meSoup?user=${encodeURIComponent(username)}` : '/meSoup'}>
			← Back to {username ? 'my' : 'the'} map
		</a>
	</nav>

	<main>
		{#if status === 'loading'}
			<p class="note">Checking…</p>
		{:else if status === 'denied'}
			<h1>Sign in first</h1>
			<p class="note">
				Sign in to keep a map of everywhere you've swum, or go back to <a href="/meSoup">the map</a
				>.
			</p>
		{:else}
			<h1>My spots</h1>
			<p class="note">
				{spots.length}
				{spots.length === 1 ? 'spot' : 'spots'} on the map.
				{#if useDms}
					Coordinates are degrees, minutes and seconds with a hemisphere.
				{:else}
					Coordinates are decimal degrees — south and west are negative.
				{/if}
			</p>

			{#if msg}<p class="banner ok">{msg}</p>{/if}
			{#if error}<p class="banner bad">{error}</p>{/if}

			<div class="preview">
				<WorldMap spots={mapSpots} {waterTypes} bind:selectedId />
			</div>

			<form class="form" on:submit|preventDefault={save}>
				<div class="form-head">
					<h2>{editingId === null ? 'Add a spot' : 'Editing'}</h2>
					<label class="check">
						<input type="checkbox" bind:checked={useDms} on:change={toggleDms} />
						<span>Degrees, minutes, seconds</span>
					</label>
				</div>

				<div class="grid">
					<label class="wide">
						<span>Name</span>
						<input bind:value={draft.name} placeholder="Walden Pond" />
					</label>

					{#if useDms}
						<fieldset class="dms">
							<legend>Latitude</legend>
							<input
								bind:value={latDms.d}
								inputmode="decimal"
								placeholder="42"
								aria-label="Latitude degrees"
							/><i>°</i>
							<input
								bind:value={latDms.m}
								inputmode="decimal"
								placeholder="26"
								aria-label="Latitude minutes"
							/><i>′</i>
							<input
								bind:value={latDms.s}
								inputmode="decimal"
								placeholder="20.4"
								aria-label="Latitude seconds"
							/><i>″</i>
							<select bind:value={latDms.hemi} aria-label="Latitude hemisphere">
								<option value="N">N</option>
								<option value="S">S</option>
							</select>
						</fieldset>

						<fieldset class="dms">
							<legend>Longitude</legend>
							<input
								bind:value={lonDms.d}
								inputmode="decimal"
								placeholder="71"
								aria-label="Longitude degrees"
							/><i>°</i>
							<input
								bind:value={lonDms.m}
								inputmode="decimal"
								placeholder="20"
								aria-label="Longitude minutes"
							/><i>′</i>
							<input
								bind:value={lonDms.s}
								inputmode="decimal"
								placeholder="6.0"
								aria-label="Longitude seconds"
							/><i>″</i>
							<select bind:value={lonDms.hemi} aria-label="Longitude hemisphere">
								<option value="E">E</option>
								<option value="W">W</option>
							</select>
						</fieldset>
					{:else}
						<label>
							<span>Latitude</span>
							<input bind:value={draft.lat} inputmode="decimal" placeholder="42.4390" />
						</label>

						<label>
							<span>Longitude</span>
							<input bind:value={draft.lon} inputmode="decimal" placeholder="-71.3350" />
						</label>
					{/if}

					<label>
						<span>Date swum</span>
						<input type="date" bind:value={draft.swumOn} />
					</label>

					<label>
						<span>Water</span>
						<select bind:value={draft.waterType}>
							{#each waterTypes as t (t.id)}
								<option value={t.id}>{t.label}</option>
							{/each}
						</select>
					</label>

					{#if isOther}
						<label>
							<span>What kind? (added to the list)</span>
							<input bind:value={draft.otherLabel} maxlength="40" placeholder="Hot spring" />
						</label>
					{/if}

					<label>
						<span>Country</span>
						<input bind:value={draft.country} placeholder="United States" />
					</label>

					<label>
						<span>Region</span>
						<input bind:value={draft.region} placeholder="Massachusetts" />
					</label>

					<label class="wide">
						<span>Note</span>
						<input bind:value={draft.note} placeholder="Freezing. Worth it." />
					</label>
				</div>

				{#if draftError}<p class="banner bad">{draftError}</p>{/if}

				<div class="actions">
					<button type="submit" class="primary" disabled={busy || !checked.ok}>
						{editingId === null ? 'Add spot' : 'Save changes'}
					</button>
					{#if editingId !== null}
						<button type="button" on:click={cancelEdit} disabled={busy}>Cancel</button>
					{/if}
				</div>
			</form>

			{#if spots.length}
				<table>
					<thead>
						<tr>
							<th></th>
							<th>Name</th>
							<th>Where</th>
							<th>Date</th>
							<th class="num">Lat</th>
							<th class="num">Lon</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each spots as spot (spot.id)}
							<tr class:editing={spot.id === editingId}>
								<td>
									<span
										class="swatch"
										style:background={waterType(spot.waterType, waterTypes).color}
										title={waterType(spot.waterType, waterTypes).label}
									></span>
								</td>
								<td>
									{spot.name}
									{#if spot.note}<div class="sub">{spot.note}</div>{/if}
								</td>
								<td class="sub">
									{[spot.region, spot.country].filter(Boolean).join(', ') || '—'}
								</td>
								<td class="sub">{spot.swumOn ?? '—'}</td>
								<td class="num">
									{useDms ? formatDms(spot.lat, 'Latitude') : spot.lat.toFixed(4)}
								</td>
								<td class="num">
									{useDms ? formatDms(spot.lon, 'Longitude') : spot.lon.toFixed(4)}
								</td>
								<td class="row-actions">
									<button type="button" on:click={() => startEdit(spot)} disabled={busy}>
										Edit
									</button>
									<button
										type="button"
										class="danger"
										on:click={() => remove(spot)}
										disabled={busy}
									>
										Delete
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
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
		margin: 0 0 0.5rem 0;
		color: #1a1a1a;
	}

	h2 {
		font-size: 1.2rem;
		margin: 0 0 1rem 0;
		color: #333;
	}

	.note {
		margin: 0 0 1.25rem 0;
		color: #666;
		font-size: 0.95rem;
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

	.preview {
		margin-bottom: 1.5rem;
	}

	.form {
		margin-bottom: 2rem;
		padding: 1.25rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.85rem;
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

	label span,
	.dms legend {
		font-size: 0.8rem;
		color: #666;
	}

	.form-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.form-head h2 {
		margin: 0;
	}

	label.check {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}

	label.check span {
		font-size: 0.85rem;
		color: #444;
	}

	/* One row per coordinate: 42 ° 26 ′ 20.4 ″ N */
	.dms {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.dms legend {
		padding: 0;
		margin-bottom: 0.3rem;
	}

	.dms input {
		flex: 1 1 0;
		width: 0;
		padding-left: 0.4rem;
		padding-right: 0.4rem;
	}

	.dms i {
		font-style: normal;
		color: #888;
	}

	.dms select {
		flex: none;
		padding-left: 0.3rem;
		padding-right: 0.3rem;
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

	input:focus,
	select:focus {
		outline: none;
		border-color: #0066cc;
	}

	.actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1rem;
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
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th,
	td {
		padding: 0.55rem 0.6rem;
		border-bottom: 1px solid #eee;
		text-align: left;
		vertical-align: top;
	}

	th {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #888;
		font-weight: 600;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.sub {
		color: #777;
		font-size: 0.85em;
	}

	tr.editing {
		background: #f0f7ff;
	}

	.swatch {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
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
