<!-- src/routes/account/+page.svelte -->
<script>
    import { onMount } from 'svelte';

    let mode = 'loading'; // loading | signedin | signup | login
    let me = null;
    let inviteToken = '';
    let redirectTo = '/';
    let lockedEmail = '';
    let username = '';
    let password = '';
    let identifier = '';
    let error = '';
    let busy = false;

    onMount(async () => {
        const params = new URLSearchParams(window.location.search);
        inviteToken = params.get('invite') || '';
        redirectTo = params.get('redirect') || '/';

        const meRes = await fetch('/api/auth/me').then((r) => r.json()).catch(() => ({ user: null }));
        if (meRes.user) {
            me = meRes;
            mode = 'signedin';
            return;
        }
        if (inviteToken) {
            const info = await fetch(`/api/auth/invite-info?token=${encodeURIComponent(inviteToken)}`)
                .then((r) => r.json())
                .catch(() => ({ ok: false }));
            if (info.ok) {
                lockedEmail = info.email;
                mode = 'signup';
            } else {
                error = info.error || 'This invite link is invalid.';
                mode = 'login';
            }
        } else {
            mode = 'login';
        }
    });

    function go() {
        window.location.href = redirectTo;
    }

    async function doLogin() {
        error = '';
        busy = true;
        const r = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });
        const data = await r.json();
        busy = false;
        if (!r.ok) {
            error = data.error || 'Could not sign in.';
            return;
        }
        go();
    }
    async function doSignup() {
        error = '';
        busy = true;
        const r = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invite: inviteToken, username, password })
        });
        const data = await r.json();
        busy = false;
        if (!r.ok) {
            error = data.error || 'Could not create account.';
            return;
        }
        go();
    }
    async function doLogout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.reload();
    }
</script>

<svelte:head>
    <title>Account</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="page-background">
    <div class="container">
        <nav class="breadcrumb"><a href="/">&larr; Back to Home</a></nav>
        <main>
            <h1>Account</h1>

            {#if mode === 'loading'}
                <p class="muted">Loading…</p>
            {:else if mode === 'signedin'}
                <p>Signed in as <b>{me.user}</b>{#if me.email} — {me.email}{/if}.</p>
                <button class="btn" on:click={doLogout}>Log out</button>
            {:else if mode === 'signup'}
                <p class="muted">You're invited. Your email is set by your invite — pick a username and password.</p>
                <label class="field"><span>Email</span>
                    <input type="email" value={lockedEmail} disabled />
                </label>
                <label class="field"><span>Username</span>
                    <input type="text" bind:value={username} placeholder="pick a username" />
                </label>
                <label class="field"><span>Password</span>
                    <input type="password" bind:value={password} placeholder="4+ characters"
                        on:keydown={(e) => e.key === 'Enter' && doSignup()} />
                </label>
                <button class="btn" on:click={doSignup} disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
                {#if error}<p class="err">{error}</p>{/if}
            {:else}
                <p class="muted">Sign in with your email or username.</p>
                <label class="field"><span>Email or username</span>
                    <input type="text" bind:value={identifier} />
                </label>
                <label class="field"><span>Password</span>
                    <input type="password" bind:value={password}
                        on:keydown={(e) => e.key === 'Enter' && doLogin()} />
                </label>
                <button class="btn" on:click={doLogin} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                {#if error}<p class="err">{error}</p>{/if}
                <p class="muted small">Accounts are invite-only. Open your invite link to create one.</p>
            {/if}
        </main>
    </div>
</div>

<style>
    .page-background { min-height: 100vh; background-color: #4a9b9b; padding: 1rem 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 2rem; }
    .breadcrumb { margin-bottom: 2rem; }
    .breadcrumb a { color: #666; text-decoration: none; font-size: 0.9rem; }
    .breadcrumb a:hover { color: #0066cc; }
    main { background: white; border-radius: 12px; padding: 2.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h1 { font-size: 2rem; margin: 0 0 1.25rem; color: #1a1a1a; }
    .muted { color: #6b7280; }
    .muted.small { font-size: 0.85rem; margin-top: 1rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem; }
    .field span { font-size: 0.85rem; font-weight: 600; color: #4b5563; }
    .field input { padding: 0.65rem 0.9rem; font-size: 1rem; border: 2px solid #e5e7eb; border-radius: 8px; }
    .field input:focus { outline: none; border-color: #2c5aa0; }
    .field input:disabled { background: #f3f4f6; color: #6b7280; cursor: not-allowed; }
    .btn { padding: 0.7rem 1.6rem; background: #2c5aa0; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn:hover:not(:disabled) { background: #1e4080; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .err { color: #dc2626; font-size: 0.9rem; margin-top: 0.75rem; }
</style>
