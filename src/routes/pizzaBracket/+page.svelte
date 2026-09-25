<script>
    import { onMount } from 'svelte';
    import PizzaBracket from './PizzaBracket.svelte';

    let isAdmin = false;

    onMount(async () => {
        const me = await fetch('/api/auth/me')
            .then((r) => r.json())
            .catch(() => ({ roles: [] }));
        const roles = me.roles || [];
        isAdmin = roles.includes('site:admin') || roles.includes('pizza:admin');
    });
</script>

<svelte:head>
    <title>JP Pizza Bracket</title>
</svelte:head>

<main>
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
        {#if isAdmin}
            <a class="admin-link" href="/pizzaBracket/admin">Edit results →</a>
        {/if}
    </nav>
    <PizzaBracket />
</main>

<style>
    main {
        min-height: 100vh;
        background: #faf5f0;
        padding: 1rem;
    }
    
    .breadcrumb {
        max-width: 1400px;
        margin: 0 auto 1rem auto;
        display: flex;
        justify-content: space-between;
        gap: 1rem;
    }

    .admin-link {
        font-weight: 600;
    }
    
    .breadcrumb a {
        color: #666;
        text-decoration: none;
        font-size: 0.9rem;
    }
    
    .breadcrumb a:hover {
        color: #d97706;
    }
</style>