<script>
    import { onMount } from 'svelte';
    
    export let dataPath = '/pizzaBracket/pizzaBracket.json';
    
    let bracket = null;
    let loading = true;
    let error = null;
    
    onMount(async () => {
        try {
            const response = await fetch(dataPath);
            if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
            bracket = await response.json();
        } catch (err) {
            error = err.message;
        } finally {
            loading = false;
        }
    });
    
    function isWinner(team, match) {
        return match.winner && team.name === match.winner;
    }
    
    function isLoser(team, match) {
        return match.winner && team.name !== match.winner;
    }
    
    function formatRating(rating) {
        if (rating === null || rating === undefined) return '—';
        return rating.toFixed(1);
    }
    
    function formatVotes(votes) {
        if (votes === null || votes === undefined) return '';
        return `${votes}v`;
    }
    
    function getChampion() {
        if (!bracket?.finals?.rounds) return null;
        const lastRound = bracket.finals.rounds[bracket.finals.rounds.length - 1];
        return lastRound?.matches?.[0]?.winner || null;
    }
</script>

{#snippet teamRowMarkup(team, match)}
    <div class="team-row" class:winner={isWinner(team, match)} class:loser={isLoser(team, match)} class:tbd={!team.name || team.name === 'TBD'} class:bye={team.source === 'bye'}>
        <span class="seed">{team.seed ? `(${team.seed})` : ''}</span>
        <span class="name">{team.name || 'TBD'}</span>
        <span class="stats">
            {#if team.votes != null}<span class="votes">{formatVotes(team.votes)}</span>{/if}
            {#if team.rating != null}<span class="rating">{formatRating(team.rating)}</span>{/if}
        </span>
    </div>
{/snippet}

{#snippet divisionLeft(division)}
    <div class="division-side" style="--div-color: {division.color}">
        <h2 class="div-label">{division.name}</h2>
        <div class="div-grid left-grid">
            <!-- R1 standard (5v6) — top-left -->
            <div class="cell cell-r1-std">
                {#each division.rounds[0].matches.filter(m => m.type === 'standard') as match}
                    <div class="match-card" class:completed={match.winner}>
                        {#each match.teams as team}{@render teamRowMarkup(team, match)}{/each}
                    </div>
                {/each}
            </div>
            <!-- R2 (1-seed vs 5v6 winner) — top-middle, same row as 5v6 -->
            <div class="cell cell-r2">
                {#each division.rounds[1].matches as match}
                    <div class="match-card" class:completed={match.winner}>
                        {#each match.teams as team}{@render teamRowMarkup(team, match)}{/each}
                    </div>
                {/each}
            </div>
            <!-- Division Final — spans both rows, centered right -->
            <div class="cell cell-final">
                {#each division.rounds[2].matches as match}
                    <div class="match-card div-final" class:completed={match.winner}>
                        {#each match.teams as team}{@render teamRowMarkup(team, match)}{/each}
                    </div>
                {/each}
            </div>
            <!-- R1 triple (2v3v4) — bottom-left, spans R1+R2 columns -->
            <div class="cell cell-r1-triple">
                {#each division.rounds[0].matches.filter(m => m.type === 'triple') as match}
                    <div class="match-card triple" class:completed={match.winner}>
                        {#each match.teams as team}{@render teamRowMarkup(team, match)}{/each}
                    </div>
                {/each}
            </div>
        </div>
    </div>
{/snippet}

{#snippet divisionRight(division)}
    <div class="division-side" style="--div-color: {division.color}">
        <h2 class="div-label">{division.name}</h2>
        <div class="div-grid right-grid">
            <!-- Division Final — spans both rows, centered left -->
            <div class="cell cell-final-r">
                {#each division.rounds[2].matches as match}
                    <div class="match-card div-final" class:completed={match.winner}>
                        {#each match.teams as team}{@render teamRowMarkup(team, match)}{/each}
                    </div>
                {/each}
            </div>
            <!-- R2 (1-seed vs 5v6 winner) — top-middle -->
            <div class="cell cell-r2-r">
                {#each division.rounds[1].matches as match}
                    <div class="match-card" class:completed={match.winner}>
                        {#each match.teams as team}{@render teamRowMarkup(team, match)}{/each}
                    </div>
                {/each}
            </div>
            <!-- R1 standard (5v6) — top-right -->
            <div class="cell cell-r1-std-r">
                {#each division.rounds[0].matches.filter(m => m.type === 'standard') as match}
                    <div class="match-card" class:completed={match.winner}>
                        {#each match.teams as team}{@render teamRowMarkup(team, match)}{/each}
                    </div>
                {/each}
            </div>
            <!-- R1 triple (2v3v4) — bottom-right, spans R2+R1 columns -->
            <div class="cell cell-r1-triple-r">
                {#each division.rounds[0].matches.filter(m => m.type === 'triple') as match}
                    <div class="match-card triple" class:completed={match.winner}>
                        {#each match.teams as team}{@render teamRowMarkup(team, match)}{/each}
                    </div>
                {/each}
            </div>
        </div>
    </div>
{/snippet}

{#if loading}
    <div class="pb-loading">Loading bracket...</div>
{:else if error}
    <div class="pb-error"><h3>Error</h3><p>{error}</p></div>
{:else if bracket}
    <div class="pizza-bracket">
        <header class="pb-header">
            <h1 class="pb-title">🍕 {bracket.bracketName}</h1>
            {#if bracket.description}
                <p class="pb-subtitle">{bracket.description}</p>
            {/if}
            {#if getChampion()}
                <div class="pb-champion-banner">
                    <span class="champ-icon">🏆</span>
                    <span class="champ-text">{getChampion()}</span>
                    <span class="champ-icon">🏆</span>
                </div>
            {/if}
        </header>
        
        <!-- Top half -->
        <div class="bracket-half">
            {@render divisionLeft(bracket.divisions[0])}
            
            {#if bracket.finals?.rounds?.[0]?.matches?.[0]}
                {@const sf = bracket.finals.rounds[0].matches[0]}
                <div class="semifinal-col">
                    <div class="match-card sf-card" class:completed={sf.winner}>
                        <div class="round-label">Semifinal</div>
                        {#each sf.teams as team}{@render teamRowMarkup(team, sf)}{/each}
                    </div>
                </div>
            {/if}
            
            {@render divisionRight(bracket.divisions[1])}
        </div>
        
        <!-- Championship -->
        {#if bracket.finals?.rounds?.[1]?.matches?.[0]}
            {@const final = bracket.finals.rounds[1].matches[0]}
            <div class="championship-row">
                <div class="match-card championship-card" class:completed={final.winner}>
                    <div class="round-label champ-label">🍕 Championship 🍕</div>
                    {#each final.teams as team}
                        <div class="team-row champ-row" class:winner={isWinner(team, final)} class:loser={isLoser(team, final)} class:tbd={!team.name || team.name === 'TBD'}>
                            <span class="name">{team.name || 'TBD'}</span>
                            <span class="stats">
                                {#if team.votes != null}<span class="votes">{formatVotes(team.votes)}</span>{/if}
                                {#if team.rating != null}<span class="rating">{formatRating(team.rating)}</span>{/if}
                            </span>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
        
        <!-- Bottom half -->
        <div class="bracket-half">
            {@render divisionLeft(bracket.divisions[2])}
            
            {#if bracket.finals?.rounds?.[0]?.matches?.[1]}
                {@const sf2 = bracket.finals.rounds[0].matches[1]}
                <div class="semifinal-col">
                    <div class="match-card sf-card" class:completed={sf2.winner}>
                        <div class="round-label">Semifinal</div>
                        {#each sf2.teams as team}{@render teamRowMarkup(team, sf2)}{/each}
                    </div>
                </div>
            {/if}
            
            {@render divisionRight(bracket.divisions[3])}
        </div>
    </div>
{/if}

<style>
    .pizza-bracket {
        max-width: 1400px;
        margin: 0 auto;
        padding: 1.5rem 1rem;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    }
    
    .pb-header { text-align: center; margin-bottom: 1.5rem; }
    .pb-title { font-size: 2rem; font-weight: 800; color: #1a1a1a; margin: 0 0 0.25rem 0; }
    .pb-subtitle { font-size: 1rem; color: #6b7280; margin: 0 0 0.75rem 0; }
    
    .pb-champion-banner {
        display: inline-flex; align-items: center; gap: 0.75rem;
        padding: 0.6rem 1.75rem;
        background: linear-gradient(135deg, #fbbf24, #d97706);
        border-radius: 999px;
    }
    .champ-icon { font-size: 1.25rem; }
    .champ-text { font-size: 1.15rem; font-weight: 800; color: white; text-transform: uppercase; letter-spacing: 0.04em; }
    
    /* Half row */
    .bracket-half {
        display: flex;
        align-items: center;
        margin-bottom: 0.75rem;
    }
    
    .division-side { flex: 1; min-width: 0; }
    
    .div-label {
        font-size: 0.75rem; font-weight: 700; color: var(--div-color);
        text-transform: uppercase; letter-spacing: 0.08em;
        margin: 0 0 0.4rem 0; text-align: center;
    }
    
    /* === CSS GRID for division layout === */
    /* Left division: 3 columns (R1, R2, Final), 2 rows (upper, lower) */
    .div-grid {
        display: grid;
        gap: 0.5rem;
        align-items: start;
    }
    
    .left-grid {
        grid-template-columns: 1fr 1fr 1fr;
        grid-template-rows: auto auto;
        grid-template-areas:
            "r1std  r2    final"
            "triple .     final";
    }
    
    .cell-r1-std    { grid-area: r1std; align-self: start; }
    .cell-r2        { grid-area: r2; align-self: start; }
    .cell-final     { grid-area: final; align-self: center; }
    .cell-r1-triple { grid-area: triple; }
    
    /* Right division: mirrored — 3 columns (Final, R2, R1) */
    .right-grid {
        grid-template-columns: 1fr 1fr 1fr;
        grid-template-rows: auto auto;
        grid-template-areas:
            "final  r2     r1std"
            "final  .      triple";
    }
    
    .cell-final-r     { grid-area: final; align-self: center; }
    .cell-r2-r        { grid-area: r2; align-self: start; }
    .cell-r1-std-r    { grid-area: r1std; align-self: start; }
    .cell-r1-triple-r { grid-area: triple; }
    
    .semifinal-col {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        padding: 0 0.5rem;
    }
    
    /* Match card */
    .match-card {
        border: 2px solid #e5e7eb;
        border-radius: 6px;
        overflow: hidden;
        background: white;
        min-width: 120px;
    }
    .match-card.completed { border-color: #d1d5db; }
    .match-card.triple { border-color: #c7d2fe; }
    .match-card.div-final { border-color: var(--div-color, #6b7280); }
    .sf-card { border-color: #a78bfa; min-width: 155px; }
    .championship-card { border-color: #fbbf24; border-width: 3px; min-width: 180px; }
    
    .round-label {
        text-align: center; font-size: 0.6rem; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.08em;
        padding: 0.15rem 0.5rem; background: #f3f4f6; color: #6b7280;
    }
    .champ-label {
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        color: #92400e; font-size: 0.7rem;
    }
    
    .championship-row {
        display: flex; justify-content: center; margin: 0.75rem 0;
    }
    
    /* Team row */
    .team-row {
        display: flex; align-items: center;
        padding: 0.3rem 0.5rem; font-size: 0.75rem;
        border-bottom: 1px solid #f3f4f6; gap: 0.25rem;
    }
    .team-row:last-child { border-bottom: none; }
    .team-row.winner { background: #059669; color: white; font-weight: 600; }
    .team-row.loser { background: #f9fafb; color: #9ca3af; }
    .team-row.tbd { color: #d1d5db; font-style: italic; }
    .team-row.bye { background: #fffbeb; border-left: 3px solid #fbbf24; }
    .champ-row { padding: 0.45rem 0.75rem; font-size: 0.85rem; }
    
    .seed { font-size: 0.6rem; font-weight: 600; color: #9ca3af; min-width: 1.3rem; flex-shrink: 0; }
    .team-row.winner .seed { color: rgba(255,255,255,0.75); }
    .name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stats { display: flex; align-items: center; gap: 0.25rem; margin-left: auto; flex-shrink: 0; }
    .votes { font-size: 0.6rem; font-weight: 500; color: #6b7280; background: #f3f4f6; padding: 0.05rem 0.2rem; border-radius: 3px; }
    .team-row.winner .votes { color: white; background: rgba(255,255,255,0.2); }
    .rating { font-weight: 700; font-size: 0.75rem; min-width: 1.4rem; text-align: right; }
    .team-row.winner .rating { color: white; }
    .team-row.loser .rating { color: #9ca3af; }
    
    .pb-loading, .pb-error { text-align: center; padding: 3rem; color: #6b7280; }
    .pb-error { color: #dc2626; }
    
    @media (max-width: 1000px) {
        .bracket-half { flex-direction: column; gap: 0.75rem; }
        .semifinal-col { padding: 0; }
    }
    
    @media (max-width: 600px) {
        .left-grid, .right-grid {
            grid-template-columns: 1fr;
            grid-template-areas:
                "r1std"
                "r2"
                "triple"
                "final";
        }
        .pb-title { font-size: 1.4rem; }
    }
</style>