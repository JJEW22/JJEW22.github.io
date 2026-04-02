<script>
    import Tournament from './Tournament.svelte';
    
    // Tournament registry - add new tournaments here
    // Most recent first; the first entry is shown by default
    const tournaments = [
        {
            id: 'final-2026',
            name: 'Final Tournament',
            season: 'Season 2',
            date: 'April 2026',
            dataPath: '/jpFlicks/tournaments/finalTournament2026.json',
            current: true
        },
        {
            id: 'winter-2025',
            name: 'Winter Tournament',
            season: 'Season 2',
            date: 'December 2025',
            dataPath: '/jpFlicks/tournaments/winterTournament2025.json',
            current: false
        }
    ];
    
    // Default to the current/most recent tournament
    let selectedTournamentId = tournaments.find(t => t.current)?.id || tournaments[0]?.id;
    
    $: selectedTournament = tournaments.find(t => t.id === selectedTournamentId);
    $: isCurrentTournament = selectedTournament?.current || false;
    
    function selectTournament(id) {
        selectedTournamentId = id;
    }
</script>

<svelte:head>
    <title>Crokinole Tournament</title>
</svelte:head>

<main>
    <div class="tournament-nav">
        <div class="nav-header">
            <h2>🏆 JP Flicks Tournaments</h2>
        </div>
        
        <div class="tournament-selector">
            {#each tournaments as tourney}
                <button 
                    class="tournament-tab"
                    class:active={selectedTournamentId === tourney.id}
                    class:current={tourney.current}
                    on:click={() => selectTournament(tourney.id)}
                >
                    <span class="tab-name">{tourney.name}</span>
                    <span class="tab-meta">{tourney.season} · {tourney.date}</span>
                    {#if tourney.current}
                        <span class="current-badge">Live</span>
                    {/if}
                </button>
            {/each}
        </div>
    </div>
    
    {#if selectedTournament}
        {#key selectedTournamentId}
            <Tournament 
                dataPath={selectedTournament.dataPath} 
                editable={isCurrentTournament}
            />
        {/key}
    {:else}
        <p class="no-tournament">No tournament selected.</p>
    {/if}
</main>

<style>
    main {
        min-height: 100vh;
        background: #f3f4f6;
        padding: 1rem;
    }
    
    .tournament-nav {
        max-width: 1200px;
        margin: 0 auto 1rem auto;
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .nav-header {
        margin-bottom: 1rem;
    }
    
    .nav-header h2 {
        margin: 0;
        font-size: 1.5rem;
        color: #1a202c;
    }
    
    .tournament-selector {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }
    
    .tournament-tab {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.2rem;
        padding: 0.75rem 1.25rem;
        background: #f9fafb;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
        text-align: left;
    }
    
    .tournament-tab:hover {
        border-color: #9ca3af;
        background: #f3f4f6;
    }
    
    .tournament-tab.active {
        border-color: #2c5aa0;
        background: #eff6ff;
    }
    
    .tournament-tab.current .tab-name {
        color: #059669;
    }
    
    .tab-name {
        font-weight: 600;
        font-size: 0.95rem;
        color: #1f2937;
    }
    
    .tab-meta {
        font-size: 0.8rem;
        color: #6b7280;
    }
    
    .current-badge {
        position: absolute;
        top: -6px;
        right: -6px;
        background: #059669;
        color: white;
        font-size: 0.65rem;
        font-weight: 700;
        padding: 0.15rem 0.4rem;
        border-radius: 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .no-tournament {
        text-align: center;
        color: #6b7280;
        padding: 2rem;
    }
    
    @media (max-width: 768px) {
        .tournament-selector {
            flex-direction: column;
        }
        
        .tournament-tab {
            width: 100%;
        }
    }
</style>