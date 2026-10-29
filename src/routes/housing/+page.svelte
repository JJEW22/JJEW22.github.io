<!-- src/routes/housing/+page.svelte -->
<!--
	Housing market data and the math on top of it. Hidden: nothing links here.

	Every page in this app is prerendered (see src/routes/+layout.js), so there is
	no server load to gate on. The page shell renders for anyone and shows a
	denied state; /housing/api/* is what requires housing:admin, so no data ever
	reaches someone without it. Same pattern as /snow/admin.

	Nothing is fetched from FRED, Zillow or Redfin on a page load. The data is
	whatever the last refresh stored: the button below, or the weekly workflow.
	The region starts on Greater Boston (Boston, Cambridge, Somerville and
	Brookline), led by its buyers and sellers.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import '../../app.css';
	import BalanceChart from './BalanceChart.svelte';
	import Houses from './Houses.svelte';
	import LineChart from './LineChart.svelte';
	import {
		FRED_SERIES,
		GREATER_BOSTON_CITIES,
		GREATER_BOSTON_ID,
		MORTGAGE_RATE_SERIES,
		US_REGION_ID,
		compact,
		formatDay,
		formatDollars,
		formatMonth,
		formatValue,
		lastYears,
		marketBalance,
		monthlyPayment,
		paymentSeries,
		priceToRent,
		sellerBuyerGapPct,
		yearOverYear,
		type BalanceSeries,
		type Point
	} from '$lib/housing';

	interface Region {
		id: string;
		name: string;
		state: string | null;
	}

	interface SyncStatus {
		source: 'fred' | 'zillow' | 'redfin';
		lastAttempt: { ok: boolean; detail: string; at: string } | null;
		lastSuccess: string | null;
	}

	const SOURCE_LABELS = { fred: 'FRED', zillow: 'Zillow Research', redfin: 'Redfin' };
	const RANGES = [
		{ years: 5, label: '5Y' },
		{ years: 10, label: '10Y' },
		{ years: 0, label: 'All' }
	];

	let status = 'loading'; // loading | denied | ready
	let error = '';
	let msg = '';
	let busy = false;
	let refreshing = false;

	let regions: Region[] = [];
	let regionId = GREATER_BOSTON_ID;
	let region: Region | null = null;
	let zhvi: Point[] = [];
	let zori: Point[] = [];
	let balance: BalanceSeries[] = [];
	let fred: Record<string, Point[]> = {};
	let syncs: SyncStatus[] = [];

	// summary | houses. Kept in the URL hash so a reload stays on the same tab.
	let tab = 'summary';

	let years = 10;
	let downPct = 20;

	onMount(() => {
		if (location.hash === '#houses') tab = 'houses';
		load();
	});

	function pickTab(t: string) {
		tab = t;
		history.replaceState(history.state, '', t === 'summary' ? location.pathname : `#${t}`);
	}

	async function load() {
		busy = true;
		error = '';
		try {
			const res = await fetch(`/housing/api/data?region=${encodeURIComponent(regionId)}`);
			if (res.status === 401 || res.status === 403) {
				status = 'denied';
				return;
			}
			if (!res.ok) throw new Error(String(res.status));
			const data = await res.json();
			regions = data.regions ?? [];
			region = data.region ?? null;
			// The server falls back to the US for a region it doesn't have yet
			// (Greater Boston before its first refresh); follow it.
			if (region) regionId = region.id;
			balance = data.balance ?? [];
			zhvi = data.zillow?.zhvi ?? [];
			zori = data.zillow?.zori ?? [];
			fred = data.fred ?? {};
			syncs = data.status ?? [];
			status = 'ready';
		} catch {
			error = 'Could not load the housing data.';
			// A failed load after a successful one keeps the last render.
			if (status === 'loading') status = 'ready';
		} finally {
			busy = false;
		}
	}

	async function refreshNow() {
		refreshing = true;
		msg = '';
		error = '';
		try {
			const res = await fetch('/housing/api/admin/refresh', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
			const data = await res.json().catch(() => null);
			if (!res.ok && !data?.results) {
				error = data?.error || data?.message || `Refresh failed (${res.status}).`;
				return;
			}
			const failed = (data.results as { source: string; ok: boolean; detail: string }[]).filter(
				(r) => !r.ok
			);
			if (failed.length) {
				error = failed.map((r) => `${r.source}: ${r.detail}`).join(' · ');
			} else {
				msg = 'Refreshed.';
			}
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			refreshing = false;
		}
	}

	function when(iso: string | null): string {
		if (!iso) return 'never';
		return new Date(iso).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function signed(pct: number | null): string {
		if (pct === null) return '';
		return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% vs a year ago`;
	}

	$: rates = fred[MORTGAGE_RATE_SERIES] ?? [];
	$: down = Number.isFinite(downPct) ? Math.min(Math.max(downPct, 0), 100) : 20;
	$: ratio = priceToRent(zhvi, zori);
	$: payments = paymentSeries(zhvi, rates, down);

	$: latestValue = zhvi.at(-1);
	$: latestRent = zori.at(-1);
	$: latestRatio = ratio.at(-1);
	$: latestRate = rates.at(-1);
	$: latestPayment =
		latestValue && latestRate
			? monthlyPayment(latestValue[1] * (1 - down / 100), latestRate[1])
			: null;
	// Payment as a share of the rent on the same typical place, which is the
	// buy-vs-rent comparison in one number (before taxes, insurance and upkeep).
	$: paymentVsRent = latestPayment && latestRent ? latestPayment / latestRent[1] : null;

	$: place = region ? (region.id === US_REGION_ID ? 'the US' : region.name) : 'this region';
	const cityList = GREATER_BOSTON_CITIES.map((c) => c.name).join(', ');

	// The latest month both lines have, for the tile.
	function latestBalance(b: BalanceSeries | undefined) {
		if (!b) return null;
		const sellers = new Map(b.sellers);
		const last = b.buyers.findLast(([day]) => sellers.has(day));
		return last ? { day: last[0], buyers: last[1], sellers: sellers.get(last[0]) ?? 0 } : null;
	}
	$: balanceNow = latestBalance(balance[0]);

	function balanceSubtitle(b: BalanceSeries): string {
		if (b.id === GREATER_BOSTON_ID) {
			return (
				`Estimated for ${cityList}. Sellers are their active listings; buyers are their ` +
				"pending sales times the Boston metro's buyers per pending sale, Redfin's own " +
				'formula. 3-month rolling, seasonally adjusted here.'
			);
		}
		return `Redfin's estimate for the ${b.name}, seasonally adjusted. Sellers are active listings; buyers are inferred from pending sales and how long buyers search.`;
	}
	$: noData = !zhvi.length && !Object.keys(fred).length;
</script>

<svelte:head>
	<title>Housing</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<main>
		{#if status === 'loading'}
			<p class="note">Checking…</p>
		{:else if status === 'denied'}
			<h1>Not available</h1>
			<p class="note">
				This page needs the <code>housing:admin</code> role. Sign in with an account that has it.
			</p>
		{:else}
			<h1>Housing market</h1>

			<div class="tabs page-tabs">
				<button
					type="button"
					class="tab"
					class:active={tab === 'summary'}
					on:click={() => pickTab('summary')}
				>
					Summary
				</button>
				<button
					type="button"
					class="tab"
					class:active={tab === 'houses'}
					on:click={() => pickTab('houses')}
				>
					Houses
				</button>
			</div>

			{#if tab === 'houses'}
				<Houses marketRate={latestRate ? latestRate[1] : null} />
			{:else}
				{#if msg}<p class="banner ok">{msg}</p>{/if}
				{#if error}<p class="banner bad">{error}</p>{/if}

				{#if noData}
					<section class="panel">
						<h2>No data yet</h2>
						<p class="note">Nothing has been pulled from FRED or Zillow yet. Refresh to load it.</p>
						<button type="button" on:click={refreshNow} disabled={refreshing}>
							{refreshing ? 'Refreshing… (this takes a little while)' : 'Refresh now'}
						</button>
					</section>
				{:else}
					<div class="filters" class:stale={busy}>
						<label>
							<span>Region</span>
							<select bind:value={regionId} on:change={load}>
								{#each regions as r (r.id)}
									<option value={r.id}>{r.name}</option>
								{/each}
							</select>
						</label>
						<div class="field">
							<span>Range</span>
							<div class="tabs">
								{#each RANGES as r (r.years)}
									<button
										type="button"
										class="tab"
										class:active={years === r.years}
										on:click={() => (years = r.years)}
									>
										{r.label}
									</button>
								{/each}
							</div>
						</div>
						<label class="narrow">
							<span>Down payment %</span>
							<input type="number" min="0" max="100" step="1" bind:value={downPct} />
						</label>
					</div>

					<div class="tiles" class:stale={busy}>
						<div class="tile">
							<span class="label">Buyers vs sellers</span>
							<span class="value"
								>{balanceNow ? marketBalance(balanceNow.buyers, balanceNow.sellers) : '—'}</span
							>
							<span class="delta">
								{#if balanceNow}
									{@const gap = sellerBuyerGapPct(balanceNow.buyers, balanceNow.sellers)}
									{Math.abs(gap).toFixed(0)}% {gap >= 0 ? 'more' : 'fewer'} sellers than buyers ·
									{formatMonth(balanceNow.day)}
								{:else}
									Redfin covers the US and the 50 biggest metros
								{/if}
							</span>
						</div>
						<div class="tile">
							<span class="label">Typical home value</span>
							<span class="value">{latestValue ? formatDollars(latestValue[1]) : '—'}</span>
							<span class="delta">{signed(yearOverYear(zhvi))}</span>
						</div>
						<div class="tile">
							<span class="label">Typical rent</span>
							<span class="value">{latestRent ? `${formatDollars(latestRent[1])}/mo` : '—'}</span>
							<span class="delta">{signed(yearOverYear(zori))}</span>
						</div>
						<div class="tile">
							<span class="label">Price-to-rent ratio</span>
							<span class="value">{latestRatio ? latestRatio[1].toFixed(1) : '—'}</span>
							<span class="delta">home value ÷ a year of rent</span>
						</div>
						<div class="tile">
							<span class="label">30-year fixed rate</span>
							<span class="value">{latestRate ? `${latestRate[1].toFixed(2)}%` : '—'}</span>
							<span class="delta">{latestRate ? `week of ${formatDay(latestRate[0])}` : ''}</span>
						</div>
						<div class="tile">
							<span class="label">Monthly payment</span>
							<span class="value">{latestPayment ? formatDollars(latestPayment) : '—'}</span>
							<span class="delta">
								{down}% down, principal + interest{paymentVsRent
									? ` · ${paymentVsRent.toFixed(2)}× rent`
									: ''}
							</span>
						</div>
					</div>

					<h2>{place}</h2>
					{#if region?.id === GREATER_BOSTON_ID}
						<p class="note place-note">
							{cityList} only. Home values and rents are the four cities' Zillow figures, weighted by
							their number of homes.
						</p>
					{/if}
					{#if balance.length}
						<div class="charts balance" class:stale={busy}>
							{#each balance as b (b.id)}
								<BalanceChart
									series={b}
									{years}
									title="Buyers vs sellers, {b.name}"
									subtitle={balanceSubtitle(b)}
								/>
							{/each}
						</div>
					{:else}
						<p class="note">
							Buyers vs sellers: Redfin publishes these for the US and the 50 biggest metros, and
							{region?.name ?? 'this region'} isn't one of them.
						</p>
					{/if}
					<div class="charts" class:stale={busy}>
						<LineChart
							title="Typical home value"
							subtitle="Zillow Home Value Index, mid-tier homes, seasonally adjusted"
							points={lastYears(zhvi, years)}
							format={formatDollars}
							tick={(v) => compact(v, '$')}
						/>
						<LineChart
							title="Typical rent"
							subtitle="Zillow Observed Rent Index, per month"
							points={lastYears(zori, years)}
							format={formatDollars}
							tick={(v) => compact(v, '$')}
						/>
						<LineChart
							title="Price-to-rent ratio"
							subtitle="Home value ÷ 12 months of rent. Higher means renting is cheaper relative to buying."
							points={lastYears(ratio, years)}
							format={(v) => v.toFixed(1)}
						/>
						<LineChart
							title="Monthly payment on the typical home"
							subtitle="{down}% down, 30-year fixed at that month's average rate. Principal and interest only."
							points={lastYears(payments, years)}
							format={formatDollars}
							tick={(v) => compact(v, '$')}
						/>
					</div>

					<h2>National indicators</h2>
					<div class="charts" class:stale={busy}>
						{#each FRED_SERIES as s (s.id)}
							<LineChart
								title={s.label}
								subtitle="{s.units} · FRED {s.id}"
								points={lastYears(fred[s.id] ?? [], years)}
								format={(v) => formatValue(v, s.format)}
								tick={(v) =>
									s.format === 'dollars'
										? compact(v, '$')
										: s.format === 'percent'
											? `${v}%`
											: compact(v)}
								dateLabel={s.id === MORTGAGE_RATE_SERIES ? formatDay : formatMonth}
							/>
						{/each}
					</div>
				{/if}

				<section class="panel sources">
					<h2>Data</h2>
					<table>
						<tbody>
							{#each syncs as s (s.source)}
								<tr>
									<th>{SOURCE_LABELS[s.source]}</th>
									<td>Last refreshed {when(s.lastSuccess)}</td>
									<td>
										{#if s.lastAttempt && !s.lastAttempt.ok}
											<span class="failed">Last attempt failed: {s.lastAttempt.detail}</span>
										{:else if s.lastAttempt}
											{s.lastAttempt.detail}
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<button type="button" on:click={refreshNow} disabled={refreshing}>
						{refreshing ? 'Refreshing… (this takes a little while)' : 'Force refresh'}
					</button>
					<p class="note attribution">
						Home value and rent data provided by Zillow Research (zillow.com/research/data). Buyers
						and sellers data from Redfin, a national real estate brokerage
						(redfin.com/news/data-center). National series from FRED, Federal Reserve Bank of St.
						Louis. Copyrighted FRED series (Case-Shiller, Freddie Mac rates) belong to their owners.
					</p>
				</section>
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

	main {
		background: white;
		border-radius: 12px;
		padding: 2.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	h1 {
		font-size: 2rem;
		margin: 0 0 1.5rem 0;
		color: #1a1a1a;
	}

	h2 {
		font-size: 1.2rem;
		margin: 2rem 0 1rem 0;
		color: #333;
	}

	.panel h2 {
		margin-top: 0;
	}

	code {
		padding: 0.1rem 0.35rem;
		background: #f3f4f6;
		border-radius: 4px;
		font-size: 0.9em;
	}

	.note {
		color: #666;
		font-size: 0.9rem;
	}

	.banner {
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.banner.ok {
		background: #ecfdf3;
		color: #006300;
	}

	.banner.bad {
		background: #fef2f2;
		color: #b42318;
	}

	.stale {
		opacity: 0.55;
		transition: opacity 0.15s;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	label,
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	label span,
	.field > span {
		font-size: 0.8rem;
		color: #666;
	}

	label.narrow input {
		width: 7rem;
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
		max-width: 100%;
	}

	.tabs {
		display: flex;
		gap: 0.4rem;
	}

	.page-tabs {
		margin: -0.5rem 0 1.5rem;
	}

	.tab {
		padding: 0.35rem 0.9rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		font: inherit;
		font-size: 0.9rem;
		color: #4b5563;
		cursor: pointer;
	}

	.tab:hover {
		border-color: #0066cc;
		color: #0066cc;
	}

	.tab.active {
		background: #0066cc;
		border-color: #0066cc;
		color: #fff;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 0.85rem;
	}

	.tile {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.9rem 1rem;
		background: #fcfcfb;
		border: 1px solid rgba(11, 11, 11, 0.1);
		border-radius: 10px;
	}

	.tile .label {
		font-size: 0.8rem;
		color: #52514e;
	}

	.tile .value {
		font-size: 1.5rem;
		font-weight: 600;
		color: #0b0b0b;
	}

	.tile .delta {
		font-size: 0.78rem;
		color: #898781;
	}

	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
		gap: 1rem;
	}

	.charts.balance {
		margin-bottom: 1rem;
	}

	.place-note {
		margin: -0.5rem 0 1rem;
	}

	.panel {
		margin-top: 2.5rem;
		padding: 1.25rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
	}

	.sources table {
		width: 100%;
		margin-bottom: 1rem;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.sources th,
	.sources td {
		padding: 0.35rem 0.75rem 0.35rem 0;
		text-align: left;
		vertical-align: top;
	}

	.sources th {
		white-space: nowrap;
	}

	.failed {
		color: #b42318;
	}

	button:not(.tab) {
		padding: 0.5rem 1rem;
		background: #0066cc;
		border: none;
		border-radius: 6px;
		color: #fff;
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.attribution {
		margin-bottom: 0;
		font-size: 0.8rem;
	}

	@media (max-width: 768px) {
		.container {
			padding: 0;
		}

		main {
			padding: 1.25rem 1rem;
			border-radius: 0;
		}

		.sources td {
			display: block;
		}
	}
</style>
