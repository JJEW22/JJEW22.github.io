<!-- src/routes/pizzaBracket/admin/+page.svelte -->
<!--
	Replaces pizzaBracketRatings.xlsx. One tab per round, voters down the side and
	one column per pizza, which is the shape the workbook had and the shape the
	tasting actually happens in.

	Every page in this app is prerendered (see src/routes/+layout.js), so there is
	no server load to gate on: the page renders for anyone and shows a denied state,
	while /pizzaBracket/api/admin/* is what actually enforces the role. Same pattern
	as /admin.

	Winners are previewed in the browser from $lib/pizzaScoring — the same module the
	server scores with — so you can see what a rating does before saving it.
-->
<script>
	import { onMount } from 'svelte';
	import { scoreMatch } from '$lib/pizzaScoring';

	const API = '/pizzaBracket/api/admin';

	let status = 'loading'; // loading | denied | ready | empty
	let state = null;
	let activeRound = 0;
	let msg = '';
	let busy = false;

	// Unsaved cells: "matchId:teamId:voterId" -> number | null. Kept separate from
	// state.ratings so a failed save doesn't lose what was typed.
	let edits = {};
	let newVoter = '';

	onMount(async () => {
		const me = await fetch('/api/auth/me')
			.then((r) => r.json())
			.catch(() => ({ roles: [] }));
		const roles = me.roles || [];
		if (!me.user || !(roles.includes('site:admin') || roles.includes('pizza:admin'))) {
			status = 'denied';
			return;
		}
		await load();
	});

	async function load() {
		const r = await fetch(`${API}/state`);
		const data = await r.json().catch(() => null);
		if (!r.ok) {
			msg = data?.message || data?.error || `Could not load the bracket (${r.status}).`;
			status = r.status === 404 ? 'empty' : 'denied';
			return;
		}
		state = data.state;
		status = 'ready';
	}

	// ---------- cells ----------

	const cellKey = (matchId, teamId, voterId) => `${matchId}:${teamId}:${voterId}`;

	function storedValue(match, teamId, voterId) {
		const v = match.ratings?.[String(teamId)]?.[String(voterId)];
		return v === undefined ? null : Number(v);
	}

	function cellValue(match, teamId, voterId) {
		const key = cellKey(match.id, teamId, voterId);
		return key in edits ? edits[key] : storedValue(match, teamId, voterId);
	}

	function setCell(match, teamId, voterId, raw) {
		const key = cellKey(match.id, teamId, voterId);
		// An empty cell is not a zero: it means this person didn't try that pizza,
		// and the scoring counts only voters who rated both sides of a matchup.
		const value = raw === '' || raw === null ? null : Number(raw);
		const next = { ...edits };
		if (value === storedValue(match, teamId, voterId)) delete next[key];
		else next[key] = value;
		edits = next;
	}

	function cellInvalid(value) {
		return value !== null && (!Number.isFinite(value) || value < 0 || value > 5);
	}

	$: dirtyKeys = Object.keys(edits);
	$: invalidCount = Object.values(edits).filter(cellInvalid).length;

	// ---------- live preview ----------

	// What one pizza scored in one match, unsaved cells included.
	function ratingsFor(match, teamId, voters, pending) {
		const out = {};
		for (const voter of voters) {
			const key = cellKey(match.id, teamId, voter.id);
			const value = key in pending ? pending[key] : storedValue(match, teamId, voter.id);
			if (value !== null && Number.isFinite(value)) out[voter.id] = value;
		}
		return out;
	}

	// Recomputed whenever a cell changes, so the winner shown is the winner the
	// server would compute from what is currently on screen.
	function buildPreviews(current, pending) {
		const out = {};
		if (!current) return out;
		for (const round of current.rounds) {
			for (const match of round.matches) {
				if (!match.ready) continue;
				const entrants = match.slots.map((s) => ({
					teamId: s.teamId,
					ratings: ratingsFor(match, s.teamId, current.voters, pending)
				}));
				out[match.id] = scoreMatch(match.kind, entrants);
			}
		}
		return out;
	}

	$: previews = buildPreviews(state, edits);

	function previewFor(match, teamId) {
		return previews[match.id]?.results?.find((r) => r.teamId === teamId) ?? null;
	}

	function teamName(id) {
		return state?.teams.find((t) => t.id === id)?.name ?? 'TBD';
	}

	// What the bracket will show: an override wins, otherwise the ratings decide.
	function effectiveWinner(match) {
		if (match.overridden) return match.winnerTeamId;
		return previews[match.id]?.winnerTeamId ?? null;
	}

	// ---------- saving ----------

	async function post(path, body) {
		msg = '';
		busy = true;
		try {
			const r = await fetch(`${API}/${path}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = await r.json().catch(() => null);
			if (!r.ok || data?.ok === false) {
				msg = data?.message || data?.error || `Request failed (${r.status}).`;
				return null;
			}
			state = data.state;
			return data;
		} catch (err) {
			msg = `Request failed: ${err.message}`;
			return null;
		} finally {
			busy = false;
		}
	}

	async function saveRatings() {
		if (invalidCount) {
			msg = 'Some ratings are outside 0-5. Fix those first.';
			return;
		}
		const changes = dirtyKeys.map((key) => {
			const [matchId, teamId, voterId] = key.split(':').map(Number);
			return { matchId, teamId, voterId, rating: edits[key] };
		});
		if (!changes.length) return;

		const data = await post('ratings', { changes });
		if (!data) return;
		edits = {};
		msg = `Saved ${data.saved} rating${data.saved === 1 ? '' : 's'}${
			data.cleared ? `, cleared ${data.cleared}` : ''
		}.`;
	}

	function discard() {
		edits = {};
		msg = 'Unsaved changes discarded.';
	}

	async function setOverride(match, value) {
		const winnerTeamId = value === '' ? null : Number(value);
		const data = await post('match', { matchId: match.id, winnerTeamId, note: match.overrideNote });
		if (data) msg = winnerTeamId === null ? 'Override cleared.' : 'Winner overridden.';
	}

	// The note belongs to the override, so never let editing it create one.
	async function saveNote(match, note) {
		if (!match.overridden) return;
		await post('match', { matchId: match.id, winnerTeamId: match.winnerTeamId, note });
	}

	async function renameTeam(teamId, name) {
		if (!name.trim() || name === teamName(teamId)) return;
		const data = await post('team', { teamId, name });
		if (data) msg = `Renamed to "${name.trim()}".`;
	}

	async function addVoter() {
		if (!newVoter.trim()) return;
		const data = await post('voter', { action: 'add', name: newVoter });
		if (data) {
			msg = `Added ${newVoter.trim()}.`;
			newVoter = '';
		}
	}

	async function renameVoter(voter, name) {
		if (!name.trim() || name === voter.name) return;
		await post('voter', { action: 'rename', voterId: voter.id, name });
	}

	async function removeVoter(voter) {
		const count = ratingsByVoter[voter.id] || 0;
		const warning = count
			? `Remove ${voter.name}? Their ${count} rating${count === 1 ? '' : 's'} go too, which can change a winner.`
			: `Remove ${voter.name}?`;
		if (!confirm(warning)) return;
		const data = await post('voter', { action: 'remove', voterId: voter.id });
		if (data) msg = `Removed ${voter.name}.`;
	}

	// ---------- derived views ----------

	$: rounds = state?.rounds ?? [];
	$: round = rounds[activeRound] ?? null;
	// Only matchups with everyone in them can be rated; the rest are waiting on an
	// earlier result, not on votes.
	$: readyMatches = round ? round.matches.filter((m) => m.ready) : [];
	$: waitingMatches = round ? round.matches.filter((m) => !m.ready) : [];

	// One column per pizza, matches side by side, in bracket order.
	$: columns = readyMatches.flatMap((match) =>
		match.slots.map((slot, i) => ({ match, slot, first: i === 0, span: match.slots.length }))
	);

	$: ratingsByVoter = (() => {
		const counts = {};
		for (const r of rounds) {
			for (const m of r.matches) {
				for (const byVoter of Object.values(m.ratings ?? {})) {
					for (const voterId of Object.keys(byVoter)) {
						counts[voterId] = (counts[voterId] || 0) + 1;
					}
				}
			}
		}
		return counts;
	})();

	function fmt(n) {
		return n === null || n === undefined ? '—' : Number(n).toFixed(2);
	}
</script>

<svelte:head>
	<title>Pizza Bracket Admin</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/pizzaBracket">← Back to the bracket</a>
	</nav>

	{#if status === 'loading'}
		<p class="note">Loading…</p>
	{:else if status === 'denied'}
		<div class="card">
			<h1>Pizza Bracket Admin</h1>
			<p>You don't have access to this page.</p>
			<p><a href="/account?redirect=/pizzaBracket/admin">Sign in</a> with a pizza:admin account.</p>
			{#if msg}<p class="msg error">{msg}</p>{/if}
		</div>
	{:else if status === 'empty'}
		<div class="card">
			<h1>Pizza Bracket Admin</h1>
			<p>No bracket in the database yet.</p>
			<p class="note">
				Run <code>docker compose exec svelte-app node scripts/importPizzaBracket.mjs</code> to bring
				the 2025 bracket across from the spreadsheet.
			</p>
		</div>
	{:else}
		<header class="head">
			<div>
				<h1>🍕 {state.bracket.name}</h1>
				<p class="note">{state.teams.length} pizzas · {state.voters.length} voters</p>
			</div>
			<div class="actions">
				{#if dirtyKeys.length}
					<span class="dirty">{dirtyKeys.length} unsaved</span>
					<button class="btn ghost" on:click={discard} disabled={busy}>Discard</button>
				{/if}
				<button class="btn" on:click={saveRatings} disabled={busy || !dirtyKeys.length}>
					{busy ? 'Saving…' : 'Save ratings'}
				</button>
			</div>
		</header>

		{#if msg}<p class="msg" class:error={invalidCount > 0}>{msg}</p>{/if}

		<nav class="tabs">
			{#each rounds as r, i}
				<button class="tab" class:active={i === activeRound} on:click={() => (activeRound = i)}>
					{r.name}
				</button>
			{/each}
		</nav>

		{#if round}
			{#if columns.length}
				<div class="grid-wrap">
					<table class="grid">
						<thead>
							<tr>
								<th class="voter-head" rowspan="2">Voter</th>
								{#each readyMatches as match}
									<th class="match-head" colspan={match.slots.length}>
										{match.divisionName ?? match.roundName}
										<span class="match-key">{match.matchKey}</span>
									</th>
								{/each}
							</tr>
							<tr>
								{#each columns as col}
									<th class="team-head" class:group-start={col.first}>
										{#if col.slot.seed}<span class="seed">({col.slot.seed})</span>{/if}
										{teamName(col.slot.teamId)}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each state.voters as voter}
								<tr>
									<th class="voter">{voter.name}</th>
									{#each columns as col}
										{@const value = cellValue(col.match, col.slot.teamId, voter.id)}
										<td class:group-start={col.first}>
											<input
												type="number"
												min="0"
												max="5"
												step="0.1"
												class:dirty={cellKey(col.match.id, col.slot.teamId, voter.id) in edits}
												class:invalid={cellInvalid(value)}
												value={value === null ? '' : value}
												on:change={(e) =>
													setCell(col.match, col.slot.teamId, voter.id, e.currentTarget.value)}
											/>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<th class="voter">Votes</th>
								{#each columns as col}
									{@const r = previewFor(col.match, col.slot.teamId)}
									<td class="summary" class:group-start={col.first}>{r?.votes ?? '—'}</td>
								{/each}
							</tr>
							<tr>
								<th class="voter">Average</th>
								{#each columns as col}
									{@const r = previewFor(col.match, col.slot.teamId)}
									<td
										class="summary avg"
										class:group-start={col.first}
										class:won={effectiveWinner(col.match) === col.slot.teamId}
										class:out={r?.eliminated}
									>
										{fmt(r?.rating)}
									</td>
								{/each}
							</tr>
						</tfoot>
					</table>
				</div>
			{:else}
				<p class="note">No matchup in this round is ready to rate yet.</p>
			{/if}

			<section class="results">
				{#each readyMatches as match}
					{@const preview = previews[match.id]}
					{@const winner = effectiveWinner(match)}
					<div class="result-card" class:overridden={match.overridden}>
						<div class="result-head">
							<strong>{match.divisionName ?? match.roundName}</strong>
							<span class="match-key">{match.matchKey}</span>
							{#if match.kind === 'triple'}<span class="pill">3-way</span>{/if}
						</div>

						<div class="winner">
							{#if winner}
								🏆 {teamName(winner)}
								{#if match.overridden}<span class="pill warn">overridden</span>{/if}
							{:else}
								<span class="note">Undecided — no ratings yet.</span>
							{/if}
						</div>

						{#if preview?.tied && !match.overridden}
							<p class="warn-line">
								Level on votes and average. Resolved by slot order — override it to make the call
								explicit.
							</p>
						{/if}
						{#if preview?.ignoredRatings}
							<p class="note small">
								{preview.ignoredRatings} rating{preview.ignoredRatings === 1 ? '' : 's'} not counted
								in the vote — only one side of the deciding pair was rated.
							</p>
						{/if}
						{#if match.overridden && match.computedWinnerTeamId}
							<p class="note small">
								The ratings say {teamName(match.computedWinnerTeamId)}.
							</p>
						{/if}

						<div class="override">
							<label>
								Winner
								<select
									value={match.overridden ? String(match.winnerTeamId) : ''}
									on:change={(e) => setOverride(match, e.currentTarget.value)}
									disabled={busy}
								>
									<option value="">From the ratings</option>
									{#each match.slots as slot}
										<option value={String(slot.teamId)}>{teamName(slot.teamId)}</option>
									{/each}
								</select>
							</label>
							{#if match.overridden}
								<input
									class="note-input"
									placeholder="Why?"
									value={match.overrideNote ?? ''}
									on:change={(e) => saveNote(match, e.currentTarget.value)}
									disabled={busy}
								/>
							{/if}
						</div>
					</div>
				{/each}

				{#each waitingMatches as match}
					<div class="result-card waiting">
						<div class="result-head">
							<strong>{match.divisionName ?? match.roundName}</strong>
							<span class="match-key">{match.matchKey}</span>
						</div>
						<p class="note">
							Waiting on
							{match.slots
								.filter((s) => s.teamId === null)
								.map((s) => s.sourceMatchKey ?? 'an empty slot')
								.join(' and ')}.
						</p>
					</div>
				{/each}
			</section>
		{/if}

		<details class="panel">
			<summary>Voters ({state.voters.length})</summary>
			<div class="panel-body">
				<div class="add-row">
					<input placeholder="Add a voter" bind:value={newVoter} disabled={busy} />
					<button class="mini" on:click={addVoter} disabled={busy || !newVoter.trim()}>Add</button>
				</div>
				<ul class="list">
					{#each state.voters as voter}
						<li>
							<input
								value={voter.name}
								on:change={(e) => renameVoter(voter, e.currentTarget.value)}
								disabled={busy}
							/>
							<span class="note small">{ratingsByVoter[voter.id] || 0} ratings</span>
							<button class="mini danger" on:click={() => removeVoter(voter)} disabled={busy}>
								Remove
							</button>
						</li>
					{/each}
				</ul>
			</div>
		</details>

		<details class="panel">
			<summary>Pizzerias ({state.teams.length})</summary>
			<div class="panel-body">
				<p class="note small">Renaming is safe — ratings follow the team, not its name.</p>
				<ul class="list">
					{#each state.teams as team}
						<li>
							<input
								value={team.name}
								on:change={(e) => renameTeam(team.id, e.currentTarget.value)}
								disabled={busy}
							/>
						</li>
					{/each}
				</ul>
			</div>
		</details>
	{/if}
</main>

<style>
	main {
		min-height: 100vh;
		background: #faf5f0;
		padding: 1rem;
		font-family:
			'Segoe UI',
			system-ui,
			-apple-system,
			sans-serif;
		max-width: 1400px;
		margin: 0 auto;
	}

	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.breadcrumb a:hover {
		color: #d97706;
	}

	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin: 1rem 0 0.5rem;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.card {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1.5rem;
		margin-top: 1rem;
	}

	.note {
		color: #6b7280;
		font-size: 0.85rem;
		margin: 0.25rem 0;
	}
	.small {
		font-size: 0.75rem;
	}
	.msg {
		background: #f3f4f6;
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		margin: 0.5rem 0;
	}
	.msg.error {
		background: #fee2e2;
		color: #991b1b;
	}
	.dirty {
		font-size: 0.8rem;
		color: #92400e;
		background: #fef3c7;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
	}

	.btn {
		background: #d97706;
		color: white;
		border: none;
		border-radius: 6px;
		padding: 0.5rem 1rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.btn.ghost {
		background: white;
		color: #6b7280;
		border: 1px solid #d1d5db;
	}
	.mini {
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		padding: 0.2rem 0.5rem;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.mini.danger {
		color: #991b1b;
		border-color: #fca5a5;
	}

	.tabs {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
		margin: 0.75rem 0;
	}
	.tab {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		padding: 0.4rem 0.8rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.tab.active {
		background: #1f2937;
		color: white;
		border-color: #1f2937;
	}

	.grid-wrap {
		overflow-x: auto;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}
	.grid {
		border-collapse: collapse;
		font-size: 0.8rem;
	}
	.grid th,
	.grid td {
		border-bottom: 1px solid #f3f4f6;
		padding: 0.25rem 0.35rem;
		text-align: center;
	}
	.match-head {
		font-size: 0.7rem;
		color: #6b7280;
		background: #f9fafb;
		border-left: 2px solid #e5e7eb;
		font-weight: 600;
		padding: 0.35rem;
	}
	.match-key {
		display: block;
		font-weight: 400;
		font-size: 0.6rem;
		color: #9ca3af;
	}
	.team-head {
		font-size: 0.7rem;
		max-width: 5.5rem;
		vertical-align: bottom;
		background: #f9fafb;
	}
	.seed {
		color: #9ca3af;
		font-weight: 400;
	}
	.voter-head,
	.voter {
		text-align: left;
		position: sticky;
		left: 0;
		background: white;
		font-weight: 600;
		white-space: nowrap;
		padding-right: 0.75rem;
		z-index: 1;
	}
	.group-start {
		border-left: 2px solid #e5e7eb;
	}

	.grid input[type='number'] {
		width: 3.2rem;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 0.15rem 0.25rem;
		text-align: center;
		font-size: 0.8rem;
		background: transparent;
	}
	.grid input[type='number']:hover {
		border-color: #e5e7eb;
	}
	.grid input[type='number']:focus {
		border-color: #d97706;
		outline: none;
		background: #fffbeb;
	}
	.grid input.dirty {
		background: #fef3c7;
		border-color: #fcd34d;
	}
	.grid input.invalid {
		background: #fee2e2;
		border-color: #f87171;
	}

	tfoot .summary {
		background: #f9fafb;
		font-size: 0.75rem;
		color: #6b7280;
	}
	tfoot .avg {
		font-weight: 700;
		color: #374151;
	}
	tfoot .avg.won {
		background: #059669;
		color: white;
	}
	tfoot .avg.out {
		color: #9ca3af;
		text-decoration: line-through;
	}

	.results {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.75rem;
		margin: 1rem 0;
	}
	.result-card {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 0.75rem;
	}
	.result-card.overridden {
		border-color: #fbbf24;
	}
	.result-card.waiting {
		opacity: 0.6;
	}
	.result-head {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		font-size: 0.8rem;
		margin-bottom: 0.4rem;
	}
	.result-head .match-key {
		display: inline;
	}
	.winner {
		font-size: 0.95rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
	}
	.pill {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: #e5e7eb;
		color: #4b5563;
		border-radius: 999px;
		padding: 0.1rem 0.4rem;
	}
	.pill.warn {
		background: #fef3c7;
		color: #92400e;
	}
	.warn-line {
		font-size: 0.75rem;
		color: #92400e;
		background: #fef3c7;
		border-radius: 4px;
		padding: 0.3rem 0.5rem;
		margin: 0.3rem 0;
	}

	.override {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: #6b7280;
	}
	.override select,
	.note-input {
		width: 100%;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		padding: 0.25rem;
		font-size: 0.8rem;
	}

	.panel {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		margin-top: 0.75rem;
	}
	.panel summary {
		padding: 0.6rem 0.9rem;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
	}
	.panel-body {
		padding: 0 0.9rem 0.9rem;
	}
	.add-row {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	.add-row input {
		flex: 1;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.4rem;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.list input,
	.add-row input {
		border: 1px solid #d1d5db;
		border-radius: 4px;
		padding: 0.25rem 0.4rem;
		font-size: 0.8rem;
		min-width: 0;
		flex: 1;
	}
</style>
