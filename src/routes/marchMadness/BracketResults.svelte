<script>
    import { onMount } from 'svelte';
    import { 
        SCORE_FOR_ROUND, 
        SEED_FACTOR,
        regionPositions,
        matchupPairs,
        createEmptyBracket,
        initializeBracketWithTeams,
        computeScore,
        computePossibleRemaining,
        computeStakeInGame,
        letterToNumber
    } from './BracketStructure.js';
    import { loadBracketFromPath } from './bracketIO.js';
    import BracketView from './BracketView.svelte';
    
    // Configuration
    const YEAR = '2026';
    const BRACKETS_PATH = `/marchMadness/${YEAR}/brackets`;
    const TEAMS_FILE = `/marchMadness/${YEAR}/ThisYearTeams${YEAR}.csv`;
    const RESULTS_FILE = `/marchMadness/${YEAR}/results-bracket-march-madness-${YEAR}`;
    const OPTIMAL_BRACKETS_FILE = `/marchMadness/${YEAR}/optimal-brackets.json`;
    
    // State
    let loading = true;
    let error = null;
    let activeTab = 'standings'; // 'standings', 'brackets', 'stakes'
    
    // Data
    let teams = {};  // Map of team name -> team data
    let teamsList = [];
    let participants = [];  // List of participant names
    let participantBrackets = {};  // Map of name -> bracket
    let resultsBracket = null;
    let standings = [];
    let selectedParticipant = null;
    let selectedScenario = null;  // Index of selected scenario, 'optimal', or 'losing-N' for losing scenarios
    let currentRound = 1;  // Current round for stake calculations
    let upcomingGames = [];  // Games that haven't been decided yet
    let stakeData = {};  // Stake in each upcoming game per participant
    let winProbabilities = {};  // Map of name -> win probability
    let loseProbabilities = {};  // Map of name -> lose (last place) probability
    let averagePlaces = {};  // Map of name -> average place
    let winningScenarios = {};  // Map of name -> array of winning scenarios
    let losingScenarios = {};  // Map of name -> array of losing scenarios
    let nextGamePreferences = {};  // Map of game key -> preferences per participant
    let optimalBrackets = {};  // Map of name -> optimal bracket for max possible score
    
    onMount(async () => {
        try {
            await loadTeams();
            await loadResults();
            await loadParticipants();
            await loadAllBrackets();
            await loadWinProbabilities();
            await loadOptimalBrackets();
            calculateStandings();
            findUpcomingGames();
            calculateStakes();
            loading = false;
        } catch (err) {
            error = err.message;
            console.error('Error loading data:', err);
            loading = false;
        }
    });
    
    async function loadTeams() {
        const response = await fetch(TEAMS_FILE);
        if (!response.ok) throw new Error(`Failed to load teams: ${response.status}`);
        
        const csvText = await response.text();
        const lines = csvText.trim().split('\n').slice(1); // Skip header
        
        teamsList = lines.map(line => {
            const [name, seed, region] = line.split(',').map(s => s.trim());
            const team = { name, seed: parseInt(seed), region };
            teams[name] = team;
            return team;
        });
    }
    
    async function loadResults() {
        // Try to load results (loadBracketFromPath tries JSON first, then Excel)
        try {
            resultsBracket = await loadBracketFromPath(RESULTS_FILE, teams, teamsList);
        } catch (e) {
            console.log('No results file found, using empty bracket');
            resultsBracket = initializeBracketWithTeams(teamsList);
        }
    }
    
    function parseResultsCSV(csvText) {
        // Parse results CSV and populate resultsBracket
        // This would parse the same format as the bracket Excel files
        const lines = csvText.trim().split('\n');
        // Implementation depends on CSV format
    }
    
    async function loadParticipants() {
        // Load participant list from a config file or directory listing
        try {
            const response = await fetch(`/marchMadness/${YEAR}/participants.json`);
            if (response.ok) {
                participants = await response.json();
            } else {
                // Default participants for testing
                participants = ['player1', 'player2'];
            }
        } catch (e) {
            participants = ['player1', 'player2'];
        }
    }
    
    async function loadWinProbabilities() {
        try {
            const response = await fetch(`/marchMadness/${YEAR}/winProbabilities.json`);
            if (response.ok) {
                const data = await response.json();
                // Handle both old format and new format with losing_scenarios
                if (data.win_probabilities) {
                    // New format with win/lose probabilities
                    winProbabilities = data.win_probabilities;
                    loseProbabilities = data.lose_probabilities || {};
                    averagePlaces = data.average_places || {};
                    winningScenarios = data.winning_scenarios || {};
                    losingScenarios = data.losing_scenarios || {};
                    nextGamePreferences = data.next_game_preferences || {};
                } else if (data.probabilities) {
                    // Old format with just 'probabilities'
                    winProbabilities = data.probabilities;
                    loseProbabilities = {};
                    averagePlaces = {};
                    winningScenarios = data.winning_scenarios || {};
                    losingScenarios = {};
                    nextGamePreferences = data.next_game_preferences || {};
                } else {
                    // Very old format - just probabilities object
                    winProbabilities = data;
                    loseProbabilities = {};
                    averagePlaces = {};
                    winningScenarios = {};
                    losingScenarios = {};
                    nextGamePreferences = {};
                }
            } else {
                // No probabilities file - leave empty
                winProbabilities = {};
                loseProbabilities = {};
                averagePlaces = {};
                winningScenarios = {};
                losingScenarios = {};
                nextGamePreferences = {};
            }
        } catch (e) {
            console.log('No win probabilities file found');
            winProbabilities = {};
            loseProbabilities = {};
            averagePlaces = {};
            winningScenarios = {};
            losingScenarios = {};
            nextGamePreferences = {};
        }
    }
    
    async function loadOptimalBrackets() {
        try {
            const response = await fetch(OPTIMAL_BRACKETS_FILE);
            if (response.ok) {
                optimalBrackets = await response.json();
            } else {
                console.log('No optimal brackets file found');
                optimalBrackets = {};
            }
        } catch (e) {
            console.log('Could not load optimal brackets:', e);
            optimalBrackets = {};
        }
    }
    
    async function loadAllBrackets() {
        for (const name of participants) {
            try {
                const bracket = await loadBracketForParticipant(name);
                if (bracket) {
                    participantBrackets[name] = bracket;
                }
            } catch (e) {
                console.error(`Failed to load bracket for ${name}:`, e);
            }
        }
    }
    
    async function loadBracketForParticipant(name) {
        // Try JSON first (preferred format)
        try {
            const jsonResponse = await fetch(`${BRACKETS_PATH}/${name}-bracket-march-madness-${YEAR}.json`);
            if (jsonResponse.ok) {
                const bracket = await jsonResponse.json();
                // Add parentGames references for UI navigation
                addParentGameReferences(bracket);
                return bracket;
            }
        } catch (e) {
            console.log(`No JSON bracket for ${name}`);
        }
        
        // Try CSV
        try {
            const csvResponse = await fetch(`${BRACKETS_PATH}/${name}-bracket-march-madness-${YEAR}.csv`);
            if (csvResponse.ok) {
                const csvText = await csvResponse.text();
                return parseBracketCSV(csvText);
            }
        } catch (e) {
            console.log(`No CSV bracket for ${name}`);
        }
        
        // Try to load Excel using ExcelJS
        try {
            const xlsxResponse = await fetch(`${BRACKETS_PATH}/${name}-bracket-march-madness-${YEAR}.xlsx`);
            if (xlsxResponse.ok) {
                const arrayBuffer = await xlsxResponse.arrayBuffer();
                return await parseBracketExcel(arrayBuffer);
            }
        } catch (e) {
            console.log(`No Excel bracket for ${name}`);
        }
        
        return null;
    }
    
    // Add parentGames references for UI navigation between rounds
    function addParentGameReferences(bracket) {
        if (bracket.round2) {
            bracket.round2.forEach((game, i) => {
                if (game && bracket.round1) {
                    game.parentGames = [bracket.round1[i * 2], bracket.round1[i * 2 + 1]];
                }
            });
        }
        if (bracket.round3) {
            bracket.round3.forEach((game, i) => {
                if (game && bracket.round2) {
                    game.parentGames = [bracket.round2[i * 2], bracket.round2[i * 2 + 1]];
                }
            });
        }
        if (bracket.round4) {
            bracket.round4.forEach((game, i) => {
                if (game && bracket.round3) {
                    game.parentGames = [bracket.round3[i * 2], bracket.round3[i * 2 + 1]];
                }
            });
        }
        if (bracket.round5 && bracket.round4) {
            if (bracket.round5[0]) {
                bracket.round5[0].parentGames = [bracket.round4[0], bracket.round4[1]];
            }
            if (bracket.round5[1]) {
                bracket.round5[1].parentGames = [bracket.round4[2], bracket.round4[3]];
            }
        }
        if (bracket.round6 && bracket.round6[0] && bracket.round5) {
            bracket.round6[0].parentGames = [bracket.round5[0], bracket.round5[1]];
        }
    }
    
    function parseBracketCSV(csvText) {
        // Initialize bracket with teams
        const bracket = initializeBracketWithTeams(teamsList);
        
        const lines = csvText.trim().split('\n');
        // Parse CSV and extract winners for each game
        // Format depends on how you export the CSV
        
        return bracket;
    }
    
    async function parseBracketExcel(arrayBuffer) {
        const ExcelJSModule = await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm');
        const ExcelJS = ExcelJSModule.default || ExcelJSModule;
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        
        const sheet = workbook.getWorksheet('madness');
        if (!sheet) return null;
        
        // Initialize bracket with teams
        const bracket = initializeBracketWithTeams(teamsList);
        
        // Extract winners from the Excel file using the same cell mappings
        // East Region (left side, top)
        extractRegionWinners(sheet, bracket, 'East', 0, {
            r1Rows: [7, 11, 15, 19, 23, 27, 31, 35],
            r2Rows: [8, 12, 16, 20, 24, 28, 32, 36],
            s16Rows: [10, 18, 26, 34],
            e8Rows: [14, 30],
            f4Row: 22,
            r1Col: 'C', r2Col: 'E', s16Col: 'H', e8Col: 'K', f4Col: 'N'
        });
        
        // West Region (left side, bottom)
        extractRegionWinners(sheet, bracket, 'West', 8, {
            r1Rows: [42, 46, 50, 54, 58, 62, 66, 70],
            r2Rows: [43, 47, 51, 55, 59, 63, 67, 71],
            s16Rows: [45, 53, 61, 69],
            e8Rows: [49, 65],
            f4Row: 57,
            r1Col: 'C', r2Col: 'E', s16Col: 'H', e8Col: 'K', f4Col: 'N'
        });
        
        // South Region (right side, top)
        extractRegionWinners(sheet, bracket, 'South', 16, {
            r1Rows: [7, 11, 15, 19, 23, 27, 31, 35],
            r2Rows: [8, 12, 16, 20, 24, 28, 32, 36],
            s16Rows: [10, 18, 26, 34],
            e8Rows: [14, 30],
            f4Row: 22,
            r1Col: 'AL', r2Col: 'AJ', s16Col: 'AG', e8Col: 'AD', f4Col: 'AA'
        });
        
        // Midwest Region (right side, bottom)
        extractRegionWinners(sheet, bracket, 'Midwest', 24, {
            r1Rows: [42, 46, 50, 54, 58, 62, 66, 70],
            r2Rows: [43, 47, 51, 55, 59, 63, 67, 71],
            s16Rows: [45, 53, 61, 69],
            e8Rows: [49, 65],
            f4Row: 57,
            r1Col: 'AL', r2Col: 'AJ', s16Col: 'AG', e8Col: 'AD', f4Col: 'AA'
        });
        
        // Championship
        const champ1 = getCellValue(sheet, 'O', 39);
        const champ2 = getCellValue(sheet, 'W', 39);
        const champion = getCellValue(sheet, 'R', 44);
        
        if (champ1) bracket.round5[0].winner = findTeam(champ1);
        if (champ2) bracket.round5[1].winner = findTeam(champ2);
        if (champion) {
            bracket.round6[0].winner = findTeam(champion);
            bracket.winner = findTeam(champion);
        }
        
        return bracket;
    }
    
    function extractRegionWinners(sheet, bracket, region, startIndex, config) {
        const { r1Rows, r2Rows, s16Rows, e8Rows, f4Row, r1Col, r2Col, s16Col, e8Col, f4Col } = config;
        
        // Round 1 winners (from Round 2 cells)
        for (let i = 0; i < 8; i++) {
            const row = r2Rows[i];
            const winner = getCellValue(sheet, r2Col, row);
            if (winner) {
                bracket.round1[startIndex + i].winner = findTeam(winner);
            }
        }
        
        // Round 2 winners (from Sweet 16 cells)
        for (let i = 0; i < 4; i++) {
            const row = s16Rows[i];
            const winner = getCellValue(sheet, s16Col, row);
            if (winner) {
                const r2Index = Math.floor(startIndex / 2) + i;
                bracket.round2[r2Index].winner = findTeam(winner);
            }
        }
        
        // Sweet 16 winners (from Elite 8 cells)
        for (let i = 0; i < 2; i++) {
            const row = e8Rows[i];
            const winner = getCellValue(sheet, e8Col, row);
            if (winner) {
                const s16Index = Math.floor(startIndex / 4) + i;
                bracket.round3[s16Index].winner = findTeam(winner);
            }
        }
        
        // Elite 8 winner (from Final Four cell)
        const f4Winner = getCellValue(sheet, f4Col, f4Row);
        if (f4Winner) {
            const e8Index = Math.floor(startIndex / 8);
            bracket.round4[e8Index].winner = findTeam(f4Winner);
        }
    }
    
    function getCellValue(sheet, col, row) {
        const cell = sheet.getCell(`${col}${row}`);
        let value = cell.value;
        
        // Handle formula results
        if (value && typeof value === 'object' && value.result) {
            value = value.result;
        }
        
        if (typeof value === 'string') {
            return value.trim();
        }
        return value;
    }
    
    function findTeam(name) {
        if (!name) return null;
        const teamName = String(name).trim();
        if (teams[teamName]) {
            return teams[teamName];
        }
        // Try partial match
        for (const [key, team] of Object.entries(teams)) {
            if (key.toLowerCase().includes(teamName.toLowerCase()) || 
                teamName.toLowerCase().includes(key.toLowerCase())) {
                return team;
            }
        }
        return { name: teamName, seed: 0 };
    }
    
    function calculatePicksPerRound(results, participant) {
        // Returns array of correct picks per round [r1, r2, r3, r4, r5, r6]
        const picks = [0, 0, 0, 0, 0, 0];
        
        for (let round = 1; round <= 6; round++) {
            const roundKey = `round${round}`;
            const resultsGames = results[roundKey] || [];
            const participantGames = participant[roundKey] || [];
            
            for (let i = 0; i < resultsGames.length; i++) {
                const resultGame = resultsGames[i];
                const participantGame = participantGames[i];
                
                if (resultGame?.winner && participantGame?.winner) {
                    const resultWinner = resultGame.winner.name || resultGame.winner;
                    const participantWinner = participantGame.winner.name || participantGame.winner;
                    
                    if (resultWinner === participantWinner) {
                        picks[round - 1]++;
                    }
                }
            }
        }
        
        return picks;
    }
    
    function formatPicksPerRound(picksPerRound) {
        if (!picksPerRound) return '';
        const total = picksPerRound.reduce((sum, p) => sum + p, 0);
        return `${total} [${picksPerRound.join(',')}]`;
    }
    
    function calculateStandings() {
        standings = [];
        
        for (const [name, bracket] of Object.entries(participantBrackets)) {
            const scoreResult = computeScore(resultsBracket, bracket, teams, {
                applySeedBonus: true
            });
            
            // computePossibleRemaining now returns { basePoints, bonusPoints, total }
            const possibleRemainingResult = computePossibleRemaining(resultsBracket, bracket, teams);
            
            // Calculate correct picks per round
            const picksPerRound = calculatePicksPerRound(resultsBracket, bracket);
            
            standings.push({
                name,
                score: scoreResult.totalScore,
                correctPicks: scoreResult.correctPicks,
                seedBonus: scoreResult.seedBonus,
                possibleRemaining: possibleRemainingResult.total,
                possibleBase: possibleRemainingResult.basePoints,
                possibleBonus: possibleRemainingResult.bonusPoints,
                winProbability: winProbabilities[name] ?? null,
                loseProbability: loseProbabilities[name] ?? null,
                averagePlace: averagePlaces[name] ?? null,
                roundBreakdown: scoreResult.roundBreakdown,
                picksPerRound
            });
        }
        
        // Sort by score descending
        standings.sort((a, b) => b.score - a.score);
        
        // Add rank
        standings.forEach((entry, index) => {
            entry.rank = index + 1;
        });
    }
    
    function findUpcomingGames() {
        upcomingGames = [];
        
        for (let round = 1; round <= 6; round++) {
            const roundKey = `round${round}`;
            const games = resultsBracket[roundKey];
            
            if (!games) continue;
            
            games.forEach((game, index) => {
                // Skip if game already has a winner
                if (!game || game.winner) return;
                
                // Check if this game is "next" (parents decided or no parents for Round 1)
                const isNext = !game.parentGames || 
                    game.parentGames.every(parent => parent && parent.winner);
                
                if (isNext && game.team1 && game.team2) {
                    upcomingGames.push({
                        round,
                        index,
                        game,
                        team1: game.team1,
                        team2: game.team2
                    });
                    if (round > currentRound) currentRound = round;
                }
            });
        }
    }
    
    function calculateStakes() {
        stakeData = {};
        
        for (const gameInfo of upcomingGames) {
            const gameKey = `r${gameInfo.round}-${gameInfo.index}`;
            stakeData[gameKey] = {};
            
            for (const [name, bracket] of Object.entries(participantBrackets)) {
                const stake = computeStakeInGame(
                    resultsBracket, 
                    bracket, 
                    gameInfo.round, 
                    gameInfo.index
                );
                stakeData[gameKey][name] = stake;
            }
        }
    }
    
    function selectTab(tab) {
        activeTab = tab;
    }
    
    function selectParticipant(name) {
        selectedParticipant = name;
        selectedScenario = null;  // Reset scenario when changing participant
        activeTab = 'brackets';
    }
    
    // Reset scenario when participant changes via dropdown
    $: if (selectedParticipant) {
        // Only reset if the new participant doesn't have the selected scenario
        // 'optimal' is always valid, so don't reset for that
        if (selectedScenario !== null && selectedScenario !== 'optimal') {
            if (typeof selectedScenario === 'string') {
                if (selectedScenario.startsWith('winning-')) {
                    const index = parseInt(selectedScenario.replace('winning-', ''), 10);
                    const scenarios = winningScenarios[selectedParticipant] || [];
                    if (index >= scenarios.length) {
                        selectedScenario = null;
                    }
                } else if (selectedScenario.startsWith('losing-')) {
                    const index = parseInt(selectedScenario.replace('losing-', ''), 10);
                    const scenarios = losingScenarios[selectedParticipant] || [];
                    if (index >= scenarios.length) {
                        selectedScenario = null;
                    }
                }
            } else if (typeof selectedScenario === 'number') {
                // Legacy numeric format
                const scenarios = winningScenarios[selectedParticipant] || [];
                if (selectedScenario >= scenarios.length) {
                    selectedScenario = null;
                }
            }
        }
    }
    
    /**
     * Get the championship winner from a scenario
     */
    function getScenarioChampion(scenario) {
        if (!scenario || !scenario.games) return 'Unknown';
        // Find the round 6 (championship) game
        const finalGame = scenario.games.find(g => g.round === 6);
        return finalGame ? finalGame.winner : 'Unknown';
    }
    
    /**
     * Convert an optimal bracket to the scenario format
     * Scenario format: { games: [{ round, gameIndex, winner }, ...], probability: number }
     */
    function optimalBracketToScenario(optimalBracket) {
        if (!optimalBracket) return null;
        
        // New format: optimal bracket already has games array, probability, outcome, etc.
        if (optimalBracket.games && Array.isArray(optimalBracket.games)) {
            return {
                games: optimalBracket.games,
                probability: optimalBracket.probability || 1,
                outcome: optimalBracket.outcome
            };
        }
        
        // Legacy format: optimal bracket has round1, round2, etc. keys
        const games = [];
        
        for (let round = 1; round <= 6; round++) {
            const roundKey = `round${round}`;
            const roundGames = optimalBracket[roundKey] || [];
            
            for (let gameIndex = 0; gameIndex < roundGames.length; gameIndex++) {
                const game = roundGames[gameIndex];
                if (game && game.winner) {
                    games.push({
                        round,
                        gameIndex,
                        winner: game.winner.name
                    });
                }
                // If no winner, we don't add it - this will be treated as "either" or TBD
            }
        }
        
        return {
            games,
            probability: 1  // Not a real probability, just for display
        };
    }
    
    /**
     * Get the currently selected scenario object
     * Converts optimal bracket to scenario format if 'optimal' is selected
     * Handles 'winning-N' and 'losing-N' format for scenarios
     */
    $: currentScenario = (() => {
        if (!selectedParticipant) return null;
        if (selectedScenario === null) return null;
        
        if (selectedScenario === 'optimal') {
            return optimalBracketToScenario(optimalBrackets[selectedParticipant]);
        }
        
        // Handle 'winning-N' format
        if (typeof selectedScenario === 'string' && selectedScenario.startsWith('winning-')) {
            const index = parseInt(selectedScenario.replace('winning-', ''), 10);
            if (winningScenarios[selectedParticipant] && winningScenarios[selectedParticipant][index]) {
                return winningScenarios[selectedParticipant][index];
            }
        }
        
        // Handle 'losing-N' format
        if (typeof selectedScenario === 'string' && selectedScenario.startsWith('losing-')) {
            const index = parseInt(selectedScenario.replace('losing-', ''), 10);
            if (losingScenarios[selectedParticipant] && losingScenarios[selectedParticipant][index]) {
                return losingScenarios[selectedParticipant][index];
            }
        }
        
        // Legacy: handle numeric index (for backwards compatibility)
        if (typeof selectedScenario === 'number' && winningScenarios[selectedParticipant]) {
            return winningScenarios[selectedParticipant][selectedScenario];
        }
        
        return null;
    })();
    
    /**
     * Check if current scenario is a losing scenario (for styling)
     */
    $: isLosingScenario = typeof selectedScenario === 'string' && selectedScenario.startsWith('losing-');
    
    /**
     * Format a probability for display.
     * - 2 decimal places for normal values
     * - Scientific notation for values < 0.01%
     * - Returns "-" for null/undefined
     */
    function formatProbability(prob) {
        if (prob === null || prob === undefined) return '-';
        const pct = prob * 100;
        if (pct < 0.01 && pct > 0) {
            // Use scientific notation for very small probabilities
            return pct.toExponential(1) + '%';
        }
        return pct.toFixed(2) + '%';
    }
    
    function handleNextGameClick(event) {
        const { gameKey } = event.detail;
        activeTab = 'stakes';
        
        // Scroll to the specific game after a short delay for DOM update
        setTimeout(() => {
            const gameElement = document.getElementById(`stake-game-${gameKey}`);
            if (gameElement) {
                gameElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                gameElement.classList.add('highlighted');
                setTimeout(() => gameElement.classList.remove('highlighted'), 2000);
            }
        }, 100);
    }
    
    function getWinnerDisplay(game) {
        if (!game) return '';
        if (!game.winner) return 'TBD';
        return game.winner.name;
    }
    
    function getRoundName(round) {
        const names = ['', 'Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
        return names[round] || `Round ${round}`;
    }
    
    /**
     * Get the winning outcome preference for a participant in a specific game
     * Returns { team1: percent, team2: percent } or null if no winning scenarios
     */
    function getPreference(gameKey, participantName) {
        const gamePrefs = nextGamePreferences[gameKey];
        if (!gamePrefs || !gamePrefs.preferences) return null;
        return gamePrefs.preferences[participantName] || null;
    }
    
    /**
     * Format preference as tuple string (Team1: X%, Team2: Y%)
     */
    function formatPreferenceTuple(pref, team1Name, team2Name) {
        if (!pref) return 'N/A';
        const t1Pct = (pref.team1 * 100).toFixed(0);
        const t2Pct = (pref.team2 * 100).toFixed(0);
        return `${team1Name}: ${t1Pct}%, ${team2Name}: ${t2Pct}%`;
    }
</script>

<div class="results-container">
    {#if loading}
        <div class="loading">Loading bracket results...</div>
    {:else if error}
        <div class="error">
            <h3>Error loading results</h3>
            <p>{error}</p>
        </div>
    {:else}
        <!-- Tab Navigation -->
        <div class="tabs">
            <button 
                class="tab" 
                class:active={activeTab === 'standings'}
                on:click={() => selectTab('standings')}
            >
                📊 Standings
            </button>
            <button 
                class="tab" 
                class:active={activeTab === 'brackets'}
                on:click={() => selectTab('brackets')}
            >
                🏀 Brackets
            </button>
            <button 
                class="tab" 
                class:active={activeTab === 'stakes'}
                on:click={() => selectTab('stakes')}
            >
                🎯 Stakes
            </button>
        </div>
        
        <!-- Tab Content -->
        <div class="tab-content">
            {#if activeTab === 'standings'}
                <div class="standings-view">
                    <h2>Current Standings</h2>
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Name</th>
                                <th>Score</th>
                                <th>Correct Picks</th>
                                <th>Underdog</th>
                                <th>Possible</th>
                                <th>Win %</th>
                                <th>Lose %</th>
                                <th>Avg Place</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each standings as entry}
                                <tr class:highlight={selectedParticipant === entry.name}>
                                    <td class="rank">
                                        {#if entry.rank === 1}🥇
                                        {:else if entry.rank === 2}🥈
                                        {:else if entry.rank === 3}🥉
                                        {:else}{entry.rank}
                                        {/if}
                                    </td>
                                    <td class="name">
                                        <button class="name-btn" on:click={() => selectParticipant(entry.name)}>
                                            {entry.name}
                                        </button>
                                    </td>
                                    <td class="score">{entry.score}</td>
                                    <td class="correct picks-breakdown">{formatPicksPerRound(entry.picksPerRound)}</td>
                                    <td class="underdog">{entry.seedBonus}</td>
                                    <td class="possible">
                                        +{entry.possibleRemaining}
                                        {#if entry.possibleBonus > 0}
                                            <span class="possible-breakdown">({entry.possibleBase}+{entry.possibleBonus})</span>
                                        {/if}
                                    </td>
                                    <td class="win-prob">
                                        {formatProbability(entry.winProbability)}
                                    </td>
                                    <td class="lose-prob">
                                        {formatProbability(entry.loseProbability)}
                                    </td>
                                    <td class="avg-place">
                                        {#if entry.averagePlace !== null}
                                            {entry.averagePlace.toFixed(2)}
                                        {:else}
                                            -
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                    
                    {#if standings.length === 0}
                        <p class="no-data">No brackets loaded yet. Add participant bracket files to see standings.</p>
                    {/if}
                    
                    <!-- Results Bracket Display -->
                    {#if resultsBracket}
                        <div class="results-bracket-section">
                            <h2>Tournament Results</h2>
                            <BracketView 
                                bracketPath={`${RESULTS_FILE}.json`}
                            />
                        </div>
                    {/if}
                </div>
                
            {:else if activeTab === 'brackets'}
                <div class="brackets-view">
                    <h2>Individual Brackets</h2>
                    
                    <div class="participant-selector">
                        <label for="participant-select">Select Participant:</label>
                        <select id="participant-select" bind:value={selectedParticipant} on:change={() => selectedScenario = null}>
                            <option value={null}>-- Choose --</option>
                            {#each Object.keys(participantBrackets) as name}
                                <option value={name}>{name}</option>
                            {/each}
                        </select>
                        
                        {#if selectedParticipant}
                            <label for="scenario-select">Scenario:</label>
                            <select id="scenario-select" bind:value={selectedScenario} class:losing-selected={typeof selectedScenario === 'string' && selectedScenario.startsWith('losing-')}>
                                <option value={null}>-- None --</option>
                                <option value="optimal">⭐ Optimal Bracket (Max Possible Score)</option>
                                {#if winningScenarios[selectedParticipant]?.length > 0}
                                    <optgroup label="🏆 Winning Scenarios">
                                        {#each winningScenarios[selectedParticipant] as scenario, i}
                                            <option value={`winning-${i}`} class="winning-option">Win {i + 1} - {getScenarioChampion(scenario)} wins ({formatProbability(scenario.probability)})</option>
                                        {/each}
                                    </optgroup>
                                {:else}
                                    <option disabled>-- No winning scenarios --</option>
                                {/if}
                                {#if losingScenarios[selectedParticipant]?.length > 0}
                                    <optgroup label="💀 Losing Scenarios">
                                        {#each losingScenarios[selectedParticipant] as scenario, i}
                                            <option value={`losing-${i}`} class="losing-option">Lose {i + 1} - {getScenarioChampion(scenario)} wins ({formatProbability(scenario.probability)})</option>
                                        {/each}
                                    </optgroup>
                                {/if}
                            </select>
                        {/if}
                    </div>
                    
                    <div class="bracket-legend">
                        <div class="legend-section">
                            <span class="legend-title">Decided Games:</span>
                            <div class="scenario-legend-item">
                                <div class="legend-color correct"></div>
                                <span>Correctly picked</span>
                            </div>
                            <div class="scenario-legend-item">
                                <div class="legend-color incorrect"></div>
                                <span>Incorrectly picked</span>
                            </div>
                        </div>
                        {#if currentScenario}
                            <div class="legend-section">
                                <span class="legend-title">{selectedScenario === 'optimal' ? 'Optimal Bracket:' : (typeof selectedScenario === 'string' && selectedScenario.startsWith('losing-') ? 'Losing Scenario:' : 'Winning Scenario:')}</span>
                                <div class="scenario-legend-item">
                                    <div class="legend-color match"></div>
                                    <span>Winner - bracket's pick matches</span>
                                </div>
                                <div class="scenario-legend-item">
                                    <div class="legend-color mismatch"></div>
                                    <span>Winner - differs from bracket (bracket's pick)</span>
                                </div>
                                <div class="scenario-legend-item">
                                    <div class="legend-color either"></div>
                                    <span>{selectedScenario === 'optimal' ? 'TBD - not yet determined' : 'Either team can win'}</span>
                                </div>
                            </div>
                        {/if}
                    </div>
                    
                    {#key `${selectedParticipant}-${selectedScenario}`}
                    {#if selectedParticipant && participantBrackets[selectedParticipant]}
                        <BracketView 
                            bracketPath={`${BRACKETS_PATH}/${selectedParticipant}-bracket-march-madness-${YEAR}.json`}
                            resultsPath={RESULTS_FILE}
                            {stakeData}
                            scenario={currentScenario}
                            on:nextGameClick={handleNextGameClick}
                        />
                    {:else}
                        <p class="no-selection">Select a participant to view their bracket.</p>
                    {/if}
                    {/key}
                </div>
                
            {:else if activeTab === 'stakes'}
                <div class="stakes-view">
                    <h2>Stakes in Upcoming Games</h2>
                    
                    {#if upcomingGames.length === 0}
                        <p class="no-data">No upcoming games found. The tournament may be complete or results haven't been entered.</p>
                    {:else}
                        {#each upcomingGames as gameInfo}
                            {@const gameKey = `r${gameInfo.round}-${gameInfo.index}`}
                            <div class="stake-game" id="stake-game-{gameKey}">
                                <h3>{getRoundName(gameInfo.round)}: {gameInfo.team1.name} vs {gameInfo.team2.name}</h3>
                                
                                <div class="stake-columns">
                                    <div class="stake-column">
                                        <h4>{gameInfo.team1.name} ({gameInfo.team1.seed})</h4>
                                        <ul class="stake-list">
                                            {#each Object.entries(stakeData[gameKey] || {}) as [name, stake]}
                                                {#if stake && stake.team1 > 0}
                                                    {@const pref = getPreference(gameKey, name)}
                                                    <li>
                                                        <span class="stake-name">{name}</span>
                                                        <span class="stake-points">+{stake.team1}</span>
                                                        <span class="stake-pref">({formatPreferenceTuple(pref, gameInfo.team1.name, gameInfo.team2.name)})</span>
                                                    </li>
                                                {/if}
                                            {/each}
                                        </ul>
                                    </div>
                                    
                                    <div class="stake-column">
                                        <h4>{gameInfo.team2.name} ({gameInfo.team2.seed})</h4>
                                        <ul class="stake-list">
                                            {#each Object.entries(stakeData[gameKey] || {}) as [name, stake]}
                                                {#if stake && stake.team2 > 0}
                                                    {@const pref = getPreference(gameKey, name)}
                                                    <li>
                                                        <span class="stake-name">{name}</span>
                                                        <span class="stake-points">+{stake.team2}</span>
                                                        <span class="stake-pref">({formatPreferenceTuple(pref, gameInfo.team1.name, gameInfo.team2.name)})</span>
                                                    </li>
                                                {/if}
                                            {/each}
                                        </ul>
                                    </div>
                                    
                                    <div class="stake-column no-stake">
                                        <h4>No Stake</h4>
                                        <ul class="stake-list">
                                            {#each Object.entries(stakeData[gameKey] || {}) as [name, stake]}
                                                {#if !stake || (!stake.team1 && !stake.team2)}
                                                    {@const pref = getPreference(gameKey, name)}
                                                    <li>
                                                        <span class="stake-name">{name}</span>
                                                        <span class="stake-pref">({formatPreferenceTuple(pref, gameInfo.team1.name, gameInfo.team2.name)})</span>
                                                    </li>
                                                {/if}
                                            {/each}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .results-container {
        padding: 1rem;
    }
    
    .loading, .error {
        text-align: center;
        padding: 2rem;
    }
    
    .error {
        background: #fee;
        border: 1px solid #fcc;
        border-radius: 8px;
        color: #c00;
    }
    
    /* Tabs */
    .tabs {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        border-bottom: 2px solid #e5e7eb;
        padding-bottom: 0.5rem;
    }
    
    .tab {
        padding: 0.75rem 1.5rem;
        background: #f3f4f6;
        border: none;
        border-radius: 8px 8px 0 0;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .tab:hover {
        background: #e5e7eb;
    }
    
    .tab.active {
        background: #0066cc;
        color: white;
    }
    
    /* Standings */
    .standings-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
    }
    
    .standings-table th,
    .standings-table td {
        padding: 0.75rem 1rem;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .standings-table th {
        background: #f3f4f6;
        font-weight: 600;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .standings-table tr:hover {
        background: #f9fafb;
    }
    
    .standings-table tr.highlight {
        background: #dbeafe;
    }
    
    .rank {
        font-size: 1.25rem;
        text-align: center;
    }
    
    .name-btn {
        background: none;
        border: none;
        color: #0066cc;
        cursor: pointer;
        font-size: inherit;
        padding: 0;
    }
    
    .name-btn:hover {
        text-decoration: underline;
    }
    
    .score {
        font-weight: 700;
        font-size: 1.1rem;
    }
    
    .picks-breakdown {
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 0.85rem;
        white-space: nowrap;
    }
    
    .possible {
        color: #059669;
    }
    
    .possible-breakdown {
        font-size: 0.75rem;
        color: #6b7280;
        margin-left: 0.25rem;
    }
    
    .max {
        color: #6b7280;
    }
    
    /* Results Bracket Section */
    .results-bracket-section {
        margin-top: 3rem;
        padding-top: 2rem;
        border-top: 2px solid #e5e7eb;
    }
    
    .results-bracket-section h2 {
        margin-bottom: 1.5rem;
        color: #1f2937;
    }
    
    /* Brackets View */
    .participant-selector {
        margin-bottom: 1.5rem;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1rem;
    }
    
    .participant-selector label {
        font-weight: 500;
        color: #374151;
    }
    
    .participant-selector select {
        padding: 0.5rem 1rem;
        font-size: 1rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
    }
    
    .participant-selector select:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    .participant-selector select.no-scenarios {
        background-color: #f3f4f6;
        color: #9ca3af;
        cursor: not-allowed;
        font-style: italic;
    }
    
    .participant-selector select:disabled {
        opacity: 0.7;
    }
    
    /* Bracket legend */
    .bracket-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
        margin-bottom: 1rem;
        padding: 0.75rem;
        background: #f9fafb;
        border-radius: 6px;
        font-size: 0.875rem;
    }
    
    .legend-section {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
    }
    
    .legend-title {
        font-weight: 600;
        color: #374151;
    }
    
    .scenario-legend-item {
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }
    
    .legend-color {
        width: 1rem;
        height: 1rem;
        border-radius: 3px;
    }
    
    .legend-color.correct { background: #059669; }
    .legend-color.incorrect { background: #dc2626; }
    .legend-color.match { background: #80276C; }
    .legend-color.mismatch { background: #f97316; }
    .legend-color.either { background: #0891b2; }
    .legend-color.tbd { background: #9ca3af; }
    
    .round-section {
        margin-bottom: 1.5rem;
    }
    
    .round-section h4 {
        margin-bottom: 0.75rem;
        color: #374151;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 0.5rem;
    }
    
    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 1rem;
    }
    
    .game-card {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 0.75rem;
    }
    
    .game-card.correct {
        background: #d1fae5;
        border-color: #059669;
    }
    
    .game-card.incorrect {
        background: #fee2e2;
        border-color: #dc2626;
    }
    
    .game-teams {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.9rem;
    }
    
    .team.picked {
        font-weight: 600;
        color: #0066cc;
    }
    
    .vs {
        font-size: 0.75rem;
        color: #9ca3af;
        text-align: center;
    }
    
    .game-pick {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #e5e7eb;
        font-size: 0.85rem;
    }
    
    .champion-pick {
        text-align: center;
        margin-top: 2rem;
        padding: 1.5rem;
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        border-radius: 12px;
        color: white;
    }
    
    .champion-pick h4 {
        margin-bottom: 0.5rem;
    }
    
    .champion-name {
        font-size: 1.5rem;
        font-weight: 700;
    }
    
    .no-selection, .no-data {
        text-align: center;
        color: #6b7280;
        padding: 2rem;
        font-style: italic;
    }
    
    /* Stakes View */
    .stake-game {
        background: #f9fafb;
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        transition: box-shadow 0.3s, border-color 0.3s;
        border: 2px solid transparent;
    }
    
    .stake-game.highlighted {
        border-color: #f59e0b;
        box-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
    }
    
    .stake-game h3 {
        margin-bottom: 1rem;
        color: #1f2937;
    }
    
    .stake-columns {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
    }
    
    .stake-column {
        background: white;
        border-radius: 8px;
        padding: 1rem;
    }
    
    .stake-column h4 {
        font-size: 0.9rem;
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #0066cc;
    }
    
    .stake-column.no-stake h4 {
        border-bottom-color: #9ca3af;
    }
    
    .stake-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    
    .stake-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.25rem 0;
        font-size: 0.9rem;
        gap: 0.5rem;
    }
    
    .stake-name {
        flex: 1;
    }
    
    .stake-points {
        font-weight: 600;
        color: #059669;
    }
    
    .stake-pref {
        font-size: 0.8rem;
        color: #6b7280;
        font-style: italic;
    }
    
    h2 {
        margin-bottom: 1rem;
        color: #1f2937;
    }
    
    @media (max-width: 768px) {
        .stake-columns {
            grid-template-columns: 1fr;
        }
        
        .games-grid {
            grid-template-columns: 1fr;
        }
        
        .tabs {
            flex-wrap: wrap;
        }
        
        .tab {
            flex: 1;
            text-align: center;
        }
    }
    
    /* Losing scenario styles */
    .losing-selected {
        background-color: #fef2f2 !important;
        border-color: #ef4444 !important;
    }
    
    select option.losing-option {
        background-color: #fef2f2;
        color: #991b1b;
    }
    
    select option.winning-option {
        background-color: #f0fdf4;
        color: #166534;
    }
    
    /* Lose probability column styling */
    .standings-table .lose-prob {
        color: #991b1b;
        font-weight: 500;
    }
    
    /* Average place column styling */
    .standings-table .avg-place {
        color: #6b7280;
        font-weight: 500;
    }
    
    /* Win probability column styling (keep green) */
    .standings-table .win-prob {
        color: #166534;
        font-weight: 500;
    }
</style>