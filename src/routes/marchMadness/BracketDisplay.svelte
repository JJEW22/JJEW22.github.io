<script>
    import { createEventDispatcher } from 'svelte';
    import { regionPositions } from './bracketIO.js';
    
    // Props
    export let bracket;                    // The bracket data to display
    export let resultsBracket = null;      // Optional results for comparison
    export let eliminatedTeams = new Set(); // Set of eliminated team names
    export let interactive = false;         // Whether picks can be made
    export let stakeData = null;           // Optional stake data for tooltips {gameKey: {participant: {team1: pts, team2: pts}}}
    
    const dispatch = createEventDispatcher();
    
    // Variables for dynamic spacing
    let gameHeight = 0;
    const baseGameGap = 8;
    
    // Tooltip state
    let hoveredGame = null;
    let tooltipX = 0;
    let tooltipY = 0;
    
    // Reactive spacing calculations
    $: round2FirstOffset = gameHeight > 0 ? (gameHeight + baseGameGap) / 2 : 40;
    $: round2Gap = gameHeight > 0 ? gameHeight + baseGameGap : 80;
    $: round3FirstOffset = gameHeight > 0 ? round2FirstOffset + (gameHeight + baseGameGap) : 120;
    $: round3Gap = gameHeight > 0 ? 3 * gameHeight + 3 * baseGameGap : 248;
    $: round4FirstOffset = gameHeight > 0 ? round3FirstOffset + (gameHeight + baseGameGap) : 200;
    
    /**
     * Check if a game is "next up" - parents are decided but this game has no winner yet
     * @param {Object} resultsGame - The game from the results bracket
     */
    function isNextGame(resultsGame) {
        if (!resultsGame) return false;
        
        // Already has a winner - not "next"
        if (resultsGame.winner) return false;
        
        // Round 1 (no parents): next if unplayed
        if (!resultsGame.parentGames) return true;
        
        // Otherwise: next if both parent games have winners
        return resultsGame.parentGames.every(parent => parent && parent.winner);
    }
    
    /**
     * Get the results game corresponding to a user's bracket game
     */
    function getResultsGame(round, gameIndex) {
        if (!resultsBracket) return null;
        const roundKey = `round${round}`;
        return resultsBracket[roundKey]?.[gameIndex];
    }
    
    /**
     * Generate a game key for stake data lookup
     */
    function getGameKey(round, gameIndex) {
        return `r${round}-${gameIndex}`;
    }
    
    /**
     * Handle mouse enter on a next-game
     */
    function handleGameMouseEnter(event, round, gameIndex) {
        const resultsGame = getResultsGame(round, gameIndex);
        if (!isNextGame(resultsGame) || !stakeData) return;
        
        const gameKey = getGameKey(round, gameIndex);
        if (!stakeData[gameKey]) return;
        
        const rect = event.currentTarget.getBoundingClientRect();
        tooltipX = rect.left + rect.width / 2;
        tooltipY = rect.top;
        hoveredGame = { round, gameIndex, gameKey, resultsGame };
    }
    
    /**
     * Handle mouse leave on a next-game
     */
    function handleGameMouseLeave() {
        hoveredGame = null;
    }
    
    /**
     * Handle click on a next-game - emit event to parent
     */
    function handleNextGameClick(round, gameIndex) {
        const resultsGame = getResultsGame(round, gameIndex);
        if (!isNextGame(resultsGame)) return;
        
        dispatch('nextGameClick', { 
            round, 
            gameIndex, 
            gameKey: getGameKey(round, gameIndex),
            resultsGame 
        });
    }
    
    /**
     * Get tooltip content for a game
     */
    function getTooltipStakes(gameKey) {
        if (!stakeData || !stakeData[gameKey]) return null;
        
        const stakes = stakeData[gameKey];
        const team1Supporters = [];
        const team2Supporters = [];
        
        for (const [name, data] of Object.entries(stakes)) {
            if (data.team1 > 0) team1Supporters.push({ name, points: data.team1 });
            if (data.team2 > 0) team2Supporters.push({ name, points: data.team2 });
        }
        
        // Sort by points descending
        team1Supporters.sort((a, b) => b.points - a.points);
        team2Supporters.sort((a, b) => b.points - a.points);
        
        return { team1Supporters, team2Supporters };
    }

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
                            <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(1, i))} 
                                class:clickable={isNextGame(getResultsGame(1, i))}
                                bind:clientHeight={gameHeight}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 1, i)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(1, i)}
                            >
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
                            <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(1, i))}
                                class:clickable={isNextGame(getResultsGame(1, i))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 1, i)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(1, i)}>
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(2, i))}
                                class:clickable={isNextGame(getResultsGame(2, i))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 2, i)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(2, i)} style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(3, i))}
                                class:clickable={isNextGame(getResultsGame(3, i))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 3, i)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(3, i)} style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
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
                    <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(4, 0))}
                                class:clickable={isNextGame(getResultsGame(4, 0))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 4, 0)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(4, 0)} style="margin-top: {round4FirstOffset}px">
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
                    <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(4, 2))}
                                class:clickable={isNextGame(getResultsGame(4, 2))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 4, 2)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(4, 2)} style="margin-top: {round4FirstOffset}px">
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(3, i + 4))}
                                class:clickable={isNextGame(getResultsGame(3, i + 4))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 3, i + 4)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(3, i + 4)} style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(2, i + 8))}
                                class:clickable={isNextGame(getResultsGame(2, i + 8))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 2, i + 8)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(2, i + 8)} style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(1, i + 16))}
                                class:clickable={isNextGame(getResultsGame(1, i + 16))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 1, i + 16)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(1, i + 16)}>
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
                <div 
                                class="game semifinal-game" 
                                class:next-game={isNextGame(getResultsGame(5, 0))}
                                class:clickable={isNextGame(getResultsGame(5, 0))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 5, 0)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(5, 0)}>
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
                <div 
                                class="game championship-game" 
                                class:next-game={isNextGame(getResultsGame(6, 0))}
                                class:clickable={isNextGame(getResultsGame(6, 0))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 6, 0)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(6, 0)}>
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
                <div 
                                class="game semifinal-game" 
                                class:next-game={isNextGame(getResultsGame(5, 1))}
                                class:clickable={isNextGame(getResultsGame(5, 1))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 5, 1)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(5, 1)}>
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(1, i + 8))}
                                class:clickable={isNextGame(getResultsGame(1, i + 8))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 1, i + 8)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(1, i + 8)}>
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(2, i + 4))}
                                class:clickable={isNextGame(getResultsGame(2, i + 4))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 2, i + 4)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(2, i + 4)} style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(3, i + 2))}
                                class:clickable={isNextGame(getResultsGame(3, i + 2))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 3, i + 2)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(3, i + 2)} style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
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
                    <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(4, 1))}
                                class:clickable={isNextGame(getResultsGame(4, 1))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 4, 1)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(4, 1)} style="margin-top: {round4FirstOffset}px">
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
                    <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(4, 3))}
                                class:clickable={isNextGame(getResultsGame(4, 3))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 4, 3)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(4, 3)} style="margin-top: {round4FirstOffset}px">
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(3, i + 6))}
                                class:clickable={isNextGame(getResultsGame(3, i + 6))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 3, i + 6)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(3, i + 6)} style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(2, i + 12))}
                                class:clickable={isNextGame(getResultsGame(2, i + 12))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 2, i + 12)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(2, i + 12)} style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
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
                        <div 
                                class="game" 
                                class:next-game={isNextGame(getResultsGame(1, i + 24))}
                                class:clickable={isNextGame(getResultsGame(1, i + 24))}
                                on:mouseenter={(e) => handleGameMouseEnter(e, 1, i + 24)}
                                on:mouseleave={handleGameMouseLeave}
                                on:click={() => handleNextGameClick(1, i + 24)}>
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

