<script>
    import { onMount } from 'svelte';
    
    // Variables to store element heights for dynamic spacing
    let gameHeight = 0;
    let firstGameRef; // Will hold reference to first game
    const baseGameGap = 8; // pixels (0.5rem ≈ 8px)
    
    // Reactive calculations for spacing based on actual rendered heights
    // For centering: each later-round game must be centered between the two games feeding into it
    
    // Round 2: First game needs offset to center between R1 games 0 and 1
    // Center point is at: (gameHeight / 2) + (gameHeight + gap) / 2 = gameHeight + gap/2
    // So offset from top = center point - (gameHeight / 2) = (gameHeight + gap) / 2
    $: round2FirstOffset = gameHeight > 0 
        ? (gameHeight + baseGameGap) / 2 
        : 40;
    // Gap between R2 games: need to skip one full R1 game pair (2 games + 1 gap), minus the height of R2 game
    // Total span of 2 R1 games = 2*gameHeight + gap
    // R2 game-to-game spacing = 2*gameHeight + 2*gap (center to center) - gameHeight = gameHeight + 2*gap
    // But column has auto-gap, so additional margin needed = gameHeight + gap
    $: round2Gap = gameHeight > 0 
        ? gameHeight + baseGameGap
        : 80;
    
    // Round 3: First game centered between R2 games 0 and 1
    $: round3FirstOffset = gameHeight > 0 
        ? round2FirstOffset + (gameHeight + baseGameGap) 
        : 120;
    $: round3Gap = gameHeight > 0 
        ? 3 * gameHeight + 3 * baseGameGap
        : 248;
    
    // Round 4: First game centered between R3 games 0 and 1
    $: round4FirstOffset = gameHeight > 0
        ? round3FirstOffset + (gameHeight + baseGameGap)
        : 200;
    
    // Debug logging
    $: if (gameHeight > 0) {
        console.log('Game height:', gameHeight, 'px');
        console.log('Round 2 first offset:', round2FirstOffset, 'px, gap:', round2Gap, 'px');
        console.log('Round 3 first offset:', round3FirstOffset, 'px, gap:', round3Gap, 'px');
        console.log('Round 4 first offset:', round4FirstOffset, 'px');
    }
    
    // Spacing constants - adjust these to fine-tune bracket alignment
    const SPACING = {
        gameHeight: '4.5rem',          // Height of each game box
        gameGap: '0.5rem',             // Gap between games in same column
        round2MarginTop: '2.5rem',     // Vertical offset for Round 2 games
        round3MarginTop: '5.5rem',     // Vertical offset for Round 3 games
        round4MarginTop: '11.5rem',    // Vertical offset for Round 4 games
        columnGap: '0.5rem',           // Gap between columns
        regionGap: '1.5rem',           // Gap between regions (top/bottom)
        sideGap: '1rem',               // Gap between left/center/right sections
        columnMinWidth: '180px',       // Minimum width of each column
        teamBtnPadding: '0.75rem',     // Padding inside team buttons
        seedSize: '24px',              // Size of seed number circles
        teamFontSize: '0.9rem'         // Font size for team names
    };
    
    // Region positioning for Final Four matchups
    const regionPositions = {
        topLeft: 'East',
        bottomLeft: 'West', 
        topRight: 'South',
        bottomRight: 'Midwest'
    };
    
    // Teams will be loaded from CSV
    let initialTeams = [];
    let loading = true;
    let error = null;
    
    // Bracket structure
    let bracket = {
        round1: [], // Round of 64
        round2: [], // Round of 32
        round3: [], // Sweet 16
        round4: [], // Elite 8
        round5: [], // Final 4
        round6: [], // Championship
        winner: null
    };
    
    onMount(async () => {
        await loadTeamsFromCSV();
        if (initialTeams.length > 0) {
            initializeBracket();
        }
    });
    
    async function loadTeamsFromCSV() {
        try {
            const response = await fetch('/marchMadness/2026/ThisYearTeams2026.csv');
            
            if (!response.ok) {
                throw new Error(`Failed to load teams CSV: ${response.status}`);
            }
            
            const csvText = await response.text();
            const lines = csvText.trim().split('\n');
            
            // Skip header row
            const dataLines = lines.slice(1);
            
            initialTeams = dataLines.map(line => {
                // Handle CSV parsing (basic - assumes no commas in team names)
                const [team, seed, region] = line.split(',').map(s => s.trim());
                return {
                    name: team,
                    seed: parseInt(seed),
                    region: region
                };
            });
            
            console.log('Loaded teams:', initialTeams);
            loading = false;
        } catch (err) {
            error = err.message;
            console.error('Error loading teams:', err);
            loading = false;
        }
    }
    
    function initializeBracket() {
        // Group teams by region
        const regions = {
            East: [],
            West: [],
            South: [],
            Midwest: []
        };
        
        initialTeams.forEach(team => {
            if (regions[team.region]) {
                regions[team.region].push(team);
            }
        });
        
        // Sort each region by seed
        Object.keys(regions).forEach(region => {
            regions[region].sort((a, b) => a.seed - b.seed);
        });
        
        // Standard tournament matchups: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
        const matchupPairs = [
            [1, 16],
            [8, 9],
            [5, 12],
            [4, 13],
            [6, 11],
            [3, 14],
            [7, 10],
            [2, 15]
        ];
        
        // Initialize Round 1 with proper seed matchups
        bracket.round1 = [];
        
        // Process regions in order based on positioning (topLeft, bottomLeft, topRight, bottomRight)
        const orderedRegions = [
            regionPositions.topLeft,
            regionPositions.bottomLeft,
            regionPositions.topRight,
            regionPositions.bottomRight
        ];
        
        orderedRegions.forEach(regionName => {
            const regionTeams = regions[regionName];
            
            matchupPairs.forEach(([seed1, seed2]) => {
                const team1 = regionTeams.find(t => t.seed === seed1);
                const team2 = regionTeams.find(t => t.seed === seed2);
                
                if (team1 && team2) {
                    bracket.round1.push({
                        team1: team1,
                        team2: team2,
                        winner: null,
                        region: regionName,
                        gameId: `r1-${regionName}-${seed1}v${seed2}`
                    });
                }
            });
        });
        
        // Initialize subsequent rounds with empty games
        bracket.round2 = Array(16).fill(null).map((_, i) => ({
            team1: null,
            team2: null,
            winner: null,
            gameId: `r2-${i}`
        }));
        
        bracket.round3 = Array(8).fill(null).map((_, i) => ({
            team1: null,
            team2: null,
            winner: null,
            gameId: `r3-${i}`
        }));
        
        bracket.round4 = Array(4).fill(null).map((_, i) => ({
            team1: null,
            team2: null,
            winner: null,
            gameId: `r4-${i}`
        }));
        
        // Final Four: topLeft vs bottomLeft, topRight vs bottomRight
        bracket.round5 = [
            {
                team1: null, // topLeft winner
                team2: null, // bottomLeft winner
                winner: null,
                gameId: 'semifinal-left'
            },
            {
                team1: null, // topRight winner
                team2: null, // bottomRight winner
                winner: null,
                gameId: 'semifinal-right'
            }
        ];
        
        bracket.round6 = [{
            team1: null,
            team2: null,
            winner: null,
            gameId: 'championship'
        }];
    }
    
    function selectWinner(round, gameIndex, team) {
        const game = bracket[`round${round}`][gameIndex];
        game.winner = team;
        
        // Advance winner to next round
        if (round < 6) {
            const nextRound = `round${round + 1}`;
            
            if (round === 4) {
                // Elite 8 to Final 4: Map regions to correct semifinal games
                // Games 0-7 in Elite 8 map to regions: topLeft, bottomLeft, topRight, bottomRight
                const regionIndex = gameIndex; // 0=topLeft, 1=bottomLeft, 2=topRight, 3=bottomRight
                
                if (regionIndex === 0) {
                    // topLeft winner goes to semifinal 0, slot 1
                    bracket.round5[0].team1 = team;
                } else if (regionIndex === 1) {
                    // bottomLeft winner goes to semifinal 0, slot 2
                    bracket.round5[0].team2 = team;
                } else if (regionIndex === 2) {
                    // topRight winner goes to semifinal 1, slot 1
                    bracket.round5[1].team1 = team;
                } else if (regionIndex === 3) {
                    // bottomRight winner goes to semifinal 1, slot 2
                    bracket.round5[1].team2 = team;
                }
            } else if (round === 5) {
                // Final 4 to Championship
                if (gameIndex === 0) {
                    bracket.round6[0].team1 = team; // Left bracket winner
                } else {
                    bracket.round6[0].team2 = team; // Right bracket winner
                }
            } else {
                // Standard advancement for earlier rounds
                const nextGameIndex = Math.floor(gameIndex / 2);
                const nextGame = bracket[nextRound][nextGameIndex];
                
                if (gameIndex % 2 === 0) {
                    nextGame.team1 = team;
                } else {
                    nextGame.team2 = team;
                }
            }
        } else {
            // Championship winner
            bracket.winner = team;
        }
        
        // Trigger reactivity
        bracket = bracket;
    }
    
    function resetBracket() {
        initializeBracket();
        bracket = bracket;
    }
