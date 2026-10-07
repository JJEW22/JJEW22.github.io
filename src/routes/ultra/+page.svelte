<!-- src/routes/ultra/+page.svelte -->
<!--
	Live ultra tracking. My phone runs the Overland app, which posts GPS points
	to /ultra/api/ingest; this page polls /ultra/api/track and draws them.

	Only points inside the race window (RACE in $lib/ultra) are ever public.
	Before the start it's a countdown; a site admin can flip on a 24-hour
	preview to check the phone is reporting.

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

	interface Track {
		status: 'unscheduled' | 'upcoming' | 'live' | 'finished' | 'preview';
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
		path: [number, number][];
		latest: { t: string; lat: number; lon: number; battery: number | null } | null;
		distanceMiles: number;
		elapsedMs: number | null;
		paceMsPerMile: number | null;
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
	let trackLine: Polyline | null = null;
	let courseLine: Polyline | null = null;
	let here: CircleMarker | null = null;
	let fitted = false;
	let courseLoaded = false;

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
			courseLine = L.polyline(pts, { color: '#8a94a6', weight: 4, opacity: 0.6, dashArray: '6 8' })
				.addTo(map)
				.bringToBack();
			if (!track.path.length) map.fitBounds(courseLine.getBounds(), { padding: [20, 20] });
		} catch {
			// No course drawn; the live track still works.
		}
	}

	function draw() {
		if (!L || !map || !track) return;
		loadCourse();
		const path = track.path;
		if (!path.length) {
			trackLine?.remove();
			here?.remove();
			trackLine = here = null;
			return;
		}
		if (trackLine) trackLine.setLatLngs(path);
		else trackLine = L.polyline(path, { color: '#e4572e', weight: 4 }).addTo(map);
		const last = path[path.length - 1];
		if (here) here.setLatLng(last);
		else
			here = L.circleMarker(last, {
				radius: 9,
				color: '#fff',
				weight: 3,
				fillColor: '#e4572e',
				fillOpacity: 1
			}).addTo(map);
		if (!fitted) {
			map.fitBounds(trackLine.getBounds(), { padding: [30, 30], maxZoom: 15 });
			fitted = true;
		} else if (follow) {
			map.panTo(last);
		}
	}

	function recenter() {
		follow = true;
		const last = track?.path[track.path.length - 1];
		if (map && last) map.setView(last, Math.max(map.getZoom(), 14));
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

	// Aid-station ETAs from the average pace so far, counted from the last fix.
	function eta(mile: number): string {
		if (!track?.latest || !track.paceMsPerMile) return '—';
		const left = mile - track.distanceMiles;
		if (left <= 0) return 'passed';
		return clock(Date.parse(track.latest.t) + left * track.paceMsPerMile);
	}

	$: status = track?.status ?? null;
	$: startMs = track?.race.start ? Date.parse(track.race.start) : null;
	$: elapsed = status === 'live' && startMs !== null ? now - startMs : (track?.elapsedMs ?? null);
	$: stale =
		(status === 'live' || status === 'preview') &&
		!!track?.latest &&
		now - Date.parse(track.latest.t) > STALE_MS;
	$: toGo =
		track?.race.distanceMiles != null
			? Math.max(0, track.race.distanceMiles - (track?.distanceMiles ?? 0))
			: null;
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
				{#if track?.race.location || track?.race.start}
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
		{:else if status === 'unscheduled'}
			<p class="banner">Race details coming soon. Live tracking will appear here on race day.</p>
		{:else if status === 'upcoming' && startMs !== null}
			<p class="banner">
				Tracking starts in <b>{formatDuration(startMs - now)}</b> ({clock(startMs)}).
			</p>
		{:else if status === 'preview'}
			<p class="banner warn">
				Admin preview: the last 24 hours of points, whatever the race window. Not visible to anyone
				else.
			</p>
		{/if}

		{#if stale && track?.latest}
			<p class="banner warn">
				No update since {ago(track.latest.t)} — probably no signal out on the course. The track fills
				in when the phone reconnects.
			</p>
		{/if}

		{#if status === 'live' || status === 'finished' || status === 'preview'}
			<div class="stats">
				<div>
					<span class="n">{track?.distanceMiles.toFixed(1) ?? '0.0'}</span><span class="l"
						>miles{#if toGo !== null}&nbsp;· {toGo.toFixed(1)} to go{/if}</span
					>
				</div>
				<div>
					<span class="n">{elapsed !== null ? formatDuration(elapsed) : '—'}</span><span class="l"
						>elapsed</span
					>
				</div>
				<div>
					<span class="n">{formatPace(track?.paceMsPerMile ?? null)}</span><span class="l"
						>average pace</span
					>
				</div>
				<div>
					<span class="n">{track?.latest ? ago(track.latest.t) : '—'}</span><span class="l"
						>last update{#if track?.latest?.battery != null}&nbsp;· phone {Math.round(
								track.latest.battery * 100
							)}%{/if}</span
					>
				</div>
			</div>
		{/if}

		<div class="map-wrap">
			<div class="map" bind:this={mapEl}></div>
			{#if track?.path.length && !follow}
				<button type="button" class="recenter" on:click={recenter}>Follow me</button>
			{/if}
		</div>

		{#if track?.race.aidStations.length}
			<h2>Aid stations</h2>
			<table>
				<thead>
					<tr><th>Station</th><th class="num">Mile</th><th class="num">ETA</th></tr>
				</thead>
				<tbody>
					{#each track.race.aidStations as s (s.name + s.mile)}
						<tr class:passed={track.distanceMiles >= s.mile}>
							<td>{s.name}</td>
							<td class="num">{s.mile}</td>
							<td class="num">{eta(s.mile)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="sub">ETAs use my average pace so far, so they drift later as the miles add up.</p>
		{/if}

		{#if track?.isAdmin}
			<p class="admin">
				{#if preview}
					<a href={resolve('/ultra')}>Leave preview</a>
				{:else}
					<a href="{resolve('/ultra')}?preview=1">Preview the last 24 hours</a> (admin only — to check
					the phone is reporting)
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

	tr.passed td {
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
