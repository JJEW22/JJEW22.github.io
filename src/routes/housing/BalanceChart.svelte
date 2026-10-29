<!-- src/routes/housing/BalanceChart.svelte -->
<!--
	Buyers against sellers over time, after Redfin's "Balance of Power" chart:
	sellers in red, buyers in blue, each line labelled at its right end with its
	latest count. A crosshair reads both at once, with the gap between them and
	what Redfin would call that market; the arrow keys step through the months,
	and every value is in the "Show data" table.

	The lines are named at their ends and in the legend, so neither rests on
	colour alone. The scale starts where the data does, not at zero, as
	Redfin's does: the crossings are the point.
-->
<script lang="ts">
	import {
		formatMonth,
		lastYears,
		marketBalance,
		sellerBuyerGapPct,
		type BalanceSeries
	} from '$lib/housing';

	export let series: BalanceSeries;
	export let title: string;
	export let subtitle = '';
	export let years = 0;
	export let height = 260;

	const M = { top: 14, right: 84, bottom: 26, left: 52 };
	const count = (v: number) => Math.round(v).toLocaleString('en-US');

	let width = 600;
	let active: number | null = null;

	// The months both lines have, oldest first.
	$: sellersByDay = new Map(series.sellers);
	$: rows = lastYears(series.buyers, years)
		.filter(([day]) => sellersByDay.has(day))
		.map(([day, buyers]) => ({ day, buyers, sellers: sellersByDay.get(day) ?? 0 }));

	$: innerW = Math.max(width - M.left - M.right, 10);
	$: innerH = height - M.top - M.bottom;
	$: times = rows.map((r) => Date.parse(r.day));
	$: t0 = times[0] ?? 0;
	$: t1 = times.at(-1) ?? 1;
	$: all = rows.flatMap((r) => [r.buyers, r.sellers]);
	$: yTicks = niceTicks(Math.min(...all), Math.max(...all));
	$: scale = { t0, t1, lo: yTicks[0] ?? 0, hi: yTicks.at(-1) ?? 1, innerW, innerH };

	$: sellersLine = path(
		scale,
		times,
		rows.map((r) => r.sellers)
	);
	$: buyersLine = path(
		scale,
		times,
		rows.map((r) => r.buyers)
	);
	$: xTicks = yearTicks(t0, t1, innerW);

	$: latest = rows.at(-1) ?? null;
	// End labels, nudged apart when the two lines finish close together.
	$: ends = latest ? endLabels(scale, latest) : null;

	type Scale = typeof scale;

	function sx(s: Scale, t: number): number {
		return M.left + (s.t1 === s.t0 ? s.innerW / 2 : ((t - s.t0) / (s.t1 - s.t0)) * s.innerW);
	}

	function sy(s: Scale, v: number): number {
		return M.top + s.innerH - ((v - s.lo) / (s.hi - s.lo || 1)) * s.innerH;
	}

	function path(s: Scale, ts: number[], vs: number[]): string {
		return vs.map((v, i) => `${i ? 'L' : 'M'}${sx(s, ts[i])},${sy(s, v)}`).join('');
	}

	function endLabels(s: Scale, r: { sellers: number; buyers: number }) {
		const GAP = 30; // two lines of text
		let ys = sy(s, r.sellers);
		let yb = sy(s, r.buyers);
		if (Math.abs(ys - yb) < GAP) {
			const mid = (ys + yb) / 2;
			const up = r.sellers >= r.buyers;
			ys = mid + (up ? -GAP / 2 : GAP / 2);
			yb = mid + (up ? GAP / 2 : -GAP / 2);
		}
		return { sellers: ys, buyers: yb };
	}

	// Round-number ticks covering the data, ~4 of them.
	function niceTicks(lo: number, hi: number): number[] {
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
		if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
		const raw = (hi - lo) / 4;
		const mag = Math.pow(10, Math.floor(Math.log10(raw)));
		const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) ?? 10 * mag;
		const out: number[] = [];
		for (let v = Math.floor(lo / step) * step; v < hi + step * 0.999; v += step) {
			out.push(Number(v.toPrecision(12)));
		}
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

	function compactCount(v: number): string {
		if (Math.abs(v) >= 1e6) return `${Number((v / 1e6).toFixed(2))}M`;
		if (Math.abs(v) >= 1e3) return `${Number((v / 1e3).toFixed(1))}K`;
		return String(v);
	}

	// "21% more sellers than buyers" / "12% fewer sellers than buyers".
	function gapText(r: { buyers: number; sellers: number }): string {
		const gap = sellerBuyerGapPct(r.buyers, r.sellers);
		if (Math.abs(gap) < 0.5) return 'as many sellers as buyers';
		return `${Math.abs(gap).toFixed(0)}% ${gap > 0 ? 'more' : 'fewer'} sellers than buyers`;
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
		if (rows.length) active = nearest(e.clientX, e.currentTarget as SVGSVGElement);
	}

	function onKey(e: KeyboardEvent) {
		if (!rows.length) return;
		const last = rows.length - 1;
		if (e.key === 'ArrowLeft') active = Math.max((active ?? last + 1) - 1, 0);
		else if (e.key === 'ArrowRight') active = Math.min((active ?? -1) + 1, last);
		else if (e.key === 'Home') active = 0;
		else if (e.key === 'End') active = last;
		else return;
		e.preventDefault();
	}

	$: activeRow = active !== null ? rows[active] : null;
	$: tipLeft = activeRow ? sx(scale, times[active ?? 0]) : 0;
	// Beside the crosshair, on whichever side has room, and never past either
	// edge of the plot (a phone is narrower than the tooltip's two sides).
	let tipW = 0;
	$: tipX = Math.max(
		0,
		Math.min(tipLeft > width / 2 ? tipLeft - tipW - 10 : tipLeft + 10, width - tipW)
	);