<!-- Tooltip for next-game hover -->
{#if hoveredGame && stakeData}
    {@const stakes = getTooltipStakes(hoveredGame.gameKey)}
    {#if stakes}
        <div 
            class="game-tooltip" 
            style="left: {tooltipX}px; top: {tooltipY}px;"
        >
            <div class="tooltip-header">
                <span class="tooltip-team">{hoveredGame.resultsGame?.team1?.name || 'TBD'}</span>
                <span class="tooltip-vs">vs</span>
                <span class="tooltip-team">{hoveredGame.resultsGame?.team2?.name || 'TBD'}</span>
            </div>
            <div class="tooltip-content">
                <div class="tooltip-column">
                    <div class="tooltip-column-header">{hoveredGame.resultsGame?.team1?.name || 'Team 1'}</div>
                    {#each stakes.team1Supporters.slice(0, 5) as supporter}
                        <div class="tooltip-row">
                            <span class="supporter-name">{supporter.name}</span>
                            <span class="supporter-points">+{supporter.points}</span>
                        </div>
                    {/each}
                    {#if stakes.team1Supporters.length === 0}
                        <div class="tooltip-row empty">No stakes</div>
                    {/if}
                    {#if stakes.team1Supporters.length > 5}
                        <div class="tooltip-row more">+{stakes.team1Supporters.length - 5} more</div>
                    {/if}
                </div>
                <div class="tooltip-column">
                    <div class="tooltip-column-header">{hoveredGame.resultsGame?.team2?.name || 'Team 2'}</div>
                    {#each stakes.team2Supporters.slice(0, 5) as supporter}
                        <div class="tooltip-row">
                            <span class="supporter-name">{supporter.name}</span>
                            <span class="supporter-points">+{supporter.points}</span>
                        </div>
                    {/each}
                    {#if stakes.team2Supporters.length === 0}
                        <div class="tooltip-row empty">No stakes</div>
                    {/if}
                    {#if stakes.team2Supporters.length > 5}
                        <div class="tooltip-row more">+{stakes.team2Supporters.length - 5} more</div>
                    {/if}
                </div>
            </div>
            <div class="tooltip-footer">Click for full details</div>
        </div>
    {/if}
{/if}

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
    
    .game.next-game {
        border-color: #f59e0b;
        border-width: 3px;
        box-shadow: 0 0 8px rgba(245, 158, 11, 0.3);
    }
    
    .game.clickable {
        cursor: pointer;
        transition: transform 0.15s, box-shadow 0.15s;
    }
    
    .game.clickable:hover {
        transform: scale(1.02);
        box-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
    }
    
    /* Tooltip styles */
    .game-tooltip {
        position: fixed;
        transform: translate(-50%, -100%) translateY(-10px);
        background: white;
        border: 2px solid #f59e0b;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        min-width: 280px;
        pointer-events: none;
    }
    
    .tooltip-header {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        border-radius: 6px 6px 0 0;
        font-weight: 600;
        color: white;
        font-size: 0.85rem;
    }
    
    .tooltip-vs {
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.75rem;
    }
    
    .tooltip-content {
        display: flex;
        gap: 1rem;
        padding: 0.75rem;
    }
    
    .tooltip-column {
        flex: 1;
        min-width: 0;
    }
    
    .tooltip-column-header {
        font-weight: 600;
        font-size: 0.75rem;
        color: #64748b;
        text-transform: uppercase;
        margin-bottom: 0.5rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .tooltip-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.8rem;
        padding: 0.2rem 0;
    }
    
    .tooltip-row.empty {
        color: #9ca3af;
        font-style: italic;
    }
    
    .tooltip-row.more {
        color: #64748b;
        font-style: italic;
    }
    
    .supporter-name {
        color: #374151;
    }
    
    .supporter-points {
        color: #059669;
        font-weight: 600;
    }
    
    .tooltip-footer {
        padding: 0.5rem;
        text-align: center;
        font-size: 0.7rem;
        color: #9ca3af;
        border-top: 1px solid #e5e7eb;
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
    
    /* Read-only mode - no hover effect, no pointer cursor */
    .read-only .team-btn {
        cursor: default;
        pointer-events: none;
    }
    
    .read-only .team-btn.selected {
        pointer-events: none;
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