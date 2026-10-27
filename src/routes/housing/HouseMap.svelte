<!-- src/routes/housing/HouseMap.svelte -->
<!--
	Every saved house on a map. Clicking a pin selects that house, the same as
	clicking its card; the selected one is drawn larger. Leaflet over
	OpenStreetMap tiles, like /ultra, imported in onMount so the prerender never
	touches it (it needs `window`).

	A house appears once it has coordinates, which the server finds from its
	address (see locatePending in $lib/server/housing). Those it couldn't place
	are listed under the map.
-->
<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import type { CircleMarker, LayerGroup, Map as LeafletMap } from 'leaflet';
	import { averageRating, flagSummary, formatDollars, type House } from '$lib/housing';

	export let houses: House[] = [];
	export let selectedId: number | null = null;

	const dispatch = createEventDispatcher<{ select: number }>();

	let el: HTMLDivElement;
	let L: typeof import('leaflet') | null = null;
	let map: LeafletMap | null = null;
	let layer: LayerGroup | null = null;
	// The houses the view was last fitted to. Refit only when that set changes,
	// so editing a house or rating it doesn't yank the map away from where
	// someone has panned.
	let fittedTo = '';

	onMount(async () => {
		L = await import('leaflet');
		map = L.map(el, { scrollWheelZoom: false }).setView([42.36, -71.06], 11);
		L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		layer = L.layerGroup().addTo(map);
		draw(placed, selectedId);
	});

	onDestroy(() => map?.remove());

	$: placed = houses.filter((h) => h.lat !== null && h.lng !== null);
	$: unplaced = houses.filter((h) => h.lat === null || h.lng === null);
	$: draw(placed, selectedId);

	function label(h: House): string {
		return h.address ?? (h.zpid ? `Zillow listing ${h.zpid}` : 'Zillow listing');
	}

	function draw(list: House[], selected: number | null) {
		if (!L || !map || !layer) return;
		layer.clearLayers();
		const markers: CircleMarker[] = [];
		// The selected pin last, so it sits on top of any neighbours.
		const ordered = [...list].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
		for (const h of ordered) {
			const isSelected = h.id === selected;
			const m = L.circleMarker([h.lat as number, h.lng as number], {
				radius: isSelected ? 11 : 8,
				color: '#fcfcfb',
				weight: 2,
				fillColor: isSelected ? '#184f95' : '#2a78d6',
				fillOpacity: 1
			});
			const avg = averageRating(h);
			// Tooltip text is built from house data, which admins typed, so it is
			// set as a DOM node's textContent rather than parsed as HTML.
			const tip = document.createElement('div');
			const name = document.createElement('strong');
			name.textContent = label(h);
			const facts = document.createElement('div');
			facts.textContent = [
				h.price !== null ? formatDollars(h.price) : 'No price yet',
				h.beds !== null ? `${h.beds} bd` : '',
				avg !== null ? `${avg.toFixed(1)}/10` : '',
				flagSummary(h)
			]
				.filter(Boolean)
				.join(' · ');
			tip.append(name, facts);
			m.bindTooltip(tip, { direction: 'top', offset: [0, -8] });
			m.on('click', () => dispatch('select', h.id));
			m.addTo(layer);
			markers.push(m);
		}

		const key = list
			.map((h) => h.id)
			.sort()
			.join(',');
		if (key !== fittedTo && markers.length) {
			fittedTo = key;
			if (markers.length === 1) map.setView(markers[0].getLatLng(), 14);
			else map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [30, 30], maxZoom: 15 });
		}
	}
</script>

<div class="map-wrap">
	<div class="map" bind:this={el} role="region" aria-label="Map of saved houses"></div>
	{#if !placed.length}
		<p class="overlay">Houses appear here once their address is found.</p>
	{/if}
</div>
{#if unplaced.length}
	<p class="note">
		Not on the map: {unplaced.map(label).join('; ')}. Check the address, or look the house up on
		RentCast.
	</p>
{/if}

<style>
	.map-wrap {
		position: relative;
	}

	.map {
		height: 360px;
		border: 1px solid rgba(11, 11, 11, 0.1);
		border-radius: 10px;
		z-index: 0; /* keep Leaflet's panes under the page's own overlays */
	}

	.overlay {
		position: absolute;
		inset: auto 0 1rem 0;
		margin: 0 auto;
		width: max-content;
		max-width: calc(100% - 2rem);
		padding: 0.4rem 0.75rem;
		background: rgba(255, 255, 255, 0.92);
		border-radius: 6px;
		color: #52514e;
		font-size: 0.85rem;
		z-index: 500;
		pointer-events: none;
	}

	.note {
		color: #666;
		font-size: 0.85rem;
	}

	@media (max-width: 768px) {
		.map {
			height: 280px;
		}
	}
</style>
