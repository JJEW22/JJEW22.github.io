<!-- src/routes/ultra/admin/+page.svelte -->
<!--
	Ultra tracker admin: what the public /ultra page shows.

	- Display mode: off, the race window (RACE in $lib/ultra), or live from the
	  moment it's switched on.
	- Devices: every phone that has posted points, by its Overland Device ID.
	  Name it, colour it, and switch it on to show it publicly. New phones start
	  hidden, so handing out the token never puts anyone on the map by itself.

	Prerendered like every page here; /ultra/api/admin enforces ultra:admin.
-->
<script lang="ts">
	import '../../../app.css';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';

	type Mode = 'off' | 'race' | 'live';
	interface Device {
		deviceId: string;
		name: string | null;
		color: string;
		shown: boolean;
		points: number;
		firstAt: string | null;
		lastAt: string | null;
		battery: number | null;
	}
	interface Row extends Device {
		nameDraft: string;
	}
	type RaceId = 'main' | 'test';
	interface RaceOption {
		id: RaceId;
		label: string;
		test: boolean;
	}
	interface Race {
		id: RaceId;
		test: boolean;
		name: string;
		start: string | null;
		end: string | null;
		ended: boolean;
		startSource: 'admin' | 'config' | null;
		cutoffHours: number;
	}
	interface Settings {
		mode: Mode;
		liveSince: string | null;
		showBattery: boolean;
		raceStart: string | null;
		raceEnd: string | null;
	}

	let status: 'loading' | 'denied' | 'ready' = 'loading';
	let error = '';
	let msg = '';
	let busy = false;
	let mode: Mode = 'race';
	let liveSince: string | null = null;
	let race: Race | null = null;
	let races: RaceOption[] = [];
	let showBattery = true;
	// The clock fields, as <input type="datetime-local"> values in the admin's
	// own time zone. Refreshes leave them alone while they're being edited.
	let startDraft = '';
	let endDraft = '';
	let editingClock = false;
	let devices: Row[] = [];
	let now = Date.now();

	onMount(() => {
		load();
		// Refresh "last seen" while the page is open, so a new phone shows up.
		const poll = setInterval(() => {
			if (document.visibilityState === 'visible' && !busy) load(true);
		}, 20_000);
		const tick = setInterval(() => (now = Date.now()), 1000);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
		};
	});

	function apply(data: { settings: Settings; devices: Device[]; race: Race; races: RaceOption[] }) {
		const switched = race !== null && race.id !== data.race.id;
		races = data.races;
		mode = data.settings.mode;
		liveSince = data.settings.liveSince;
		showBattery = data.settings.showBattery;
		race = data.race;
		// A different race has a different clock: drop any half-typed times.
		if (switched) editingClock = false;
		if (!editingClock) {
			startDraft = toLocalInput(data.race.start);
			endDraft = data.race.ended ? toLocalInput(data.race.end) : '';
		}
		// Keep a half-typed name across background refreshes.
		const drafts = new Map(devices.map((d) => [d.deviceId, d.nameDraft]));
		devices = data.devices.map((d) => ({
			...d,
			nameDraft: drafts.get(d.deviceId) ?? d.name ?? ''
		}));
	}

	async function load(quiet = false) {
		const r = await fetch('/ultra/api/admin');
		const data = await r.json().catch(() => null);
		if (!r.ok || !data?.ok) {
			if (!quiet) {
				status = 'denied';
				error = data?.error ?? `Couldn't load (${r.status}).`;
			}
			return;
		}
		apply(data);
		status = 'ready';
	}

	async function post(body: Record<string, unknown>, done: string) {
		busy = true;
		msg = '';
		try {
			const r = await fetch('/ultra/api/admin', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = await r.json().catch(() => null);
			if (!r.ok || !data?.ok) {
				msg = data?.error ?? `Failed (${r.status}).`;
				return;
			}
			apply(data);
			msg = done;
		} finally {
			busy = false;
		}
	}

	function switchRace(r: RaceOption) {
		if (r.id === race?.id) return;
		const note =
			mode === 'off'
				? ''
				: "\n\nThe public page will show this race straight away (the display isn't Off).";
		if (!confirm(`Switch to "${r.label}"?${note}\n\nEach race keeps its own clock.`)) return;
		post({ activeRace: r.id }, `Now showing: ${r.label}.`);
	}

	function setMode(m: Mode) {
		if (m === 'live' && mode === 'live') {
			if (!confirm('Restart live from now? The public track will only show points from now on.'))
				return;
		}
		post(
			{ mode: m },
			m === 'off'
				? 'Tracking hidden.'
				: m === 'race'
					? 'Following the race window.'
					: 'Live from now.'
		);
	}

	// ISO <-> the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in local time.
	function toLocalInput(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function fromLocalInput(v: string): string | null {
		if (!v) return null;
		const d = new Date(v); // parsed as local time
		return Number.isNaN(d.getTime()) ? null : d.toISOString();
	}

	async function clockPost(body: Record<string, unknown>, done: string) {
		await post(body, done);
		editingClock = false;
		startDraft = toLocalInput(race?.start ?? null);
		endDraft = race?.ended ? toLocalInput(race.end) : '';
	}

	function startNow() {
		const again = race?.start && race.startSource === 'admin';
		if (
			!confirm(
				again
					? 'Restart the race clock from now? The current start time is replaced.'
					: 'Start the race now? The public page switches to the race window.'
			)
		)
			return;
		clockPost({ startRace: true }, 'Race started — the clock is running.');
	}

	function endNow() {
		if (!confirm('End the race now? Elapsed time stops at this moment.')) return;
		clockPost({ endRace: true }, 'Race ended.');
	}

	function saveStart() {
		const iso = fromLocalInput(startDraft);
		if (!iso) return;
		clockPost({ raceStart: iso }, 'Start time saved.');
	}

	function saveEnd() {
		const iso = fromLocalInput(endDraft);
		if (!iso) return;
		clockPost({ raceEnd: iso }, 'End time saved.');
	}

	function label(d: Device): string {
		return d.name || d.deviceId || '(no Device ID)';
	}

	function ago(iso: string | null): string {
		if (!iso) return '—';
		const mins = Math.floor((now - Date.parse(iso)) / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		if (mins < 48 * 60) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
		return new Date(iso).toLocaleDateString();
	}

	function clock(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	$: shownCount = devices.filter((d) => d.shown).length;
	$: clockState = !race?.start
		? 'unset'
		: now < Date.parse(race.start)
			? 'upcoming'
			: race.end && now > Date.parse(race.end)
				? 'finished'
				: 'running';

	function hms(ms: number): string {
		const t = Math.max(0, Math.floor(ms / 1000));
		const h = Math.floor(t / 3600);
		const m = Math.floor((t % 3600) / 60);
		return `${h}:${String(m).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
	}
</script>

<svelte:head>
	<title>Ultra tracker admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<nav class="breadcrumb"><a href={resolve('/ultra')}>← Back to the tracker</a></nav>

	<main>
		<h1>Ultra tracker admin</h1>

		{#if status === 'loading'}
			<p class="note">Loading…</p>
		{:else if status === 'denied'}
			<p class="note">
				{error}
				<a href="{resolve('/account')}?redirect=/ultra/admin">Sign in</a> with a site admin or
				<code>ultra:admin</code> account.
			</p>
		{:else}
			<section>
				<h2>Race</h2>
				<div class="races" role="radiogroup" aria-label="Race">
					{#each races as r (r.id)}
						<button
							type="button"
							role="radio"
							aria-checked={race?.id === r.id}
							class:on={race?.id === r.id}
							class:test={r.test}
							disabled={busy}
							on:click={() => switchRace(r)}
						>
							{#if r.test}<span class="test-tag">TEST</span>{/if}
							<b>{r.label}</b>
						</button>
					{/each}
				</div>
				{#if race?.test}
					<p class="banner warn">
						The <b>test race</b> is active: the public page shows its course, with a TEST label. Switch
						back to the real race when you're done. Its clock is kept separately and isn't affected.
					</p>
				{/if}
			</section>

			<section>
				<h2>Public display</h2>
				<div class="modes" role="radiogroup" aria-label="Public display">
					<button
						type="button"
						role="radio"
						aria-checked={mode === 'off'}
						class:on={mode === 'off'}
						disabled={busy}
						on:click={() => setMode('off')}
					>
						<b>Off</b><span>Nothing is shown.</span>
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={mode === 'race'}
						class:on={mode === 'race'}
						disabled={busy}
						on:click={() => setMode('race')}
					>
						<b>Race window</b>
						<span>
							{#if race?.start && race.end}
								{clock(race.start)} → {clock(race.end)}
							{:else}
								No start time set yet
							{/if}
						</span>
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={mode === 'live'}
						class:on={mode === 'live'}
						disabled={busy}
						on:click={() => setMode('live')}
					>
						<b>Live now</b>
						<span>
							{#if mode === 'live' && liveSince}
								Since {clock(liveSince)} · click to restart
							{:else}
								Shows points from the moment you switch it on.
							{/if}
						</span>
					</button>
				</div>
				{#if mode !== 'off' && shownCount === 0}
					<p class="banner warn">
						No phones are switched on below, so the public page is empty. Tick <b>Show</b> for whoever
						should appear.
					</p>
				{/if}
			</section>

			<section>
				<h2>
					Race clock{#if race}<span class="clock-for">&nbsp;· {race.name}</span>{/if}
				</h2>
				<p class="clock-state {clockState}">
					{#if clockState === 'unset'}
						Not started — no start time set.
					{:else if clockState === 'upcoming' && race?.start}
						Starts {clock(race.start)} (in {hms(Date.parse(race.start) - now)}){race.startSource ===
						'config'
							? ' — from the race config in the code'
							: ''}.
					{:else if clockState === 'running' && race?.start}
						<b>Running · {hms(now - Date.parse(race.start))}</b> since {clock(race.start)}.
						{#if race.end && !race.ended}Window closes {clock(race.end)} (start + {race.cutoffHours}h).{/if}
					{:else if race?.start && race.end}
						<b>Finished · {hms(Date.parse(race.end) - Date.parse(race.start))}</b> ({clock(
							race.start
						)}
						→ {clock(race.end)}).
					{/if}
				</p>
				<div class="clock-actions">
					<button type="button" class="go" disabled={busy} on:click={startNow}
						>{race?.start && race.startSource === 'admin'
							? 'Restart from now'
							: 'Start the race now'}</button
					>
					<button
						type="button"
						class="stop"
						disabled={busy || clockState !== 'running'}
						on:click={endNow}>End the race now</button
					>
				</div>
				<div class="clock-fields">
					<label>
						<span>Start</span>
						<input
							type="datetime-local"
							bind:value={startDraft}
							on:input={() => (editingClock = true)}
							disabled={busy}
						/>
						<button
							type="button"
							class="mini"
							disabled={busy || !startDraft || startDraft === toLocalInput(race?.start ?? null)}
							on:click={saveStart}>Save</button
						>
						{#if race?.startSource === 'admin'}
							<button
								type="button"
								class="mini"
								disabled={busy}
								on:click={() =>
									clockPost({ raceStart: null, raceEnd: null }, 'Race clock cleared.')}
								>Clear</button
							>
						{/if}
					</label>
					<label>
						<span>End</span>
						<input
							type="datetime-local"
							bind:value={endDraft}
							on:input={() => (editingClock = true)}
							disabled={busy || !race?.start}
						/>
						<button
							type="button"
							class="mini"
							disabled={busy || !endDraft || (race?.ended && endDraft === toLocalInput(race.end))}
							on:click={saveEnd}>Save</button
						>
						{#if race?.ended}
							<button
								type="button"
								class="mini"
								disabled={busy}
								on:click={() =>
									clockPost({ raceEnd: null }, 'End cleared — the race is running again.')}
								>Clear</button
							>
						{/if}
					</label>
				</div>
				<p class="sub">
					Times are in your time zone. Starting the race also switches the public display to
					<b>Race window</b>. With no end set, the window closes {race?.cutoffHours ?? 30} hours after
					the start.
				</p>
			</section>

			<section>
				<h2>Shown to followers</h2>
				<label class="toggle">
					<input
						type="checkbox"
						checked={showBattery}
						disabled={busy}
						on:change={(e) =>
							post(
								{ showBattery: e.currentTarget.checked },
								e.currentTarget.checked ? 'Battery % shown.' : 'Battery % hidden.'
							)}
					/>
					<span>Phone battery % on the public page</span>
				</label>
				<p class="sub">
					When off, the battery isn't sent to the public page at all. You still see it here and in
					the preview.
				</p>
			</section>

			<section>
				<h2>Phones</h2>
				<p class="sub">
					Every phone that has sent points, by its Overland <b>Device ID</b>. New phones start
					hidden. To add someone, give them the endpoint and token and ask them to set a Device ID
					of their own.
				</p>
				{#if !devices.length}
					<p class="note">No phone has sent anything yet.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>Show</th>
								<th>Colour</th>
								<th>Name on the page</th>
								<th>Device ID</th>
								<th class="num">Points</th>
								<th>Last point</th>
								<th class="num">Battery</th>
							</tr>
						</thead>
						<tbody>
							{#each devices as d (d.deviceId)}
								<tr class:hidden-row={!d.shown}>
									<td>
										<input
											type="checkbox"
											checked={d.shown}
											disabled={busy}
											aria-label="Show {label(d)}"
											on:change={(e) =>
												post(
													{ deviceId: d.deviceId, shown: e.currentTarget.checked },
													`${label(d)} ${e.currentTarget.checked ? 'shown' : 'hidden'}.`
												)}
										/>
									</td>
									<td>
										<input
											type="color"
											value={d.color}
											disabled={busy}
											aria-label="Colour for {label(d)}"
											on:change={(e) =>
												post(
													{ deviceId: d.deviceId, color: e.currentTarget.value },
													'Colour saved.'
												)}
										/>
									</td>
									<td class="name">
										<input
											bind:value={d.nameDraft}
											placeholder={d.deviceId || 'Unnamed phone'}
											maxlength="40"
										/>
										<button
											type="button"
											class="mini"
											disabled={busy || d.nameDraft.trim() === (d.name ?? '')}
											on:click={() =>
												post({ deviceId: d.deviceId, name: d.nameDraft }, 'Name saved.')}
											>Save</button
										>
									</td>
									<td><code>{d.deviceId || '(none)'}</code></td>
									<td class="num">{d.points.toLocaleString()}</td>
									<td>{ago(d.lastAt)}</td>
									<td class="num">{d.battery != null ? `${Math.round(d.battery * 100)}%` : '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>

			{#if msg}<p class="msg">{msg}</p>{/if}

			<p class="links">
				<a href={resolve('/ultra')}>Open the public page</a> ·
				<a href="{resolve('/ultra')}?preview=1">Preview the last 24 hours</a>
			</p>
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

	main {
		background: white;
		border-radius: 12px;
		padding: 2.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	h1 {
		font-size: 2rem;
		margin: 0 0 1rem 0;
		color: #1a1a1a;
	}

	h2 {
		font-size: 1.15rem;
		margin: 1.75rem 0 0.6rem 0;
		color: #333;
	}

	.note {
		color: #555;
	}

	.sub {
		font-size: 0.85rem;
		color: #777;
		margin: 0 0 0.75rem 0;
	}

	code {
		padding: 0.1rem 0.35rem;
		background: #f3f4f6;
		border-radius: 4px;
		font-size: 0.85em;
	}

	.modes {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.modes button {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.85rem 1rem;
		background: #fff;
		border: 2px solid #e3e7ec;
		border-radius: 10px;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.modes button span {
		font-size: 0.8rem;
		color: #777;
	}

	.modes button.on {
		border-color: #e4572e;
		background: #fff5f2;
	}

	.modes button:disabled {
		cursor: default;
		opacity: 0.7;
	}

	.clock-for {
		font-weight: 400;
		color: #888;
		font-size: 0.95rem;
	}

	.races {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.races button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.7rem 1rem;
		background: #fff;
		border: 2px solid #e3e7ec;
		border-radius: 10px;
		font: inherit;
		cursor: pointer;
	}

	.races button.on {
		border-color: #e4572e;
		background: #fff5f2;
	}

	.races button.test.on {
		border-color: #b9770e;
		background: #fff8e8;
	}

	.races button:disabled {
		opacity: 0.7;
		cursor: default;
	}

	.test-tag {
		padding: 0.05rem 0.4rem;
		background: #b9770e;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #fff;
	}

	.clock-state {
		margin: 0 0 0.75rem 0;
		padding: 0.65rem 0.9rem;
		border-radius: 8px;
		background: #f3f4f6;
		color: #444;
	}

	.clock-state.running {
		background: #fdeeee;
		color: #8c2a1c;
	}

	.clock-state.finished {
		background: #eaf7ee;
		color: #1e6b36;
	}

	.clock-state.upcoming {
		background: #eef4fb;
		color: #1d4f7a;
	}

	.clock-actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.9rem;
	}

	.clock-actions button {
		padding: 0.55rem 1.1rem;
		border: 0;
		border-radius: 8px;
		font: inherit;
		font-weight: 600;
		color: #fff;
		cursor: pointer;
	}

	.clock-actions .go {
		background: #27ae60;
	}

	.clock-actions .stop {
		background: #c0392b;
	}

	.clock-actions button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.clock-fields {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.clock-fields label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.clock-fields label span {
		width: 3rem;
		font-size: 0.9rem;
		color: #555;
	}

	.clock-fields input {
		padding: 0.35rem 0.5rem;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.banner.warn {
		margin: 0.9rem 0 0 0;
		padding: 0.7rem 0.9rem;
		background: #fff6e5;
		border-radius: 8px;
		color: #7a5200;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th,
	td {
		padding: 0.45rem 0.5rem;
		border-bottom: 1px solid #eee;
		text-align: left;
		vertical-align: middle;
	}

	th {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #888;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	tr.hidden-row td {
		color: #9aa5b1;
	}

	td.name {
		display: flex;
		gap: 0.4rem;
	}

	td.name input {
		flex: 1;
		min-width: 7rem;
		padding: 0.3rem 0.45rem;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
	}

	input[type='color'] {
		width: 2.2rem;
		height: 1.8rem;
		padding: 0;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		background: none;
		cursor: pointer;
	}

	.mini {
		padding: 0.3rem 0.7rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.mini:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.msg {
		margin: 1rem 0 0 0;
		padding: 0.55rem 0.8rem;
		background: #eaf7ee;
		border-radius: 8px;
		font-size: 0.9rem;
		color: #1e6b36;
	}

	.links {
		margin-top: 1.5rem;
		font-size: 0.9rem;
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		main {
			padding: 1.25rem;
		}

		.modes {
			grid-template-columns: 1fr;
		}

		table {
			display: block;
			overflow-x: auto;
		}
	}
</style>
