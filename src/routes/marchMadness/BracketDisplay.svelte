<script>
    import { createEventDispatcher } from 'svelte';
    import { regionPositions } from './bracketIO.js';
    
    // Props
    export let bracket;                    // The bracket data to display
    export let resultsBracket = null;      // Optional results for comparison
    export let eliminatedTeams = new Set(); // Set of eliminated team names
    export let interactive = false;         // Whether picks can be made
    
    const dispatch = createEventDispatcher();
    
    // Variables for dynamic spacing
    let gameHeight = 0;
    const baseGameGap = 8;
    
    // Reactive spacing calculations
    $: round2FirstOffset = gameHeight > 0 ? (gameHeight + baseGameGap) / 2 : 40;
    $: round2Gap = gameHeight > 0 ? gameHeight + baseGameGap : 80;
    $: round3FirstOffset = gameHeight > 0 ? round2FirstOffset + (gameHeight + baseGameGap) : 120;
    $: round3Gap = gameHeight > 0 ? 3 * gameHeight + 3 * baseGameGap : 248;
    $: round4FirstOffset = gameHeight > 0 ? round3FirstOffset + (gameHeight + baseGameGap) : 200;
    
    /**
     * Get the status of a pick for coloring
     * @returns {'correct'|'incorrect'|'pending'|'none'}
     */
    function getPickStatus(game, round, gameIndex) {
        if (!game || !game.winner) {
            return 'none';
        }
        
        if (!resultsBracket) {
            return 'pending'; // No results to compare against
        }
        
        const roundKey = `round${round}`;
        const resultsGame = resultsBracket[roundKey]?.[gameIndex];
        
        if (!resultsGame) {
            return 'pending';
        }
        
        // If the results game has a winner, compare directly
        if (resultsGame.winner) {
            return resultsGame.winner.name === game.winner.name ? 'correct' : 'incorrect';
        }
        
        // Game not yet played - check if picked team is eliminated
        if (eliminatedTeams.has(game.winner.name)) {
            return 'incorrect';
        }
        
        return 'pending';
    }
    
    /**
     * Get CSS class for a selected team based on pick status
     */
    function getSelectionClass(game, team, round, gameIndex) {
        if (game.winner !== team) return '';
        
        const status = getPickStatus(game, round, gameIndex);
        switch (status) {
            case 'correct': return 'selected correct';
            case 'incorrect': return 'selected incorrect';
            case 'pending': return 'selected pending';
            default: return 'selected';
        }
    }
    
    function handleTeamClick(round, gameIndex, team) {
        if (interactive) {
            dispatch('selectWinner', { round, gameIndex, team });
        }
    }
</script>

