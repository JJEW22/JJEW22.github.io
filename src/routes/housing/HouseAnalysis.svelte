<!-- src/routes/housing/HouseAnalysis.svelte -->
<!--
	The buy-vs-rent cost analysis for one house, laid out like the "Buy vs Rent
	analysis" sheet: the cost lines with yearly / monthly / per-person /
	per-bedroom columns,
	then year by year what owning has cost against what renting would have. All
	the math is analyze() in $lib/housing; this only collects the assumptions and
	shows the result.

	Editing an input recomputes immediately. Saving stores the assumptions on the
	house, where every admin sees them.
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import LineChart from './LineChart.svelte';
	import {
		ASSUMPTION_LABELS,
		DEFAULT_ASSUMPTIONS,
		analyze,
		compact,
		formatDollars,
		houseAssumptions,
		houseDefaults,
		monthsFromNow,
		taxJurisdiction,
		type Assumptions,
		type House
	} from '$lib/housing';

	export let house: House;
	export let price: number;
	// Today's 30-year rate from FRED, the default for a house with nothing saved.
	export let marketRate: number | null = null;
	export let busy = false;

	const dispatch = createEventDispatcher<{ save: Partial<Assumptions> | null }>();

	interface Field {
		key: keyof Assumptions;
		label: string;
		step?: number;
		hint?: string;
	}

	const GROUPS: { title: string; fields: Field[] }[] = [
		{
			title: 'Loan',
			fields: [
				{ key: 'downPct', label: 'Down payment %', step: 0.5 },
				{ key: 'ratePct', label: 'Interest rate %', step: 0.05 },
				{ key: 'termYears', label: 'Term (years)', step: 1 },
				{ key: 'pmiPct', label: 'PMI % / yr', step: 0.05, hint: 'only under 20% down' }
			]
		},
		{
			title: 'Ongoing costs',
			fields: [
				{ key: 'taxPct', label: 'Property tax % / yr', step: 0.01 },
				{
					key: 'taxExemption',
					label: 'Tax exemption $ / yr',
					step: 100,
					hint: 'owner-occupied'
				},
				{ key: 'insurancePct', label: 'Insurance % / yr', step: 0.01 },
				{ key: 'upkeepPct', label: 'Upkeep % / yr', step: 0.05 },
				{ key: 'hoaMonthly', label: 'HOA $ / mo', step: 25 },
				{ key: 'utilitiesMonthly', label: 'Extra utilities $ / mo', step: 25 }
			]
		},
		{
			title: 'One-time',
			fields: [
				{ key: 'closingCosts', label: 'Closing costs $', step: 500 },
				{ key: 'renoCosts', label: 'Renovation $', step: 1000 },
				{ key: 'renoRoiPct', label: 'Renovation value kept %', step: 5 },
				{ key: 'sellingPct', label: 'Selling fees %', step: 0.5 }
			]
		},
		{
			title: 'Renting instead',
			fields: [
				{ key: 'rent', label: 'Rent $ / mo per person', step: 25 },
				{ key: 'rentGrowthPct', label: 'Rent growth % / yr', step: 0.1 },
				{ key: 'investReturnPct', label: 'Investment return % / yr', step: 0.1 }
			]
		},
		{
			title: 'Bedrooms',
			fields: [
				{ key: 'bedrooms', label: 'Bedrooms', step: 1 },
				{ key: 'people', label: 'People splitting costs', step: 1, hint: 'one bedroom each' },
				{ key: 'roomRent', label: 'Rent per bedroom $ / mo', step: 25, hint: 'for the rest' },
				{ key: 'rentalIncome', label: 'Other rental income $ / mo', step: 50, hint: 'a unit' }
			]
		},
		{
			title: 'The house',
			fields: [
				{ key: 'appreciationPct', label: 'Appreciation % / yr', step: 0.1 },
				{ key: 'horizonYears', label: 'Years to model', step: 1 }
			]
		}
	];

	let a: Assumptions = houseAssumptions(house, marketRate);
	// A house and the figures its defaults came from (bedrooms, price, the
	// RentCast lookup). Changing any of them re-seeds the inputs, so a corrected
	// bedroom count or a fresh rent estimate shows up at once.
	const keyOf = (h: House) => `${h.id}:${h.beds}:${h.price}:${h.rentcast?.lookedUpAt ?? ''}`;
	let loadedFor = keyOf(house);

	// Switching houses swaps in that house's saved assumptions.
	$: if (keyOf(house) !== loadedFor) {
		loadedFor = keyOf(house);
		a = houseAssumptions(house, marketRate);
	}

	// An emptied input binds as null; fall back to the default so one blank
	// field doesn't turn every number into NaN.
	$: clean = Object.fromEntries(
		Object.entries(a).map(([k, v]) => [
			k,
			typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_ASSUMPTIONS[k as keyof Assumptions]
		])
	) as unknown as Assumptions;

	$: city = taxJurisdiction(house.address);
	// The city's tax figures get their own sentence in the note, so they're
	// left out of this list.
	$: fromHouse = Object.keys(houseDefaults(house))
		.filter((k) => !city || (k !== 'taxPct' && k !== 'taxExemption'))
		.map((k) => ASSUMPTION_LABELS[k as keyof Assumptions] ?? k);
	$: result = analyze(price, clean);
	$: firstYear = result.effectiveRent[0] ?? null;
	$: effectiveByYear = new Map(result.effectiveRent.map((e) => [e.year, e.pct]));
	$: people = result.people;
	$: bedrooms = result.bedrooms;
	// Per-bedroom figures leave out rental income: what each bedroom costs before
	// any rent comes in from the others, to set against the rent per bedroom.
	$: gross = result.lines.filter((l) => l.monthly > 0).reduce((t, l) => t + l.monthly, 0);
	$: grossNonEquity =
		gross - (result.lines.find((l) => l.label === 'Mortgage principal')?.monthly ?? 0);
	$: last = result.rows.at(-1);
	$: yearly = result.rows.filter((r) => r.month % 12 === 0);
	$: dirty = JSON.stringify(clean) !== JSON.stringify(houseAssumptions(house, marketRate));

	// "Bedrooms, people splitting and tax rate": a list that reads as a sentence.
	function sentenceList(labels: string[]): string {
		const words = labels.map((l, i) => (i ? l.toLowerCase() : l));
		return words.length > 1
			? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
			: words.join('');
	}

	function advantageAt(rows: typeof result.rows, years: number): number | null {
		return rows[years * 12 - 1]?.advantage ?? null;
	}

	function ahead(v: number | null): string {
		if (v === null) return '—';
		return v >= 0 ? `Buying +${formatDollars(v)}` : `Renting +${formatDollars(-v)}`;
	}

	function months(m: number): string {
		const y = Math.floor(m / 12);
		const r = m % 12;
		return [y ? `${y} yr` : '', r ? `${r} mo` : ''].filter(Boolean).join(' ');
	}
