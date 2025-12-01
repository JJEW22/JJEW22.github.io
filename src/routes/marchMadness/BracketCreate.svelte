<script>
    import { onMount } from 'svelte';
    import BracketDisplay from './BracketDisplay.svelte';
    import { 
        loadTeamsFromCSV, 
        initializeBracket, 
        loadBracketFromPath,
        saveBracketToExcel 
    } from './bracketIO.js';
    
    // Props
    export let bracketPath = null;  // Optional path to load a bracket from
    
    // State
    let teams = {};
    let teamsList = [];
    let bracket = null;
    let loading = true;
    let error = null;
    
    const TEAMS_FILE = '/marchMadness/2026/ThisYearTeams2026.csv';
    
    onMount(async () => {
        try {
            // Load teams
            const teamsData = await loadTeamsFromCSV(TEAMS_FILE);
            teams = teamsData.teams;
            teamsList = teamsData.teamsList;
            
            // Initialize bracket
            if (bracketPath) {
                bracket = await loadBracketFromPath(bracketPath, teams, teamsList);
            } else {
                bracket = initializeBracket(teamsList);
            }
            
            loading = false;
        } catch (err) {
            error = err.message;
            console.error('Error initializing bracket:', err);
            loading = false;
        }
    });
    
    function handleSelectWinner(event) {
        const { round, gameIndex, team } = event.detail;
        selectWinner(round, gameIndex, team);
    }
    
    function selectWinner(round, gameIndex, team) {
        const game = bracket[`round${round}`][gameIndex];
        game.winner = team;
        
        // Advance winner to next round
        if (round < 6) {
            const nextRound = `round${round + 1}`;
            
            if (round === 4) {
                // Elite 8 to Final 4
                const regionIndex = gameIndex;
                if (regionIndex === 0) {
                    bracket.round5[0].team1 = team;
                } else if (regionIndex === 1) {
                    bracket.round5[0].team2 = team;
                } else if (regionIndex === 2) {
                    bracket.round5[1].team1 = team;
                } else if (regionIndex === 3) {
                    bracket.round5[1].team2 = team;
                }
            } else if (round === 5) {
                // Final 4 to Championship
                if (gameIndex === 0) {
                    bracket.round6[0].team1 = team;
                } else {
                    bracket.round6[0].team2 = team;
                }
            } else {
                // Standard advancement
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
        bracket = initializeBracket(teamsList);
    }
    
    async function saveBracket() {
        await saveBracketToExcel(bracket);
    }
</script>

{#if loading}
    <div class="loading">Loading bracket...</div>
{:else if error}
    <div class="error">
        <h3>Error loading bracket</h3>
        <p>{error}</p>
    </div>
{:else if bracket}
    <div class="controls">
        <button class="save-btn" on:click={saveBracket}>💾 Save Bracket</button>
        <button class="reset-btn" on:click={resetBracket}>Reset Bracket</button>
    </div>
    
    <BracketDisplay 
        {bracket}
        interactive={true}
        on:selectWinner={handleSelectWinner}
    />
{/if}

<style>
    .controls {
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .save-btn {
        padding: 0.75rem 1.5rem;
        background: #059669;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .save-btn:hover {
        background: #047857;
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
</style>