</script>

<figure class="chart">
	<figcaption>
		<span class="title">{title}</span>
		{#if latest}
			<span class="latest"
				>{marketBalance(latest.buyers, latest.sellers)} · {formatMonth(latest.day)}</span
			>
		{/if}
		{#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
		<span class="legend">
			<span class="key"><span class="swatch sellers"></span>Sellers (homes for sale)</span>
			<span class="key"><span class="swatch buyers"></span>Buyers (estimated)</span>
		</span>
	</figcaption>

	{#if rows.length < 2}
		<p class="empty">No data for this yet.</p>
	{:else}
		<div class="plot" bind:clientWidth={width}>
			<!-- Focusable so the keyboard can step through the months, like the crosshair. -->
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
						{compactCount(v)}
					</text>
				{/each}
				{#each xTicks as t (t)}
					<line
						class="xtick"
						x1={sx(scale, t)}
						x2={sx(scale, t)}
						y1={M.top + innerH}
						y2={M.top + innerH + 4}
					/>
					<text class="tick" x={sx(scale, t)} y={height - 6} text-anchor="middle">
						{new Date(t).getUTCFullYear()}
					</text>
				{/each}

				<path class="line sellers" d={sellersLine} />
				<path class="line buyers" d={buyersLine} />

				{#if latest && ends}
					{@const x = sx(scale, t1)}
					{#each [{ key: 'sellers', label: 'Sellers', v: latest.sellers, y: ends.sellers }, { key: 'buyers', label: 'Buyers', v: latest.buyers, y: ends.buyers }] as end (end.key)}
						<line
							class="leader {end.key}"
							x1={x + 4}
							x2={x + 12}
							y1={sy(scale, end.v)}
							y2={end.y}
						/>
						<text class="end-name" x={x + 15} y={end.y - 3}>{end.label}</text>
						<text class="end-value" x={x + 15} y={end.y + 11}>{count(end.v)}</text>
					{/each}
					{#if active === null}
						<circle class="dot sellers" cx={x} cy={sy(scale, latest.sellers)} r="4" />
						<circle class="dot buyers" cx={x} cy={sy(scale, latest.buyers)} r="4" />
					{/if}
				{/if}

				{#if activeRow}
					<line class="crosshair" x1={tipLeft} x2={tipLeft} y1={M.top} y2={M.top + innerH} />
					<circle class="dot sellers" cx={tipLeft} cy={sy(scale, activeRow.sellers)} r="4" />
					<circle class="dot buyers" cx={tipLeft} cy={sy(scale, activeRow.buyers)} r="4" />
				{/if}
			</svg>

			{#if activeRow}
				<div class="tooltip" bind:clientWidth={tipW} style="left: {tipX}px">
					<span class="when">{formatMonth(activeRow.day)}</span>
					<span
						><span class="swatch sellers"></span>Sellers
						<strong>{count(activeRow.sellers)}</strong></span
					>
					<span
						><span class="swatch buyers"></span>Buyers
						<strong>{count(activeRow.buyers)}</strong></span
					>
					<span class="gap"
						>{gapText(activeRow)} · {marketBalance(activeRow.buyers, activeRow.sellers)}</span
					>
				</div>
			{/if}
		</div>

		<details>
			<summary>Show data</summary>
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Month</th><th>Sellers</th><th>Buyers</th><th>Sellers vs buyers</th></tr>
					</thead>
					<tbody>
						{#each [...rows].reverse() as r (r.day)}
							{@const gap = sellerBuyerGapPct(r.buyers, r.sellers)}
							<tr>
								<td>{formatMonth(r.day)}</td>
								<td>{count(r.sellers)}</td>
								<td>{count(r.buyers)}</td>
								<td>{gap >= 0 ? '+' : '−'}{Math.abs(gap).toFixed(1)}%</td>
							</tr>
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
		--sellers: #c8303a;
		--buyers: #1b86a8;
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

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.9rem;
		flex-basis: 100%;
		color: var(--ink-2);
		font-size: 0.8rem;
	}

	.key {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.swatch {
		display: inline-block;
		width: 14px;
		height: 3px;
		border-radius: 2px;
		vertical-align: middle;
	}

	.swatch.sellers {
		background: var(--sellers);
	}

	.swatch.buyers {
		background: var(--buyers);
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
		outline: 2px solid var(--buyers);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.grid {
		stroke: var(--grid);
		stroke-width: 1;
	}

	.xtick {
		stroke: var(--axis);
		stroke-width: 1;
	}

	.tick {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.line {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.line.sellers,
	.leader.sellers {
		stroke: var(--sellers);
	}

	.line.buyers,
	.leader.buyers {
		stroke: var(--buyers);
	}

	.leader {
		stroke-width: 1.5;
		stroke-dasharray: 2 2;
	}

	.dot {
		stroke: var(--surface);
		stroke-width: 2;
	}

	.dot.sellers {
		fill: var(--sellers);
	}

	.dot.buyers {
		fill: var(--buyers);
	}

	.end-name {
		fill: var(--ink);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.end-value {
		fill: var(--ink-2);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.crosshair {
		stroke: var(--axis);
		stroke-width: 1;
	}

	.tooltip {
		position: absolute;
		top: 4px;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.4rem 0.6rem;
		background: #fff;
		border: 1px solid rgba(11, 11, 11, 0.1);
		border-radius: 6px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
		pointer-events: none;
		white-space: nowrap;
		font-size: 0.8rem;
		color: var(--ink-2);
	}

	.tooltip .swatch {
		margin-right: 0.35rem;
	}

	.tooltip strong {
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.tooltip .when {
		color: var(--ink);
		font-weight: 600;
	}

	.tooltip .gap {
		color: var(--muted);
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
