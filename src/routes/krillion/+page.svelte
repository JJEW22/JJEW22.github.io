<!-- src/routes/krillion/+page.svelte -->
<!--
	Krillion, rescored. Paste your end screen from krillion.io (or type your seven
	answers) and get a score based on how many players actually gave each answer.

	Prerendered like every page here, so everything arrives from /krillion/api/*
	in the browser. The paste is read here for the preview and read again on the
	server, which is what actually scores it.
-->
<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { parsePaste, TOP_SCORE, type PastedDive } from '$lib/krillion';

	interface Day {
		date: string;
		today: string;
		dayNumber: number;
		scored: boolean;
		countsAsOf: string | null;
		prompts: { id: string; text: string }[];
		nextFetch: string;
		answers?: Record<string, string[]>;
	}
	interface ScoredRound {
		round: number;
		prompt: string;
		submitted: string | null;
		match: string | null;
		miss: boolean;
		gamePoints: number | null;
		points: number;
		count: number | null;
	}
	interface Result {
		dayNumber: number;
		date: string;
		status: 'scored' | 'waiting';
		rounds: ScoredRound[];
		gameScore: number | null;
		updatedScore: number | null;
		countsAsOf: string | null;
		notify: boolean;
	}

	let day: Day | null = null;
	let dayFailed = false;
	let me: string | null = null;
	let myDives: {
		date: string;
		day_number: number;
		game_score: number | null;
		updated_score: number | null;
	}[] = [];

	let mode: 'paste' | 'type' = 'paste';
	let paste = '';
	let typed = ['', '', '', '', '', '', ''];
	let notify = false;
	let email = '';
	let busy = false;
	let error = '';
	let result: Result | null = null;

	onMount(async () => {
		try {
			const r = await fetch('/krillion/api/day?answers=1');
			if (!r.ok) throw new Error(String(r.status));
			day = await r.json();
		} catch {
			dayFailed = true;
		}
		try {
			const r = await fetch('/krillion/api/mine').then((x) => x.json());
			if (r.signedIn) {
				me = r.username;
				myDives = r.dives ?? [];
			}
		} catch {
			me = null;
		}
	});

	$: dive = paste.trim() ? parsePaste(paste) : null;
	$: pasteProblem = describeProblem(dive);
	$: typedCount = typed.filter((t) => t.trim()).length;
	$: canSubmit =
		!busy &&
		(mode === 'paste' ? Boolean(dive && dive.complete) : typedCount > 0) &&
		(!notify || Boolean(me) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

	function describeProblem(d: PastedDive | null): string {
		if (!d) return '';
		if (d.dayNumber === null)
			return "Couldn't find 'Dive #… complete' — copy the whole end screen.";
		if (!d.complete)
			return `Found ${d.rounds.length} of 7 rounds — copy the whole end screen, including "the catch".`;
		if (!d.totalMatchesScore)
			return 'The rounds don’t add up to the score shown; check the paste is complete.';
		return '';
	}

	async function submit() {
		busy = true;
		error = '';
		result = null;
		try {
			const body =
				mode === 'paste'
					? { paste, notify, email: me ? null : email.trim() }
					: { answers: typed, notify, email: me ? null : email.trim() };
			const r = await fetch('/krillion/api/submit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = await r.json().catch(() => null);
			if (!r.ok || !data?.ok) {
				error = data?.error || `Something went wrong (${r.status}).`;
				return;
			}
			result = data;
			if (me) {
				const m = await fetch('/krillion/api/mine').then((x) => x.json());
				myDives = m.dives ?? [];
			}
		} catch (err) {
			error = `Couldn't submit: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			busy = false;
		}
	}

	function promptLabel(i: number): string {
		return day?.scored && day.prompts[i] ? day.prompts[i].text : `Round ${i + 1}`;
	}

	function time(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleTimeString('en-US', {
			timeZone: 'America/New_York',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Krillion, rescored</title>
	<meta
		name="description"
		content="Paste your Krillion end screen and get a score based on how many players actually gave each answer."
	/>
</svelte:head>

<div class="container">
	<nav class="breadcrumb">
		<a href="/me">← Back to Me</a>
		{#if !me}<a class="pill" href="/account?redirect=/krillion">Sign in</a>{/if}
	</nav>

	<main>
		<header class="head">
			<h1>Krillion, rescored</h1>
			<p class="intro">
				<a href="https://krillion.io" target="_blank" rel="noopener">Krillion</a> scores answers in
				six hand-picked tiers. This rescores every answer by how many players actually gave it: the
				most common answer on each prompt scores a little, the rarest scores {TOP_SCORE}, and
				everything in between follows the counts.
			</p>
			<p class="notice">
				Your rescored total can change during the day as more people play. Final scores are locked
				in after the dive closes at midnight ET.
			</p>
		</header>

		<section class="status">
			{#if dayFailed}
				<p class="warn">Couldn't load today's status — submitting may still work.</p>
			{:else if day}
				<p>
					<b>Dive #{day.dayNumber}</b> ({day.date}):
					{#if day.scored}
						counts in, as of {time(day.countsAsOf)} ET.
					{:else}
						counts arrive at {day.nextFetch}. Submit now and your dive is scored then.
					{/if}
				</p>
			{/if}
		</section>

		<section class="card">
			<div class="tabs" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'paste'}
					class:on={mode === 'paste'}
					on:click={() => (mode = 'paste')}>Paste my end screen</button
				>
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'type'}
					class:on={mode === 'type'}
					on:click={() => (mode = 'type')}>Type my answers</button
				>
			</div>

			{#if mode === 'paste'}
				<p class="hint">
					On krillion.io's end screen: select all and copy (Ctrl/⌘ + A, then C — on a phone,
					long-press and Select All), then paste it here.
				</p>
				<textarea bind:value={paste} rows="8" placeholder="Paste the whole end screen here…"
				></textarea>
				{#if dive}
					{#if pasteProblem}
						<p class="warn">{pasteProblem}</p>
					{/if}
					{#if dive.rounds.length}
						<table class="preview">
							<thead
								><tr><th>#</th><th>Prompt</th><th>Answer</th><th class="num">Game</th></tr></thead
							>
							<tbody>
								{#each dive.rounds as r (r.round)}
									<tr class:miss={r.miss}>
										<td>{r.round}</td>
										<td class="sub">{r.prompt}</td>
										<td>{r.answer ?? (r.typed ? `miss ("${r.typed}")` : 'miss')}</td>
										<td class="num">{r.gamePoints ?? '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						<p class="sub">Dive #{dive.dayNumber} · game score {dive.score ?? '—'}</p>
					{/if}
				{/if}
			{:else}
				<p class="hint">
					Today's dive only. Leave a round blank if you missed it. Suggestions appear once today's
					counts are in.
				</p>
				<div class="typed">
					{#each [0, 1, 2, 3, 4, 5, 6] as i (i)}
						<label>
							<span>{promptLabel(i)}</span>
							<input bind:value={typed[i]} list="k-answers-{i}" autocomplete="off" />
						</label>
						{#if day?.answers && day.prompts[i]}
							<datalist id="k-answers-{i}">
								{#each day.answers[day.prompts[i].id] ?? [] as a (a)}<option value={a}
									></option>{/each}
							</datalist>
						{/if}
					{/each}
				</div>
			{/if}

			<div class="notify">
				{#if me}
					<label class="check">
						<input type="checkbox" bind:checked={notify} />
						<span>Email me my final score after midnight ET</span>
					</label>
					<p class="sub">
						Signed in as <b>{me}</b> — your final score is saved to your account either way.
					</p>
				{:else}
					<label class="check">
						<input type="checkbox" bind:checked={notify} />
						<span>Email me my final score after midnight ET</span>
					</label>
					{#if notify}
						<input type="email" bind:value={email} placeholder="you@example.com" class="email" />
						<p class="sub">Used for this one email, then deleted.</p>
					{/if}
					<p class="sub">
						<a href="/account?redirect=/krillion">Sign in</a> to keep your scores on your account.
					</p>
				{/if}
			</div>

			<button type="button" class="primary" disabled={!canSubmit} on:click={submit}>
				{busy ? 'Scoring…' : 'Rescore my dive'}
			</button>
			{#if error}<p class="warn">{error}</p>{/if}
		</section>

		{#if result}
			<section class="card result">
				<h2>Dive #{result.dayNumber}</h2>
				{#if result.status === 'waiting'}
					<p>
						Saved. Today's counts arrive at {day?.nextFetch ?? '11:00 ET'} — come back then for your
						rescored total{#if result.notify}, or watch for the email after midnight{/if}.
					</p>
				{:else}
					<div class="totals">
						<div>
							<span class="n">{result.gameScore ?? '—'}</span><span class="l">game score</span>
						</div>
						<div>
							<span class="n">{result.updatedScore?.toFixed(1)}</span><span class="l">rescored</span
							>
						</div>
					</div>
					<table>
						<thead>
							<tr
								><th>#</th><th>Answer</th><th class="num">Players</th><th class="num">Game</th><th
									class="num">Rescored</th
								></tr
							>
						</thead>
						<tbody>
							{#each result.rounds as r (r.round)}
								<tr class:miss={r.miss}>
									<td>{r.round}</td>
									<td>
										{r.miss ? 'miss' : r.match}
										{#if !r.miss && r.submitted && r.match && r.match.toLowerCase() !== r.submitted.toLowerCase()}
											<span class="sub">(you typed “{r.submitted}”)</span>
										{/if}
										<div class="sub">{r.prompt}</div>
									</td>
									<td class="num">{r.count?.toLocaleString() ?? '—'}</td>
									<td class="num">{r.gamePoints ?? '—'}</td>
									<td class="num"><b>{r.points.toFixed(1)}</b></td>
								</tr>
							{/each}
						</tbody>
					</table>
					<p class="notice">
						Based on counts as of {time(result.countsAsOf)} ET. Your rescored total can change during
						the day; it's final after midnight ET.
					</p>
				{/if}
			</section>
		{/if}

		{#if me && myDives.length}
			<section class="card">
				<h2>Your dives</h2>
				<table>
					<thead
						><tr
							><th>Dive</th><th>Date</th><th class="num">Game</th><th class="num">Rescored</th></tr
						></thead
					>
					<tbody>
						{#each myDives as d (d.date)}
							<tr>
								<td>#{d.day_number}</td>
								<td class="sub">{d.date}</td>
								<td class="num">{d.game_score ?? '—'}</td>
								<td class="num"
									>{d.updated_score === null ? 'waiting' : d.updated_score.toFixed(1)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		<section class="how">
			<h2>How the rescoring works</h2>
			<ul>
				<li>
					Each answer's score comes from its <b>surprisal</b> — how unlikely it was, given how many players
					gave it. Rarer answers score more, smoothly.
				</li>
				<li>
					The most common answer on a prompt scores a small amount that's higher when no single
					answer dominates; the rarest scores {TOP_SCORE}.
				</li>
				<li>
					Each prompt's curve is shaped so its average and spread sit close to Krillion's own —
					mostly Krillion's tiers re-dealt in order of how common each answer really was.
				</li>
				<li>
					Counts are taken once a day at 11:00 ET from krillion.io. Misses score 0, as in the game.
				</li>
			</ul>
		</section>
	</main>
</div>

<style>
	.container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
	}

	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.breadcrumb a:hover {
		color: #0066cc;
	}

	.pill {
		padding: 0.25rem 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
	}

	main {
		background: white;
		border-radius: 12px;
		padding: 2.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	h1 {
		font-size: 2.3rem;
		margin: 0 0 0.5rem 0;
		color: #1a1a1a;
	}

	h2 {
		font-size: 1.2rem;
		margin: 0 0 0.75rem 0;
		color: #333;
	}

	.intro {
		margin: 0 0 0.75rem 0;
		line-height: 1.65;
		color: #555;
	}

	.notice {
		margin: 0.75rem 0 0 0;
		padding: 0.6rem 0.85rem;
		background: #f0f7ff;
		border-radius: 8px;
		font-size: 0.9rem;
		color: #0b4f8a;
	}

	.status {
		margin: 1.25rem 0;
		font-size: 0.95rem;
		color: #444;
	}

	.card {
		margin-bottom: 1.5rem;
		padding: 1.25rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
	}

	.tabs {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}

	.tabs button {
		padding: 0.4rem 0.9rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 20px;
		font: inherit;
		font-size: 0.9rem;
		color: #444;
		cursor: pointer;
	}

	.tabs button.on {
		background: #0b62a4;
		border-color: #0b62a4;
		color: #fff;
	}

	.hint,
	.sub {
		font-size: 0.85rem;
		color: #777;
	}

	.hint {
		margin: 0 0 0.6rem 0;
	}

	textarea,
	input:not([type='checkbox']) {
		width: 100%;
		box-sizing: border-box;
		padding: 0.5rem 0.6rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
	}

	textarea:focus,
	input:focus {
		outline: none;
		border-color: #0066cc;
	}

	.typed {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.6rem;
	}

	.typed label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.typed label span {
		font-size: 0.85rem;
		color: #555;
	}

	.notify {
		margin: 1rem 0;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.email {
		margin-top: 0.5rem;
		max-width: 22rem;
	}

	.notify .sub {
		margin: 0.35rem 0 0 0;
	}

	button.primary {
		padding: 0.55rem 1.2rem;
		background: #0066cc;
		border: 1px solid #0066cc;
		border-radius: 6px;
		font: inherit;
		color: #fff;
		cursor: pointer;
	}

	button.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.warn {
		margin: 0.6rem 0 0 0;
		font-size: 0.9rem;
		color: #9a2c2c;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.75rem;
		font-size: 0.9rem;
	}

	th,
	td {
		padding: 0.45rem 0.5rem;
		border-bottom: 1px solid #eee;
		text-align: left;
		vertical-align: top;
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

	tr.miss td {
		color: #999;
	}

	.totals {
		display: flex;
		gap: 2.5rem;
	}

	.totals div {
		display: flex;
		flex-direction: column;
	}

	.totals .n {
		font-size: 2rem;
		font-weight: 600;
		color: #0b62a4;
		font-variant-numeric: tabular-nums;
	}

	.totals .l {
		font-size: 0.85rem;
		color: #666;
	}

	.how ul {
		margin: 0;
		padding-left: 1.2rem;
		line-height: 1.6;
		color: #555;
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		main {
			padding: 1.5rem;
		}

		h1 {
			font-size: 1.8rem;
		}

		table {
			display: block;
			overflow-x: auto;
		}
	}
</style>
