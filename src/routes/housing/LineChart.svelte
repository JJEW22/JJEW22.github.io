<!-- src/routes/housing/LineChart.svelte -->
<!--
	One series over time: a 2px line over a 10% wash, a crosshair that snaps to
	the nearest observation, and the same readout on keyboard focus (arrow keys
	step through the points). Every value is also in the "Show data" table, so the
	tooltip never gates anything.
-->
<script lang="ts">
	import { formatMonth, type Point } from '$lib/housing';

	export let points: Point[] = [];
	export let title: string;
	export let subtitle = '';
	export let format: (v: number) => string = (v) => v.toFixed(1);
	export let tick: (v: number) => string = format;
	export let dateLabel: (day: string) => string = formatMonth;
	export let height = 220;

	const M = { top: 12, right: 16, bottom: 26, left: 52 };

	let width = 600;
	let active: number | null = null;

	$: innerW = Math.max(width - M.left - M.right, 10);
	$: innerH = height - M.top - M.bottom;

	$: times = points.map(([d]) => Date.parse(d));
	$: t0 = times[0] ?? 0;
	$: t1 = times.at(-1) ?? 1;
	$: values = points.map(([, v]) => v);
	$: yTicks = niceTicks(Math.min(...values), Math.max(...values));
	$: yMin = yTicks[0] ?? 0;
	$: yMax = yTicks.at(-1) ?? 1;

	// The scale as data rather than a reactive closure: template calls like
	// sx(scale, t) then re-run whenever the scale changes.
	$: scale = { t0, t1, yMin, yMax, innerW, innerH };

	$: line = points
		.map((p, i) => `${i ? 'L' : 'M'}${sx(scale, times[i])},${sy(scale, p[1])}`)
		.join('');
	$: area = points.length
		? `${line}L${sx(scale, t1)},${M.top + innerH}L${sx(scale, t0)},${M.top + innerH}Z`
		: '';
	$: xTicks = yearTicks(t0, t1, innerW);

	type Scale = typeof scale;

	function sx(s: Scale, t: number): number {
		return M.left + (s.t1 === s.t0 ? s.innerW / 2 : ((t - s.t0) / (s.t1 - s.t0)) * s.innerW);
	}

	function sy(s: Scale, v: number): number {
		return M.top + s.innerH - ((v - s.yMin) / (s.yMax - s.yMin || 1)) * s.innerH;
	}

	// Ticks on round numbers that cover the data, ~4 of them. Zero is kept in
	// view only when the data is already near it; a rate chart pinned to zero
	// would flatten every move worth seeing.
	function niceTicks(lo: number, hi: number): number[] {
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
		if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
		const raw = (hi - lo) / 4;
		const mag = Math.pow(10, Math.floor(Math.log10(raw)));
		const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? 10 * mag;
		const start = Math.floor(lo / step) * step;
		const out: number[] = [];
		for (let v = start; v < hi + step * 0.999; v += step) out.push(Number(v.toPrecision(12)));
		return out;
	}

	// January of every Nth year, N chosen so labels stay ~70px apart.
	function yearTicks(a: number, b: number, w: number): number[] {
		const first = new Date(a).getUTCFullYear() + 1;
		const last = new Date(b).getUTCFullYear();
		const span = Math.max(last - first + 1, 1);
		const every = [1, 2, 5, 10].find((n) => (w / span) * n >= 70) ?? 10;
		const out: number[] = [];
		for (let yr = first; yr <= last; yr++) if (yr % every === 0) out.push(Date.UTC(yr, 0, 1));
		return out;
	}

	function nearest(clientX: number, svg: SVGSVGElement): number {
		const box = svg.getBoundingClientRect();
		const px = ((clientX - box.left) / box.width) * width;
		let best = 0;
		for (let i = 1; i < times.length; i++) {
			if (Math.abs(sx(scale, times[i]) - px) < Math.abs(sx(scale, times[best]) - px)) best = i;
		}
		return best;
	}

	function onMove(e: PointerEvent) {
		if (points.length) active = nearest(e.clientX, e.currentTarget as SVGSVGElement);
	}

	function onKey(e: KeyboardEvent) {
		if (!points.length) return;
		const last = points.length - 1;
		if (e.key === 'ArrowLeft') active = Math.max((active ?? last + 1) - 1, 0);
		else if (e.key === 'ArrowRight') active = Math.min((active ?? -1) + 1, last);
		else if (e.key === 'Home') active = 0;
		else if (e.key === 'End') active = last;
		else return;
		e.preventDefault();
	}

	$: activePoint = active !== null ? points[active] : null;
	$: latest = points.at(-1);
	// Keep the tooltip inside the chart: flip it to the left of the crosshair
	// past the midpoint.
	$: tipLeft = activePoint ? sx(scale, times[active ?? 0]) : 0;
	$: tipFlip = tipLeft > width / 2;
</script>