</script>

<svelte:head>
    <title>March Madness Bracket</title>
    <meta name="description" content="Create your March Madness bracket">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>🏀 March Madness Bracket</h1>
        
        {#if loading}
            <div class="loading">Loading teams...</div>
        {:else if error}
            <div class="error">
                <h3>Error loading teams</h3>
                <p>{error}</p>
            </div>
        {:else}
            <div class="controls">
                <button class="reset-btn" on:click={resetBracket}>Reset Bracket</button>
            </div>
        
        <div class="bracket-scroll-container">
            <div class="bracket-wrapper">
            <!-- Top Bracket Row -->
            <div class="bracket-row top-bracket">
                <!-- Top Left Region -->
                <div class="bracket-region top-left">
                    <h3 class="region-title">{regionPositions.topLeft}</h3>
                    
                    <!-- Round 1 - Games 0-7 (topLeft region) -->
                    <div class="bracket-column">
                        {#each bracket.round1.slice(0, 8) as game, i}
                            {#if i === 0}
                                <div class="game" bind:clientHeight={gameHeight}>
                                    {#if game.team1}
                                        <button 
                                            class="team-btn"
                                            class:selected={game.winner === game.team1}
                                            on:click={() => selectWinner(1, i, game.team1)}
                                        >
                                            <span class="seed">{game.team1.seed}</span>
                                            <span class="team-name">{game.team1.name}</span>
                                        </button>
                                    {:else}
                                        <div class="team-btn empty">TBD</div>
                                    {/if}
                                    {#if game.team2}
                                        <button 
                                            class="team-btn"
                                            class:selected={game.winner === game.team2}
                                            on:click={() => selectWinner(1, i, game.team2)}
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
                                            class="team-btn"
                                            class:selected={game.winner === game.team1}
                                            on:click={() => selectWinner(1, i, game.team1)}
                                        >
                                            <span class="seed">{game.team1.seed}</span>
                                            <span class="team-name">{game.team1.name}</span>
                                        </button>
                                    {:else}
                                        <div class="team-btn empty">TBD</div>
                                    {/if}
                                    {#if game.team2}
                                        <button 
                                            class="team-btn"
                                            class:selected={game.winner === game.team2}
                                            on:click={() => selectWinner(1, i, game.team2)}
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
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(2, i, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(2, i, game.team2)}
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
                    
                    <!-- Round 3 (Sweet 16) - Games 0-1 -->
                    <div class="bracket-column">
                        {#each bracket.round3.slice(0, 2) as game, i}
                            <div class="game" style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                                {#if game.team1}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(3, i, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(3, i, game.team2)}
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
                    
                    <!-- Round 4 (Elite 8) - Game 0 -->
                    <div class="bracket-column">
                        <div class="game" style="margin-top: {round4FirstOffset}px">
                            {#if bracket.round4[0] && bracket.round4[0].team1}
                                <button 
                                    class="team-btn"
                                    class:selected={bracket.round4[0].winner === bracket.round4[0].team1}
                                    on:click={() => selectWinner(4, 0, bracket.round4[0].team1)}
                                >
                                    <span class="seed">{bracket.round4[0].team1.seed}</span>
                                    <span class="team-name">{bracket.round4[0].team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            
                            {#if bracket.round4[0] && bracket.round4[0].team2}
                                <button 
                                    class="team-btn"
                                    class:selected={bracket.round4[0].winner === bracket.round4[0].team2}
                                    on:click={() => selectWinner(4, 0, bracket.round4[0].team2)}
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
                    
                    <!-- Round 4 (Elite 8) - Game 2 -->
                    <div class="bracket-column">
                        <div class="game" style="margin-top: {round4FirstOffset}px">
                            {#if bracket.round4[2] && bracket.round4[2].team1}
                                <button 
                                    class="team-btn"
                                    class:selected={bracket.round4[2].winner === bracket.round4[2].team1}
                                    on:click={() => selectWinner(4, 2, bracket.round4[2].team1)}
                                >
                                    <span class="seed">{bracket.round4[2].team1.seed}</span>
                                    <span class="team-name">{bracket.round4[2].team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            
                            {#if bracket.round4[2] && bracket.round4[2].team2}
                                <button 
                                    class="team-btn"
                                    class:selected={bracket.round4[2].winner === bracket.round4[2].team2}
                                    on:click={() => selectWinner(4, 2, bracket.round4[2].team2)}
                                >
                                    <span class="seed">{bracket.round4[2].team2.seed}</span>
                                    <span class="team-name">{bracket.round4[2].team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    </div>
                    
                    <!-- Round 3 (Sweet 16) - Games 4-5 -->
                    <div class="bracket-column">
                        {#each bracket.round3.slice(4, 6) as game, i}
                            <div class="game" style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                                {#if game.team1}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(3, i + 4, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(3, i + 4, game.team2)}
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
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(2, i + 8, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(2, i + 8, game.team2)}
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
                    
                    <!-- Round 1 - Games 16-23 (topRight region) -->
                    <div class="bracket-column">
                        {#each bracket.round1.slice(16, 24) as game, i}
                            <div class="game">
                                {#if game.team1}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(1, i + 16, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(1, i + 16, game.team2)}
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
                        {#if bracket.round5[0] && bracket.round5[0].team1}
                            <button 
                                class="team-btn"
                                class:selected={bracket.round5[0].winner === bracket.round5[0].team1}
                                on:click={() => selectWinner(5, 0, bracket.round5[0].team1)}
                            >
                                <span class="seed">{bracket.round5[0].team1.seed}</span>
                                <span class="team-name">{bracket.round5[0].team1.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        
                        {#if bracket.round5[0] && bracket.round5[0].team2}
                            <button 
                                class="team-btn"
                                class:selected={bracket.round5[0].winner === bracket.round5[0].team2}
                                on:click={() => selectWinner(5, 0, bracket.round5[0].team2)}
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
                        {#if bracket.round6[0] && bracket.round6[0].team1}
                            <button 
                                class="team-btn"
                                class:selected={bracket.round6[0].winner === bracket.round6[0].team1}
                                on:click={() => selectWinner(6, 0, bracket.round6[0].team1)}
                            >
                                <span class="seed">{bracket.round6[0].team1.seed}</span>
                                <span class="team-name">{bracket.round6[0].team1.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        
                        {#if bracket.round6[0] && bracket.round6[0].team2}
                            <button 
                                class="team-btn"
                                class:selected={bracket.round6[0].winner === bracket.round6[0].team2}
                                on:click={() => selectWinner(6, 0, bracket.round6[0].team2)}
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
                            <div class="team-btn champion-display">
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
                        {#if bracket.round5[1] && bracket.round5[1].team1}
                            <button 
                                class="team-btn"
                                class:selected={bracket.round5[1].winner === bracket.round5[1].team1}
                                on:click={() => selectWinner(5, 1, bracket.round5[1].team1)}
                            >
                                <span class="seed">{bracket.round5[1].team1.seed}</span>
                                <span class="team-name">{bracket.round5[1].team1.name}</span>
                            </button>
                        {:else}
                            <div class="team-btn empty">TBD</div>
                        {/if}
                        
                        {#if bracket.round5[1] && bracket.round5[1].team2}
                            <button 
                                class="team-btn"
                                class:selected={bracket.round5[1].winner === bracket.round5[1].team2}
                                on:click={() => selectWinner(5, 1, bracket.round5[1].team2)}
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
                    
                    <!-- Round 1 - Games 8-15 (bottomLeft region) -->
                    <div class="bracket-column">
                        {#each bracket.round1.slice(8, 16) as game, i}
                            <div class="game">
                                {#if game.team1}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(1, i + 8, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(1, i + 8, game.team2)}
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
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(2, i + 4, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(2, i + 4, game.team2)}
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
                    
                    <!-- Round 3 (Sweet 16) - Games 2-3 -->
                    <div class="bracket-column">
                        {#each bracket.round3.slice(2, 4) as game, i}
                            <div class="game" style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                                {#if game.team1}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(3, i + 2, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(3, i + 2, game.team2)}
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
                    
                    <!-- Round 4 (Elite 8) - Game 1 -->
                    <div class="bracket-column">
                        <div class="game" style="margin-top: {round4FirstOffset}px">
                            {#if bracket.round4[1] && bracket.round4[1].team1}
                                <button 
                                    class="team-btn"
                                    class:selected={bracket.round4[1].winner === bracket.round4[1].team1}
                                    on:click={() => selectWinner(4, 1, bracket.round4[1].team1)}
                                >
                                    <span class="seed">{bracket.round4[1].team1.seed}</span>
                                    <span class="team-name">{bracket.round4[1].team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            
                            {#if bracket.round4[1] && bracket.round4[1].team2}
                                <button 
                                    class="team-btn"
                                    class:selected={bracket.round4[1].winner === bracket.round4[1].team2}
                                    on:click={() => selectWinner(4, 1, bracket.round4[1].team2)}
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
                    
                    <!-- Round 4 (Elite 8) - Game 3 -->
                    <div class="bracket-column">
                        <div class="game" style="margin-top: {round4FirstOffset}px">
                            {#if bracket.round4[3] && bracket.round4[3].team1}
                                <button 
                                    class="team-btn"
                                    class:selected={bracket.round4[3].winner === bracket.round4[3].team1}
                                    on:click={() => selectWinner(4, 3, bracket.round4[3].team1)}
                                >
                                    <span class="seed">{bracket.round4[3].team1.seed}</span>
                                    <span class="team-name">{bracket.round4[3].team1.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                            
                            {#if bracket.round4[3] && bracket.round4[3].team2}
                                <button 
                                    class="team-btn"
                                    class:selected={bracket.round4[3].winner === bracket.round4[3].team2}
                                    on:click={() => selectWinner(4, 3, bracket.round4[3].team2)}
                                >
                                    <span class="seed">{bracket.round4[3].team2.seed}</span>
                                    <span class="team-name">{bracket.round4[3].team2.name}</span>
                                </button>
                            {:else}
                                <div class="team-btn empty">TBD</div>
                            {/if}
                        </div>
                    </div>
                    
                    <!-- Round 3 (Sweet 16) - Games 6-7 -->
                    <div class="bracket-column">
                        {#each bracket.round3.slice(6, 8) as game, i}
                            <div class="game" style="margin-top: {i === 0 ? round3FirstOffset : round3Gap}px">
                                {#if game.team1}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(3, i + 6, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(3, i + 6, game.team2)}
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
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(2, i + 12, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(2, i + 12, game.team2)}
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
                    
                    <!-- Round 1 - Games 24-31 (bottomRight region) -->
                    <div class="bracket-column">
                        {#each bracket.round1.slice(24, 32) as game, i}
                            <div class="game">
                                {#if game.team1}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team1}
                                        on:click={() => selectWinner(1, i + 24, game.team1)}
                                    >
                                        <span class="seed">{game.team1.seed}</span>
                                        <span class="team-name">{game.team1.name}</span>
                                    </button>
                                {:else}
                                    <div class="team-btn empty">TBD</div>
                                {/if}
                                {#if game.team2}
                                    <button 
                                        class="team-btn"
                                        class:selected={game.winner === game.team2}
                                        on:click={() => selectWinner(1, i + 24, game.team2)}
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
        {/if}
    </main>
</div>

<style>
    /* Inject spacing constants as CSS variables */
    :root {
        --game-height: 4.5rem;
        --game-gap: 0.5rem;
        --round2-margin-top: 2.5rem;
        --round3-margin-top: 5.5rem;
        --round4-margin-top: 11.5rem;
        --column-gap: 0.5rem;
        --region-gap: 1.5rem;
        --side-gap: 1rem;
        --column-min-width: 180px;
        --team-btn-padding: 0.75rem;
        --seed-size: 24px;
        --team-font-size: 0.9rem;
    }
    
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
    
    .controls {
        display: flex;
        justify-content: center;
        margin-bottom: 2rem;
    }
    
    .reset-btn {
        padding: 0.75rem 1.5rem;
        background: #dc2626;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .reset-btn:hover {
        background: #b91c1c;
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
    
    .top-bracket,
    .bottom-bracket {
        gap: 2rem;
    }
    
    .bracket-container {
        display: flex;
        gap: var(--side-gap);
        padding: 1rem 0;
        justify-content: center;
        min-width: min-content;
    }
    
    .bracket-side {
        display: flex;
        flex-direction: column;
        gap: var(--region-gap);
    }
    
    .left-side {
        order: 1;
    }
    
    .bracket-center {
        order: 2;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2rem;
        min-width: 220px;
    }
    
    .right-side {
        order: 2;
    }
    
    /* Final Four horizontal row */
    .final-four-row {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        gap: 3rem;
        padding: 1.5rem 2rem;
        background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 12px;
        border: 2px solid #e2e8f0;
        margin: 0 auto;
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
    
    .semifinal-game,
    .championship-game {
        width: var(--column-min-width);
    }
    
    .championship-section {
        padding: 0 1rem;
    }
    
    .championship-section h3 {
        color: #d97706;
    }
    
    .champion-label {
        margin-top: 0.5rem;
        color: #d97706 !important;
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
    
    .team-btn.champion-display {
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        color: white;
        font-weight: 600;
        cursor: default;
    }
    
    .champion-display .seed {
        background: white;
        color: #f59e0b;
    }
    
    .bracket-region {
        display: flex;
        gap: 0.5rem;
    }
    
    .top-left .bracket-column,
    .bottom-left .bracket-column {
        order: 1;
    }
    
    .top-right .bracket-column,
    .bottom-right .bracket-column {
        order: -1; /* Reverse order for right side */
    }
    
    .region-title {
        writing-mode: vertical-lr;
        text-orientation: upright;
        font-size: 1rem;
        font-weight: 700;
        color: #4b5563;
        text-align: center;
        padding: 1rem 0.5rem;
        background: #f3f4f6;
        border-radius: 6px;
    }
    
    .bracket-column {
        display: flex;
        flex-direction: column;
        gap: var(--game-gap);
        width: var(--column-min-width);
    }
    
    .round {
        min-width: 200px;
        flex-shrink: 0;
    }
    
    .round h3 {
        font-size: 1rem;
        text-align: center;
        margin-bottom: 1rem;
        color: #4b5563;
        font-weight: 600;
    }
    
    .games {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    /* Spacing for later rounds to align with bracket flow */
    /* Each round's game should be centered between the two games feeding into it */
    .round2-spacing {
        margin-top: 2.75rem; /* (game height 4.5rem + gap 0.5rem) / 2 = 2.5rem, adjusted for visual centering */
    }
    
    .round2-spacing:first-child {
        margin-top: 0;
    }
    
    .round3-spacing {
        margin-top: 6rem; /* Centers between two Round 2 games */
    }
    
    .round3-spacing:first-child {
        margin-top: 0;
    }
    
    .round4-spacing {
        margin-top: 12.5rem; /* Centers between two Round 3 games */
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
    
    .team-btn:not(.empty):hover {
        background: #f3f4f6;
    }
    
    .team-btn.selected {
        background: #0066cc;
        color: white;
        font-weight: 600;
    }
    
    .team-btn.empty {
        background: #f9fafb;
        color: #9ca3af;
        cursor: default;
        font-style: italic;
        justify-content: center;
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
    
    .team-btn.selected .seed {
        background: white;
        color: #0066cc;
    }
    
    .team-name {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }
    
    .loading {
        text-align: center;
        padding: 3rem;
        font-size: 1.25rem;
        color: #4b5563;
    }
    
    .error {
        background: #fee;
        border: 1px solid #fcc;
        border-radius: 8px;
        padding: 2rem;
        color: #c00;
        text-align: center;
    }
    
    .error h3 {
        margin-top: 0;
    }
    
    /* Mobile responsive */
    @media (max-width: 768px) {
        main {
            padding: 1rem;
        }
        
        h1 {
            font-size: 1.5rem;
        }
        
        .round {
            min-width: 160px;
        }
        
        .team-btn {
            padding: 0.5rem;
            font-size: 0.8rem;
        }
    }
</style>