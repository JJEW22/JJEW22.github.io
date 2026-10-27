<!-- src/routes/admin/+page.svelte -->
<script>
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	// Every role the site checks. site:admin implies all of them (hasRole), so it
	// comes first; the rest are one feature's admin each.
	const KNOWN_ROLES = [
		'site:admin',
		'pickem:admin',
		'pizza:admin',
		'krillion:admin',
		'ultra:admin',
		'snow:admin',
		'jpflicks:admin',
		'housing:admin'
	];
	// The column header: "pickem" for pickem:admin, keeping the table narrow.
	const roleLabel = (/** @type {string} */ r) => r.replace(/:admin$/, '');

	let status = 'loading'; // loading | denied | ready
	let emailsText = '';
	/** @type {{ email: string, link: string, sent: boolean }[]} */
	let generated = [];
	/** @type {{ email: string, used_by: string | null }[]} */
	let inviteList = [];
	/**
	 * savedRoles / real_name are what the server has; roles / nameDraft are the
	 * row's edits. The row's Save sends whichever of the two differ.
	 * @typedef {{ id: number, username: string, email: string | null, roles: string[], savedRoles: string[], real_name: string | null, nameDraft: string }} Account
	 * @type {Account[]}
	 */
	let users = [];
	/** @type {Record<number, { link: string, expiresAt: string }>} */
	let resetLinks = {};
	let msg = '';
	let msgBad = false;
	let busy = false;
	/** @type {number | null} */
	let savingId = null;

	onMount(async () => {
		const me = await fetch('/api/auth/me')
			.then((r) => r.json())
			.catch(() => ({ roles: [] }));
		if (!me.user || !(me.roles || []).includes('site:admin')) {
			status = 'denied';
			return;
		}
		status = 'ready';
		await Promise.all([loadInvites(), loadUsers()]);
	});

	async function loadInvites() {
		inviteList = await fetch('/api/admin/invites')
			.then((r) => (r.ok ? r.json() : []))
			.catch(() => []);
	}
	async function loadUsers() {
		const rows = await fetch('/api/admin/users')
			.then((r) => (r.ok ? r.json() : []))
			.catch(() => []);
		users = rows.map((/** @type {Account} */ u) => ({
			...u,
			roles: u.roles || [],
			savedRoles: u.roles || [],
			nameDraft: u.real_name ?? ''
		}));
	}

	/** @param {string} text */
	function say(text, bad = false) {
		msg = text;
		msgBad = bad;
	}

	async function generateInvites() {
		say('');
		busy = true;
		const emails = emailsText
			.split(/[\s,]+/)
			.map((e) => e.trim())
			.filter(Boolean);
		if (emails.length === 0) {
			say('Enter at least one email.', true);
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
			say(data?.error || 'Could not generate invites.', true);
			return;
		}
		generated = data.invites || [];
		emailsText = '';
		await loadInvites();
	}

	/** @param {Account} u @param {string} role */
	function toggleRole(u, role) {
		u.roles = u.roles.includes(role) ? u.roles.filter((r) => r !== role) : [...u.roles, role];
		users = users; // nudge reactivity
	}

	/** @param {string[]} a @param {string[]} b */
	const sameRoles = (a, b) => a.length === b.length && a.every((r) => b.includes(r));
	/** @param {Account} u */
	const nameChanged = (u) => u.nameDraft.trim() !== (u.real_name ?? '');
	/** @param {Account} u */
	const rolesChanged = (u) => !sameRoles(u.roles, u.savedRoles);

	// One Save per row: the name and the roles go to the same endpoint as two
	// requests, because it takes one change per call. The name goes first; it is
	// the one that can be refused (taken, too long), and a refusal stops there
	// so the row stays dirty and nothing is half-saved silently.
	/** @param {Account} u */
	async function saveRow(u) {
		say('');
		savingId = u.id;
		const saved = [];
		try {
			if (nameChanged(u)) {
				const r = await fetch('/api/admin/users', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ userId: u.id, name: u.nameDraft })
				});
				const data = await r.json().catch(() => null);
				if (!r.ok) {
					say(data?.error || `Could not save ${u.username}'s name.`, true);
					return;
				}
				u.real_name = data?.name ?? null;
				u.nameDraft = u.real_name ?? '';
				saved.push(u.real_name ? `name "${u.real_name}"` : 'name cleared');
			}
			if (rolesChanged(u)) {
				const r = await fetch('/api/admin/users', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ userId: u.id, roles: u.roles })
				});
				if (!r.ok) {
					say(`Could not save ${u.username}'s roles.`, true);
					return;
				}
				u.savedRoles = [...u.roles];
				saved.push('roles');
			}
			say(`Saved ${u.username}: ${saved.join(', ')}.`);
		} finally {
			savingId = null;
			users = users;
		}
	}

	// Mints a link for someone who is locked out; you deliver it yourself. Works
	// with no mail provider configured, which is the point of having it.
	/** @param {Account} u */
	async function makeResetLink(u) {
		say('');
		const r = await fetch('/api/admin/reset-link', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: u.id })
		});
		const data = await r.json().catch(() => ({}));
		if (!r.ok || data.ok === false) {
			say(data?.message || data?.error || 'Could not create a reset link.', true);
			return;
		}
		resetLinks = { ...resetLinks, [u.id]: { link: data.link, expiresAt: data.expiresAt } };
		say(`Reset link for ${data.username} — send it to them, it works once and expires in 24h.`);
	}

	/** @param {string} text */
	async function copy(text) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			/* no clipboard access: the link is still selectable */
		}
	}
