<script>
    import BracketCreate from './BracketCreate.svelte';
    import BracketResults from './BracketResults.svelte';
    import '../../app.css';

    const bracketMode = 'create'
</script>

<svelte:head>
    <title>March Madness Bracket</title>
    <meta name="description" content="March Madness bracket creator and results">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>🏀 March Madness Bracket</h1>
        
        {#if bracketMode === 'create'}
            <BracketCreate />
        {:else if bracketMode === 'results'}
            <BracketResults />
        {/if}
    </main>
</div>

<style>
    .container {
        max-width: 100%;
        margin: 0 auto;
        padding: 1rem;
    }
    
    .breadcrumb {
        margin-bottom: 1rem;
    }
    
    .breadcrumb a {
        color: #666;
        text-decoration: none;
        font-size: 0.9rem;
    }
    
    .breadcrumb a:hover {
        color: #0066cc;
    }
    
    main {
        background: white;
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }
    
    h1 {
        font-size: 2rem;
        margin-bottom: 1.5rem;
        color: #1a1a1a;
        text-align: center;
    }
</style>