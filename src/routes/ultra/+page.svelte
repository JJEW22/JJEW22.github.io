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
	import {
		ON_COURSE_M,
		METERS_PER_MILE,
		buildGpx,
		courseProgress,
		directionsUrl,
		formatDuration,
		formatPace,
		indexCourse,
		parseGpx,
		placeStations,
		projectOnCourse,
		type AidStation,
		type CourseIndex
	} from '$lib/ultra';
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
		startedAt: string | null;
	}
	// A stop on the course: a GPX waypoint (or a configured aid station), with
	// its course mile so arrival times can be estimated.
	interface Stop {
		name: string;
		lat: number;
		lon: number;
		mile: number;
	}
	interface Track {
		status: 'unscheduled' | 'upcoming' | 'live' | 'finished' | 'preview' | 'off';
		mode: 'off' | 'race' | 'live';
		liveSince: string | null;
		showBattery: boolean;
		isAdmin: boolean;
		race: {
			name: string;
			start: string | null;
			end: string | null;
			distanceMiles: number | null;
			location: string;
			note: string;
			courseGpx: string | null;
			aidStations: AidStation[];
			googleMapsUrl: string | null;
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
	// The course, once its GPX has loaded, and its stops in course order.
	let ci: CourseIndex | null = null;
	let stops: Stop[] = [];
	let downloadHref = '';
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
		if (downloadHref) URL.revokeObjectURL(downloadHref);
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
			const parsed = parseGpx(text);
			const pts = parsed.track;
			if (!pts.length) return;
			const index = indexCourse(pts);
			// The GPX's own waypoints are the stops, each snapped to the route for
			// its mile. Any aid stations configured in RACE join them, unless one is
			// already there as a waypoint.
			const fromGpx: Stop[] = parsed.waypoints.map((w) => ({
				...w,
				mile: projectOnCourse(index, w.lat, w.lon).mile
			}));
			const fromConfig = placeStations(track.race.aidStations, pts).filter(
				(c) => !fromGpx.some((w) => Math.abs(c.lat - w.lat) + Math.abs(c.lon - w.lon) < 0.0005)
			);
			stops = [...fromGpx, ...fromConfig].sort((a, b) => a.mile - b.mile);
			ci = index;
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
			// A waypoint at either end of the course is the start or finish itself:
			// it names the end marker instead of getting a pin of its own.
			const startStop = stops.find((st) => isStartStop(st));
			const finishStop = stops.find((st) => isFinishStop(st, index));
			end(pts[0], startStop?.name ?? 'Start', '#27ae60');
			end(pts[pts.length - 1], finishStop?.name ?? 'Finish', '#1a1a1a');
			for (const st of stops) {
				if (st === startStop || st === finishStop) continue;
				L.marker([st.lat, st.lon], { icon: stopIcon('aid'), keyboard: false })
					.bindTooltip(`${st.name} · mile ${st.mile.toFixed(1)}`, {
						direction: 'top',
						offset: [0, -10]
					})
					.addTo(map);
			}
			// The download: the course with every stop as a waypoint, ready to
			// import into Google My Maps, Gaia, Strava...
			const blob = new Blob(
				[
					buildGpx(
						track.race.name,
						pts,
						stops.map((st) => ({ ...st, mile: Math.round(st.mile * 10) / 10 }))
					)
				],
				{ type: 'application/gpx+xml' }
			);
			downloadHref = URL.createObjectURL(blob);
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

	// Stops at the very ends of the course: the start, and the finish.
	function isStartStop(st: Stop): boolean {
		return st.mile < 0.1;
	}

	function isFinishStop(st: Stop, index: CourseIndex): boolean {
		return st.mile > index.total - 0.25;
	}

	// A small square pin for a stop on the course; aid stations get a cross.
	function stopIcon(kind: 'aid' | 'wpt') {
		return L!.divIcon({
			className: 'stop-icon',
			html: `<span class="stop ${kind}">${kind === 'aid' ? '+' : ''}</span>`,
			iconSize: [18, 18],
			iconAnchor: [9, 9]
		});
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

	// Average pace along the course so far: time from the clock start to the
	// last fix, over course miles covered. Measured to the last fix rather than
	// to now, so a stretch with no signal doesn't make it look like a crawl.
	function coursePace(r: Runner): number | null {
		const p = progressById[r.id];
		if (!p?.onCourse || p.mile < 0.1 || !r.latest || !r.startedAt) return null;
		return (Date.parse(r.latest.t) - Date.parse(r.startedAt)) / p.mile;
	}

	// When a runner should reach a course mile at their average pace so far.
	function etaMs(r: Runner, mile: number): number | null {
		const p = progressById[r.id];
		const pace = coursePace(r);
		if (!p || pace === null || !r.latest) return null;
		return Date.parse(r.latest.t) + Math.max(0, mile - p.mile) * pace;
	}

	function eta(r: Runner, mile: number): string {
		const p = progressById[r.id];
		if (p?.onCourse && p.mile >= mile) return 'passed';
		const at = etaMs(r, mile);
		return at === null ? '—' : clock(at);
	}

	function passed(r: Runner, mile: number): boolean {
		const p = progressById[r.id];
		return !!p?.onCourse && p.mile >= mile;
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
	// Where each runner is along the course (null without a course or a track).
	$: progressById = Object.fromEntries(
		runners.map((r) => [r.id, ci && r.path.length ? courseProgress(ci, r.path) : null])
	) as Record<string, ReturnType<typeof courseProgress> | null>;
	$: showEtas = runners.some((r) => coursePace(r) !== null);
	$: courseTotal = ci?.total ?? track?.race.distanceMiles ?? null;
	// Progress-bar ticks: the stops between the ends.
	$: barStops = ci ? stops.filter((st) => !isStartStop(st) && !isFinishStop(st, ci!)) : [];
	// The stops table: every waypoint, plus a Finish row if the GPX has none.
	$: tableStops =
		ci && !stops.some((st) => isFinishStop(st, ci!))
			? [
					...stops,
					{
						name: 'Finish',
						lat: ci.track[ci.track.length - 1][0],
						lon: ci.track[ci.track.length - 1][1],
						mile: ci.total
					}
				]
			: stops;
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
						{#if courseTotal}· {courseTotal.toFixed(1)} mi{/if}
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
				{@const p = progressById[r.id]}
				{@const onCourse = !!ci && !!p?.onCourse}
				<div class="stats">
					<div>
						{#if onCourse && ci && p}
							<span class="n">{p.mile.toFixed(1)} mi</span><span class="l"
								>of {ci.total.toFixed(1)} · {Math.max(0, ci.total - p.mile).toFixed(1)} to go</span
							>
						{:else}
							<span class="n">{r.distanceMiles.toFixed(1)}</span><span class="l">miles</span>
						{/if}
					</div>
					<div>
						<span class="n">{elapsed(r) !== null ? formatDuration(elapsed(r) ?? 0) : '—'}</span
						><span class="l">elapsed</span>
					</div>
					<div>
						<span class="n">{formatPace(onCourse ? coursePace(r) : r.paceMsPerMile)}</span><span
							class="l">average pace</span
						>
					</div>
					<div>
						<span class="n">{r.latest ? ago(r.latest.t) : '—'}</span><span class="l"
							>last update{#if r.latest?.battery != null}&nbsp;· phone {Math.round(
									r.latest.battery * 100
								)}%{/if}</span
						>
					</div>
				</div>
				{#if onCourse && ci && p}
					{@const pct = Math.min(100, (100 * p.mile) / ci.total)}
					{@const finish = etaMs(r, ci.total)}
					<div class="progress">
						<div
							class="bar"
							role="progressbar"
							aria-valuenow={Math.round(pct)}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label="Course progress"
						>
							<div class="fill" style="width:{pct}%; background:{r.color}"></div>
							{#each barStops as st (st.name + st.mile)}
								<span
									class="tick"
									class:done={p.mile >= st.mile}
									style="left:{(100 * st.mile) / ci.total}%"
									title="{st.name} · mile {st.mile.toFixed(1)}"
								></span>
							{/each}
						</div>
						<div class="progress-labels">
							<span><b>{pct.toFixed(1)}%</b> of the course</span>
							{#if finish !== null && p.mile < ci.total}
								<span>Projected finish <b>{clock(finish)}</b></span>
							{/if}
						</div>
						{#if p.offMeters > ON_COURSE_M}
							<p class="sub">
								Off the route right now ({(p.offMeters / METERS_PER_MILE).toFixed(1)} mi away) — progress
								holds at the last point on the course.
							</p>
						{/if}
					</div>
				{:else if ci && r.latest && p && !p.onCourse}
					<p class="sub">
						Not on the course yet — {(p.offMeters / METERS_PER_MILE).toFixed(1)} mi from the route.
					</p>
				{/if}
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

		{#if ci}
			<div class="course-links">
				{#if track?.race.googleMapsUrl}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
					<a class="btn primary" href={track.race.googleMapsUrl} target="_blank" rel="noopener"
						>Open the course in Google Maps</a
					>
				{/if}
				{#if downloadHref}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a blob: download, not a route -->
					<a class="btn" href={downloadHref} download="{track?.race.name ?? 'course'}.gpx"
						>Download course (GPX)</a
					>
				{/if}
				<span class="sub"
					>{track?.race.googleMapsUrl
						? 'Google Maps shows the course and your own location; it doesn’t share it with anyone.'
						: 'The GPX includes the aid stations; it opens in Google My Maps, Gaia, Strava and most running apps.'}</span
				>
			</div>
		{/if}

		{#if ci && (stops.length || showEtas)}
			{@const solo = runners.length <= 1 ? runners[0] : null}
			<h2>Aid stations</h2>
			<table>
				<thead>
					<tr>
						<th>Stop</th>
						<th class="num">Mile</th>
						{#if showEtas}
							{#if solo}
								<th class="num">To go</th>
								<th class="num">ETA</th>
							{:else}
								{#each runners as r (r.id)}
									<th class="num">{r.name}</th>
								{/each}
							{/if}
						{/if}
						<th class="num">Directions</th>
					</tr>
				</thead>
				<tbody>
					{#each tableStops as st (st.name + st.mile)}
						<tr class:finish-row={isFinishStop(st, ci)}>
							<td>{st.name}</td>
							<td class="num">{st.mile.toFixed(1)}</td>
							{#if showEtas}
								{#if solo}
									{@const sp = progressById[solo.id]}
									<td class="num" class:passed={passed(solo, st.mile)}
										>{sp?.onCourse ? `${Math.max(0, st.mile - sp.mile).toFixed(1)} mi` : '—'}</td
									>
									<td class="num" class:passed={passed(solo, st.mile)}>{eta(solo, st.mile)}</td>
								{:else}
									{#each runners as r (r.id)}
										<td class="num" class:passed={passed(r, st.mile)}>{eta(r, st.mile)}</td>
									{/each}
								{/if}
							{/if}
							<td class="num">
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
								<a href={directionsUrl(st.lat, st.lon)} target="_blank" rel="noopener"
									>Google Maps ↗</a
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="sub">
				{#if showEtas}ETAs use average pace along the course so far, so they drift later as the
					miles add up.{/if}
				Directions open Google Maps from wherever you are, which is handy for crew.
			</p>
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

	.progress {
		margin: -0.4rem 0 1.25rem 0;
	}

	.bar {
		position: relative;
		height: 14px;
		background: #edf0f4;
		border-radius: 7px;
		overflow: visible;
	}

	.fill {
		height: 100%;
		border-radius: 7px;
		min-width: 4px;
		transition: width 0.6s ease;
	}

	.tick {
		position: absolute;
		top: -3px;
		width: 4px;
		height: 20px;
		margin-left: -2px;
		background: #d35400;
		border-radius: 2px;
		box-shadow: 0 0 0 1px #fff;
	}

	.tick.done {
		background: #9aa5b1;
	}

	.progress-labels {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
		font-size: 0.85rem;
		color: #555;
	}

	tr.finish-row td {
		font-weight: 600;
	}

	.course-links {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-top: 0.9rem;
	}

	.btn {
		padding: 0.45rem 0.9rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font-size: 0.9rem;
		color: #333;
		text-decoration: none;
	}

	.btn.primary {
		background: #0066cc;
		border-color: #0066cc;
		color: #fff;
	}

	/* Leaflet adds these outside the component's markup, hence :global. */
	:global(.stop-icon) {
		background: none;
		border: 0;
	}

	:global(.stop) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border: 2px solid #fff;
		border-radius: 4px;
		box-sizing: border-box;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
		font: 700 14px/1 sans-serif;
		color: #fff;
	}

	:global(.stop.aid) {
		background: #d35400;
	}

	:global(.stop.wpt) {
		background: #5d6d7e;
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
