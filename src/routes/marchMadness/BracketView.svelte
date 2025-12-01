<script>
    import { onMount, createEventDispatcher } from 'svelte';
    import BracketDisplay from './BracketDisplay.svelte';
    import { 
        loadTeamsFromCSV, 
        initializeBracket, 
        loadBracketFromPath,
        getEliminatedTeams
    } from './bracketIO.js';
    
    const dispatch = createEventDispatcher();
    
    // Props
    export let bracketPath = null;      // Path to the bracket to view
    export let resultsPath = null;      // Path to the results bracket
    export let stakeData = null;        // Stake data for tooltips
    
    // State
    let teams = {};
    let teamsList = [];
    let bracket = null;
    let resultsBracket = null;
    let eliminatedTeams = new Set();
    let loading = true;
    let error = null;
    
    const TEAMS_FILE = '/marchMadness/2026/ThisYearTeams2026.csv';
    
    onMount(async () => {
        try {
            // Load teams
            const teamsData = await loadTeamsFromCSV(TEAMS_FILE);
            teams = teamsData.teams;
            teamsList = teamsData.teamsList;
            
            // Load the bracket to view
            if (bracketPath) {
                bracket = await loadBracketFromPath(bracketPath, teams, teamsList);
            } else {
                bracket = initializeBracket(teamsList);
            }
            
            // Load results bracket if provided
            if (resultsPath) {
                try {
                    resultsBracket = await loadBracketFromPath(resultsPath, teams, teamsList);
                    eliminatedTeams = getEliminatedTeams(resultsBracket);
                } catch (e) {
                    console.warn('Could not load results bracket:', e);
                    // Continue without results - all picks will show as pending
                }
            }
            
            loading = false;
        } catch (err) {
            error = err.message;
            console.error('Error loading bracket:', err);
            loading = false;
        }
    });
    
    function handleNextGameClick(event) {
        dispatch('nextGameClick', event.detail);
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
    <BracketDisplay 
        {bracket}
        {resultsBracket}
        {eliminatedTeams}
        {stakeData}
        interactive={false}
        on:nextGameClick={handleNextGameClick}
    />
{/if}

<style>
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