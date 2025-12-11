<script>
    import Tournament from './Tournament.svelte';
</script>

<svelte:head>
    <title>Crokinole Tournament</title>
</svelte:head>

<main>
    <Tournament dataPath="/tournamentData10Player.json" />
</main>

<style>
    main {
        min-height: 100vh;
        background: #f3f4f6;
        padding: 1rem;
    }
</style>