</script>

<section class="analysis">
	<h3>Cost analysis</h3>

	<div class="groups">
		{#each GROUPS as g (g.title)}
			<fieldset>
				<legend>{g.title}</legend>
				{#each g.fields as f (f.key)}
					<label>
						<span
							>{f.label}{#if f.hint}<em> · {f.hint}</em>{/if}</span
						>
						<input type="number" step={f.step ?? 'any'} min="0" bind:value={a[f.key]} />
					</label>
				{/each}
			</fieldset>
		{/each}
	</div>

	<p class="note">
		{people}
		{people === 1 ? 'person' : 'people'} splitting {bedrooms === 1
			? 'the bedroom'
			: `${bedrooms} bedrooms`}{result.roomsRented
			? `, renting the other ${result.roomsRented} at ${formatDollars(clean.roomRent)}`
			: ''}.
		{#if city}
			Tax rate and residential exemption are {city.name}'s {city.fiscalYear} figures ({city.ratePct}%,
			{formatDollars(city.exemption)} off a year for an owner-occupant).
		{/if}
		{#if fromHouse.length}
			{sentenceList(fromHouse)} start from this house's details{house.rentcast
				? ' and RentCast'
				: ''}{house.assumptions ? ', unless saved assumptions say otherwise' : ''}.
		{/if}
	</p>

	<div class="actions">
		<button type="button" on:click={() => dispatch('save', clean)} disabled={busy}>
			Save assumptions for this house
		</button>
		{#if house.assumptions}
			<button
				type="button"
				class="secondary"
				on:click={() => dispatch('save', null)}
				disabled={busy}
			>
				Reset to defaults
			</button>
		{/if}
		{#if dirty}<span class="unsaved">Unsaved changes</span>{/if}
	</div>

	<div class="tiles">
		<div class="tile">
			<span class="label">Cash up front</span>
			<span class="value">{formatDollars(result.upfront)}</span>
			<span class="delta">
				down {formatDollars(result.price - result.loan)} + closing + renovation{people > 1
					? ` · ${formatDollars(result.upfront / people)} each`
					: ''}
			</span>
		</div>
		<div class="tile">
			<span class="label">Monthly cost per person</span>
			<span class="value">{formatDollars(result.totalMonthly / people)}</span>
			<span class="delta">
				{formatDollars(result.nonEquityMonthly / people)} of it doesn't build equity
			</span>
		</div>
		<div class="tile">
			<span class="label">Monthly cost per bedroom</span>
			<span class="value">{formatDollars(gross / bedrooms)}</span>
			<span class="delta">
				before rent from other rooms · rent per bedroom {formatDollars(clean.roomRent)}
			</span>
		</div>
		<div class="tile">
			<span class="label">Effective rent</span>
			<span class="value">{firstYear ? `${firstYear.pct.toFixed(2)}% / yr` : '—'}</span>
			<span class="delta">
				{firstYear ? formatDollars(firstYear.lost) : '—'} lost in year one, of the home's value · renting
				the whole place: {result.rentToPricePct.toFixed(2)}%
			</span>
		</div>
		<div class="tile">
			<span class="label">Rent instead</span>
			<span class="value">{formatDollars(clean.rent)}</span>
			<span class="delta">per person, month one</span>
		</div>
		<div class="tile">
			<span class="label">Buying pulls ahead after</span>
			<span class="value">{result.breakEvenMonth ? months(result.breakEvenMonth) : 'never'}</span>
			<span class="delta">within {clean.horizonYears} years</span>
		</div>
		<div class="tile">
			<span class="label">After {clean.horizonYears} years</span>
			<span class="value">{ahead(last?.advantage ?? null)}</span>
			<span class="delta"
				>5 yr: {ahead(advantageAt(result.rows, 5))} · 10 yr: {ahead(
					advantageAt(result.rows, 10)
				)}</span
			>
		</div>
	</div>

	<h4>Monthly costs, month one</h4>
	<div class="table-wrap">
		<table class="lines">
			<thead>
				<tr>
					<th>Cost</th>
					<th>Rate</th>
					<th>Yearly</th>
					<th>Monthly</th>
					<th>Per person</th>
					<th>Per bedroom</th>
				</tr>
			</thead>
			<tbody>
				{#each result.lines.filter((l) => l.monthly !== 0) as l (l.label)}
					<tr>
						<td>{l.label}</td>
						<td class="muted">{l.rate}</td>
						<td>{formatDollars(l.monthly * 12)}</td>
						<td>{formatDollars(l.monthly)}</td>
						<td>{formatDollars(l.monthly / people)}</td>
						<td>{l.monthly > 0 ? formatDollars(l.monthly / bedrooms) : '—'}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<th>Total</th>
					<td></td>
					<td>{formatDollars(result.totalMonthly * 12)}</td>
					<td>{formatDollars(result.totalMonthly)}</td>
					<td>{formatDollars(result.totalMonthly / people)}</td>
					<td>{formatDollars(gross / bedrooms)}</td>
				</tr>
				<tr>
					<th>Excluding principal</th>
					<td class="muted">doesn't come back</td>
					<td>{formatDollars(result.nonEquityMonthly * 12)}</td>
					<td>{formatDollars(result.nonEquityMonthly)}</td>
					<td>{formatDollars(result.nonEquityMonthly / people)}</td>
					<td>{formatDollars(grossNonEquity / bedrooms)}</td>
				</tr>
			</tfoot>
		</table>
	</div>
	<p class="note">
		Loan: {formatDollars(result.loan)} at {clean.ratePct}% for {clean.termYears} years =
		{formatDollars(result.payment)}/mo, from P·r(1+r)ⁿ / ((1+r)ⁿ − 1).
	</p>

	<div class="chart">
		<LineChart
			title="How far ahead buying is"
			subtitle="Per person. Above zero, buying beats renting and investing the difference; below, renting wins."
			points={monthsFromNow(result.rows, (r) => r.advantage)}
			format={(v) => ahead(v)}
			tick={(v) => compact(v, '$')}
			signed
			log
			logToggle
			crossingLabel="Break-even"
			positiveLabel="Buying is better"
			negativeLabel="Renting is better"
		/>
	</div>

	<h4>Year by year, per person</h4>
	<p class="note">
		Cost of owning = cash put in − equity if sold that month + what that cash would have earned
		invested. Cost of renting = rent paid.
	</p>
	<div class="table-wrap tall">
		<table>
			<thead>
				<tr>
					<th>Year</th>
					<th>Home value</th>
					<th>Loan left</th>
					<th>Equity if sold</th>
					<th>Rent / mo</th>
					<th>Non-equity spent</th>
					<th>Forgone returns</th>
					<th>Cost of owning</th>
					<th>Cost of renting</th>
					<th>Buying ahead by</th>
					<th title="That year's lost costs ÷ the home's value at its start">Effective rent</th>
				</tr>
			</thead>
			<tbody>
				{#each yearly as r (r.month)}
					<tr>
						<td>{r.month / 12}</td>
						<td>{formatDollars(r.homeValue)}</td>
						<td>{formatDollars(r.balance)}</td>
						<td>{formatDollars(r.equity)}</td>
						<td>{formatDollars(r.rent)}</td>
						<td>{formatDollars(r.cumNonEquity)}</td>
						<td>{formatDollars(r.opportunityCost)}</td>
						<td>{formatDollars(r.ownCost)}</td>
						<td>{formatDollars(r.rentCost)}</td>
						<td class:good={r.advantage >= 0} class:bad={r.advantage < 0}>
							{r.advantage >= 0 ? '' : '−'}{formatDollars(Math.abs(r.advantage))}
						</td>
						<td>{effectiveByYear.get(r.month / 12)?.toFixed(2) ?? '—'}%</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.analysis {
		margin-top: 1.5rem;
	}

	h3 {
		margin: 0 0 1rem;
		font-size: 1.15rem;
		color: #333;
	}

	h4 {
		margin: 1.75rem 0 0.75rem;
		font-size: 1rem;
		color: #333;
	}

	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.85rem;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0.75rem 0.9rem 0.9rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		min-width: 0;
	}

	legend {
		padding: 0 0.3rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #333;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	label span {
		font-size: 0.78rem;
		color: #666;
	}

	label em {
		font-style: normal;
		color: #898781;
	}

	input {
		padding: 0.4rem 0.5rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		min-width: 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin: 1rem 0 1.5rem;
	}

	button {
		padding: 0.5rem 1rem;
		background: #0066cc;
		border: none;
		border-radius: 6px;
		color: #fff;
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
	}

	button.secondary {
		background: #fff;
		border: 1px solid #d5dae1;
		color: #333;
	}

	button:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.unsaved {
		font-size: 0.85rem;
		color: #8a5a00;
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
		font-size: 1.35rem;
		font-weight: 600;
		color: #0b0b0b;
	}

	.tile .delta {
		font-size: 0.78rem;
		color: #898781;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.table-wrap.tall {
		max-height: 420px;
		overflow-y: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		padding: 0.35rem 0.6rem;
		border-bottom: 1px solid #e1e0d9;
		text-align: right;
		white-space: nowrap;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	thead th {
		position: sticky;
		top: 0;
		background: #fff;
		color: #52514e;
		font-weight: 600;
	}

	tfoot th,
	tfoot td {
		font-weight: 600;
		border-bottom: none;
	}

	.lines td.muted {
		text-align: left;
	}

	.muted {
		color: #898781;
	}

	.good {
		color: #006300;
	}

	.bad {
		color: #b42318;
	}

	.note {
		color: #666;
		font-size: 0.85rem;
	}

	.chart {
		margin-top: 1.5rem;
	}
</style>
