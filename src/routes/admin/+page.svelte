<!-- src/routes/admin/+page.svelte -->
<script>
    import { onMount } from 'svelte';

    const KNOWN_ROLES = ['site:admin', 'pickem:admin'];

    let status = 'loading'; // loading | denied | ready
    let emailsText = '';
    let generated = [];
    let inviteList = [];
    let users = [];
    let msg = '';
    let busy = false;

    onMount(async () => {
        const me = await fetch('/api/auth/me').then((r) => r.json()).catch(() => ({ roles: [] }));
        if (!me.user || !(me.roles || []).includes('site:admin')) {
            status = 'denied';
            return;
        }
        status = 'ready';
        await Promise.all([loadInvites(), loadUsers()]);
    });

    async function loadInvites() {
        inviteList = await fetch('/api/admin/invites').then((r) => (r.ok ? r.json() : [])).catch(() => []);
    }
    async function loadUsers() {
        users = await fetch('/api/admin/users').then((r) => (r.ok ? r.json() : [])).catch(() => []);
    }

    async function generateInvites() {
        msg = '';
        busy = true;
        const emails = emailsText
            .split(/[\s,]+/)
            .map((e) => e.trim())
            .filter(Boolean);
        if (emails.length === 0) {
            msg = 'Enter at least one email.';
            busy = false;
            return;
        }
        const r = await fetch('/api/admin/invites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails })
        });
        const data = await r.json();
        busy = false;
        if (!r.ok) {
            msg = data?.error || 'Could not generate invites.';
            return;
        }
        generated = data.invites || [];
        emailsText = '';
        await loadInvites();
    }

    function toggleRole(u, role) {
        const set = new Set(u.roles || []);
        if (set.has(role)) set.delete(role);
        else set.add(role);
        u.roles = [...set];
        users = users; // nudge reactivity
    }

    async function saveRoles(u) {
        msg = '';
        const r = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: u.id, roles: u.roles || [] })
        });
        if (r.ok) msg = `Saved roles for ${u.username}.`;
        else msg = 'Could not save roles.';
    }

    async function copy(text) {
        try { await navigator.clipboard.writeText(text); } catch (_) {}
    }
</script>

<svelte:head>
    <title>Admin</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="page-background">
    <div class="container">
        <nav class="breadcrumb"><a href="/">&larr; Back to Home</a></nav>
        <main>
            <h1>Site admin</h1>

            {#if status === 'loading'}
                <p class="muted">Loading…</p>
            {:else if status === 'denied'}
                <p class="muted">You don't have access to this page.</p>
                <p><a href="/account">Sign in</a> with a site-admin account.</p>
            {:else}
                {#if msg}<p class="msg">{msg}</p>{/if}

                <section class="card">
                    <h2>Invite people</h2>
                    <p class="muted">One account per email. Paste emails (commas, spaces, or new lines).</p>
                    <textarea bind:value={emailsText} rows="3" placeholder="zeke@example.com, elyse@example.com"></textarea>
                    <button class="btn" on:click={generateInvites} disabled={busy}>{busy ? 'Generating…' : 'Generate invite links'}</button>

                    {#if generated.length}
                        <h3>New links — send each person theirs</h3>
                        <ul class="links">
                            {#each generated as g}
                                <li>
                                    <span class="who">{g.email}</span>
                                    <input readonly value={g.link} />
                                    <button class="mini" on:click={() => copy(g.link)}>Copy</button>
                                </li>
                            {/each}
                        </ul>
                    {/if}

                    {#if inviteList.length}
                        <h3>All invites</h3>
                        <table>
                            <thead><tr><th>Email</th><th>Status</th></tr></thead>
                            <tbody>
                                {#each inviteList as inv}
                                    <tr>
                                        <td>{inv.email}</td>
                                        <td>{inv.used_by ? `used by ${inv.used_by}` : 'unused'}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    {/if}
                </section>

                <section class="card">
                    <h2>Accounts &amp; roles</h2>
                    <p class="muted">Grant site-wide or feature-specific admin. site:admin implies everything.</p>
                    <table>
                        <thead><tr><th>User</th><th>Email</th>{#each KNOWN_ROLES as r}<th class="rc">{r}</th>{/each}<th></th></tr></thead>
                        <tbody>
                            {#each users as u}
                                <tr>
                                    <td class="strong">{u.username}</td>
                                    <td class="muted">{u.email}</td>
                                    {#each KNOWN_ROLES as r}
                                        <td class="rc"><input type="checkbox" checked={(u.roles || []).includes(r)} on:change={() => toggleRole(u, r)} /></td>
                                    {/each}
                                    <td><button class="mini" on:click={() => saveRoles(u)}>Save</button></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </section>
            {/if}
        </main>
    </div>
</div>

<style>
    .page-background { min-height: 100vh; background-color: #4a9b9b; padding: 1rem 0; }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
    .breadcrumb { margin-bottom: 1.5rem; }
    .breadcrumb a { color: #666; text-decoration: none; font-size: 0.9rem; }
    main { background: white; border-radius: 12px; padding: 2.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h1 { font-size: 2rem; margin: 0 0 1.5rem; color: #1a1a1a; }
    h2 { font-size: 1.25rem; margin: 0 0 0.5rem; color: #1a1a1a; }
    h3 { font-size: 1rem; margin: 1.25rem 0 0.5rem; color: #374151; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .muted { color: #6b7280; font-size: 0.9rem; }
    .msg { background: #ecfdf5; color: #065f46; padding: 0.6rem 0.9rem; border-radius: 8px; }
    textarea { width: 100%; box-sizing: border-box; padding: 0.65rem 0.9rem; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 0.95rem; margin-bottom: 0.75rem; }
    textarea:focus { outline: none; border-color: #2c5aa0; }
    .btn { padding: 0.6rem 1.4rem; background: #2c5aa0; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .mini { padding: 0.3rem 0.7rem; background: #2c5aa0; color: white; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
    .links { list-style: none; padding: 0; }
    .links li { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .links .who { min-width: 12rem; font-size: 0.85rem; color: #374151; }
    .links input { flex: 1; padding: 0.4rem 0.6rem; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.8rem; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; }
    th.rc, td.rc { text-align: center; }
    .strong { font-weight: 600; }
</style>