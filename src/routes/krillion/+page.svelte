<!-- src/routes/krillion/+page.svelte -->
<!--
	Krillion, rescored. Paste your end screen from krillion.io (or type your seven
	answers) and get a score based on how many players actually gave each answer.

	Prerendered like every page here, so everything arrives from /krillion/api/*
	in the browser. The paste is read here for the preview and read again on the
	server, which is what actually scores it.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import '../../app.css';
	import { onMount } from 'svelte';
	import {
		MIN_DIVES_FOR_AVERAGE,
		etDate,
		formatPercentile,
		parsePaste,
		rescoreShareText,
		TOP_MAX,
		TOP_MIN,
		type PastedRound
	} from '$lib/krillion';

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
		rarity?: number | null;
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
	interface MyDive {
		date: string;
		day_number: number;
		game_score: number | null;
		updated_score: number | null;
		notify: boolean;
		scored: ScoredRound[] | null;
		rounds: PastedRound[];
	}
	let myDives: MyDive[] = [];
	// True when the result card shows a dive saved earlier rather than one just submitted.
	let restored = false;
	// The answer form collapses to a one-line bar once today's dive is in; "Edit
	// answers" opens it again, still filled in.
	let formOpen = true;

	// One flow: paste the end screen (optional), then review the seven answers.
	// The paste fills in whatever rounds it covers; the rest are typed. Editing
	// the paste refills the rows; editing a row never touches the paste.
	interface Row {
		answer: string;
		original: string; // what the paste said, to tell an edit from a pasted answer
		typed: string | null; // a miss's typed text, from the paste
		gamePoints: number | null;
		othersChose: number | null;
		prompt: string;
		found: boolean;
	}
	const blankRow = (): Row => ({
		answer: '',
		original: '',
		typed: null,
		gamePoints: null,
		othersChose: null,
		prompt: '',
		found: false
	});
	let paste = '';
	let rows: Row[] = [0, 1, 2, 3, 4, 5, 6].map(blankRow);
	let pasted: {
		dayNumber: number | null;
		score: number | null;
		betterThan: number | null;
		found: number;
	} | null = null;
	let notify = false;
	let email = '';
	let busy = false;
	let error = '';
	let result: Result | null = null;

	// The rescored share block, once the dive has counts.
	// Rescored minus the game's score, for the totals row.
	$: adjustment =
		result?.status === 'scored' && result.updatedScore !== null && result.gameScore !== null
			? result.updatedScore - result.gameScore
			: null;
	$: shareText =
		result?.status === 'scored' && result.updatedScore !== null
			? rescoreShareText(result.dayNumber, result.gameScore, result.updatedScore, result.rounds)
			: '';
	let copied = false;

	async function copyShare() {
		try {
			await navigator.clipboard.writeText(shareText);
		} catch {
			// No clipboard API (older browser or insecure context): fall back to
			// selecting a hidden textarea.
			const t = document.createElement('textarea');
			t.value = shareText;
			t.style.cssText = 'position:fixed;opacity:0';
			document.body.appendChild(t);
			t.select();
			document.execCommand('copy');
			t.remove();
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	// Leaderboard: signed-in dives, totals only.
	interface LeaderRow {
		name: string;
		gameScore: number | null;
		updatedScore: number | null;
		dives: number;
		average: number | null;
		isYou: boolean;
	}
	interface AllTimeRow {
		name: string;
		dives: number;
		average: number;
		best: number;
		averageGame: number | null;
		qualified: boolean;
		isYou: boolean;
	}
	let boardView: 'day' | 'all' = 'day';
	let boardDate = '';
	let boardDay: LeaderRow[] = [];
	let boardAll: AllTimeRow[] = [];
	let boardDays: { date: string; dayNumber: number }[] = [];
	let boardDayNumber: number | null = null;
	let isAdmin = false;

	async function loadBoard(dayNumber: number | null = boardDayNumber) {
		try {
			const qs = dayNumber ? `?day=${dayNumber}` : '';
			const b = await fetch(`/krillion/api/leaderboard${qs}`).then((x) => x.json());
			boardDate = b.date;
			boardDay = b.day ?? [];
			boardAll = b.allTime ?? [];
			boardDays = b.days ?? [];
			boardDayNumber = dayNumber;
		} catch {
			boardDay = [];
		}
	}

	onMount(async () => {
		loadBoard(null);
		fetch('/api/auth/me')
			.then((x) => x.json())
			.then((m) => {
				const roles: string[] = m.roles ?? [];
				isAdmin = roles.includes('site:admin') || roles.includes('krillion:admin');
			})
			.catch(() => (isAdmin = false));
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
				restoreToday();
			}
		} catch {
			me = null;
		}
	});

	// Signed in and already submitted today: show that dive again, with the
	// latest scores, and put its answers back in the boxes so it can be edited
	// and resubmitted (a resubmission replaces it).
	function restoreToday() {
		const today = etDate();
		const mine = myDives.find((d) => d.date === today);
		if (!mine || result) return;
		const scoredRounds: ScoredRound[] =
			mine.scored ??
			mine.rounds.map((r) => ({
				round: r.round,
				prompt: r.prompt,
				submitted: r.answer,
				match: r.answer,
				miss: r.miss || !r.answer,
				gamePoints: r.gamePoints,
				points: 0,
				count: null
			}));
		result = {
			dayNumber: mine.day_number,
			date: mine.date,
			status: mine.scored ? 'scored' : 'waiting',
			rounds: scoredRounds,
			gameScore: mine.game_score,
			updatedScore: mine.updated_score,
			countsAsOf: day?.countsAsOf ?? null,
			notify: mine.notify
		};
		restored = true;
		formOpen = false;
		notify = mine.notify;
		rows = scoredRounds.map((r) => {
			const text = r.miss ? '' : (r.match ?? r.submitted ?? '');
			return { ...blankRow(), answer: text, original: text, prompt: r.prompt ?? '' };
		});
	}

	function readPaste() {
		if (!paste.trim()) {
			pasted = null;
			return;
		}
		const d = parsePaste(paste, day?.scored ? day.prompts : []);
		rows = d.rounds.map((r) => ({
			answer: r.answer ?? '',
			original: r.answer ?? '',
			typed: r.typed,
			gamePoints: r.gamePoints,
			othersChose: r.othersChose,
			prompt: r.prompt,
			found: r.found
		}));
		pasted = { dayNumber: d.dayNumber, score: d.score, betterThan: d.betterThan, found: d.found };
	}

	function clearAll() {
		paste = '';
		pasted = null;
		rows = [0, 1, 2, 3, 4, 5, 6].map(blankRow);
	}

	$: answered = rows.filter((r) => r.answer.trim()).length;
	$: edited = rows.some((r) => r.answer.trim() !== r.original);
	$: canSubmit =
		!busy &&
		answered > 0 &&
		(!notify || Boolean(me) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

	async function submit() {
		busy = true;
		error = '';
		result = null;
		try {
			const body = {
				dayNumber: pasted?.dayNumber ?? null,
				// The paste's own total only describes the paste, not edits to it.
				gameScore: edited ? null : (pasted?.score ?? null),
				betterThan: pasted?.betterThan ?? null,
				rounds: rows.map((r) => {
					const same = r.answer.trim() === r.original;
					return {
						answer: r.answer.trim(),
						typed: r.answer.trim() ? null : r.typed,
						gamePoints: same ? r.gamePoints : null,
						othersChose: same ? r.othersChose : null,
						prompt: r.prompt,
						found: r.found && same
					};
				}),
				notify,
				email: me ? null : email.trim()
			};
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
			restored = false;
			formOpen = false;
			if (me) {
				const m = await fetch('/krillion/api/mine').then((x) => x.json());
				myDives = m.dives ?? [];
				loadBoard(boardDayNumber);
			}
		} catch (err) {
			error = `Couldn't submit: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			busy = false;
		}
	}

	function promptLabel(i: number): string {
		if (day?.scored && day.prompts[i]) return day.prompts[i].text;
		// Before the day's counts arrive, the paste's own prompt text is the best label.
		const p = rows[i]?.prompt;
		return p ? p.charAt(0) + p.slice(1).toLowerCase() : `Round ${i + 1}`;
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
		<a href={resolve('/me')}>← Back to Me</a>
		<span class="nav-right">
			{#if isAdmin}<a class="pill" href={resolve('/krillion/admin')}>Admin</a>{/if}
			{#if !me}<a class="pill" href="{resolve('/account')}?redirect=/krillion">Sign in</a>{/if}
		</span>
	</nav>

	<main>
		<header class="head">
			<h1>Krillion, rescored</h1>
			<p class="intro">
				<a href="https://krillion.io" target="_blank" rel="noopener">Krillion</a> scores answers in
				six hand-picked tiers. This rescores every answer by how many players actually gave it: the
				most common answer on each prompt scores a little, the rarest scores {TOP_MIN}–{TOP_MAX} (more
				on broad prompts, where it really is one of a handful; less on narrow ones), and everything in
				between follows the counts.
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

		{#if !formOpen && result}
			<section class="card compact">
				<span
					>✓ Your dive #{result.dayNumber} is submitted{#if result.status === 'waiting'}
						— scored when today's counts arrive{/if}.</span
				>
				<button type="button" class="small" on:click={() => (formOpen = true)}>Edit answers</button>
			</section>
		{:else}
			<section class="card">
				<h2>Your dive</h2>
				<p class="hint">
					Paste your end screen from krillion.io — the whole page or just the part with your answers
					(on a phone, select what you can and copy). Whatever rounds it finds fill in below; type
					or fix the rest. Leave a round blank if you missed it.
				</p>
				<textarea
					bind:value={paste}
					on:input={readPaste}
					rows="5"
					placeholder="Paste your end screen here (optional)…"
				></textarea>
				{#if pasted}
					<p class="found" class:warn={pasted.found < 7}>
						{#if pasted.found === 7}
							Found all 7 rounds{pasted.dayNumber ? ` from dive #${pasted.dayNumber}` : ''}. Check
							them below, then submit.
						{:else if pasted.found === 0}
							Couldn't find any rounds in that paste — type your answers below instead.
						{:else}
							Found {pasted.found} of 7 rounds — fill in the rest below.
						{/if}
						{#if pasted.found > 0 && !pasted.dayNumber}
							<span class="sub">(No dive number in the paste, so this counts as today's dive.)</span
							>
						{/if}
					</p>
				{/if}

				<div class="rows">
					{#each rows as r, i (i)}
						<label
							class="row"
							class:from-paste={r.found && r.answer.trim() === r.original && r.answer}
						>
							<span class="row-label"><b>{i + 1}.</b> {promptLabel(i)}</span>
							<span class="row-input">
								<input
									bind:value={r.answer}
									list="k-answers-{i}"
									autocomplete="off"
									placeholder={r.typed
										? `missed — you typed "${r.typed}"`
										: 'answer (blank = miss)'}
								/>
								<span class="row-tag">
									{#if r.found && r.answer && r.answer.trim() === r.original}
										from paste{#if r.gamePoints !== null}&nbsp;· {r.gamePoints} pts{/if}
									{:else if r.answer.trim()}
										typed
									{:else if r.found}
										miss
									{/if}
								</span>
							</span>
						</label>
						{#if day?.answers && day.prompts[i]}
							<datalist id="k-answers-{i}">
								{#each day.answers[day.prompts[i].id] ?? [] as a (a)}<option value={a}
									></option>{/each}
							</datalist>
						{/if}
					{/each}
				</div>
				{#if paste || answered}
					<button type="button" class="link" on:click={clearAll}>Clear and start over</button>
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
							<a href="{resolve('/account')}?redirect=/krillion">Sign in</a> to keep your scores on your
							account.
						</p>
					{/if}
				</div>

				<button type="button" class="primary" disabled={!canSubmit} on:click={submit}>
					{busy ? 'Scoring…' : 'Rescore my dive'}
				</button>
				{#if error}<p class="warn">{error}</p>{/if}
			</section>
		{/if}

		{#if result}
			<section class="card result">
				<h2>
					Dive #{result.dayNumber}{#if restored}<span class="saved-flag">your saved dive</span>{/if}
				</h2>
				{#if restored}
					<p class="sub">
						You already submitted today. Here it is with the latest scores — change any answer above
						and submit again to replace it.
					</p>
				{/if}
				{#if result.status === 'waiting'}
					<p>
						Saved. Today's counts arrive at {day?.nextFetch ?? '11:00 ET'} — come back then for your
						rescored total{#if result.notify}, or watch for the email after midnight{/if}.
					</p>
					<table>
						<thead><tr><th>#</th><th>Your answer</th><th class="num">Game</th></tr></thead>
						<tbody>
							{#each result.rounds as r (r.round)}
								<tr class:miss={r.miss}>
									<td>{r.round}</td>
									<td>{r.miss ? 'miss' : r.submitted}</td>
									<td class="num">{r.gamePoints ?? '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<div class="totals">
						<div>
							<span class="n">{result.gameScore ?? '—'}</span><span class="l">game score</span>
						</div>
						<div>
							<span class="n">{result.updatedScore?.toFixed(1)}</span><span class="l">rescored</span
							>
						</div>
						{#if adjustment !== null}
							<div>
								<span class="n adj" class:up={adjustment > 0} class:down={adjustment < 0}
									>{adjustment > 0 ? '+' : ''}{adjustment.toFixed(1)}</span
								><span class="l">total adjustment</span>
							</div>
						{/if}
					</div>
					<table>
						<thead>
							<tr
								><th>#</th><th>Answer</th><th class="num">Players</th><th
									class="num"
									title="Percentile of rarity: the share of players whose answer was more common than yours"
									>Rarity</th
								><th class="num">Game</th><th class="num">Rescored</th></tr
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
									<td
										class="num"
										title={r.rarity != null
											? `Rarer than ${formatPercentile(r.rarity)} of players' answers`
											: undefined}>{r.rarity != null ? formatPercentile(r.rarity) : '—'}</td
									>
									<td class="num">{r.gamePoints ?? '—'}</td>
									<td class="num"><b>{r.points.toFixed(1)}</b></td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if shareText}
						<div class="share">
							<pre>{shareText}</pre>
							<button type="button" on:click={copyShare}
								>{copied ? 'Copied!' : 'Copy to share'}</button
							>
						</div>
					{/if}
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

		<section class="card board">
			<div class="board-head">
				<h2>Leaderboard</h2>
				<div class="tabs">
					<button
						type="button"
						class:on={boardView === 'day'}
						aria-pressed={boardView === 'day'}
						on:click={() => (boardView = 'day')}>By day</button
					>
					<button
						type="button"
						class:on={boardView === 'all'}
						aria-pressed={boardView === 'all'}
						on:click={() => (boardView = 'all')}>All time</button
					>
				</div>
			</div>
			<p class="hint">
				Everyone who submits while signed in, by rescored total. All time ranks average rescored
				total, once you have {MIN_DIVES_FOR_AVERAGE} dives. Totals only — no answers, so it never spoils
				the dive.{#if !me}
					<a href="{resolve('/account')}?redirect=/krillion">Sign in</a> to be on it.{/if}
			</p>

			{#if boardView === 'day'}
				<label class="day-pick">
					<span>Dive</span>
					<select
						value={boardDayNumber ?? ''}
						on:change={(e) => loadBoard(Number(e.currentTarget.value) || null)}
					>
						<option value="">Today</option>
						{#each boardDays as d (d.date)}
							<option value={d.dayNumber}>#{d.dayNumber} ({d.date})</option>
						{/each}
					</select>
				</label>
				{#if boardDay.length}
					<table>
						<thead>
							<tr
								><th>#</th><th>Name</th><th class="num">Game</th><th class="num">Rescored</th><th
									class="num"
									title="All-time average rescored total, once a player has {MIN_DIVES_FOR_AVERAGE} dives"
									>Avg</th
								></tr
							>
						</thead>
						<tbody>
							{#each boardDay as r, i (r.name + i)}
								<tr class:you={r.isYou}>
									<td>{r.updatedScore === null ? '—' : i + 1}</td>
									<td
										>{r.name}{#if r.isYou}<span class="you-flag">you</span>{/if}</td
									>
									<td class="num">{r.gameScore ?? '—'}</td>
									<td class="num"
										><b>{r.updatedScore === null ? 'waiting' : r.updatedScore.toFixed(1)}</b></td
									>
									<td class="num sub"
										>{r.dives >= MIN_DIVES_FOR_AVERAGE && r.average !== null
											? r.average.toFixed(1)
											: `${r.dives}/${MIN_DIVES_FOR_AVERAGE}`}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="sub">
						Nobody signed in has submitted {boardDate ? `for ${boardDate}` : ''} yet.
					</p>
				{/if}
			{:else if boardAll.length}
				<table>
					<thead>
						<tr
							><th>#</th><th>Name</th><th class="num">Dives</th><th class="num">Average</th><th
								class="num">Best</th
							><th class="num">Avg game</th></tr
						>
					</thead>
					<tbody>
						{#each boardAll as r, i (r.name + i)}
							{#if !r.qualified && (i === 0 || boardAll[i - 1].qualified)}
								<tr class="divider">
									<td colspan="6"
										>Still building to {MIN_DIVES_FOR_AVERAGE} dives — not ranked on average yet</td
									>
								</tr>
							{/if}
							<tr class:you={r.isYou} class:unranked={!r.qualified}>
								<td>{r.qualified ? i + 1 : '—'}</td>
								<td
									>{r.name}{#if r.isYou}<span class="you-flag">you</span>{/if}</td
								>
								<td class="num">{r.qualified ? r.dives : `${r.dives}/${MIN_DIVES_FOR_AVERAGE}`}</td>
								<td class="num"><b>{r.average.toFixed(1)}</b></td>
								<td class="num">{r.best.toFixed(1)}</td>
								<td class="num">{r.averageGame === null ? '—' : r.averageGame.toFixed(0)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="sub">No scored dives yet.</p>
			{/if}
		</section>

		<section class="how">
			<h2>How the rescoring works</h2>
			<ul>
				<li>
					Each answer's score comes from its <b>surprisal</b> — how unlikely it was, given how many players
					gave it. Rarer answers score more, smoothly.
				</li>
				<li>
					The most common answer on a prompt scores a small amount that's higher when no single
					answer dominates; the rarest scores between {TOP_MIN} and {TOP_MAX}, placed by how broad
					the prompt is against every prompt so far, on a log scale: {TOP_MAX} for the broadest we've
					seen, {TOP_MIN}
					for the narrowest (say, ten possible countries). Breadth is √(possible answers) ÷ the sum of
					each answer's squared share.
				</li>
				<li>
					Each prompt's curve is shaped so its average and spread sit close to Krillion's own —
					mostly Krillion's tiers re-dealt in order of how common each answer really was.
				</li>
				<li>
					Counts are taken from krillion.io twice a day, at 11:00 and 23:00 ET; your score updates
					with each. Misses score 0, as in the game.
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

	.card.compact {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.7rem 1rem;
		font-size: 0.9rem;
		color: #1e6b36;
		background: #f4fbf6;
		border-color: #cfe8d6;
	}

	button.small {
		padding: 0.3rem 0.8rem;
		background: #fff;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
		font-size: 0.85rem;
		color: #333;
		cursor: pointer;
	}

	button.small:hover {
		border-color: #0066cc;
		color: #0066cc;
	}

	.share {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}

	.share pre {
		margin: 0;
		padding: 0.75rem 1rem;
		background: #f6f8fa;
		border: 1px solid #e3e7ec;
		border-radius: 8px;
		font-family: inherit;
		font-size: 1rem;
		line-height: 1.5;
		white-space: pre;
	}

	.share button {
		padding: 0.45rem 1rem;
		background: #0066cc;
		border: 1px solid #0066cc;
		border-radius: 6px;
		font: inherit;
		font-size: 0.9rem;
		color: #fff;
		cursor: pointer;
	}

	.saved-flag {
		margin-left: 0.6rem;
		padding: 0.1rem 0.5rem;
		background: #eaf7ee;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 500;
		color: #1e6b36;
		vertical-align: middle;
	}

	.found {
		margin: 0.5rem 0 0 0;
		font-size: 0.9rem;
		color: #1e6b36;
	}

	.found.warn {
		color: #9a5b00;
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-top: 1rem;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.row-label {
		font-size: 0.85rem;
		color: #555;
	}

	.row-input {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.row-tag {
		flex: none;
		min-width: 6rem;
		font-size: 0.75rem;
		color: #888;
	}

	.row.from-paste input {
		border-color: #9fd3b0;
		background: #f4fbf6;
	}

	button.link {
		margin-top: 0.5rem;
		padding: 0;
		background: none;
		border: 0;
		font: inherit;
		font-size: 0.85rem;
		color: #0066cc;
		cursor: pointer;
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

	.totals .n.adj.up {
		color: #1e6b36;
	}

	.totals .n.adj.down {
		color: #9a2c2c;
	}

	.totals .l {
		font-size: 0.85rem;
		color: #666;
	}

	.nav-right {
		display: flex;
		gap: 0.5rem;
	}

	.board-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.board-head h2 {
		margin: 0;
	}

	.board .tabs {
		margin: 0;
	}

	.day-pick {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: #555;
	}

	.day-pick select {
		padding: 0.3rem 0.5rem;
		border: 1px solid #d5dae1;
		border-radius: 6px;
		font: inherit;
	}

	tr.divider td {
		padding-top: 0.9rem;
		font-size: 0.8rem;
		color: #888;
		border-bottom: 1px solid #eee;
	}

	tr.unranked td {
		color: #777;
	}

	tr.you td {
		background: #f0f7ff;
	}

	.you-flag {
		margin-left: 0.4rem;
		padding: 0.05rem 0.4rem;
		background: #0b62a4;
		border-radius: 10px;
		font-size: 0.7rem;
		color: #fff;
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
