<!-- src/routes/featureRequests/+page.svelte -->
<script>
    import { onMount } from 'svelte';

    const API = '/premierLeaguePickem/api';

    let loaded = false;
    let signedIn = false;
    let joined = false;
    let cycle = 0;
    let maxLen = 280;
    let nextReset = '';
    let mine = null;
    let submissions = null; // admin only

    let body = '';
    let saving = false;
    let status = '';

    onMount(load);

    async function load() {
        try {
            const r = await fetch(`${API}/features`);
            const d = await r.json();
            signedIn = !!d.signedIn;
            joined = !!d.joined;
            cycle = d.cycle;
            maxLen = d.maxLen;
            nextReset = d.nextReset || '';
            mine = d.mine ?? null;
            submissions = d.submissions ?? null;
            if (mine) body = mine;
        } catch (_) {
            status = 'Could not load.';
        }
        loaded = true;
    }

    async function submit() {
        if (!body.trim()) { status = 'Write something first.'; return; }
        saving = true;
        status = '';
        try {
            const r = await fetch(`${API}/features`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body })
            });
            const d = await r.json();
            if (r.ok) {
                mine = d.mine;
                status = 'Sent! Thanks — you can edit it until this cycle resets.';
            } else {
                status = d.error || 'Could not submit.';
            }
        } catch (_) {
            status = 'Network error.';
        }
        saving = false;
    }

    $: remaining = maxLen - body.length;
    $: resetText = nextReset ? new Date(nextReset).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '';
</script>

<svelte:head><title>Feature Requests — Premier League Pickem</title></svelte:head>

<div class="page-background">
    <div class="container">
        <nav class="breadcrumb"><a href="/premierLeaguePickem">&larr; Back to Pickem</a></nav>
        <main>
            <h1>Feature Requests</h1>
            <p class="lede">
                Got an idea to make the competition better? Drop one request per two-week cycle.
                Each one comes straight to me, and I'll build my favorite. The slate clears every cycle{#if resetText} (next reset: <b>{resetText}</b>){/if}.
            </p>

            {#if !loaded}
                <p class="muted">Loading…</p>
            {:else if !signedIn}
                <div class="gate"><p>Please <a href="/premierLeaguePickem">sign in on the Pickem page</a> to submit a request.</p></div>
            {:else if !joined}
                <div class="gate"><p>Join the competition on the <a href="/premierLeaguePickem">Pickem page</a> first, then you can send requests.</p></div>
            {:else}
                <section class="card">
                    <h2>Your request for this cycle</h2>
                    <textarea
                        maxlength={maxLen}
                        rows="3"
                        placeholder="e.g. Add a weekly head-to-head bonus against one random opponent"
                        bind:value={body}
                    ></textarea>
                    <div class="row">
                        <span class="count" class:low={remaining <= 20}>{remaining} left</span>
                        <button class="save-btn" on:click={submit} disabled={saving}>{saving ? 'Sending…' : mine ? 'Update request' : 'Send request'}</button>
                    </div>
                    {#if status}<p class="status">{status}</p>{/if}
                    {#if mine}<p class="muted">Submitted this cycle: “{mine}”</p>{/if}
                </section>

                {#if submissions}
                    <section class="card">
                        <h2>This cycle's requests ({submissions.length})</h2>
                        {#if submissions.length === 0}
                            <p class="muted">Nothing yet.</p>
                        {:else}
                            <ul class="sub-list">
                                {#each submissions as s}
                                    <li><b>{s.name}:</b> {s.body}</li>
                                {/each}
                            </ul>
                        {/if}
                    </section>
                {/if}
            {/if}
        </main>
    </div>
</div>

<style>
    .page-background { min-height: 100vh; background-color: #4a9b9b; padding: 1rem 0; }
    .container { max-width: 800px; margin: 0 auto; padding: 2rem; }
    .breadcrumb { margin-bottom: 1rem; }
    .breadcrumb a { color: #eafafa; text-decoration: none; font-size: 0.9rem; }
    main { background: #fff; border-radius: 12px; padding: 2.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h1 { font-size: 2rem; margin: 0 0 0.5rem; color: #1a1a1a; }
    .lede { color: #4b5563; line-height: 1.6; margin-bottom: 1.5rem; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .card h2 { font-size: 1.2rem; margin: 0 0 1rem; color: #1a202c; }
    textarea { width: 100%; box-sizing: border-box; padding: 0.75rem; font: inherit; border: 2px solid #e5e7eb; border-radius: 8px; resize: vertical; }
    textarea:focus { outline: none; border-color: #2c5aa0; }
    .row { display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; gap: 1rem; }
    .count { font-size: 0.85rem; color: #6b7280; }
    .count.low { color: #dc2626; }
    .save-btn { padding: 0.6rem 1.25rem; background: #2c5aa0; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
    .save-btn:hover { background: #1e4080; }
    .save-btn:disabled { opacity: 0.6; cursor: default; }
    .status { margin-top: 0.75rem; color: #059669; }
    .muted { color: #6b7280; font-size: 0.9rem; }
    .gate { background: #f3f7fc; border: 1px solid #d7e3f2; border-radius: 12px; padding: 1.5rem; text-align: center; }
    .sub-list { margin: 0; padding-left: 1.25rem; }
    .sub-list li { margin-bottom: 0.6rem; line-height: 1.5; }
</style>