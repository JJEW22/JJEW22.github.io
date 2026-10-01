<!-- src/routes/meSoup/WorldMap.svelte -->
<!--
	The world, with a dot everywhere I've swum.

	Drawn as one SVG from d3-geo and a 110m TopoJSON in static/, rather than an
	embedded Tableau viz or a tiled slippy map. Both of those hand the page to a
	third party — Tableau owns the data and the republish cycle, tiles need a
	provider that stays up — and neither styles like the rest of the site. This
	way the whole map is 105KB of static JSON and the dots come from our own API.

	Zooming is deliberately not bound to a bare wheel: the map sits in the middle
	of a scrollable page, and a map that eats the scroll wheel is worse than one
	with buttons. Ctrl/pinch-wheel, double-click and the buttons all zoom; plain
	scrolling passes through to the page.
-->
<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
	import { feature } from 'topojson-client';
	import { WATER_TYPES, waterType, formatSwims, formatCoords } from '$lib/swimSpots';
	import type { SwimSpot, WaterTypeMeta } from '$lib/swimSpots';
	import type { Feature, FeatureCollection, Geometry } from 'geojson';

	export let spots: SwimSpot[] = [];
	// Built-ins plus custom types, from the API. Without it a custom-typed dot
	// still draws, just grey.
	export let waterTypes: WaterTypeMeta[] = WATER_TYPES;
	// The signed-out map: its spots have no date to show, and "date unknown" on
	// every dot would read as missing data rather than withheld data.
	export let anonymous = false;
	export let topoPath = '/meSoup/countries-110m.json';
	// Bindable, so the list beside the map and the map itself highlight together.
	export let selectedId: number | null = null;

	const dispatch = createEventDispatcher<{ select: number | null }>();

	// The viewBox. Everything below is in these units and scales with the
	// container, so the component has no fixed pixel size of its own.
	const W = 960;
	const H = 500;
	const MIN_K = 1;
	const MAX_K = 14;

	const projection = geoNaturalEarth1().fitExtent(
		[
			[4, 4],
			[W - 4, H - 4]
		],
		{ type: 'Sphere' }
	);
	const path = geoPath(projection);

	// geoPath returns null for a shape that projects to nothing. Neither of these
	// can, but the type says otherwise and an empty `d` is the honest fallback.
	const spherePath = path({ type: 'Sphere' }) ?? '';
	const graticulePath = path(geoGraticule10()) ?? '';

	let countries: Feature<Geometry>[] = [];
	let landFailed = false;

	// Pan/zoom, applied as one transform on the content group.
	let k = 1;
	let tx = 0;
	let ty = 0;

	// Container width in CSS pixels, for turning viewBox coordinates into a
	// position for the HTML tooltip.
	let mapWidth = W;
	let hoverId: number | null = null;

	$: pxPerUnit = mapWidth / W;
	$: activeId = selectedId ?? hoverId;
	$: active = spots.find((s) => s.id === activeId) ?? null;

	// Nothing to pan at 1x, so let the page keep the touch gesture until the
	// reader has actually zoomed in.
	$: touchAction = k > 1 ? 'none' : 'pan-y';

	onMount(async () => {
		try {
			const res = await fetch(topoPath);
			if (!res.ok) throw new Error(String(res.status));
			const topo = await res.json();
			// feature() is overloaded on whether the object is a geometry or a
			// collection, and `topo` off a fetch is `any`, so TypeScript picks the
			// single-Feature overload. `countries` is a GeometryCollection.
			const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry>;
			countries = fc.features;
		} catch {
			// The dots, the graticule and the sphere still draw. A map with no
			// coastlines is poor, but it beats an empty box.
			landFailed = true;
		}
	});

	function xy(spot: SwimSpot): [number, number] {
		return projection([spot.lon, spot.lat]) ?? [0, 0];
	}

	function clampPan() {
		// Never let the content be dragged clear of the frame. At k = 1 this pins
		// the transform to the identity, which is the only sensible 1x view.
		tx = Math.min(0, Math.max(W - k * W, tx));
		ty = Math.min(0, Math.max(H - k * H, ty));
	}

	// Zoom about a fixed point, in viewBox coordinates, so whatever is under the
	// cursor stays under the cursor.
	function zoomAbout(factor: number, cx: number, cy: number) {
		const next = Math.min(MAX_K, Math.max(MIN_K, k * factor));
		if (next === k) return;
		const ratio = next / k;
		tx = cx - (cx - tx) * ratio;
		ty = cy - (cy - ty) * ratio;
		k = next;
		clampPan();
	}

	function zoomButton(factor: number) {
		zoomAbout(factor, W / 2, H / 2);
	}

	function resetView() {
		k = 1;
		tx = 0;
		ty = 0;
	}

	let svgEl: SVGSVGElement;

	function toViewBox(event: { clientX: number; clientY: number }): [number, number] {
		const rect = svgEl.getBoundingClientRect();
		return [(event.clientX - rect.left) / pxPerUnit, (event.clientY - rect.top) / pxPerUnit];
	}

	function onWheel(event: WheelEvent) {
		// A trackpad pinch arrives as a wheel event with ctrlKey set, so this one
		// test covers both "hold ctrl and scroll" and an actual pinch.
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		const [cx, cy] = toViewBox(event);
		zoomAbout(Math.pow(0.998, event.deltaY), cx, cy);
	}

	function onDoubleClick(event: MouseEvent) {
		const [cx, cy] = toViewBox(event);
		zoomAbout(event.shiftKey ? 1 / 1.8 : 1.8, cx, cy);
	}

	// --- dragging ---

	let dragging = false;
	let dragMoved = false;
	let lastX = 0;
	let lastY = 0;

	function onPointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		dragging = true;
		dragMoved = false;
		lastX = event.clientX;
		lastY = event.clientY;
		svgEl.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const dx = event.clientX - lastX;
		const dy = event.clientY - lastY;
		// A few pixels of wobble while tapping a dot is not a drag; without this
		// every tap on a touchscreen would also count as a pan and swallow the tap.
		if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
		lastX = event.clientX;
		lastY = event.clientY;
		tx += dx / pxPerUnit;
		ty += dy / pxPerUnit;
		clampPan();
	}

	function onPointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		if (svgEl.hasPointerCapture(event.pointerId)) svgEl.releasePointerCapture(event.pointerId);
	}

	// --- selection ---

	function select(id: number) {
		selectedId = selectedId === id ? null : id;
		dispatch('select', selectedId);
	}

	function clearSelection() {
		if (selectedId === null) return;
		selectedId = null;
		dispatch('select', null);
	}

	function onBackdropClick() {
		// Tap anywhere off a dot to dismiss — but not at the end of a pan.
		if (dragMoved) return;
		clearSelection();
	}

	function onDotKey(event: KeyboardEvent, id: number) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		select(id);
	}

	function onWindowKey(event: KeyboardEvent) {
		if (event.key === 'Escape') clearSelection();
	}

	// Tooltip placement, from the dot's own position rather than the cursor, so it
	// stays attached while panning and works the same for hover, tap and keyboard.
	$: tip = active ? tipFor(active) : null;

	function tipFor(spot: SwimSpot) {
		const [x, y] = xy(spot);
		const left = (tx + k * x) * pxPerUnit;
		const top = (ty + k * y) * pxPerUnit;
		// Zoomed in, the selected dot can end up outside the frame; a tooltip
		// floating over empty page next to the map is just confusing.
		return { left, top, offScreen: left < -40 || left > mapWidth + 40 };
	}

	// Radii are divided by k so a dot keeps the same apparent size at every zoom.
	$: dotR = 5 / k;
	$: hitR = 13 / k;
