<!-- src/routes/krillion/admin/+page.svelte -->
<!--
	Krillion admin: every answer's count, game points and rescored points for a
	day, one prompt at a time, searchable and sortable -- and every dive
	submitted that day, searchable by player or answer, each opening to show how
	its rounds were converted.

	Prerendered like every page here, so it renders for anyone and asks the API;
	/krillion/api/admin/answers is what enforces the krillion:admin role and the
	spoiler gate (today's scores only after you've submitted today's dive).
-->
<script lang="ts">
	import '../../../app.css';
	import { onMount } from 'svelte';

	interface Fit {
		a: number;
		b: number;
		bottom: number;
		top?: number;
		breadth?: number;
		gameMean: number;
		targetMean: number;
		fittedMean: number;
		targetSd: number;
		fittedSd: number;
	}
	interface Answer {
		answer: string;
		count: number;
		share: number;
		gameScore: number | null;
		points: number;
	}
	interface Prompt {
		id: string;
		text: string;
		fit: Fit | null;
		answers: Answer[];
	}
	type SortKey = 'points' | 'count' | 'gameScore' | 'answer';
	interface Round {
		round: number;
		prompt: string;
		submitted: string | null;
		match: string | null;
		miss: boolean;
		gamePoints: number | null;
		points: number;
		count: number | null;
	}
	interface Submission {
		id: number;
		name: string;
		guest: boolean;
		gameScore: number | null;
		betterThan: number | null;
		updatedScore: number | null;
		submittedAt: string;
		rounds: Round[];
	}
	type SubSortKey = 'updatedScore' | 'gameScore' | 'gain' | 'name';

	let status: 'loading' | 'denied' | 'gated' | 'missing' | 'ready' = 'loading';
	let error = '';
	let today = '';
	let date = '';
	let dayNumber: number | null = null;
	let picked: number | null = null; // the dropdown: null = today
	let days: { date: string; dayNumber: number }[] = [];
	let prompts: Prompt[] = [];
	let range: {
		min: number;
		minDate: string;
		minPrompt: string;
		max: number;
		maxDate: string;
		maxPrompt: string;
	} | null = null;
	let promptId = '';
	let view: 'answers' | 'submissions' = 'answers';
	let submissions: Submission[] = [];
	let subSearch = '';
	let subSort: SubSortKey = 'updatedScore';
	let subDesc = true;
	let openIds: number[] = [];

	let search = '';
	let sortKey: SortKey = 'points';
	let sortDesc = true;
	let limit = 200;

	onMount(() => load(null));

	async function load(n: number | null) {
		picked = n;
		status = 'loading';
		error = '';
		const qs = n ? `?day=${n}` : '';
		const r = await fetch(`/krillion/api/admin/answers${qs}`);
		const data = await r.json().catch(() => null);
		days = data?.days ?? days;
		today = data?.today ?? today;
		submissions = data?.submissions ?? [];
		openIds = [];
		if (r.status === 401 || (r.status === 403 && !data?.gated)) {
			status = 'denied';
			error = data?.error ?? 'Admins only.';
			return;
		}
		if (r.status === 403) {
			status = 'gated';
			error = data.error;
			date = data.date;
			return;
		}
		if (!r.ok) {
			status = 'missing';
			error = data?.error ?? `Couldn't load (${r.status}).`;
			date = data?.date ?? '';
			return;
		}
		date = data.date;
		dayNumber = data.dayNumber;
		prompts = data.prompts ?? [];
		range = data.range ?? null;
		if (!prompts.some((p) => p.id === promptId)) promptId = prompts[0]?.id ?? '';
		status = 'ready';
	}

	// "Fetch now": today's counts right away, whatever the time; the 11am
	// scheduled fetch still runs as normal.
	let fetching = false;
	let fetchMsg = '';
	let fetchBad = false;

	async function fetchNow() {
		if (
			!confirm("Fetch today's counts from krillion.io now? Every dive submitted today is rescored.")
		)
			return;
		fetching = true;
		fetchMsg = '';
		fetchBad = false;
		try {
			const r = await fetch('/krillion/api/admin/fetch', { method: 'POST' });
			const data = await r.json().catch(() => null);
			if (!r.ok || !data?.ok) {
				fetchBad = true;
				fetchMsg = data?.error ?? `Fetch failed (${r.status}).`;
				return;
			}
			fetchMsg = `Fetched dive for ${data.date}: ${data.prompts} prompts, ${data.answers.toLocaleString()} answers; ${data.rescoredDives} submitted ${data.rescoredDives === 1 ? 'dive' : 'dives'} rescored.`;
			await load(picked);
		} catch (err) {
			fetchBad = true;
			fetchMsg = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			fetching = false;
		}
	}

	function sortBy(key: SortKey) {
		if (sortKey === key) sortDesc = !sortDesc;
		else {
			sortKey = key;
			sortDesc = key !== 'answer';
		}
		limit = 200;
	}

	$: prompt = prompts.find((p) => p.id === promptId) ?? null;
	$: q = search.trim().toLowerCase();
	$: rows = (prompt?.answers ?? [])
		.filter((a) => !q || a.answer.toLowerCase().includes(q))
		.sort((x, y) => {
			const dir = sortDesc ? -1 : 1;
			if (sortKey === 'answer') return dir * x.answer.localeCompare(y.answer);
			const xv = x[sortKey] ?? -1;
			const yv = y[sortKey] ?? -1;
			return dir * (xv - yv) || x.answer.localeCompare(y.answer);
		});
	$: shown = rows.slice(0, limit);
	$: if (search !== undefined) limit = 200;

	function arrow(key: SortKey): string {
		return sortKey === key ? (sortDesc ? ' ▼' : ' ▲') : '';
	}

	// ---- submissions ----
	function gain(s: Submission): number | null {
		return s.updatedScore === null || s.gameScore === null ? null : s.updatedScore - s.gameScore;
	}

	function subSortBy(key: SubSortKey) {
		if (subSort === key) subDesc = !subDesc;
		else {
			subSort = key;
			subDesc = key !== 'name';
		}
	}

	function subArrow(key: SubSortKey): string {
		return subSort === key ? (subDesc ? ' ▼' : ' ▲') : '';
	}

	function toggle(id: number) {
		openIds = openIds.includes(id) ? openIds.filter((x) => x !== id) : [...openIds, id];
	}

	function answerText(r: Round): string {
		return r.miss ? 'miss' : (r.submitted ?? '');
	}

	// A player matches on their name; an answer matches on what they typed or
	// what it was matched to.
	$: sq = subSearch.trim().toLowerCase();
	$: subRows = submissions
		.filter(
			(s) =>
				!sq ||
				s.name.toLowerCase().includes(sq) ||
				s.rounds.some(
					(r) =>
						!r.miss &&
						((r.submitted ?? '').toLowerCase().includes(sq) ||
							(r.match ?? '').toLowerCase().includes(sq))
				)
		)
		.sort((x, y) => {
			const dir = subDesc ? -1 : 1;
			if (subSort === 'name') return dir * x.name.localeCompare(y.name);
			const xv = (subSort === 'gain' ? gain(x) : x[subSort]) ?? -Infinity;
			const yv = (subSort === 'gain' ? gain(y) : y[subSort]) ?? -Infinity;
			return xv === yv ? x.name.localeCompare(y.name) : dir * (xv > yv ? 1 : -1);
		});
	// Searching for an answer opens the dives that used it.
	function answerHit(r: Round, q: string): boolean {
		return (
			!!q &&
			!r.miss &&
			((r.submitted ?? '').toLowerCase().includes(q) || (r.match ?? '').toLowerCase().includes(q))
		);
	}
</script>

<svelte:head>
	<title>Krillion admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<nav class="breadcrumb"><a href="/krillion">← Back to Krillion, rescored</a></nav>

	<main>
		<h1>Krillion admin</h1>

		{#if days.length || today}
			<label class="day-pick">
				<span>Dive</span>
				<select value={picked ?? ''} on:change={(e) => load(Number(e.currentTarget.value) || null)}>
					<option value="">Today ({today})</option>
					{#each days.filter((d) => d.date !== today) as d (d.date)}
						<option value={d.dayNumber}>#{d.dayNumber} ({d.date})</option>
					{/each}
				</select>
			</label>
		{/if}

		{#if status !== 'denied' && status !== 'loading'}
			<div class="fetch-now">
				<button type="button" on:click={fetchNow} disabled={fetching}>
					{fetching ? 'Fetching…' : 'Fetch now'}
				</button>
				<span class="sub"
					>Pulls today's counts from krillion.io immediately (before 11am too) and rescores today's
					dives. The scheduled 11am fetch still runs.</span
				>
			</div>
			{#if fetchMsg}<p class="fetch-msg" class:bad={fetchBad}>{fetchMsg}</p>{/if}
		{/if}

		{#if status === 'ready' || (status === 'missing' && submissions.length)}
			<div class="views" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={view === 'answers'}
					class:on={view === 'answers'}
					on:click={() => (view = 'answers')}>Answers</button
				>
				<button
					type="button"
					role="tab"
					aria-selected={view === 'submissions'}
					class:on={view === 'submissions'}
					on:click={() => (view = 'submissions')}>Submissions ({submissions.length})</button
				>
			</div>
		{/if}

		{#if status === 'loading'}
			<p class="note">Loading…</p>
		{:else if status === 'denied'}
			<p class="note">
				{error} This page needs the <code>krillion:admin</code> role (or site admin) — grant it on
				<a href="/admin">/admin</a>.
			</p>
		{:else if status === 'gated'}
			<p class="banner warn">
				{error} <a href="/krillion">Submit today's dive →</a>
			</p>
		{:else if view === 'submissions'}
			{#if status === 'missing'}
				<p class="note">{error} Dives below show the game's points only until the counts arrive.</p>
			{/if}
			<input class="search" bind:value={subSearch} placeholder="Search players or answers…" />
			<p class="sub">
				{subRows.length}
				{subRows.length === 1 ? 'dive' : 'dives'}{sq ? ` matching "${subSearch.trim()}"` : ''} · click
				a dive to see each round's conversion
			</p>
			<table class="subs">
				<thead>
					<tr>
						<th
							><button type="button" on:click={() => subSortBy('name')}
								>Player{subArrow('name')}</button
							></th
						>
						<th class="num"
							><button type="button" on:click={() => subSortBy('gameScore')}
								>Game{subArrow('gameScore')}</button
							></th
						>
						<th class="num"
							><button type="button" on:click={() => subSortBy('updatedScore')}
								>Rescored{subArrow('updatedScore')}</button
							></th
						>
						<th class="num"
							><button type="button" on:click={() => subSortBy('gain')}>Δ{subArrow('gain')}</button
							></th
						>
					</tr>
				</thead>
				<tbody>
					{#each subRows as s (s.id)}
						{@const g = gain(s)}
						<tr class="dive" class:open={openIds.includes(s.id)} on:click={() => toggle(s.id)}>
							<td>
								<span class="caret"
									>{openIds.includes(s.id) || (sq && s.rounds.some((r) => answerHit(r, sq)))
										? '▾'
										: '▸'}</span
								>
								{s.name}{#if s.guest}<span class="tag">guest</span>{/if}
							</td>
							<td class="num"
								>{s.gameScore ?? '—'}{#if s.betterThan !== null}<span class="sub">
										({s.betterThan}%)</span
									>{/if}</td
							>
							<td class="num"
								><b>{s.updatedScore === null ? 'waiting' : s.updatedScore.toFixed(1)}</b></td
							>
							<td class="num" class:up={g !== null && g > 0} class:down={g !== null && g < 0}
								>{g === null ? '—' : `${g > 0 ? '+' : ''}${g.toFixed(1)}`}</td
							>
						</tr>
						{#if openIds.includes(s.id) || (sq && s.rounds.some((r) => answerHit(r, sq)))}
							<tr class="detail">
								<td colspan="4">
									<table>
										<thead>
											<tr>
												<th>#</th>
												<th>Prompt</th>
												<th>Answer</th>
												<th class="num">Players</th>
												<th class="num">Game</th>
												<th class="num">Rescored</th>
											</tr>
										</thead>
										<tbody>
											{#each s.rounds as r (r.round)}
												<tr class:miss={r.miss} class:hit={answerHit(r, sq)}>
													<td>{r.round}</td>
													<td class="prompt">{r.prompt}</td>
													<td>
														{answerText(
															r
														)}{#if !r.miss && r.match && r.match.toLowerCase() !== (r.submitted ?? '').toLowerCase()}<span
																class="sub"
															>
																→ {r.match}</span
															>{/if}
													</td>
													<td class="num">{r.count?.toLocaleString() ?? '—'}</td>
													<td class="num">{r.gamePoints ?? '—'}</td>
													<td class="num"
														><b>{s.updatedScore === null ? '—' : r.points.toFixed(1)}</b></td
													>
												</tr>
											{/each}
										</tbody>
									</table>
									<p class="sub">Submitted {new Date(s.submittedAt).toLocaleString()}</p>
								</td>
							</tr>
						{/if}
					{:else}
						<tr><td colspan="4" class="sub">No dives{sq ? ' match' : ' yet'}.</td></tr>
					{/each}
				</tbody>
			</table>
		{:else if status === 'missing'}
			<p class="note">{error}</p>
		{:else}
			<p class="note">
				Dive #{dayNumber} ({date}) — every answer on the sheet or in the counts, with the game's
				points and the rescored points (bottom score up to each prompt's top score, 90–125).
			</p>

			{#if range}
				<p class="sub">
					All-time breadth range: {range.min.toFixed(0)} (narrowest, top 90: “{range.minPrompt}”,
					{range.minDate}) to {range.max.toFixed(0)} (broadest, top 125: “{range.maxPrompt}”, {range.maxDate}).
				</p>
			{/if}

			<div class="tabs" role="tablist">
				{#each prompts as p, i (p.id)}
					<button
						type="button"
						role="tab"
						aria-selected={p.id === promptId}
						class:on={p.id === promptId}
						title={p.text}
						on:click={() => {
							promptId = p.id;
							limit = 200;
						}}>{i + 1}</button
					>
				{/each}
			</div>

			{#if prompt}
				<h2>{prompt.text}</h2>
				{#if prompt.fit}
					<p class="sub fit">
						{prompt.answers.length.toLocaleString()} answers · bottom {prompt.fit.bottom.toFixed(1)}
						· top {prompt.fit.top?.toFixed(1) ?? '—'} (breadth {prompt.fit.breadth?.toFixed(0) ??
							'—'}) · a {prompt.fit.a.toFixed(3)}, b {prompt.fit.b.toFixed(3)} · mean {prompt.fit.fittedMean.toFixed(
							1
						)} (target {prompt.fit.targetMean.toFixed(1)}, game {prompt.fit.gameMean.toFixed(1)}) ·
						SD {prompt.fit.fittedSd.toFixed(1)} (target {prompt.fit.targetSd.toFixed(1)})
					</p>
				{/if}

				<input class="search" bind:value={search} placeholder="Search answers…" />
				<p class="sub">
					{rows.length.toLocaleString()}
					{rows.length === 1 ? 'answer' : 'answers'}{q ? ` matching "${search.trim()}"` : ''}
				</p>

				<table>
					<thead>
						<tr>
							<th
								><button type="button" on:click={() => sortBy('answer')}
									>Answer{arrow('answer')}</button
								></th
							>
							<th class="num"
								><button type="button" on:click={() => sortBy('count')}
									>Players{arrow('count')}</button
								></th
							>
							<th class="num">Share</th>
							<th class="num"
								><button type="button" on:click={() => sortBy('gameScore')}
									>Game{arrow('gameScore')}</button
								></th
							>
							<th class="num"
								><button type="button" on:click={() => sortBy('points')}
									>Rescored{arrow('points')}</button
								></th
							>
						</tr>
					</thead>
					<tbody>
						{#each shown as a (a.answer)}
							<tr class:unused={a.count === 0}>
								<td>{a.answer}</td>
								<td class="num">{a.count.toLocaleString()}</td>
								<td class="num">{(a.share * 100).toFixed(2)}%</td>
								<td class="num">{a.gameScore ?? '—'}</td>
								<td class="num"><b>{a.points.toFixed(1)}</b></td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if rows.length > shown.length}
					<button type="button" class="more" on:click={() => (limit += 500)}>
						Show more ({(rows.length - shown.length).toLocaleString()} left)
					</button>
				{/if}
			{/if}
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

	h1 {
		font-size: 2rem;
		margin: 0 0 1rem 0;
		color: #1a1a1a;
	}

	h2 {
		font-size: 1.15rem;
		margin: 1rem 0 0.4rem 0;
		color: #333;
	}

	.note {
		color: #555;
		font-size: 0.95rem;
	}

	.sub {
		font-size: 0.85rem;
		color: #777;
		margin: 0.3rem 0;
	}

	.fit {
		font-variant-numeric: tabular-nums;
	}

	.banner.warn {
		padding: 0.7rem 0.9rem;
		background: #fff6e5;
		border-radius: 8px;
		color: #7a5200;
	}

	code {
		padding: 0.1rem 0.35rem;
		background: #f3f4f6;
		border-radius: 4px;
	}

	.fetch-now {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin: 0 0 0.75rem 0;
	}

	.fetch-now button {
		flex: none;
		padding: 0.45rem 1rem;
		background: #0066cc;
		border: 1px solid #0066cc;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		color: #fff;
		cursor: pointer;
	}

	.fetch-now button:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.fetch-msg {
		margin: 0 0 1rem 0;
		padding: 0.55rem 0.8rem;
		background: #eaf7ee;
		border-radius: 8px;
		font-size: 0.9rem;
		color: #1e6b36;
	}

	.fetch-msg.bad {
		background: #fdeeee;
		color: #9a2c2c;
	}

	.day-pick {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		font-size: 0.9rem;
		color: #555;
	}

	.day-pick select,
	.search {
		padding: 0.4rem 0.55rem;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
	}

	.search {
		width: 100%;
		max-width: 24rem;
		box-sizing: border-box;
		margin-top: 0.5rem;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.5rem;
	}

	.tabs button {
		min-width: 2.2rem;
		padding: 0.35rem 0.7rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 20px;
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.tabs button.on {
		background: #0b62a4;
		border-color: #0b62a4;
		color: #fff;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.5rem;
		font-size: 0.9rem;
	}

	th,
	td {
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid #eee;
		text-align: left;
	}

	th button {
		padding: 0;
		background: none;
		border: 0;
		font: inherit;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #666;
		cursor: pointer;
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

	tr.unused td {
		color: #9aa5b1;
	}

	.views {
		display: flex;
		gap: 0;
		margin: 0.25rem 0 1rem 0;
		border-bottom: 1px solid #e3e7ec;
	}

	.views button {
		padding: 0.5rem 1rem;
		background: none;
		border: 0;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		font: inherit;
		font-size: 0.95rem;
		color: #666;
		cursor: pointer;
	}

	.views button.on {
		border-bottom-color: #0b62a4;
		color: #0b62a4;
		font-weight: 600;
	}

	tr.dive {
		cursor: pointer;
	}

	tr.dive:hover td {
		background: #f7f9fb;
	}

	tr.dive.open td {
		border-bottom-color: transparent;
	}

	.caret {
		display: inline-block;
		width: 1rem;
		color: #999;
	}

	.tag {
		margin-left: 0.4rem;
		padding: 0.05rem 0.4rem;
		background: #f0f1f3;
		border-radius: 8px;
		font-size: 0.72rem;
		color: #777;
	}

	td.up {
		color: #1e6b36;
	}

	td.down {
		color: #9a2c2c;
	}

	tr.detail > td {
		padding: 0 0 0.75rem 1.5rem;
		background: #fafbfc;
	}

	tr.detail table {
		margin-top: 0;
		font-size: 0.85rem;
	}

	tr.detail .prompt {
		color: #666;
	}

	tr.miss td {
		color: #9aa5b1;
	}

	tr.hit td {
		background: #fff8db;
	}

	.more {
		margin-top: 0.75rem;
		padding: 0.4rem 0.9rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		cursor: pointer;
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		main {
			padding: 1.5rem;
		}

		table {
			display: block;
			overflow-x: auto;
		}
	}
</style>
