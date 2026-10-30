<script>
	// Entering one match's result. Shown inline, under the game it is for, in the
	// Games Finder and the admin fixture list; the page owns the request.
	//
	// Seeded from whatever is already on the match, so correcting a pending score
	// does not mean retyping it. Each open is a fresh instance, so the seeding
	// happens once. A game saved part-way through reopens where it was left.
	import { createEventDispatcher, tick } from 'svelte';
	import { ROUNDS_PER_GAME, roundEntered } from '$lib/jpFlicks';

	/** @type {import('$lib/jpFlicks').Match} */
	export let match;
	/** @type {Map<number, string>} */
	export let teamNameById;
	export let title = '';
	export let byRounds = false;
	export let isAdmin = false;
	export let busy = false;
	export let error = '';

	const dispatch = createEventDispatcher();

	// A rejected score brings its error into view. Only the form that was sent
	// does, since an admin can have the same match open in two lists.
	/** @type {HTMLElement | undefined} */
	let banner;
	let sent = false;
	$: if (error && sent) showError();

	async function showError() {
		await tick();
		banner?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	const played = byRounds ? 'rounds' : 'margin';
	let kind = match.forfeitBy !== null ? 'forfeit' : played; // margin | rounds | forfeit
	let margin =
		match.forfeitBy === null && match.margin !== null ? String(Math.abs(match.margin)) : '';
	let winner =
		match.forfeitBy === null && match.margin !== null
			? String(match.margin >= 0 ? match.teamA : match.teamB)
			: '';
	let forfeitBy = match.forfeitBy === null ? '' : String(match.forfeitBy);
	/** @type {string[][]} [team_a, team_b] per round, as typed */
	let rounds = match.rounds
		? match.rounds.map((r) => r.map((v) => (v === null ? '' : String(v))))
		: Array.from({ length: ROUNDS_PER_GAME }, () => ['', '']);
	let shootout = match.shootoutWinner === null ? '' : String(match.shootoutWinner);

	$: nameA = teamNameById.get(match.teamA);
	$: nameB = teamNameById.get(match.teamB);
	// A blank box counts as 0 in the running totals.
	$: totals = rounds.reduce(
		(sum, [a, b]) => [sum[0] + (Number(a) || 0), sum[1] + (Number(b) || 0)],
		[0, 0]
	);
	// Every round entered and the totals equal: a 20s shootout decides it.
	$: level = rounds.every(([a, b]) => roundEntered([box(a), box(b)])) && totals[0] === totals[1];

	/** @param {string} v */
	function box(v) {
		const s = String(v).trim();
		return s === '' ? null : Number(s);
	}

	/** @param {boolean} partial save the rounds so far rather than send the result */
	function submit(partial) {
		sent = true;
		dispatch('submit', {
			matchId: match.id,
			kind,
			margin,
			winner,
			forfeitBy,
			rounds,
			shootoutWinner: shootout,
			partial
		});
	}
</script>

<div class="result-form">
	{#if title}<h3>{title}</h3>{/if}
	{#if error}<p class="result-banner bad" bind:this={banner}>{error}</p>{/if}

	<div class="kind-toggle">
		<label>
			<input type="radio" bind:group={kind} value={played} />
			<span>Played</span>
		</label>
		<label>
			<input type="radio" bind:group={kind} value="forfeit" />
			<span>Forfeit</span>
		</label>
	</div>

	{#if kind === 'rounds'}
		<table class="rounds-entry">
			<thead>
				<tr>
					<th scope="col">Round</th>
					<th scope="col">{nameA}</th>
					<th scope="col">{nameB}</th>
				</tr>
			</thead>
			<tbody>
				{#each rounds as round, i (i)}
					<tr>
						<th scope="row">{i + 1}</th>
						<td>
							<input
								bind:value={round[0]}
								inputmode="numeric"
								aria-label="Round {i + 1}, {nameA}"
							/>
						</td>
						<td>
							<input
								bind:value={round[1]}
								inputmode="numeric"
								aria-label="Round {i + 1}, {nameB}"
							/>
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<th scope="row">Total</th>
					<td>{totals[0]}</td>
					<td>{totals[1]}</td>
				</tr>
			</tfoot>
		</table>
		{#if level}
			<div class="form-row shootout">
				<label>
					<span>Level on points. Who won the 20s shootout?</span>
					<select bind:value={shootout}>
						<option value="">— pick a team —</option>
						<option value={String(match.teamA)}>{nameA}</option>
						<option value={String(match.teamB)}>{nameB}</option>
					</select>
				</label>
			</div>
		{/if}
		<p class="result-note small">
			Each team's points in each of the {ROUNDS_PER_GAME} rounds. When only one team scores, the other's
			box can stay blank; a 0-0 round needs 0 in both. A level round is a draw; a level game goes to
			a 20s shootout. Mid-game? Save progress and finish it later.
		</p>
	{:else if kind === 'margin'}
		<div class="form-row">
			<label>
				<span>Winner</span>
				<select bind:value={winner}>
					<option value="">— tie —</option>
					<option value={String(match.teamA)}>{nameA}</option>
					<option value={String(match.teamB)}>{nameB}</option>
				</select>
			</label>
			<label>
				<span>Won by</span>
				<input bind:value={margin} inputmode="numeric" placeholder="55" />
			</label>
		</div>
		<p class="result-note small">The margin, not the total — enter 0 for a tie.</p>
	{:else}
		<div class="form-row">
			<label>
				<span>Who forfeited</span>
				<select bind:value={forfeitBy}>
					<option value="">— pick a team —</option>
					<option value={String(match.teamA)}>{nameA}</option>
					<option value={String(match.teamB)}>{nameB}</option>
				</select>
			</label>
		</div>
	{/if}

	<div class="form-actions">
		<button type="button" class="primary" disabled={busy} on:click={() => submit(false)}>
			{isAdmin ? 'Record it' : 'Send for approval'}
		</button>
		{#if kind === 'rounds'}
			<button type="button" disabled={busy} on:click={() => submit(true)}>Save progress</button>
		{/if}
		<button type="button" disabled={busy} on:click={() => dispatch('cancel')}>Cancel</button>
	</div>

	{#if !isAdmin}
		<p class="result-note small">This goes to the other team to confirm before it counts.</p>
	{/if}
</div>

<style>
	.result-form {
		padding: 1.1rem;
		background: #fdfaf5;
		border: 1px solid #e8dfd3;
		border-radius: 10px;
		text-align: left;
	}

	.result-form h3 {
		margin: 0 0 0.75rem;
		font-size: 1.05rem;
		color: #4a3a2a;
	}

	.result-form button {
		padding: 0.3rem 0.7rem;
		background: #fff;
		border: 1px solid #d9cdbf;
		border-radius: 6px;
		font: inherit;
		font-size: 0.85rem;
		color: #4a3a2a;
		cursor: pointer;
	}

	.result-form button:hover:not(:disabled) {
		border-color: #8a6a4a;
	}

	.result-form button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.result-form .primary {
		background: #6b5844;
		border-color: #6b5844;
		color: #fff;
	}

	.result-form .primary:hover:not(:disabled) {
		background: #4a3a2a;
	}

	.kind-toggle {
		display: flex;
		gap: 1rem;
		margin-bottom: 0.9rem;
	}

	.kind-toggle label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.9rem;
		color: #4a3a2a;
		cursor: pointer;
	}

	.form-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
	}

	.form-row.shootout {
		margin-top: 0.75rem;
	}

	.form-row label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.form-row label span {
		font-size: 0.8rem;
		color: #8a7a68;
	}

	.form-row input,
	.form-row select {
		padding: 0.4rem 0.55rem;
		background: #fff;
		border: 1px solid #d9cdbf;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		min-width: 0;
	}

	.form-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	/* The page styles every th/td for the standings; none of that belongs here. */
	.rounds-entry {
		border-collapse: collapse;
		width: 100%;
		max-width: 26rem;
		table-layout: fixed;
		box-shadow: none;
		background: none;
	}

	.rounds-entry th,
	.rounds-entry td {
		display: table-cell;
		padding: 0.25rem 0.35rem;
		background: none;
		border: none;
		color: #4a3a2a;
		text-align: center;
		text-transform: none;
		letter-spacing: normal;
		white-space: normal;
	}

	.rounds-entry tr {
		display: table-row;
		background: none;
		border: none;
	}

	.rounds-entry thead th {
		font-size: 0.8rem;
		font-weight: 600;
		color: #8a7a68;
		overflow-wrap: anywhere;
	}

	.rounds-entry th[scope='row'] {
		width: 4.5rem;
		font-size: 0.85rem;
		font-weight: 500;
		text-align: left;
	}

	.rounds-entry input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.4rem 0.55rem;
		background: #fff;
		border: 1px solid #d9cdbf;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		text-align: center;
	}

	.rounds-entry tfoot td {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		border-top: 1px solid #e8dfd3;
	}

	.result-banner {
		margin: 0 0 0.9rem 0;
		padding: 0.6rem 0.85rem;
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.result-banner.bad {
		background: #fdeeee;
		color: #9a2c2c;
	}

	.result-note.small {
		margin: 0.5rem 0;
		font-size: 0.82rem;
		color: #9a8d7d;
	}

	@media (max-width: 640px) {
		.form-row label {
			width: 100%;
		}
	}
</style>
