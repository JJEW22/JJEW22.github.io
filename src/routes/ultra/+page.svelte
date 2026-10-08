<!-- src/routes/ultra/+page.svelte -->
<!--
	Live ultra tracking. Phones run the Overland app, which posts GPS points to
	/ultra/api/ingest; this page polls /ultra/api/track and draws them.

	Whose points appear, and when, is set in /ultra/admin: each phone is
	switched on or off there (new ones start hidden), and the display mode is
	off, the race window (RACE in $lib/ultra), or live from when it was
	switched on. An admin can flip on a 24-hour preview to check a phone.

	The map is Leaflet over OpenStreetMap tiles, unlike meSoup's tile-free world
	map: following a runner needs streets and trails. Leaflet touches `window`,
	so it's imported in onMount, never during prerender.
-->
<script lang="ts">
	import '../../app.css';
	import 'leaflet/dist/leaflet.css';
	import { onDestroy, onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { formatDuration, formatPace } from '$lib/ultra';
	import type { Map as LeafletMap, Polyline, CircleMarker } from 'leaflet';

	interface Runner {
		id: string;
		name: string;
		color: string;
		path: [number, number][];
		latest: { t: string; lat: number; lon: number; battery: number | null } | null;
		distanceMiles: number;
		elapsedMs: number | null;
		paceMsPerMile: number | null;
	}
	interface Track {
		status: 'unscheduled' | 'upcoming' | 'live' | 'finished' | 'preview' | 'off';
		mode: 'off' | 'race' | 'live';
		liveSince: string | null;
		isAdmin: boolean;
		race: {
			name: string;
			start: string | null;
			end: string | null;
			distanceMiles: number | null;
			location: string;
			note: string;
			courseGpx: string | null;
			aidStations: { name: string; mile: number }[];
		};
		runners: Runner[];
		serverTime: string;
	}

	const POLL_MS = 30_000;
	// No fix for this long while live and followers are told the phone has gone quiet.
	const STALE_MS = 10 * 60_000;

	let track: Track | null = null;
	let loadFailed = false;
	let preview = false;
	let now = Date.now();
	let follow = true;

	let mapEl: HTMLDivElement;
	let map: LeafletMap | null = null;
	let L: typeof import('leaflet') | null = null;
	let courseLine: Polyline | null = null;
	let courseLoaded = false;
	// One line + marker per runner, kept across polls so the map doesn't flicker.
	// Leaflet objects, not page state: nothing in the markup reads this.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const layers = new Map<string, { line: Polyline; marker: CircleMarker }>();
	let fitted = false;

	let pollTimer: ReturnType<typeof setInterval>;
	let clockTimer: ReturnType<typeof setInterval>;

	onMount(() => {
		preview = new URLSearchParams(location.search).get('preview') === '1';
		initMap();
		load();
		pollTimer = setInterval(() => {
			if (document.visibilityState === 'visible') load();
		}, POLL_MS);
		clockTimer = setInterval(() => (now = Date.now()), 1000);
		document.addEventListener('visibilitychange', onVisible);
	});

	onDestroy(() => {
		clearInterval(pollTimer);
		clearInterval(clockTimer);
		if (typeof document !== 'undefined')
			document.removeEventListener('visibilitychange', onVisible);
		map?.remove();
	});

	function onVisible() {
		if (document.visibilityState === 'visible') load();
	}

	async function initMap() {
		L = await import('leaflet');
		map = L.map(mapEl, { zoomControl: true }).setView([42.36, -71.06], 11);
		const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		});
		const trails = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
			maxZoom: 17,
			attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)'
		});
		streets.addTo(map);
		L.control.layers({ Streets: streets, 'Trails / topo': trails }).addTo(map);
		// Dragging the map means "let me look around": stop re-centring on each poll.
		map.on('dragstart', () => (follow = false));
		draw();
	}

	async function load() {
		try {
			const r = await fetch(`/ultra/api/track${preview ? '?preview=1' : ''}`);
			if (!r.ok) throw new Error(String(r.status));
			track = await r.json();
			loadFailed = false;
			draw();
		} catch {
			loadFailed = true;
		}
	}

	async function loadCourse() {
		if (!L || !map || courseLoaded || !track?.race.courseGpx) return;
		courseLoaded = true;
		try {
			const text = await fetch(track.race.courseGpx).then((r) => (r.ok ? r.text() : ''));
			const doc = new DOMParser().parseFromString(text, 'application/xml');
			const pts: [number, number][] = [...doc.querySelectorAll('trkpt, rtept')]
				.map((p) => [Number(p.getAttribute('lat')), Number(p.getAttribute('lon'))])
				.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)) as [number, number][];
			if (!pts.length) return;
			// Dark enough to read at a whole-course zoom, dashed so the live track
			// (solid, in the runner's colour) still stands out on top of it.
			courseLine = L.polyline(pts, { color: '#3d4a5c', weight: 4, opacity: 0.75, dashArray: '8 6' })
				.addTo(map)
				.bringToBack();
			const end = (at: [number, number], label: string, fill: string) =>
				L!
					.circleMarker(at, {
						radius: 6,
						color: '#fff',
						weight: 2,
						fillColor: fill,
						fillOpacity: 1
					})
					.bindTooltip(label, { direction: 'top', offset: [0, -6] })
					.addTo(map!);
			end(pts[0], 'Start', '#27ae60');
			end(pts[pts.length - 1], 'Finish', '#1a1a1a');
			if (!fitted) map.fitBounds(courseLine.getBounds(), { padding: [20, 20] });
		} catch {
			// No course drawn; the live tracks still work.
		}
	}

	function draw() {
		if (!L || !map || !track) return;
		loadCourse();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local scratch set
		const live = new Set<string>();
		for (const r of track.runners) {
			if (!r.path.length) continue;
			live.add(r.id);
			const last = r.path[r.path.length - 1];
			const existing = layers.get(r.id);
			if (existing) {
				existing.line.setLatLngs(r.path).setStyle({ color: r.color });
				existing.marker.setLatLng(last).setStyle({ fillColor: r.color });
				existing.marker.setTooltipContent(r.name);
			} else {
				const line = L.polyline(r.path, { color: r.color, weight: 4 }).addTo(map);
				const marker = L.circleMarker(last, {
					radius: 9,
					color: '#fff',
					weight: 3,
					fillColor: r.color,
					fillOpacity: 1
				})
					.bindTooltip(r.name, { direction: 'top', offset: [0, -8] })
					.addTo(map);
				layers.set(r.id, { line, marker });
			}
		}
		// Runners switched off in the admin come off the map.
		for (const [id, l] of layers) {
			if (!live.has(id)) {
				l.line.remove();
				l.marker.remove();
				layers.delete(id);
			}
		}
		// Name labels stay up when there's more than one dot to tell apart.
		for (const l of layers.values()) {
			if (layers.size > 1) l.marker.openTooltip();
			else l.marker.closeTooltip();
		}
		if (!layers.size) return;
		const lines = [...layers.values()].map((l) => l.line);
		const bounds = lines.reduce((b, l) => b.extend(l.getBounds()), lines[0].getBounds());
		if (!fitted) {
			map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
			fitted = true;
		} else if (follow) {
			if (layers.size === 1) map.panTo([...layers.values()][0].marker.getLatLng());
			else map.fitBounds(markerBounds(), { padding: [40, 40], maxZoom: 15 });
		}
	}

	// Where everyone is right now, for following several runners at once.
	function markerBounds() {
		const pts = [...layers.values()].map((l) => l.marker.getLatLng());
		return L!.latLngBounds(pts);
	}

	function recenter() {
		follow = true;
		if (!map || !layers.size) return;
		if (layers.size === 1) {
			const m = [...layers.values()][0].marker;
			map.setView(m.getLatLng(), Math.max(map.getZoom(), 14));
		} else {
			map.fitBounds(markerBounds(), { padding: [40, 40], maxZoom: 15 });
		}
	}

	function ago(iso: string): string {
		const mins = Math.floor((now - Date.parse(iso)) / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
	}

	function clock(iso: string | number): string {
		return new Date(iso).toLocaleString(undefined, {
			weekday: 'short',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// Aid-station ETAs from a runner's average pace so far, counted from their last fix.
	function eta(r: Runner, mile: number): string {
		if (!r.latest || !r.paceMsPerMile) return '—';
		const left = mile - r.distanceMiles;
		if (left <= 0) return 'passed';
		return clock(Date.parse(r.latest.t) + left * r.paceMsPerMile);
	}

	// Elapsed ticks every second while live, from the race start or from when
	// live was switched on.
	function elapsed(r: Runner): number | null {
		if (status === 'live' && clockStartMs !== null) return now - clockStartMs;
		return r.elapsedMs;
	}

	function isStale(r: Runner): boolean {
		return (
			(status === 'live' || status === 'preview') &&
			!!r.latest &&
			now - Date.parse(r.latest.t) > STALE_MS
		);
	}

	$: status = track?.status ?? null;
	$: startMs = track?.race.start ? Date.parse(track.race.start) : null;
	$: clockStartMs =
		track?.mode === 'live' && track.liveSince ? Date.parse(track.liveSince) : startMs;
	$: runners = track?.runners ?? [];
	$: anyTrack = runners.some((r) => r.path.length);
	$: stale = runners.filter(isStale);
	$: showStats = status === 'live' || status === 'finished' || status === 'preview';
</script>

<svelte:head>
	<title>{track?.race.name ?? 'Ultra'} — live tracking</title>
	<meta name="description" content="Follow my ultra marathon live." />
</svelte:head>

<div class="container">
	<nav class="breadcrumb"><a href={resolve('/me')}>← Back to Me</a></nav>

	<main>
		<header class="head">
			<div>
				<h1>{track?.race.name ?? 'Ultra marathon'}</h1>
				{#if track?.mode === 'race' && (track.race.location || track.race.start)}
					<p class="sub">
						{track.race.location}{#if track.race.location && track.race.start}
							·
						{/if}{#if track.race.start}starts {clock(track.race.start)}{/if}
						{#if track.race.distanceMiles}· {track.race.distanceMiles} mi{/if}
					</p>
				{/if}
				{#if track?.race.note}<p class="note">{track.race.note}</p>{/if}
			</div>
			{#if status === 'live'}
				<span class="badge live">● LIVE</span>
			{:else if status === 'finished'}
				<span class="badge done">Finished</span>
			{:else if status === 'preview'}
				<span class="badge preview">Preview</span>
			{/if}
		</header>

		{#if loadFailed && !track}
			<p class="banner warn">Couldn't reach the tracker. It will keep retrying.</p>
		{:else if status === 'off'}
			<p class="banner">Live tracking is switched off right now. Check back on race day.</p>
		{:else if status === 'unscheduled'}
			<p class="banner">Race details coming soon. Live tracking will appear here on race day.</p>
		{:else if status === 'upcoming' && startMs !== null}
			<p class="banner">
				Tracking starts in <b>{formatDuration(startMs - now)}</b> ({clock(startMs)}).
			</p>
		{:else if status === 'preview'}
			<p class="banner warn">
				Admin preview: the last 24 hours of points, whatever the display mode. Not visible to anyone
				else.
			</p>
		{:else if status === 'live' && track?.mode === 'live' && !anyTrack}
			<p class="banner">Live — waiting for the first location update.</p>
		{/if}

		{#each stale as r (r.id)}
			{#if r.latest}
				<p class="banner warn">
					No update from {runners.length > 1 ? r.name : 'my phone'} since {ago(r.latest.t)} — probably
					no signal. The track fills in when the phone reconnects.
				</p>
			{/if}
		{/each}

		{#if showStats}
			{#each runners as r (r.id)}
				{#if runners.length > 1}
					<h3 class="runner"><span class="dot" style="background:{r.color}"></span>{r.name}</h3>
				{/if}
				<div class="stats">
					<div>
						<span class="n">{r.distanceMiles.toFixed(1)}</span><span class="l"
							>miles{#if track?.mode === 'race' && track.race.distanceMiles != null}&nbsp;· {Math.max(
									0,
									track.race.distanceMiles - r.distanceMiles
								).toFixed(1)} to go{/if}</span
						>
					</div>
					<div>
						<span class="n">{elapsed(r) !== null ? formatDuration(elapsed(r) ?? 0) : '—'}</span
						><span class="l">elapsed</span>
					</div>
					<div>
						<span class="n">{formatPace(r.paceMsPerMile)}</span><span class="l">average pace</span>
					</div>
					<div>
						<span class="n">{r.latest ? ago(r.latest.t) : '—'}</span><span class="l"
							>last update{#if r.latest?.battery != null}&nbsp;· phone {Math.round(
									r.latest.battery * 100
								)}%{/if}</span
						>
					</div>
				</div>
			{/each}
		{/if}

		<div class="map-wrap">
			<div class="map" bind:this={mapEl}></div>
			{#if anyTrack && !follow}
				<button type="button" class="recenter" on:click={recenter}>
					{runners.length > 1 ? 'Follow everyone' : 'Follow me'}
				</button>
			{/if}
		</div>

		{#if track?.mode === 'race' && track.race.aidStations.length && runners.length}
			<h2>Aid stations</h2>
			<table>
				<thead>
					<tr>
						<th>Station</th>
						<th class="num">Mile</th>
						{#each runners as r (r.id)}
							<th class="num">{runners.length > 1 ? r.name : 'ETA'}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each track.race.aidStations as s (s.name + s.mile)}
						<tr>
							<td>{s.name}</td>
							<td class="num">{s.mile}</td>
							{#each runners as r (r.id)}
								<td class="num" class:passed={r.distanceMiles >= s.mile}>{eta(r, s.mile)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="sub">ETAs use average pace so far, so they drift later as the miles add up.</p>
		{/if}

		{#if track?.isAdmin}
			<p class="admin">
				<a href={resolve('/ultra/admin')}>Tracker admin</a> ·
				{#if preview}
					<a href={resolve('/ultra')}>Leave preview</a>
				{:else}
					<a href="{resolve('/ultra')}?preview=1">Preview the last 24 hours</a>
				{/if}
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

	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	h1 {
		font-size: 2rem;
		margin: 0 0 0.3rem 0;
		color: #1a1a1a;
	}

	h2 {
		font-size: 1.15rem;
		margin: 1.75rem 0 0.4rem 0;
		color: #333;
	}

	h3.runner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1.1rem 0 -0.5rem 0;
		font-size: 1rem;
		color: #333;
	}

	.dot {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		display: inline-block;
	}

	.sub {
		font-size: 0.85rem;
		color: #777;
		margin: 0.3rem 0;
	}

	.note {
		color: #555;
		margin: 0.5rem 0 0 0;
	}

	.badge {
		flex: none;
		padding: 0.3rem 0.75rem;
		border-radius: 20px;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.badge.live {
		background: #fdeeee;
		color: #c0392b;
	}

	.badge.done {
		background: #eaf7ee;
		color: #1e6b36;
	}

	.badge.preview {
		background: #fff6e5;
		color: #7a5200;
	}

	.banner {
		margin: 1rem 0;
		padding: 0.7rem 0.9rem;
		background: #eef4fb;
		border-radius: 8px;
		color: #1d4f7a;
	}

	.banner.warn {
		background: #fff6e5;
		color: #7a5200;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin: 1.25rem 0;
	}

	.stats div {
		display: flex;
		flex-direction: column;
		padding: 0.75rem 0.9rem;
		background: #f7f9fb;
		border-radius: 8px;
	}

	.stats .n {
		font-size: 1.4rem;
		font-weight: 600;
		color: #1a1a1a;
		font-variant-numeric: tabular-nums;
	}

	.stats .l {
		font-size: 0.8rem;
		color: #777;
	}

	.map-wrap {
		position: relative;
		margin-top: 1rem;
	}

	.map {
		height: 520px;
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid #e3e7ec;
	}

	.recenter {
		position: absolute;
		right: 12px;
		bottom: 24px;
		z-index: 1000;
		padding: 0.45rem 0.9rem;
		background: #e4572e;
		border: 0;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		color: #fff;
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
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

	td.passed {
		color: #9aa5b1;
	}

	.admin {
		margin-top: 1.5rem;
		font-size: 0.85rem;
		color: #777;
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		main {
			padding: 1.25rem;
		}

		.stats {
			grid-template-columns: repeat(2, 1fr);
		}

		.map {
			height: 420px;
		}
	}
</style>
