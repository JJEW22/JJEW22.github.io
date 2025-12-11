<script>
    import { createEventDispatcher } from 'svelte';
    import { regionPositions } from './bracketIO.js';
    
    // Debug mode toggle - set to false to disable debug features
    const DEBUG_MODE = true;
    
    // Props
    export let bracket;                    // The bracket data to display
    export let resultsBracket = null;      // Optional results for comparison
    export let eliminatedTeams = new Set(); // Set of eliminated team names
    export let interactive = false;         // Whether picks can be made
    export let stakeData = null;           // Optional stake data for tooltips {gameKey: {participant: {team1: pts, team2: pts}}}
    export let scenario = null;            // Optional winning scenario to display
    
    const dispatch = createEventDispatcher();
    
    // Variables for dynamic spacing
    let gameHeight = 0;
    const baseGameGap = 8;
    
    // Tooltip state
    let hoveredGame = null;
    let pinnedGame = null;  // For click-to-pin functionality
    let tooltipX = 0;
    let tooltipY = 0;
    
    // Build a lookup map for scenario games: "round-gameIndex" -> scenarioGame
    $: scenarioGamesMap = buildScenarioGamesMap(scenario);
    
    function buildScenarioGamesMap(scenario) {
        const map = {};
        if (scenario && scenario.games) {
            for (const game of scenario.games) {
                const key = `${game.round}-${game.gameIndex}`;
                map[key] = game;
            }
        }
        return map;
    }
    
    /**
     * Get the scenario game for a given round and game index
     */
    function getScenarioGame(round, gameIndex) {
        const key = `${round}-${gameIndex}`;
        return scenarioGamesMap[key] || null;
    }
    
    /**
     * Check if a game is undecided in the results
     */
    function isGameUndecided(round, gameIndex) {
        if (!resultsBracket) return true;
        const roundKey = `round${round}`;
        const resultsGame = resultsBracket[roundKey]?.[gameIndex];
        return !resultsGame || !resultsGame.winner;
    }
    
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
        // Don't update hover if we have a pinned tooltip
        if (pinnedGame) return;
        
        if (!DEBUG_MODE) {
            // Original behavior - only show for next games with stake data
            const resultsGame = getResultsGame(round, gameIndex);
            if (!isNextGame(resultsGame) || !stakeData) return;
            const gameKey = getGameKey(round, gameIndex);
            if (!stakeData[gameKey]) return;
        }
        
        const resultsGame = getResultsGame(round, gameIndex);
        const gameKey = getGameKey(round, gameIndex);
        const scenarioGame = getScenarioGame(round, gameIndex);
        const bracketRoundKey = `round${round}`;
        const bracketGame = bracket?.[bracketRoundKey]?.[gameIndex];
        
        const rect = event.currentTarget.getBoundingClientRect();
        tooltipX = rect.left + rect.width / 2;
        tooltipY = rect.top;
        
        hoveredGame = { 
            round, 
            gameIndex, 
            gameKey, 
            resultsGame,
            scenarioGame,
            bracketGame,
            isUndecided: isGameUndecided(round, gameIndex),
            hasScenario: !!scenario
        };
    }
    
    /**
     * Handle mouse leave on a game
     */
    function handleGameMouseLeave() {
        // Don't clear if we have a pinned tooltip
        if (!pinnedGame) {
            hoveredGame = null;
        }
    }
    
    /**
     * Handle click on a game - toggle pinned debug tooltip
     */
    function handleDebugClick(event, round, gameIndex) {
        if (!DEBUG_MODE) return;
        
        event.stopPropagation();
        
        const resultsGame = getResultsGame(round, gameIndex);
        const gameKey = getGameKey(round, gameIndex);
        const scenarioGame = getScenarioGame(round, gameIndex);
        const bracketRoundKey = `round${round}`;
        const bracketGame = bracket?.[bracketRoundKey]?.[gameIndex];
        
        // If clicking same game, unpin
        if (pinnedGame && pinnedGame.round === round && pinnedGame.gameIndex === gameIndex) {
            pinnedGame = null;
            hoveredGame = null;
        } else {
            // Pin this game
            const rect = event.currentTarget.getBoundingClientRect();
            tooltipX = rect.left + rect.width / 2;
            tooltipY = rect.top;
            
            pinnedGame = { 
                round, 
                gameIndex, 
                gameKey, 
                resultsGame,
                scenarioGame,
                bracketGame,
                isUndecided: isGameUndecided(round, gameIndex),
                hasScenario: !!scenario
            };
            hoveredGame = pinnedGame;
        }
    }
    
    /**
     * Combined click handler for games - handles debug mode and next game clicks
     */
    function handleGameClicked(event, round, gameIndex) {
        if (DEBUG_MODE) {
            handleDebugClick(event, round, gameIndex);
        } else {
            handleNextGameClick(round, gameIndex);
        }
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
        if (!team) return '';
        
        const isUserPick = game.winner && game.winner.name === team.name;
        const status = getPickStatus(game, round, gameIndex);
        const gameActuallyPlayed = !isGameUndecided(round, gameIndex);
        
        // Debug logging for specific games (Round 2-6 to reduce noise)
        const debugThis = DEBUG_MODE && round >= 2 && scenario;
        if (debugThis) {
            console.log(`[getSelectionClass] Round ${round} Game ${gameIndex} - Team: ${team.name}`);
            console.log(`  isUserPick: ${isUserPick}, status: ${status}, gameActuallyPlayed: ${gameActuallyPlayed}`);
            console.log(`  scenario exists: ${!!scenario}`);
        }
        
        // 1. If game already played, use green/red (regardless of scenario)
        if (gameActuallyPlayed) {
            if (status === 'correct' || status === 'incorrect') {
                const result = isUserPick ? `selected ${status}` : '';
                if (debugThis) console.log(`  -> Game played, returning: "${result}"`);
                return result;
            }
        }
        
        // 2. If no scenario active, use default pending/doomed colors
        if (!scenario) {
            if (isUserPick) {
                if (status === 'incorrect') {
                    return 'selected incorrect';
                }
                return status === 'pending' ? 'selected pending' : 'selected';
            }
            return '';
        }
        
        // 3. Get scenario game data
        const scenarioGame = getScenarioGame(round, gameIndex);
        if (debugThis) {
            console.log(`  scenarioGame found: ${!!scenarioGame}`);
            if (scenarioGame) {
                console.log(`  scenarioGame.winner: ${scenarioGame.winner}, either: ${scenarioGame.either}, dead: ${scenarioGame.dead}`);
            }
        }
        
        // 4. If game is NOT in scenario AND game hasn't been played, 
        //    it means either team can win (doesn't affect outcome)
        if (!scenarioGame) {
            // Only show "either" for unplayed games
            if (!gameActuallyPlayed) {
                // Warning: unplayed game not found in scenario - may indicate mismatched data
                console.warn(`[getSelectionClass] WARNING: Unplayed game not in scenario! Round ${round} Game ${gameIndex} - Team: ${team.name}. This may indicate mismatched scenario data.`);
                if (debugThis) console.log(`  -> No scenario game, unplayed, returning: "selected scenario-either"`);
                return 'selected scenario-either';
            }
            // For played games not in scenario, use default colors
            if (isUserPick) {
                const result = status === 'pending' ? 'selected pending' : 'selected';
                if (debugThis) console.log(`  -> No scenario game, played, returning: "${result}"`);
                return result;
            }
            if (debugThis) console.log(`  -> No scenario game, played, not user pick, returning: ""`);
            return '';
        }
        
        // 5. Check boolean flags
        const isDead = scenarioGame.dead === true;
        const isEither = scenarioGame.either === true;
        
        // 6. If dead path, show gray
        if (isDead) {
            if (debugThis) console.log(`  -> Dead path, returning: "scenario-dead"`);
            return 'scenario-dead';
        }
        
        // 7. If either team can win (no stake), show teal
        if (isEither) {
            if (debugThis) console.log(`  -> Either flag set, returning: "selected scenario-either"`);
            return 'selected scenario-either';
        }
        
        // 8. Get winner name from scenario (handle both string and object)
        const scenarioWinner = typeof scenarioGame.winner === 'string' 
            ? scenarioGame.winner 
            : scenarioGame.winner?.name;
        
        if (debugThis) {
            console.log(`  scenarioWinner (extracted): "${scenarioWinner}"`);
            console.log(`  team.name: "${team.name}"`);
            console.log(`  team.name === scenarioWinner: ${team.name === scenarioWinner}`);
        }
        
        // 9. If no winner specified and not either/dead, this is TBD (participant has stake)
        //    Show standard undecided styling (same as no scenario)
        if (!scenarioWinner || scenarioWinner === "dead" || scenarioWinner === "either") {
            // TBD game - use default styling based on user's pick
            if (isUserPick) {
                const result = status === 'pending' ? 'selected pending' : 'selected';
                if (debugThis) console.log(`  -> TBD game, user pick, returning: "${result}"`);
                return result;
            }
            if (debugThis) console.log(`  -> TBD game, not user pick, returning: ""`);
            return '';
        }
        
        // 10. Determine which slot this team is in (team1 or team2 in the bracket)
        const isTeam1Slot = game.team1 && game.team1.name === team.name;
        const isTeam2Slot = game.team2 && game.team2.name === team.name;
        
        // Get the scenario's team for this slot
        let scenarioTeamInThisSlot;
        if (isTeam1Slot) {
            scenarioTeamInThisSlot = scenarioGame.team1;
        } else if (isTeam2Slot) {
            scenarioTeamInThisSlot = scenarioGame.team2;
        }
        
        if (debugThis) {
            console.log(`  isTeam1Slot: ${isTeam1Slot}, isTeam2Slot: ${isTeam2Slot}`);
            console.log(`  scenarioTeamInThisSlot: "${scenarioTeamInThisSlot}"`);
        }
        
        // Check if this slot's scenario team is the winner
        // Handle combined "either" team names like "Ole Miss/Michigan St."
        const scenarioTeamNames = scenarioTeamInThisSlot ? scenarioTeamInThisSlot.split('/') : [];
        const thisSlotIsScenarioWinner = scenarioTeamInThisSlot === scenarioWinner || 
                                          scenarioTeamNames.includes(scenarioWinner);
        
        if (debugThis) {
            console.log(`  thisSlotIsScenarioWinner: ${thisSlotIsScenarioWinner}`);
        }
        
        if (thisSlotIsScenarioWinner) {
            // This slot contains the scenario winner - highlight it
            // Check if user also picked the winner (user's pick matches scenario winner)
            const userPickedWinner = game.winner && game.winner.name === scenarioWinner;
            const result = userPickedWinner ? 'selected scenario-match' : 'selected scenario-mismatch';
            if (debugThis) console.log(`  -> This slot IS scenario winner, userPickedWinner: ${userPickedWinner}, returning: "${result}"`);
            return result;
        }
        
        // 11. This slot contains the scenario loser - no highlight
        if (debugThis) console.log(`  -> This slot is NOT scenario winner, returning: ""`);
        return '';
    }
    
    /**
     * Get display info for a team in the context of a scenario
     * For undecided games, shows the scenario's bracket merged with user's bracket
     * Returns { name, seed, userPick, dead } where userPick is shown as subtitle if different
     */
    function getTeamDisplayInfo(game, team, round, gameIndex) {
        if (!team) return null;
        
        const gameActuallyPlayed = !isGameUndecided(round, gameIndex);
        
        // If no scenario or game has actually been played, just show the team normally
        if (!scenario || gameActuallyPlayed) {
            return { name: team.name, seed: team.seed, userPick: null, dead: false };
        }
        
        const scenarioGame = getScenarioGame(round, gameIndex);
        if (!scenarioGame) {
            return { name: team.name, seed: team.seed, userPick: null, dead: false };
        }
        
        // Check if this is a dead path game
        if (scenarioGame.dead) {
            return { name: 'Dead', seed: null, userPick: null, dead: true };
        }
        
        // Determine if this is team1 or team2 slot based on the team passed in
        const isTeam1Slot = game.team1 && game.team1.name === team.name;
        const isTeam2Slot = game.team2 && game.team2.name === team.name;
        
        // Get what the scenario says should be in this slot
        let scenarioTeamName, scenarioTeamSeed, isEitherTeam, eitherTeams;
        if (isTeam1Slot) {
            scenarioTeamName = scenarioGame.team1;
            scenarioTeamSeed = scenarioGame.team1Seed;
            isEitherTeam = scenarioGame.team1IsEither;
        } else if (isTeam2Slot) {
            scenarioTeamName = scenarioGame.team2;
            scenarioTeamSeed = scenarioGame.team2Seed;
            isEitherTeam = scenarioGame.team2IsEither;
        } else {
            // Fallback - shouldn't happen
            return { name: team.name, seed: team.seed, userPick: null, dead: false };
        }
        
        // Check if the scenario team name contains "/" (combined either teams)
        const scenarioTeamNames = scenarioTeamName ? scenarioTeamName.split('/') : [];
        
        // Check if user's pick is one of the either teams
        const userPickIsInEither = scenarioTeamNames.includes(team.name);
        
        // Compare user's team in this slot vs scenario's team
        if (team.name === scenarioTeamName) {
            // User's prediction matches scenario exactly - show normally
            return { name: team.name, seed: team.seed, userPick: null, dead: false };
        } else if (userPickIsInEither) {
            // User's pick is one of the combined either teams - show combined name, no parenthetical
            return { 
                name: scenarioTeamName, 
                seed: scenarioTeamSeed, 
                userPick: null,
                dead: false
            };
        } else {
            // User had a different team - show scenario's team with user's pick as subtitle
            return {
                name: scenarioTeamName,
                seed: scenarioTeamSeed,
                userPick: team.name,
                dead: false
            };
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
                                on:click={(e) => handleGameClicked(e, 1, i)}
                            >
                                {#if game.team1}
                                    {@const info1 = getTeamDisplayInfo(game, game.team1, 1, i)}
                                    <button 
                                        class="team-btn {getSelectionClass(game, game.team1, 1, i)}"
                                        on:click={() => handleTeamClick(1, i, game.team1)}

                                    >
                                        <span class="seed">{info1.seed}</span>
                                        <span class="team-name">{info1.name}</span>
                                        {#if info1.userPick}
                                            <span class="user-pick">({info1.userPick})</span>

                                        {/if}
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                {#if game.team2}
                                    {@const info2 = getTeamDisplayInfo(game, game.team2, 1, i)}
                                    <button 
                                        class="team-btn {getSelectionClass(game, game.team2, 1, i)}"
                                        on:click={() => handleTeamClick(1, i, game.team2)}

                                    >
                                        <span class="seed">{info2.seed}</span>
                                        <span class="team-name">{info2.name}</span>
                                        {#if info2.userPick}
                                            <span class="user-pick">({info2.userPick})</span>

                                        {/if}
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
                                on:click={(e) => handleGameClicked(e, 1, i)}>
                                {#if game.team1}
                                    {@const info3 = getTeamDisplayInfo(game, game.team1, 1, i)}
                                    <button 
                                        class="team-btn {getSelectionClass(game, game.team1, 1, i)}"
                                        on:click={() => handleTeamClick(1, i, game.team1)}

                                    >
                                        <span class="seed">{info3.seed}</span>
                                        <span class="team-name">{info3.name}</span>
                                        {#if info3.userPick}
                                            <span class="user-pick">({info3.userPick})</span>

                                        {/if}
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                {#if game.team2}
                                    {@const info4 = getTeamDisplayInfo(game, game.team2, 1, i)}
                                    <button 
                                        class="team-btn {getSelectionClass(game, game.team2, 1, i)}"
                                        on:click={() => handleTeamClick(1, i, game.team2)}

                                    >
                                        <span class="seed">{info4.seed}</span>
                                        <span class="team-name">{info4.name}</span>
                                        {#if info4.userPick}
                                            <span class="user-pick">({info4.userPick})</span>

                                        {/if}
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
                                on:click={(e) => handleGameClicked(e, 2, i)} style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
                            {#if game.team1}
                                {@const info5 = getTeamDisplayInfo(game, game.team1, 2, i)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 2, i)}"
                                    on:click={() => handleTeamClick(2, i, game.team1)}

                                >
                                    <span class="seed">{info5.seed}</span>
                                    <span class="team-name">{info5.name}</span>
                                    {#if info5.userPick}
                                        <span class="user-pick">({info5.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info6 = getTeamDisplayInfo(game, game.team2, 2, i)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 2, i)}"
                                    on:click={() => handleTeamClick(2, i, game.team2)}

                                >
                                    <span class="seed">{info6.seed}</span>
                                    <span class="team-name">{info6.name}</span>
                                    {#if info6.userPick}
                                        <span class="user-pick">({info6.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 3, i)} style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                            {#if game.team1}
                                {@const info7 = getTeamDisplayInfo(game, game.team1, 3, i)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 3, i)}"
                                    on:click={() => handleTeamClick(3, i, game.team1)}

                                >
                                    <span class="seed">{info7.seed}</span>
                                    <span class="team-name">{info7.name}</span>
                                    {#if info7.userPick}
                                        <span class="user-pick">({info7.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info8 = getTeamDisplayInfo(game, game.team2, 3, i)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 3, i)}"
                                    on:click={() => handleTeamClick(3, i, game.team2)}

                                >
                                    <span class="seed">{info8.seed}</span>
                                    <span class="team-name">{info8.name}</span>
                                    {#if info8.userPick}
                                        <span class="user-pick">({info8.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 4, 0)} style="margin-top: {round4FirstOffset}px">
                        {#if bracket.round4[0]?.team1}
                            {@const info9 = getTeamDisplayInfo(bracket.round4[0], bracket.round4[0].team1, 4, 0)}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[0], bracket.round4[0].team1, 4, 0)}"
                                on:click={() => handleTeamClick(4, 0, bracket.round4[0].team1)}

                            >
                                <span class="seed">{info9.seed}</span>
                                <span class="team-name">{info9.name}</span>
                                {#if info9.userPick}
                                    <span class="user-pick">({info9.userPick})</span>

                                {/if}
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        {#if bracket.round4[0]?.team2}
                            {@const info10 = getTeamDisplayInfo(bracket.round4[0], bracket.round4[0].team2, 4, 0)}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[0], bracket.round4[0].team2, 4, 0)}"
                                on:click={() => handleTeamClick(4, 0, bracket.round4[0].team2)}

                            >
                                <span class="seed">{info10.seed}</span>
                                <span class="team-name">{info10.name}</span>
                                {#if info10.userPick}
                                    <span class="user-pick">({info10.userPick})</span>

                                {/if}
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
                                on:click={(e) => handleGameClicked(e, 4, 2)} style="margin-top: {round4FirstOffset}px">
                        {#if bracket.round4[2]?.team1}
                            {@const info11 = getTeamDisplayInfo(bracket.round4[2], bracket.round4[2].team1, 4, 2)}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[2], bracket.round4[2].team1, 4, 2)}"
                                on:click={() => handleTeamClick(4, 2, bracket.round4[2].team1)}

                            >
                                <span class="seed">{info11.seed}</span>
                                <span class="team-name">{info11.name}</span>
                                {#if info11.userPick}
                                    <span class="user-pick">({info11.userPick})</span>

                                {/if}
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        {#if bracket.round4[2]?.team2}
                            {@const info12 = getTeamDisplayInfo(bracket.round4[2], bracket.round4[2].team2, 4, 2)}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[2], bracket.round4[2].team2, 4, 2)}"
                                on:click={() => handleTeamClick(4, 2, bracket.round4[2].team2)}

                            >
                                <span class="seed">{info12.seed}</span>
                                <span class="team-name">{info12.name}</span>
                                {#if info12.userPick}
                                    <span class="user-pick">({info12.userPick})</span>

                                {/if}
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
                                on:click={(e) => handleGameClicked(e, 3, i + 4)} style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                            {#if game.team1}
                                {@const info13 = getTeamDisplayInfo(game, game.team1, 3, i + 4)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 3, i + 4)}"
                                    on:click={() => handleTeamClick(3, i + 4, game.team1)}

                                >
                                    <span class="seed">{info13.seed}</span>
                                    <span class="team-name">{info13.name}</span>
                                    {#if info13.userPick}
                                        <span class="user-pick">({info13.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info14 = getTeamDisplayInfo(game, game.team2, 3, i + 4)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 3, i + 4)}"
                                    on:click={() => handleTeamClick(3, i + 4, game.team2)}

                                >
                                    <span class="seed">{info14.seed}</span>
                                    <span class="team-name">{info14.name}</span>
                                    {#if info14.userPick}
                                        <span class="user-pick">({info14.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 2, i + 8)} style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
                            {#if game.team1}
                                {@const info15 = getTeamDisplayInfo(game, game.team1, 2, i + 8)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 2, i + 8)}"
                                    on:click={() => handleTeamClick(2, i + 8, game.team1)}

                                >
                                    <span class="seed">{info15.seed}</span>
                                    <span class="team-name">{info15.name}</span>
                                    {#if info15.userPick}
                                        <span class="user-pick">({info15.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info16 = getTeamDisplayInfo(game, game.team2, 2, i + 8)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 2, i + 8)}"
                                    on:click={() => handleTeamClick(2, i + 8, game.team2)}

                                >
                                    <span class="seed">{info16.seed}</span>
                                    <span class="team-name">{info16.name}</span>
                                    {#if info16.userPick}
                                        <span class="user-pick">({info16.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 1, i + 16)}>
                            {#if game.team1}
                                {@const info17 = getTeamDisplayInfo(game, game.team1, 1, i + 16)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 1, i + 16)}"
                                    on:click={() => handleTeamClick(1, i + 16, game.team1)}

                                >
                                    <span class="seed">{info17.seed}</span>
                                    <span class="team-name">{info17.name}</span>
                                    {#if info17.userPick}
                                        <span class="user-pick">({info17.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info18 = getTeamDisplayInfo(game, game.team2, 1, i + 16)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 1, i + 16)}"
                                    on:click={() => handleTeamClick(1, i + 16, game.team2)}

                                >
                                    <span class="seed">{info18.seed}</span>
                                    <span class="team-name">{info18.name}</span>
                                    {#if info18.userPick}
                                        <span class="user-pick">({info18.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 5, 0)}>
                    {#if bracket.round5[0]?.team1}
                        {@const info19 = getTeamDisplayInfo(bracket.round5[0], bracket.round5[0].team1, 5, 0)}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round5[0], bracket.round5[0].team1, 5, 0)}"
                            on:click={() => handleTeamClick(5, 0, bracket.round5[0].team1)}

                        >
                            <span class="seed">{info19.seed}</span>
                            <span class="team-name">{info19.name}</span>
                            {#if info19.userPick}
                                <span class="user-pick">({info19.userPick})</span>

                            {/if}
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                    {#if bracket.round5[0]?.team2}
                        {@const info20 = getTeamDisplayInfo(bracket.round5[0], bracket.round5[0].team2, 5, 0)}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round5[0], bracket.round5[0].team2, 5, 0)}"
                            on:click={() => handleTeamClick(5, 0, bracket.round5[0].team2)}

                        >
                            <span class="seed">{info20.seed}</span>
                            <span class="team-name">{info20.name}</span>
                            {#if info20.userPick}
                                <span class="user-pick">({info20.userPick})</span>

                            {/if}
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
                                on:click={(e) => handleGameClicked(e, 6, 0)}>
                    {#if bracket.round6[0]?.team1}
                        {@const info21 = getTeamDisplayInfo(bracket.round6[0], bracket.round6[0].team1, 6, 0)}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round6[0], bracket.round6[0].team1, 6, 0)}"
                            on:click={() => handleTeamClick(6, 0, bracket.round6[0].team1)}

                        >
                            <span class="seed">{info21.seed}</span>
                            <span class="team-name">{info21.name}</span>
                            {#if info21.userPick}
                                <span class="user-pick">({info21.userPick})</span>

                            {/if}
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                    {#if bracket.round6[0]?.team2}
                        {@const info22 = getTeamDisplayInfo(bracket.round6[0], bracket.round6[0].team2, 6, 0)}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round6[0], bracket.round6[0].team2, 6, 0)}"
                            on:click={() => handleTeamClick(6, 0, bracket.round6[0].team2)}

                        >
                            <span class="seed">{info22.seed}</span>
                            <span class="team-name">{info22.name}</span>
                            {#if info22.userPick}
                                <span class="user-pick">({info22.userPick})</span>

                            {/if}
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                </div>
                
                <!-- Champion -->
                <h3 class="champion-label">🏆 Champion 🏆</h3>
                <div class="game champion-game">
                    {#if bracket.winner}
                        {@const champGame = bracket.round6?.[0] || {team1: null, team2: null, winner: bracket.winner}}
                        {@const champInfo = getTeamDisplayInfo(champGame, bracket.winner, 6, 0)}
                        <div class="team-btn champion-display {getPickStatus({winner: bracket.winner}, 6, 0) === 'correct' ? 'correct' : getPickStatus({winner: bracket.winner}, 6, 0) === 'incorrect' ? 'incorrect' : ''} {scenario && isGameUndecided(6, 0) ? (champInfo.userPick ? 'scenario-mismatch' : 'scenario-match') : ''}">
                            <span class="seed">{champInfo.seed}</span>
                            <span class="team-name">{champInfo.name}</span>
                            {#if champInfo.userPick}
                                <span class="user-pick">({champInfo.userPick})</span>
                            {/if}
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
                                on:click={(e) => handleGameClicked(e, 5, 1)}>
                    {#if bracket.round5[1]?.team1}
                        {@const info23 = getTeamDisplayInfo(bracket.round5[1], bracket.round5[1].team1, 5, 1)}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round5[1], bracket.round5[1].team1, 5, 1)}"
                            on:click={() => handleTeamClick(5, 1, bracket.round5[1].team1)}

                        >
                            <span class="seed">{info23.seed}</span>
                            <span class="team-name">{info23.name}</span>
                            {#if info23.userPick}
                                <span class="user-pick">({info23.userPick})</span>

                            {/if}
                        </button>
                    {:else}
                        <div class="team-btn empty">TBD</div>
                    {/if}
                    {#if bracket.round5[1]?.team2}
                        {@const info24 = getTeamDisplayInfo(bracket.round5[1], bracket.round5[1].team2, 5, 1)}
                        <button 
                            class="team-btn {getSelectionClass(bracket.round5[1], bracket.round5[1].team2, 5, 1)}"
                            on:click={() => handleTeamClick(5, 1, bracket.round5[1].team2)}

                        >
                            <span class="seed">{info24.seed}</span>
                            <span class="team-name">{info24.name}</span>
                            {#if info24.userPick}
                                <span class="user-pick">({info24.userPick})</span>

                            {/if}
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
                                on:click={(e) => handleGameClicked(e, 1, i + 8)}>
                            {#if game.team1}
                                {@const info25 = getTeamDisplayInfo(game, game.team1, 1, i + 8)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 1, i + 8)}"
                                    on:click={() => handleTeamClick(1, i + 8, game.team1)}

                                >
                                    <span class="seed">{info25.seed}</span>
                                    <span class="team-name">{info25.name}</span>
                                    {#if info25.userPick}
                                        <span class="user-pick">({info25.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info26 = getTeamDisplayInfo(game, game.team2, 1, i + 8)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 1, i + 8)}"
                                    on:click={() => handleTeamClick(1, i + 8, game.team2)}

                                >
                                    <span class="seed">{info26.seed}</span>
                                    <span class="team-name">{info26.name}</span>
                                    {#if info26.userPick}
                                        <span class="user-pick">({info26.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 2, i + 4)} style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
                            {#if game.team1}
                                {@const info27 = getTeamDisplayInfo(game, game.team1, 2, i + 4)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 2, i + 4)}"
                                    on:click={() => handleTeamClick(2, i + 4, game.team1)}

                                >
                                    <span class="seed">{info27.seed}</span>
                                    <span class="team-name">{info27.name}</span>
                                    {#if info27.userPick}
                                        <span class="user-pick">({info27.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info28 = getTeamDisplayInfo(game, game.team2, 2, i + 4)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 2, i + 4)}"
                                    on:click={() => handleTeamClick(2, i + 4, game.team2)}

                                >
                                    <span class="seed">{info28.seed}</span>
                                    <span class="team-name">{info28.name}</span>
                                    {#if info28.userPick}
                                        <span class="user-pick">({info28.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 3, i + 2)} style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                            {#if game.team1}
                                {@const info29 = getTeamDisplayInfo(game, game.team1, 3, i + 2)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 3, i + 2)}"
                                    on:click={() => handleTeamClick(3, i + 2, game.team1)}

                                >
                                    <span class="seed">{info29.seed}</span>
                                    <span class="team-name">{info29.name}</span>
                                    {#if info29.userPick}
                                        <span class="user-pick">({info29.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info30 = getTeamDisplayInfo(game, game.team2, 3, i + 2)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 3, i + 2)}"
                                    on:click={() => handleTeamClick(3, i + 2, game.team2)}

                                >
                                    <span class="seed">{info30.seed}</span>
                                    <span class="team-name">{info30.name}</span>
                                    {#if info30.userPick}
                                        <span class="user-pick">({info30.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 4, 1)} style="margin-top: {round4FirstOffset}px">
                        {#if bracket.round4[1]?.team1}
                            {@const info31 = getTeamDisplayInfo(bracket.round4[1], bracket.round4[1].team1, 4, 1)}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[1], bracket.round4[1].team1, 4, 1)}"
                                on:click={() => handleTeamClick(4, 1, bracket.round4[1].team1)}

                            >
                                <span class="seed">{info31.seed}</span>
                                <span class="team-name">{info31.name}</span>
                                {#if info31.userPick}
                                    <span class="user-pick">({info31.userPick})</span>

                                {/if}
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        {#if bracket.round4[1]?.team2}
                            {@const info32 = getTeamDisplayInfo(bracket.round4[1], bracket.round4[1].team2, 4, 1)}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[1], bracket.round4[1].team2, 4, 1)}"
                                on:click={() => handleTeamClick(4, 1, bracket.round4[1].team2)}

                            >
                                <span class="seed">{info32.seed}</span>
                                <span class="team-name">{info32.name}</span>
                                {#if info32.userPick}
                                    <span class="user-pick">({info32.userPick})</span>

                                {/if}
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
                                on:click={(e) => handleGameClicked(e, 4, 3)} style="margin-top: {round4FirstOffset}px">
                        {#if bracket.round4[3]?.team1}
                            {@const info33 = getTeamDisplayInfo(bracket.round4[3], bracket.round4[3].team1, 4, 3)}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[3], bracket.round4[3].team1, 4, 3)}"
                                on:click={() => handleTeamClick(4, 3, bracket.round4[3].team1)}

                            >
                                <span class="seed">{info33.seed}</span>
                                <span class="team-name">{info33.name}</span>
                                {#if info33.userPick}
                                    <span class="user-pick">({info33.userPick})</span>

                                {/if}
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        {#if bracket.round4[3]?.team2}
                            {@const info34 = getTeamDisplayInfo(bracket.round4[3], bracket.round4[3].team2, 4, 3)}
                            <button 
                                class="team-btn {getSelectionClass(bracket.round4[3], bracket.round4[3].team2, 4, 3)}"
                                on:click={() => handleTeamClick(4, 3, bracket.round4[3].team2)}

                            >
                                <span class="seed">{info34.seed}</span>
                                <span class="team-name">{info34.name}</span>
                                {#if info34.userPick}
                                    <span class="user-pick">({info34.userPick})</span>

                                {/if}
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
                                on:click={(e) => handleGameClicked(e, 3, i + 6)} style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                            {#if game.team1}
                                {@const info35 = getTeamDisplayInfo(game, game.team1, 3, i + 6)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 3, i + 6)}"
                                    on:click={() => handleTeamClick(3, i + 6, game.team1)}

                                >
                                    <span class="seed">{info35.seed}</span>
                                    <span class="team-name">{info35.name}</span>
                                    {#if info35.userPick}
                                        <span class="user-pick">({info35.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info36 = getTeamDisplayInfo(game, game.team2, 3, i + 6)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 3, i + 6)}"
                                    on:click={() => handleTeamClick(3, i + 6, game.team2)}

                                >
                                    <span class="seed">{info36.seed}</span>
                                    <span class="team-name">{info36.name}</span>
                                    {#if info36.userPick}
                                        <span class="user-pick">({info36.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 2, i + 12)} style="margin-top: {i === 0 ? round2FirstOffset : round2Gap}px">
                            {#if game.team1}
                                {@const info37 = getTeamDisplayInfo(game, game.team1, 2, i + 12)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 2, i + 12)}"
                                    on:click={() => handleTeamClick(2, i + 12, game.team1)}

                                >
                                    <span class="seed">{info37.seed}</span>
                                    <span class="team-name">{info37.name}</span>
                                    {#if info37.userPick}
                                        <span class="user-pick">({info37.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info38 = getTeamDisplayInfo(game, game.team2, 2, i + 12)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 2, i + 12)}"
                                    on:click={() => handleTeamClick(2, i + 12, game.team2)}

                                >
                                    <span class="seed">{info38.seed}</span>
                                    <span class="team-name">{info38.name}</span>
                                    {#if info38.userPick}
                                        <span class="user-pick">({info38.userPick})</span>

                                    {/if}
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
                                on:click={(e) => handleGameClicked(e, 1, i + 24)}>
                            {#if game.team1}
                                {@const info39 = getTeamDisplayInfo(game, game.team1, 1, i + 24)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team1, 1, i + 24)}"
                                    on:click={() => handleTeamClick(1, i + 24, game.team1)}

                                >
                                    <span class="seed">{info39.seed}</span>
                                    <span class="team-name">{info39.name}</span>
                                    {#if info39.userPick}
                                        <span class="user-pick">({info39.userPick})</span>

                                    {/if}
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            {#if game.team2}
                                {@const info40 = getTeamDisplayInfo(game, game.team2, 1, i + 24)}
                                <button 
                                    class="team-btn {getSelectionClass(game, game.team2, 1, i + 24)}"
                                    on:click={() => handleTeamClick(1, i + 24, game.team2)}

                                >
                                    <span class="seed">{info40.seed}</span>
                                    <span class="team-name">{info40.name}</span>
                                    {#if info40.userPick}
                                        <span class="user-pick">({info40.userPick})</span>

                                    {/if}
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

<!-- Debug Tooltip - shows on hover when DEBUG_MODE is true -->
{#if DEBUG_MODE && hoveredGame}
    <div 
        class="debug-tooltip" 
        class:pinned={pinnedGame}
        style="left: {tooltipX}px; top: {tooltipY}px;"
    >
        <div class="debug-header">
            <span>Round {hoveredGame.round} Game {hoveredGame.gameIndex}</span>
            {#if pinnedGame}
                <button class="debug-close" on:click={() => { pinnedGame = null; hoveredGame = null; }}>✕</button>
            {/if}
        </div>
        {#if pinnedGame}
            <div class="debug-pinned-note">📌 Pinned - click game again or ✕ to close</div>
        {/if}
        <div class="debug-content">
            <div class="debug-section">
                <strong>Status:</strong>
                <div>isUndecided: {hoveredGame.isUndecided}</div>
                <div>hasScenario: {hoveredGame.hasScenario}</div>
            </div>
            <div class="debug-section">
                <strong>Results Game:</strong>
                <pre>{JSON.stringify(hoveredGame.resultsGame, null, 2)}</pre>
            </div>
            <div class="debug-section">
                <strong>Scenario Game:</strong>
                <pre>{JSON.stringify(hoveredGame.scenarioGame, null, 2)}</pre>
            </div>
            <div class="debug-section">
                <strong>Bracket Game (user picks):</strong>
                <pre>{JSON.stringify(hoveredGame.bracketGame, null, 2)}</pre>
            </div>
        </div>
    </div>
{/if}

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
        --column-min-width: 198px;
    }
    
    /* Debug tooltip styles */
    .debug-tooltip {
        position: fixed;
        transform: translate(-50%, -100%) translateY(-10px);
        background: #1f2937;
        color: #f3f4f6;
        padding: 12px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 500px;
        max-height: 400px;
        overflow: auto;
        font-family: monospace;
        font-size: 11px;
    }
    
    .debug-tooltip.pinned {
        border: 2px solid #fbbf24;
        box-shadow: 0 4px 25px rgba(251, 191, 36, 0.3);
    }
    
    .debug-header {
        font-weight: bold;
        font-size: 14px;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid #4b5563;
        color: #fbbf24;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .debug-close {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 4px;
        width: 24px;
        height: 24px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .debug-close:hover {
        background: #dc2626;
    }
    
    .debug-pinned-note {
        background: #fbbf24;
        color: #1f2937;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
        margin-bottom: 8px;
        text-align: center;
    }
    
    .debug-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .debug-section {
        background: #374151;
        padding: 8px;
        border-radius: 4px;
    }
    
    .debug-section strong {
        color: #60a5fa;
        display: block;
        margin-bottom: 4px;
    }
    
    .debug-section pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-all;
        color: #d1d5db;
        max-height: 150px;
        overflow: auto;
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
    
    /* Scenario colors for undecided games */
    .team-btn.selected.scenario-match {
        background: #80276C;  /* Purple - user picked this AND scenario needs it */
        color: white;
    }
    
    .team-btn.selected.scenario-mismatch {
        background: #f97316;  /* Orange - user picked this but scenario needs other team */
        color: white;
    }
    
    .team-btn.selected.scenario-either {
        background: #0891b2;  /* Cyan - either team can win in this scenario */
        color: white;
    }
    
    .team-btn.scenario-dead {
        background: #9ca3af;  /* Gray - dead path, no points possible */
        color: white;
        font-style: italic;
    }
    
    .team-btn.scenario-needed {
        background: #fef3c7;  /* Light yellow - scenario needs this but user didn't pick */
        color: #92400e;
        border: 2px dashed #f59e0b;
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
    
    .team-btn.selected.scenario-match .seed {
        color: #80276C;
    }
    
    .team-btn.selected.scenario-mismatch .seed {
        color: #f97316;
    }
    
    .team-btn.selected.scenario-either .seed {
        color: #0891b2;
    }
    
    .team-btn.scenario-dead .seed {
        display: none;  /* Hide seed for dead paths */
    }
    
    .team-btn.scenario-needed .seed {
        background: #fef3c7;
        color: #92400e;
    }
    
    /* User pick subtitle for scenario display */
    .team-btn .user-pick {
        display: block;
        font-size: 0.65rem;
        opacity: 0.85;
        margin-top: 1px;
        font-style: italic;
    }
    
    .team-btn.selected.scenario-mismatch .user-pick {
        color: rgba(255, 255, 255, 0.9);
    }
    
    .team-btn.scenario-needed .user-pick {
        color: #92400e;
        opacity: 0.75;
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
    
    .team-btn.champion-display.scenario-match {
        background: linear-gradient(135deg, #9b3d85 0%, #80276C 100%);
    }
    
    .team-btn.champion-display.scenario-mismatch {
        background: linear-gradient(135deg, #fb923c 0%, #f97316 100%);
    }
    
    .team-btn.champion-display.scenario-either {
        background: linear-gradient(135deg, #22d3ee 0%, #0891b2 100%);
    }
    
    .team-btn.champion-display.scenario-dead {
        background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
        font-style: italic;
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
    
    .champion-display.scenario-match .seed {
        color: #80276C;
    }
    
    .champion-display.scenario-mismatch .seed {
        color: #f97316;
    }
    
    .champion-display.scenario-either .seed {
        color: #0891b2;
    }
    
    .champion-display .user-pick {
        color: rgba(255, 255, 255, 0.9);
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
        text-overflow: clip;
        min-width: 0;
    }
    
    @media (max-width: 768px) {
        .team-btn {
            padding: 0.5rem;
            font-size: 0.8rem;
        }
    }
</style>