<figure class="chart">
	<figcaption>
		<span class="title">{title}</span>
		{#if latest}<span class="latest">{format(latest[1])} · {dateLabel(latest[0])}</span>{/if}
		{#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
	</figcaption>

	{#if points.length < 2}
		<p class="empty">No data for this yet.</p>
	{:else}
		<div class="plot" bind:clientWidth={width}>
			<!-- Focusable so the keyboard can step through the points, like the crosshair. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<svg
				viewBox="0 0 {width} {height}"
				{height}
				role="img"
				aria-label="{title}. Use the arrow keys to read values."
				tabindex="0"
				on:pointermove={onMove}
				on:pointerleave={() => (active = null)}
				on:blur={() => (active = null)}
				on:keydown={onKey}
			>
				{#each yTicks as v (v)}
					<line class="grid" x1={M.left} x2={M.left + innerW} y1={sy(scale, v)} y2={sy(scale, v)} />
					<text
						class="tick"
						x={M.left - 8}
						y={sy(scale, v)}
						text-anchor="end"
						dominant-baseline="middle"
					>
						{tick(v)}
					</text>
				{/each}
				{#each xTicks as t (t)}
					<text class="tick" x={sx(scale, t)} y={height - 6} text-anchor="middle">
						{new Date(t).getUTCFullYear()}
					</text>
				{/each}
				<line
					class="axis"
					x1={M.left}
					x2={M.left + innerW}
					y1={M.top + innerH}
					y2={M.top + innerH}
				/>

				<path class="area" d={area} />
				<path class="line" d={line} />

				{#if latest && active === null}
					<circle class="dot" cx={sx(scale, t1)} cy={sy(scale, latest[1])} r="4" />
				{/if}
				{#if activePoint && active !== null}
					<line class="crosshair" x1={tipLeft} x2={tipLeft} y1={M.top} y2={M.top + innerH} />
					<circle class="dot" cx={tipLeft} cy={sy(scale, activePoint[1])} r="4" />
				{/if}
			</svg>

			{#if activePoint}
				<div class="tooltip" class:flip={tipFlip} style="left: {(tipLeft / width) * 100}%">
					<strong>{format(activePoint[1])}</strong>
					<span>{dateLabel(activePoint[0])}</span>
				</div>
			{/if}
		</div>

		<details>
			<summary>Show data</summary>
			<div class="table-wrap">
				<table>
					<thead><tr><th>Date</th><th>Value</th></tr></thead>
					<tbody>
						{#each [...points].reverse() as [day, v] (day)}
							<tr><td>{dateLabel(day)}</td><td>{format(v)}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{/if}
</figure>

<style>
	.chart {
		--surface: #fcfcfb;
		--series: #2a78d6;
		--ink: #0b0b0b;
		--ink-2: #52514e;
		--muted: #898781;
		--grid: #e1e0d9;
		--axis: #c3c2b7;

		margin: 0;
		padding: 1rem 1rem 0.75rem;
		background: var(--surface);
		border: 1px solid rgba(11, 11, 11, 0.1);
		border-radius: 10px;
		min-width: 0;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		margin-bottom: 0.5rem;
	}

	.title {
		font-weight: 600;
		color: var(--ink);
	}

	.latest {
		color: var(--ink-2);
		font-size: 0.9rem;
	}

	.subtitle {
		flex-basis: 100%;
		color: var(--muted);
		font-size: 0.8rem;
	}

	.plot {
		position: relative;
	}

	svg {
		display: block;
		width: 100%;
		touch-action: pan-y;
	}

	svg:focus-visible {
		outline: 2px solid var(--series);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.grid {
		stroke: var(--grid);
		stroke-width: 1;
	}

	.axis {
		stroke: var(--axis);
		stroke-width: 1;
	}

	.tick {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.area {
		fill: var(--series);
		opacity: 0.1;
	}

	.line {
		fill: none;
		stroke: var(--series);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.dot {
		fill: var(--series);
		stroke: var(--surface);
		stroke-width: 2;
	}

	.crosshair {
		stroke: var(--axis);
		stroke-width: 1;
	}

	.tooltip {
		position: absolute;
		top: 4px;
		transform: translateX(10px);
		display: flex;
		flex-direction: column;
		padding: 0.35rem 0.55rem;
		background: #fff;
		border: 1px solid rgba(11, 11, 11, 0.1);
		border-radius: 6px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
		pointer-events: none;
		white-space: nowrap;
		font-size: 0.8rem;
	}

	.tooltip.flip {
		transform: translateX(calc(-100% - 10px));
	}

	.tooltip strong {
		color: var(--ink);
		font-size: 0.95rem;
	}

	.tooltip span {
		color: var(--ink-2);
	}

	.empty {
		margin: 1rem 0;
		color: var(--muted);
		font-size: 0.9rem;
	}

	details {
		margin-top: 0.4rem;
		font-size: 0.85rem;
	}

	summary {
		color: var(--ink-2);
		cursor: pointer;
	}

	.table-wrap {
		max-height: 240px;
		overflow-y: auto;
		margin-top: 0.4rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--grid);
		text-align: right;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	th {
		position: sticky;
		top: 0;
		background: var(--surface);
		color: var(--ink-2);
		font-weight: 600;
	}
</style>
