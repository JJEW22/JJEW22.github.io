<!-- src/routes/account/+page.svelte -->
<script>
    import { onMount } from 'svelte';

    // Resend usually delivers in seconds, but greylisting and spam filtering on the
    // receiving end can hold a message a good while longer. Quote the pessimistic
    // figure so nobody gives up on a link that is merely slow.
    const DELIVERY_MINUTES = 15;

    let mode = 'loading'; // loading | signedin | signup | login | forgot | reset
    let me = null;
    let inviteToken = '';
    let resetToken = '';
    let redirectTo = '/';
    let lockedEmail = '';
    let username = '';
    let password = '';
    let identifier = '';
    let error = '';
    let notice = '';
    let busy = false;

    onMount(async () => {
        const params = new URLSearchParams(window.location.search);
        inviteToken = params.get('invite') || '';
        resetToken = params.get('reset') || '';
        redirectTo = params.get('redirect') || '/';

        // A reset link is checked before anything else, and works even while
        // signed in — someone who has forgotten their password on one device may
        // well still be logged in on this one.
        if (resetToken) {
            const info = await fetch(`/api/auth/reset?token=${encodeURIComponent(resetToken)}`)
                .then((r) => r.json())
                .catch(() => ({ ok: false }));
            if (info.ok) {
                username = info.username;
                mode = 'reset';
            } else {
                error = info.error || 'This reset link is no longer valid.';
                mode = 'login';
            }
            return;
        }

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
    async function doForgot() {
        error = '';
        notice = '';
        busy = true;
        const r = await fetch('/api/auth/forgot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        const data = await r.json().catch(() => ({}));
        busy = false;
        if (!r.ok) {
            error = data.error || 'Could not send a reset link.';
            return;
        }
        // Identical for everyone, whether or not that account exists. The server
        // sends nothing for an unknown address and says so to no one; a message
        // here that admitted the difference would undo that. The "double-check
        // the address" line below is what quietly covers a typo.
        notice = 'A reset link is on its way. It can only be used once, and expires in an hour.';
    }

    async function doReset() {
        error = '';
        busy = true;
        const r = await fetch('/api/auth/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetToken, password })
        });
        const data = await r.json().catch(() => ({}));
        busy = false;
        if (!r.ok) {
            error = data.error || 'Could not reset your password.';
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
            {:else if mode === 'reset'}
                <p class="muted">Choose a new password for <b>{username}</b>.</p>
                <label class="field"><span>New password</span>
                    <input type="password" bind:value={password} placeholder="4+ characters"
                        on:keydown={(e) => e.key === 'Enter' && doReset()} />
                </label>
                <button class="btn" on:click={doReset} disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
                {#if error}<p class="err">{error}</p>{/if}
                <p class="muted small">This link works once. Setting a new password signs you out everywhere else.</p>
            {:else if mode === 'forgot'}
                <p class="muted">Enter your email or username and we'll send you a reset link.</p>
                <label class="field"><span>Email or username</span>
                    <input type="text" bind:value={identifier}
                        on:keydown={(e) => e.key === 'Enter' && doForgot()} />
                </label>
                <button class="btn" on:click={doForgot} disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
                {#if notice}
                    <p class="notice">{notice}</p>
                    <p class="muted small">
                        Don't see the email? It can take up to {DELIVERY_MINUTES} minutes to arrive —
                        check your spam folder too. If it still hasn't turned up after that,
                        double-check the address you entered, then contact the site admin.
                    </p>
                {/if}
                {#if error}<p class="err">{error}</p>{/if}
                <p class="muted small"><button class="linkish" on:click={() => { mode = 'login'; error = ''; notice = ''; }}>Back to sign in</button></p>
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
                <p class="muted small">
                    <button class="linkish" on:click={() => { mode = 'forgot'; error = ''; password = ''; }}>Forgot your password?</button>
                </p>
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
    .notice { color: #166534; background: #dcfce7; border-radius: 8px; padding: 0.6rem 0.8rem; font-size: 0.9rem; margin-top: 0.75rem; }
    /* A real button (keyboard-reachable, announced as a control) wearing a link's clothes */
    .linkish { background: none; border: none; padding: 0; font: inherit; color: #2c5aa0; text-decoration: underline; cursor: pointer; }
    .linkish:hover { color: #1e4080; }
</style>