<div class="bracket-scroll-container" class:read-only={!interactive}>
    <div class="bracket-wrapper">
        <!-- Top Bracket Row -->
        <div class="bracket-row top-bracket">
            <!-- Top Left Region -->
            <div class="bracket-region top-left">
                <h3 class="region-title">{regionPositions.topLeft}</h3>
                
                <!-- Round 1 - Games 0-7 -->
                <div class="bracket-column">
                    {#each bracket.round1.slice(0, 8) as game, i}
                        {#if i === 0}
                            <div class="game" bind:clientHeight={gameHeight}>
                                {#if game.team1}
                                    <button 
                                        class="team-btn {getSelectionClass(game, game.team1, 1, i)}"
                                        on:click={() => handleTeamClick(1, i, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                {#if game.team2}
                                    <button 
                                        class="team-btn {getSelectionClass(game, game.team2, 1, i)}"
                                        on:click={() => handleTeamClick(1, i, game.team2)}
                                    >
                                        <span class="seed">{game.team2.seed}</span>
                                        <span class="team-name">{game.team2.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                            </div>
                        {:else}
                            <div class="game">
                                {#if game.team1}
                                    <button 
                                        class="team-btn {getSelectionClass(game, game.team1, 1, i)}"
                                        on:click={() => handleTeamClick(1, i, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                {#if game.team2}
                                    <button 
                                        class="team-btn {getSelectionClass(game, game.team2, 1, i)}"
                                        on:click={() => handleTeamClick(1, i, game.team2)}
                                    >
                                        <span class="seed">{game.team2.seed}</span>
                                        <span class="team-name">{game.team2.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                            </div>
                        {/if}
                    {/each}
                </div>
                
                <!-- Round 2 - Games 0-3 -->
                <div class="bracket-column">
                    {#each bracket.round2.slice(0, 4) as game, i}
                        <div class="game" style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 2, i)}"
                                    on:click={() => handleTeamClick(2, i, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 2, i)}"
                                    on:click={() => handleTeamClick(2, i, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Sweet 16 - Games 0-1 -->
                <div class="bracket-column">
                    {#each bracket.round3.slice(0, 2) as game, i}
                        <div class="game" style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 3, i)}"
                                    on:click={() => handleTeamClick(3, i, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 3, i)}"
                                    on:click={() => handleTeamClick(3, i, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Elite 8 - Game 0 -->
                <div class="bracket-column">
                    <div class="game" style="margin-top: {round4FirstOffset}px">
                        {#if bracket.round4[0]?.team1}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[0], bracket.round4[0].team1, 4, 0)}"
                                on:click={() => handleTeamClick(4, 0, bracket.round4[0].team1)}
                            >
                                <span class="seed">{bracket.round4[0].team1.seed}</span>
                                <span class="team-name">{bracket.round4[0].team1.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        {#if bracket.round4[0]?.team2}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[0], bracket.round4[0].team2, 4, 0)}"
                                on:click={() => handleTeamClick(4, 0, bracket.round4[0].team2)}
                            >
                                <span class="seed">{bracket.round4[0].team2.seed}</span>
                                <span class="team-name">{bracket.round4[0].team2.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                    </div>
                </div>
            </div>
            
            <!-- Top Right Region -->
            <div class="bracket-region top-right">
                <h3 class="region-title">{regionPositions.topRight}</h3>
                
                <!-- Elite 8 - Game 2 -->
                <div class="bracket-column">
                    <div class="game" style="margin-top: {round4FirstOffset}px">
                        {#if bracket.round4[2]?.team1}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[2], bracket.round4[2].team1, 4, 2)}"
                                on:click={() => handleTeamClick(4, 2, bracket.round4[2].team1)}
                            >
                                <span class="seed">{bracket.round4[2].team1.seed}</span>
                                <span class="team-name">{bracket.round4[2].team1.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        {#if bracket.round4[2]?.team2}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[2], bracket.round4[2].team2, 4, 2)}"
                                on:click={() => handleTeamClick(4, 2, bracket.round4[2].team2)}
                            >
                                <span class="seed">{bracket.round4[2].team2.seed}</span>
                                <span class="team-name">{bracket.round4[2].team2.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                    </div>
                </div>
                
                <!-- Sweet 16 - Games 4-5 -->
                <div class="bracket-column">
                    {#each bracket.round3.slice(4, 6) as game, i}
                        <div class="game" style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 3, i + 4)}"
                                    on:click={() => handleTeamClick(3, i + 4, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 3, i + 4)}"
                                    on:click={() => handleTeamClick(3, i + 4, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Round 2 - Games 8-11 -->
                <div class="bracket-column">
                    {#each bracket.round2.slice(8, 12) as game, i}
                        <div class="game" style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 2, i + 8)}"
                                    on:click={() => handleTeamClick(2, i + 8, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 2, i + 8)}"
                                    on:click={() => handleTeamClick(2, i + 8, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Round 1 - Games 16-23 -->
                <div class="bracket-column">
                    {#each bracket.round1.slice(16, 24) as game, i}
                        <div class="game">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 1, i + 16)}"
                                    on:click={() => handleTeamClick(1, i + 16, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 1, i + 16)}"
                                    on:click={() => handleTeamClick(1, i + 16, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        </div>
        
        <!-- Final Four Row -->
        <div class="final-four-row">
            <!-- Left Semifinal -->
            <div class="semifinal-section">
                <h3>Final Four</h3>
                <div class="game semifinal-game">
                    {#if bracket.round5[0]?.team1}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round5[0], bracket.round5[0].team1, 5, 0)}"
                            on:click={() => handleTeamClick(5, 0, bracket.round5[0].team1)}
                        >
                            <span class="seed">{bracket.round5[0].team1.seed}</span>
                            <span class="team-name">{bracket.round5[0].team1.name}</span>
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                    {#if bracket.round5[0]?.team2}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round5[0], bracket.round5[0].team2, 5, 0)}"
                            on:click={() => handleTeamClick(5, 0, bracket.round5[0].team2)}
                        >
                            <span class="seed">{bracket.round5[0].team2.seed}</span>
                            <span class="team-name">{bracket.round5[0].team2.name}</span>
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                </div>
            </div>
            
            <!-- Championship -->
            <div class="championship-section">
                <h3>Championship</h3>
                <div class="game championship-game">
                    {#if bracket.round6[0]?.team1}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round6[0], bracket.round6[0].team1, 6, 0)}"
                            on:click={() => handleTeamClick(6, 0, bracket.round6[0].team1)}
                        >
                            <span class="seed">{bracket.round6[0].team1.seed}</span>
                            <span class="team-name">{bracket.round6[0].team1.name}</span>
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                    {#if bracket.round6[0]?.team2}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round6[0], bracket.round6[0].team2, 6, 0)}"
                            on:click={() => handleTeamClick(6, 0, bracket.round6[0].team2)}
                        >
                            <span class="seed">{bracket.round6[0].team2.seed}</span>
                            <span class="team-name">{bracket.round6[0].team2.name}</span>
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                </div>
                
                <!-- Champion -->
                <h3 class="champion-label">🏆 Champion 🏆</h3>
                <div class="game champion-game">
                    {#if bracket.winner}
                        <div class="team-btn champion-display {getPickStatus({winner: bracket.winner}, 6, 0) === 'correct' ? 'correct' : getPickStatus({winner: bracket.winner}, 6, 0) === 'incorrect' ? 'incorrect' : ''}">
                            <span class="seed">{bracket.winner.seed}</span>
                            <span class="team-name">{bracket.winner.name}</span>
                        </div>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                </div>
            </div>
            
            <!-- Right Semifinal -->
            <div class="semifinal-section">
                <h3>Final Four</h3>
                <div class="game semifinal-game">
                    {#if bracket.round5[1]?.team1}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round5[1], bracket.round5[1].team1, 5, 1)}"
                            on:click={() => handleTeamClick(5, 1, bracket.round5[1].team1)}
                        >
                            <span class="seed">{bracket.round5[1].team1.seed}</span>
                            <span class="team-name">{bracket.round5[1].team1.name}</span>
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                    {#if bracket.round5[1]?.team2}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round5[1], bracket.round5[1].team2, 5, 1)}"
                            on:click={() => handleTeamClick(5, 1, bracket.round5[1].team2)}
                        >
                            <span class="seed">{bracket.round5[1].team2.seed}</span>
                            <span class="team-name">{bracket.round5[1].team2.name}</span>
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                </div>
            </div>
        </div>
        
        <!-- Bottom Bracket Row -->
        <div class="bracket-row bottom-bracket">
            <!-- Bottom Left Region -->
            <div class="bracket-region bottom-left">
                <h3 class="region-title">{regionPositions.bottomLeft}</h3>
                
                <!-- Round 1 - Games 8-15 -->
                <div class="bracket-column">
                    {#each bracket.round1.slice(8, 16) as game, i}
                        <div class="game">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 1, i + 8)}"
                                    on:click={() => handleTeamClick(1, i + 8, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 1, i + 8)}"
                                    on:click={() => handleTeamClick(1, i + 8, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Round 2 - Games 4-7 -->
                <div class="bracket-column">
                    {#each bracket.round2.slice(4, 8) as game, i}
                        <div class="game" style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 2, i + 4)}"
                                    on:click={() => handleTeamClick(2, i + 4, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 2, i + 4)}"
                                    on:click={() => handleTeamClick(2, i + 4, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Sweet 16 - Games 2-3 -->
                <div class="bracket-column">
                    {#each bracket.round3.slice(2, 4) as game, i}
                        <div class="game" style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 3, i + 2)}"
                                    on:click={() => handleTeamClick(3, i + 2, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 3, i + 2)}"
                                    on:click={() => handleTeamClick(3, i + 2, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Elite 8 - Game 1 -->
                <div class="bracket-column">
                    <div class="game" style="margin-top: {round4FirstOffset}px">
                        {#if bracket.round4[1]?.team1}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[1], bracket.round4[1].team1, 4, 1)}"
                                on:click={() => handleTeamClick(4, 1, bracket.round4[1].team1)}
                            >
                                <span class="seed">{bracket.round4[1].team1.seed}</span>
                                <span class="team-name">{bracket.round4[1].team1.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        {#if bracket.round4[1]?.team2}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[1], bracket.round4[1].team2, 4, 1)}"
                                on:click={() => handleTeamClick(4, 1, bracket.round4[1].team2)}
                            >
                                <span class="seed">{bracket.round4[1].team2.seed}</span>
                                <span class="team-name">{bracket.round4[1].team2.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                    </div>
                </div>
            </div>
            
            <!-- Bottom Right Region -->
            <div class="bracket-region bottom-right">
                <h3 class="region-title">{regionPositions.bottomRight}</h3>
                
                <!-- Elite 8 - Game 3 -->
                <div class="bracket-column">
                    <div class="game" style="margin-top: {round4FirstOffset}px">
                        {#if bracket.round4[3]?.team1}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[3], bracket.round4[3].team1, 4, 3)}"
                                on:click={() => handleTeamClick(4, 3, bracket.round4[3].team1)}
                            >
                                <span class="seed">{bracket.round4[3].team1.seed}</span>
                                <span class="team-name">{bracket.round4[3].team1.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        {#if bracket.round4[3]?.team2}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[3], bracket.round4[3].team2, 4, 3)}"
                                on:click={() => handleTeamClick(4, 3, bracket.round4[3].team2)}
                            >
                                <span class="seed">{bracket.round4[3].team2.seed}</span>
                                <span class="team-name">{bracket.round4[3].team2.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                    </div>
                </div>
                
                <!-- Sweet 16 - Games 6-7 -->
                <div class="bracket-column">
                    {#each bracket.round3.slice(6, 8) as game, i}
                        <div class="game" style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 3, i + 6)}"
                                    on:click={() => handleTeamClick(3, i + 6, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 3, i + 6)}"
                                    on:click={() => handleTeamClick(3, i + 6, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Round 2 - Games 12-15 -->
                <div class="bracket-column">
                    {#each bracket.round2.slice(12, 16) as game, i}
                        <div class="game" style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 2, i + 12)}"
                                    on:click={() => handleTeamClick(2, i + 12, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 2, i + 12)}"
                                    on:click={() => handleTeamClick(2, i + 12, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
                
                <!-- Round 1 - Games 24-31 -->
                <div class="bracket-column">
                    {#each bracket.round1.slice(24, 32) as game, i}
                        <div class="game">
                            {#if game.team1}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 1, i + 24)}"
                                    on:click={() => handleTeamClick(1, i + 24, game.team1)}
                                >
                                    <span class="seed">{game.team1.seed}</span>
                                    <span class="team-name">{game.team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 1, i + 24)}"
                                    on:click={() => handleTeamClick(1, i + 24, game.team2)}
                                >
                                    <span class="seed">{game.team2.seed}</span>
                                    <span class="team-name">{game.team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    :root {
        --game-height: 4.5rem;
        --game-gap: 0.5rem;
        --column-gap: 0.5rem;
        --region-gap: 1.5rem;
        --side-gap: 1rem;
        --column-min-width: 180px;
    }
    
    .bracket-scroll-container {
        overflow: auto;
        max-height: calc(100vh - 200px);
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #fafafa;
        padding: 1rem;
    }
    
    .bracket-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rem;
        min-width: max-content;
        width: max-content;
        margin: 0 auto;
    }
    
    .bracket-row {
        display: flex;
        gap: var(--side-gap);
        justify-content: center;
        min-width: min-content;
    }
    
    .top-bracket, .bottom-bracket {
        gap: 2rem;
    }
    
    .bracket-region {
        display: flex;
        gap: 0.5rem;
    }
    
    .top-left .bracket-column,
    .bottom-left .bracket-column {
        order: 1;
    }
    
    .top-left .region-title,
    .bottom-left .region-title {
        order: 0;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        transform: rotate(180deg);
    }
    
    .top-right .bracket-column,
    .bottom-right .bracket-column {
        order: 1;
    }
    
    .top-right .region-title,
    .bottom-right .region-title {
        order: 10;
        writing-mode: vertical-rl;
        text-orientation: mixed;
    }
    
    .region-title {
        font-size: 1rem;
        font-weight: 700;
        color: #1f2937;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 0.5rem;
    }
    
    .bracket-column {
        display: flex;
        flex-direction: column;
        gap: var(--game-gap);
        min-width: var(--column-min-width);
        width: var(--column-min-width);
    }
    
    .final-four-row {
        display: flex;
        gap: 3rem;
        padding: 1.5rem 2rem;
        background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 12px;
        border: 2px solid #e2e8f0;
        align-items: flex-start;
    }
    
    .semifinal-section,
    .championship-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
    }
    
    .semifinal-section h3,
    .championship-section h3 {
        font-size: 0.9rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0;
    }
    
    .championship-section h3 {
        color: #d97706;
    }
    
    .champion-label {
        margin-top: 0.5rem;
        color: #d97706 !important;
    }
    
    .semifinal-game,
    .championship-game {
        width: var(--column-min-width);
    }
    
    .championship-section {
        padding: 0 1rem;
    }
    
    .champion-game {
        width: var(--column-min-width);
        border-color: #fbbf24;
        border-width: 3px;
        height: auto;
        min-height: 2.5rem;
    }
    
    .champion-game .team-btn {
        height: auto;
        min-height: 2.5rem;
    }
    
    .game {
        display: flex;
        flex-direction: column;
        gap: 2px;
        border: 2px solid #e5e7eb;
        border-radius: 6px;
        overflow: hidden;
        height: 4.5rem;
        width: 100%;
        box-sizing: border-box;
    }
    
    .championship-game {
        border-color: #fbbf24;
        border-width: 3px;
    }
    
    .team-btn {
        padding: 0.6rem 0.75rem;
        background: white;
        border: none;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        height: 50%;
        flex: 1;
        box-sizing: border-box;
    }
    
    .team-btn:not(.empty, .champion-display):hover {
        background: #f3f4f6;
    }
    
    /* Read-only mode */
    .read-only .team-btn {
        cursor: default;
    }
    
    .read-only .team-btn:not(.empty, .champion-display):hover {
        background: white;
    }
    
    /* Selection states with result colors */
    .team-btn.selected {
        background: #0066cc;
        color: white;
        font-weight: 600;
    }
    
    .team-btn.selected.pending {
        background: #0066cc;
        color: white;
    }
    
    .team-btn.selected.correct {
        background: #059669;
        color: white;
    }
    
    .team-btn.selected.incorrect {
        background: #dc2626;
        color: white;
    }
    
    .team-btn.selected .seed {
        background: white;
        color: #0066cc;
    }
    
    .team-btn.selected.correct .seed {
        color: #059669;
    }
    
    .team-btn.selected.incorrect .seed {
        color: #dc2626;
    }
    
    .team-btn.empty {
        background: #f9fafb;
        color: #9ca3af;
        cursor: default;
        font-style: italic;
        justify-content: center;
    }
    
    /* Champion display */
    .team-btn.champion-display {
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        color: white;
        font-weight: 600;
        font-size: 1.1rem;
        cursor: default;
    }
    
    .team-btn.champion-display.correct {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    
    .team-btn.champion-display.incorrect {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    }
    
    .champion-display .seed {
        background: white;
        color: #f59e0b;
    }
    
    .champion-display.correct .seed {
        color: #059669;
    }
    
    .champion-display.incorrect .seed {
        color: #dc2626;
    }
    
    .seed {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        background: #e5e7eb;
        border-radius: 50%;
        font-size: 0.7rem;
        font-weight: 700;
        flex-shrink: 0;
    }
    
    .team-name {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }
    
    @media (max-width: 768px) {
        .team-btn {
            padding: 0.5rem;
            font-size: 0.8rem;
        }
    }
</style>