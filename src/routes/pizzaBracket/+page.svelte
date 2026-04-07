<script>
    import PizzaBracket from './PizzaBracket.svelte';
</script>

<svelte:head>
    <title>JP Pizza Bracket</title>
</svelte:head>

<main>
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    <PizzaBracket dataPath="/pizzaBracket/pizzaBracket.json" />
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