</script>

<svelte:head>
	<title>Admin</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="page-background">
	<div class="container">
		<nav class="breadcrumb"><a href={resolve('/')}>&larr; Back to Home</a></nav>
		<main>
			<h1>Site admin</h1>

			{#if status === 'loading'}
				<p class="muted">Loading…</p>
			{:else if status === 'denied'}
				<p class="muted">You don't have access to this page.</p>
				<p><a href={resolve('/account')}>Sign in</a> with a site-admin account.</p>
			{:else}
				{#if msg}<p class="msg" class:bad={msgBad}>{msg}</p>{/if}

				<section class="card">
					<h2>Invite people</h2>
					<p class="muted">One account per email. Paste emails (commas, spaces, or new lines).</p>
					<textarea
						bind:value={emailsText}
						rows="3"
						placeholder="zeke@example.com, elyse@example.com"
					></textarea>
					<button class="btn" on:click={generateInvites} disabled={busy}
						>{busy ? 'Generating…' : 'Generate invite links'}</button
					>

					{#if generated.length}
						<h3>New invites</h3>
						<p class="muted">
							Emailed automatically. Anything marked <b>not sent</b> needs passing on by hand — the link
							is valid either way.
						</p>
						<ul class="links">
							{#each generated as g, i (i)}
								<li>
									<span class="who">{g.email}</span>
									<span class={g.sent ? 'sent' : 'unsent'}
										>{g.sent ? '✓ emailed' : '! not sent'}</span
									>
									<input readonly value={g.link} />
									<button class="mini" on:click={() => copy(g.link)}>Copy</button>
								</li>
							{/each}
						</ul>
					{/if}

					{#if inviteList.length}
						<h3>All invites</h3>
						<div class="scroll">
							<table class="invites">
								<thead><tr><th>Email</th><th>Status</th></tr></thead>
								<tbody>
									{#each inviteList as inv, i (i)}
										<tr>
											<td>{inv.email}</td>
											<td>{inv.used_by ? `used by ${inv.used_by}` : 'unused'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>

				<section class="card">
					<h2>Accounts &amp; roles</h2>
					<p class="muted">
						Grant site-wide or feature-specific admin. <b>site</b> implies everything.
						<b>Name</b> is the person's name across the site (separate from their username); saving
						it here overrides theirs and updates their snow predictions. Each row's <b>Save</b> saves
						its name and roles together.
					</p>

					<!--
						The table scrolls sideways when it doesn't fit; the actions column
						is pinned to its right edge, so a row's Save is always in reach.
						Under 720px each row becomes a card instead (see the media query).
					-->
					<div class="scroll">
						<table class="accounts">
							<thead>
								<tr>
									<th>User</th>
									<th>Name</th>
									{#each KNOWN_ROLES as r (r)}
										<th class="rc" title={r}>{roleLabel(r)}</th>
									{/each}
									<th class="actions-col"><span class="sr-only">Actions</span></th>
								</tr>
							</thead>
							<tbody>
								{#each users as u (u.id)}
									{@const dirty = nameChanged(u) || rolesChanged(u)}
									<tr class:dirty>
										<td class="user">
											<div class="who-cell">
												<span class="strong">{u.username}</span>
												{#if u.email}<span class="email">{u.email}</span>{/if}
											</div>
										</td>
										<td class="name-cell">
											<label>
												<span class="cell-label">Name</span>
												<input
													class="name-input"
													bind:value={u.nameDraft}
													placeholder="(no name)"
													maxlength="60"
												/>
											</label>
										</td>
										{#each KNOWN_ROLES as r (r)}
											<td class="rc">
												<label title={r}>
													<input
														type="checkbox"
														checked={u.roles.includes(r)}
														on:change={() => toggleRole(u, r)}
													/>
													<span class="cell-label">{roleLabel(r)}</span>
												</label>
											</td>
										{/each}
										<td class="actions-col">
											<div class="actions">
												<button
													class="mini"
													on:click={() => saveRow(u)}
													disabled={!dirty || savingId === u.id}
												>
													{savingId === u.id ? 'Saving…' : 'Save'}
												</button>
												<button class="mini ghost" on:click={() => makeResetLink(u)}
													>Reset link</button
												>
											</div>
										</td>
									</tr>
									{#if resetLinks[u.id]}
										<tr class="reset-row">
											<td colspan={KNOWN_ROLES.length + 3}>
												<code class="reset-link">{resetLinks[u.id].link}</code>
												<button class="mini" on:click={() => copy(resetLinks[u.id].link)}
													>Copy</button
												>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}
		</main>
	</div>
</div>

<style>
	.page-background {
		min-height: 100vh;
		background-color: #4a9b9b;
		padding: 1rem 0;
	}
	.container {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem;
	}
	.breadcrumb {
		margin-bottom: 1.5rem;
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
		margin: 0 0 1.5rem;
		color: #1a1a1a;
	}
	h2 {
		font-size: 1.25rem;
		margin: 0 0 0.5rem;
		color: #1a1a1a;
	}
	h3 {
		font-size: 1rem;
		margin: 1.25rem 0 0.5rem;
		color: #374151;
	}
	.card {
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		min-width: 0;
	}
	.muted {
		color: #6b7280;
		font-size: 0.9rem;
	}
	.msg {
		background: #ecfdf5;
		color: #065f46;
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
	}
	.msg.bad {
		background: #fef2f2;
		color: #b42318;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.65rem 0.9rem;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.95rem;
		margin-bottom: 0.75rem;
	}
	textarea:focus {
		outline: none;
		border-color: #2c5aa0;
	}
	.btn {
		padding: 0.6rem 1.4rem;
		background: #2c5aa0;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.mini {
		padding: 0.3rem 0.7rem;
		background: #2c5aa0;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.mini:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.mini.ghost {
		background: #fff;
		border: 1px solid #d5dae1;
		color: #374151;
	}
	.reset-row td {
		background: #f8fafc;
	}
	.reset-link {
		font-size: 0.75rem;
		word-break: break-all;
		margin-right: 0.5rem;
	}
	/* Whether the invite actually went out, or still needs passing on by hand */
	.sent {
		color: #166534;
		font-size: 0.75rem;
	}
	.unsent {
		color: #b45309;
		font-size: 0.75rem;
	}
	.links {
		list-style: none;
		padding: 0;
	}
	.links li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.links .who {
		min-width: 12rem;
		font-size: 0.85rem;
		color: #374151;
	}
	.links input {
		flex: 1;
		min-width: 0;
		padding: 0.4rem 0.6rem;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 0.8rem;
		color: #6b7280;
	}

	/* Tables scroll inside their card rather than pushing the page wider. */
	.scroll {
		overflow-x: auto;
		margin-top: 0.5rem;
	}
	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid #f0f0f0;
		font-size: 0.9rem;
		vertical-align: middle;
	}
	th {
		color: #374151;
		font-weight: 600;
		white-space: nowrap;
	}
	th.rc,
	td.rc {
		text-align: center;
		padding-left: 0.35rem;
		padding-right: 0.35rem;
	}
	.strong {
		font-weight: 600;
	}
	.who-cell {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.email {
		color: #6b7280;
		font-size: 0.8rem;
	}
	.name-input {
		width: 9rem;
		padding: 0.25rem 0.4rem;
		border: 1px solid #d5dae1;
		border-radius: 5px;
		font: inherit;
		font-size: 0.85rem;
	}
	tr.dirty td {
		background: #fffbeb;
	}
	/* Labels that only show once a row becomes a card. */
	.cell-label {
		display: none;
	}
	.rc input {
		width: 1rem;
		height: 1rem;
		cursor: pointer;
	}

	/* The actions column sits outside the table's grid lines, pinned right. */
	.actions-col {
		position: sticky;
		right: 0;
		padding-left: 0.9rem;
		background: #fff;
		border-bottom-color: transparent;
		box-shadow: -8px 0 8px -8px rgba(0, 0, 0, 0.18);
	}
	tr.dirty td.actions-col {
		background: #fff;
	}
	.actions {
		display: flex;
		gap: 0.35rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@media (max-width: 720px) {
		.page-background {
			padding: 0;
		}
		.container {
			padding: 0.75rem;
		}
		.breadcrumb {
			margin-bottom: 0.75rem;
		}
		main {
			padding: 1.25rem 1rem;
		}
		h1 {
			font-size: 1.5rem;
			margin-bottom: 1rem;
		}
		.card {
			padding: 1rem;
		}
		.links .who {
			min-width: 0;
			flex-basis: 100%;
		}

		/* Each account row becomes a card: who they are, their name, the
		   roles as labelled checkboxes, then Save. */
		.accounts thead {
			display: none;
		}
		.accounts,
		.accounts tbody {
			display: block;
		}
		.accounts tr {
			display: flex;
			flex-wrap: wrap;
			gap: 0.4rem 0.5rem;
			padding: 0.85rem;
			margin-bottom: 0.75rem;
			border: 1px solid #e5e7eb;
			border-radius: 10px;
		}
		.accounts tr.dirty {
			background: #fffbeb;
			border-color: #f3d48a;
		}
		.accounts td {
			display: block;
			padding: 0;
			border: none;
			background: none;
		}
		.accounts tr.dirty td {
			background: none;
		}
		.accounts .user,
		.accounts .name-cell {
			flex-basis: 100%;
		}
		.accounts .name-cell label {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
		}
		.accounts .name-input {
			width: 100%;
			box-sizing: border-box;
			padding: 0.45rem 0.55rem;
			font-size: 0.95rem;
		}
		.cell-label {
			display: inline;
			font-size: 0.85rem;
			color: #374151;
		}
		.name-cell .cell-label {
			font-size: 0.8rem;
			color: #6b7280;
		}
		.accounts td.rc label {
			display: inline-flex;
			align-items: center;
			gap: 0.35rem;
			padding: 0.35rem 0.6rem;
			border: 1px solid #e5e7eb;
			border-radius: 999px;
			background: #fff;
			cursor: pointer;
		}
		.accounts .actions-col {
			position: static;
			flex-basis: 100%;
			box-shadow: none;
			margin-top: 0.3rem;
		}
		.accounts tr.dirty td.actions-col {
			background: none;
		}
		.actions .mini {
			flex: 1;
			padding: 0.55rem 0.7rem;
			font-size: 0.9rem;
		}
		.reset-row {
			margin-top: -0.5rem;
		}
	}
</style>