</script>

<svelte:window on:keydown={onWindowKey} />

<div class="map-wrap" bind:clientWidth={mapWidth}>
	<!--
		The click here only dismisses a selection; Escape does the same from the
		keyboard (onWindowKey), and every dot is separately focusable, so there is
		nothing reachable by mouse alone.
	-->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		bind:this={svgEl}
		viewBox="0 0 {W} {H}"
		role="application"
		aria-label="World map of swim spots"
		style:touch-action={touchAction}
		class:grabbing={dragging}
		on:wheel={onWheel}
		on:dblclick={onDoubleClick}
		on:pointerdown={onPointerDown}
		on:pointermove={onPointerMove}
		on:pointerup={onPointerUp}
		on:pointercancel={onPointerUp}
		on:click={onBackdropClick}
	>
		<g transform="translate({tx} {ty}) scale({k})">
			<path class="sphere" d={spherePath} />
			<path class="graticule" d={graticulePath} style:stroke-width={0.5 / k} />
			{#each countries as country, i (country.id ?? i)}
				<path class="country" d={path(country) ?? ''} style:stroke-width={0.5 / k} />
			{/each}

			{#each spots as spot (spot.id)}
				{@const xyPt = xy(spot)}
				{@const meta = waterType(spot.waterType, waterTypes)}
				{@const on = spot.id === activeId}
				<g class="dot">
					<circle
						class="halo"
						cx={xyPt[0]}
						cy={xyPt[1]}
						r={on ? dotR * 2.2 : dotR * 1.5}
						fill={meta.color}
					/>
					<circle
						class="core"
						cx={xyPt[0]}
						cy={xyPt[1]}
						r={on ? dotR * 1.35 : dotR}
						fill={meta.color}
						style:stroke-width={1.2 / k}
					/>
					<!--
						A separate, invisible, generous target: a 5px dot is not
						something anyone hits with a thumb.
					-->
					<circle
						class="hit"
						cx={xyPt[0]}
						cy={xyPt[1]}
						r={hitR}
						role="button"
						tabindex="0"
						aria-label="{spot.name}, {meta.label}"
						aria-pressed={on}
						on:click|stopPropagation={() => select(spot.id)}
						on:keydown={(e) => onDotKey(e, spot.id)}
						on:mouseenter={() => (hoverId = spot.id)}
						on:mouseleave={() => (hoverId = hoverId === spot.id ? null : hoverId)}
						on:focus={() => (hoverId = spot.id)}
						on:blur={() => (hoverId = hoverId === spot.id ? null : hoverId)}
					/>
				</g>
			{/each}
		</g>
	</svg>

	{#if active && tip && !tip.offScreen}
		<div class="tip" style:left="{tip.left}px" style:top="{tip.top}px">
			<strong>{active.name}</strong>
			{#if !anonymous}
				<span class="tip-meta">
					{waterType(active.waterType, waterTypes).label} · {formatSwims(active.dates)}
				</span>
			{/if}
			{#if active.country || active.region}
				<span class="tip-meta">
					{[active.region, active.country].filter(Boolean).join(', ')}
				</span>
			{/if}
			<span class="tip-coords">{formatCoords(active.lat, active.lon)}</span>
			{#if active.owner}
				<span class="tip-meta">
					{[active.owner, ...(active.tagged ?? [])].join(', ')}
				</span>
			{/if}
			{#if active.note}<span class="tip-note">{active.note}</span>{/if}
		</div>
	{/if}

	<div class="zoom">
		<button type="button" on:click={() => zoomButton(1.6)} aria-label="Zoom in">+</button>
		<button type="button" on:click={() => zoomButton(1 / 1.6)} aria-label="Zoom out">−</button>
		<button type="button" class="reset" on:click={resetView} disabled={k === 1}>Reset</button>
	</div>

	{#if landFailed}
		<p class="land-failed">Coastlines didn't load — the spots are still where they belong.</p>
	{/if}
</div>

<style>
	.map-wrap {
		position: relative;
		width: 100%;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		background: #eaf2f8;
		border: 1px solid #d6e2ec;
		border-radius: 12px;
		cursor: grab;
	}

	svg.grabbing {
		cursor: grabbing;
	}

	.sphere {
		fill: #eaf2f8;
	}

	.graticule {
		fill: none;
		stroke: #cddfeb;
	}

	.country {
		fill: #f6f4ef;
		stroke: #ccd4dd;
	}

	.halo {
		opacity: 0.22;
	}

	.core {
		stroke: #fff;
	}

	.hit {
		fill: transparent;
		cursor: pointer;
		outline: none;
	}

	.hit:focus-visible {
		stroke: #0066cc;
		stroke-width: 2;
	}

	.tip {
		position: absolute;
		z-index: 2;
		transform: translate(-50%, calc(-100% - 14px));
		max-width: min(17rem, 80vw);
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem 0.7rem;
		background: #1a1a1a;
		color: #fff;
		border-radius: 8px;
		font-size: 0.8rem;
		line-height: 1.35;
		pointer-events: none;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
	}

	.tip-meta {
		color: #cfd6dd;
	}

	.tip-coords {
		color: #9aa5b1;
		font-variant-numeric: tabular-nums;
	}

	.tip-note {
		margin-top: 0.25rem;
		color: #e8e2d4;
		font-style: italic;
	}

	.zoom {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.zoom button {
		min-width: 2rem;
		padding: 0.25rem 0.4rem;
		background: rgba(255, 255, 255, 0.94);
		border: 1px solid #ccd4dd;
		border-radius: 6px;
		color: #333;
		font-size: 0.95rem;
		line-height: 1.2;
		cursor: pointer;
	}

	.zoom button:hover:not(:disabled) {
		border-color: #0066cc;
		color: #0066cc;
	}

	.zoom button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.zoom .reset {
		font-size: 0.75rem;
	}

	.land-failed {
		position: absolute;
		left: 0.75rem;
		bottom: 0.6rem;
		margin: 0;
		font-size: 0.8rem;
		color: #8a6a55;
	}
</style>
