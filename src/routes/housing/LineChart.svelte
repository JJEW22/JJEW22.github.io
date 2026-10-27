<!-- src/routes/housing/LineChart.svelte -->
<!--
	One series over time: a 2px line over a 10% wash, a crosshair that snaps to
	the nearest observation, and the same readout on keyboard focus (arrow keys
	step through the points). Every value is also in the "Show data" table, so the
	tooltip never gates anything.

	With `signed`, zero is the line that matters: it is always in view and drawn
	solid, the series is green above it and red below, and each place it crosses
	is marked with a point and labelled. A legend names the two colours, so the
	sign never rests on colour alone.

	With `logToggle`, a Log / Linear switch sits in the caption, starting on
	`log`. The log scale is symmetric (sign · log10(1 + |v| / logThreshold)), so
	it can show zero and negatives: logarithmic for big values either way,
	close to linear within about `logThreshold` of zero.
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
	export let signed = false;
	export let crossingLabel = 'Crosses zero';
	export let positiveLabel = 'Above zero';
	export let negativeLabel = 'Below zero';
	export let log = false;
	export let logToggle = false;
	export let logThreshold = 1000;

	let useLog = log;

	const M = { top: 12, right: 16, bottom: 26, left: 52 };

	let width = 600;
	let active: number | null = null;

	$: innerW = Math.max(width - M.left - M.right, 10);
	$: innerH = height - M.top - M.bottom;

	$: times = points.map(([d]) => Date.parse(d));
	$: t0 = times[0] ?? 0;
	$: t1 = times.at(-1) ?? 1;
	$: values = points.map(([, v]) => v);
	$: lo = signed ? Math.min(0, ...values) : Math.min(...values);
	$: hi = signed ? Math.max(0, ...values) : Math.max(...values);
	$: yTicks = useLog ? logTicks(lo, hi, logThreshold) : niceTicks(lo, hi);
	// The plotted range, in the scale's own units (transformed when on log).
	$: yMin = fy(useLog, logThreshold, yTicks[0] ?? 0);
	$: yMax = fy(useLog, logThreshold, yTicks.at(-1) ?? 1);

	// The scale as data rather than a reactive closure: template calls like
	// sx(scale, t) then re-run whenever the scale changes.
	$: scale = { t0, t1, yMin, yMax, innerW, innerH, log: useLog, c: logThreshold };

	$: line = points
		.map((p, i) => `${i ? 'L' : 'M'}${sx(scale, times[i])},${sy(scale, p[1])}`)
		.join('');
	$: area = points.length
		? `${line}L${sx(scale, t1)},${M.top + innerH}L${sx(scale, t0)},${M.top + innerH}Z`
		: '';
	$: xTicks = yearTicks(t0, t1, innerW);

	// Signed mode: the series cut into runs that stay on one side of zero, each
	// ending exactly on zero where the sign flips, so the colours meet at the
	// axis instead of overlapping.
	$: runs = signed ? splitBySign(times, values) : { runs: [], crossings: [] };
	$: runPaths = runs.runs.map((r) => {
		const d = r.pts.map(([t, v], i) => `${i ? 'L' : 'M'}${sx(scale, t)},${sy(scale, v)}`).join('');
		const first = r.pts[0][0];
		const last = r.pts[r.pts.length - 1][0];
		const z = sy(scale, 0);
		return {
			sign: r.sign,
			line: d,
			area: `${d}L${sx(scale, last)},${z}L${sx(scale, first)},${z}Z`
		};
	});

	type Scale = typeof scale;
	type TV = [number, number];

	function splitBySign(
		ts: number[],
		vs: number[]
	): { runs: { sign: 1 | -1; pts: TV[] }[]; crossings: number[] } {
		const out: { sign: 1 | -1; pts: TV[] }[] = [];
		const crossings: number[] = [];
		let cur: { sign: 1 | -1; pts: TV[] } | null = null;
		for (let i = 0; i < ts.length; i++) {
			const t = ts[i];
			const v = vs[i];
			const sign: 1 | -1 = v >= 0 ? 1 : -1;
			if (!cur) {
				cur = { sign, pts: [[t, v]] };
			} else if (sign === cur.sign) {
				cur.pts.push([t, v]);
			} else {
				// Where the straight line between the two points meets zero.
				const [pt, pv]: TV = cur.pts[cur.pts.length - 1];
				const tc: number = pv === v ? t : pt + ((t - pt) * (0 - pv)) / (v - pv);
				cur.pts.push([tc, 0]);
				out.push(cur);
				crossings.push(tc);
				cur = {
					sign,
					pts: [
						[tc, 0],
						[t, v]
					]
				};
			}
		}
		if (cur) out.push(cur);
		return { runs: out, crossings };
	}

	// A crossing's label, kept inside the plot near either edge.
	function labelAnchor(x: number): 'start' | 'middle' | 'end' {
		if (x < M.left + 60) return 'start';
		if (x > M.left + innerW - 60) return 'end';
		return 'middle';
	}

	function dayOf(t: number): string {
		return new Date(t).toISOString().slice(0, 10);
	}

	function sx(s: Scale, t: number): number {
		return M.left + (s.t1 === s.t0 ? s.innerW / 2 : ((t - s.t0) / (s.t1 - s.t0)) * s.innerW);
	}

	function sy(s: Scale, v: number): number {
		const y = fy(s.log, s.c, v);
		return M.top + s.innerH - ((y - s.yMin) / (s.yMax - s.yMin || 1)) * s.innerH;
	}

	// Symmetric log: defined at zero and for negatives, unlike log10 itself.
	function fy(log: boolean, c: number, v: number): number {
		return log ? Math.sign(v) * Math.log10(1 + Math.abs(v) / c) : v;
	}

	// Log ticks: zero, then ±10, ±100 ... times the threshold, out to the first
	// decade past the data on each side that has any. ±1× is skipped: that close
	// to zero the scale is nearly linear, and its labels would crowd $0's.
	function logTicks(lo: number, hi: number, c: number): number[] {
		const decades = (limit: number): number[] => {
			const out: number[] = [];
			for (let v = c * 10; ; v *= 10) {
				out.push(v);
				if (v >= limit) break;
			}
			return out;
		};
		const neg =
			lo < 0
				? decades(-lo)
						.map((v) => -v)
						.reverse()
				: [];
		const pos = hi > 0 ? decades(hi) : [];
		return [...neg, 0, ...pos];
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
		{#if logToggle}
			<span class="scale-toggle" role="group" aria-label="Vertical scale">
				<button
					type="button"
					class:on={useLog}
					aria-pressed={useLog}
					on:click={() => (useLog = true)}>Log</button
				>
				<button
					type="button"
					class:on={!useLog}
					aria-pressed={!useLog}
					on:click={() => (useLog = false)}>Linear</button
				>
			</span>
		{/if}
		{#if signed}
			<span class="legend">
				<span class="key"><span class="swatch pos"></span>{positiveLabel}</span>
				<span class="key"><span class="swatch neg"></span>{negativeLabel}</span>
				{#if runs.crossings.length}
					<span class="key"><span class="ring"></span>{crossingLabel}</span>
				{/if}
			</span>
		{/if}
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

				{#if signed}
					{#each runPaths as r, i (i)}
						<path class="area" class:pos={r.sign > 0} class:neg={r.sign < 0} d={r.area} />
					{/each}
					<line class="zero" x1={M.left} x2={M.left + innerW} y1={sy(scale, 0)} y2={sy(scale, 0)} />
					{#each runPaths as r, i (i)}
						<path class="line" class:pos={r.sign > 0} class:neg={r.sign < 0} d={r.line} />
					{/each}
				{:else}
					<path class="area" d={area} />
					<path class="line" d={line} />
				{/if}

				{#if latest && active === null}
					<circle
						class="dot"
						class:pos={signed && latest[1] >= 0}
						class:neg={signed && latest[1] < 0}
						cx={sx(scale, t1)}
						cy={sy(scale, latest[1])}
						r="4"
					/>
				{/if}
				{#each runs.crossings as tc (tc)}
					{@const cx = sx(scale, tc)}
					<circle class="crossing" {cx} cy={sy(scale, 0)} r="5" />
					<text class="crossing-label" x={cx} y={sy(scale, 0) - 10} text-anchor={labelAnchor(cx)}>
						{crossingLabel} · {dateLabel(dayOf(tc))}
					</text>
				{/each}
				{#if activePoint && active !== null}
					<line class="crosshair" x1={tipLeft} x2={tipLeft} y1={M.top} y2={M.top + innerH} />
					<circle
						class="dot"
						class:pos={signed && activePoint[1] >= 0}
						class:neg={signed && activePoint[1] < 0}
						cx={tipLeft}
						cy={sy(scale, activePoint[1])}
						r="4"
					/>
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
		--good: #0ca30c;
		--bad: #d03b3b;
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

	.line.pos,
	.area.pos,
	.dot.pos {
		stroke: var(--good);
		fill: var(--good);
	}

	.line.neg,
	.area.neg,
	.dot.neg {
		stroke: var(--bad);
		fill: var(--bad);
	}

	.line.pos,
	.line.neg {
		fill: none;
	}

	.area.pos,
	.area.neg {
		stroke: none;
	}

	.dot.pos,
	.dot.neg {
		stroke: var(--surface);
	}

	.zero {
		stroke: var(--ink-2);
		stroke-width: 1.25;
	}

	.crossing {
		fill: var(--ink);
		stroke: var(--surface);
		stroke-width: 2;
	}

	.crossing-label {
		fill: var(--ink);
		font-size: 11px;
		font-weight: 600;
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 3px;
	}

	.scale-toggle {
		display: inline-flex;
		margin-left: auto;
		border: 1px solid rgba(11, 11, 11, 0.15);
		border-radius: 6px;
		overflow: hidden;
	}

	.scale-toggle button {
		padding: 0.15rem 0.55rem;
		background: #fff;
		border: none;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.scale-toggle button + button {
		border-left: 1px solid rgba(11, 11, 11, 0.15);
	}

	.scale-toggle button.on {
		background: var(--ink);
		color: #fff;
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
		width: 14px;
		height: 2px;
		border-radius: 1px;
	}

	.swatch.pos {
		background: var(--good);
	}

	.swatch.neg {
		background: var(--bad);
	}

	.ring {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ink);
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
