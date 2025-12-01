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
    } from './bracketStructure.js';
    
    // Configuration
    const YEAR = '2026';
    const BRACKETS_PATH = `/marchMadness/${YEAR}/brackets`;
    const TEAMS_FILE = `/marchMadness/${YEAR}/ThisYearTeams${YEAR}.csv`;
    const RESULTS_FILE = `/marchMadness/${YEAR}/results-bracket-march-madness-${YEAR}`;
    
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
    let currentRound = 1;  // Current round for stake calculations
    let upcomingGames = [];  // Games that haven't been decided yet
    let stakeData = {};  // Stake in each upcoming game per participant
    
    onMount(async () => {
        try {
            await loadTeams();
            await loadResults();
            await loadParticipants();
            await loadAllBrackets();
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
        // Try to load results from CSV or Excel
        // For now, initialize empty and let it be populated
        resultsBracket = initializeBracketWithTeams(teamsList);
        
        // Try to load actual results
        try {
            const csvResponse = await fetch(`${RESULTS_FILE}.csv`);
            if (csvResponse.ok) {
                const csvText = await csvResponse.text();
                parseResultsCSV(csvText);
            }
        } catch (e) {
            console.log('No results file found, using empty bracket');
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
        // Try CSV first, then Excel
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
    
    function calculateStandings() {
        standings = [];
        
        for (const [name, bracket] of Object.entries(participantBrackets)) {
            const scoreResult = computeScore(resultsBracket, bracket, teams, {
                applySeedBonus: true
            });
            
            const possibleRemaining = computePossibleRemaining(resultsBracket, bracket, teams);
            
            standings.push({
                name,
                score: scoreResult.totalScore,
                correctPicks: scoreResult.correctPicks,
                possibleRemaining,
                maxPossible: scoreResult.totalScore + possibleRemaining,
                roundBreakdown: scoreResult.roundBreakdown
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
                if (game && game.team1 && game.team2 && !game.winner) {
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
        selectedParticipant = selectedParticipant === name ? null : name;
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
                                <th>Correct</th>
                                <th>Possible</th>
                                <th>Max</th>
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
                                    <td class="correct">{entry.correctPicks}</td>
                                    <td class="possible">+{entry.possibleRemaining}</td>
                                    <td class="max">{entry.maxPossible}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                    
                    {#if standings.length === 0}
                        <p class="no-data">No brackets loaded yet. Add participant bracket files to see standings.</p>
                    {/if}
                </div>
                
            {:else if activeTab === 'brackets'}
                <div class="brackets-view">
                    <h2>Individual Brackets</h2>
                    
                    <div class="participant-selector">
                        <label for="participant-select">Select Participant:</label>
                        <select id="participant-select" bind:value={selectedParticipant}>
                            <option value={null}>-- Choose --</option>
                            {#each Object.keys(participantBrackets) as name}
                                <option value={name}>{name}</option>
                            {/each}
                        </select>
                    </div>
                    
                    {#if selectedParticipant && participantBrackets[selectedParticipant]}
                        <div class="bracket-display">
                            <h3>{selectedParticipant}'s Bracket</h3>
                            
                            {#each [1, 2, 3, 4, 5, 6] as round}
                                <div class="round-section">
                                    <h4>{getRoundName(round)}</h4>
                                    <div class="games-grid">
                                        {#each participantBrackets[selectedParticipant][`round${round}`] as game, i}
                                            {#if game}
                                                <div class="game-card" class:correct={resultsBracket[`round${round}`][i]?.winner?.name === game.winner?.name} class:incorrect={resultsBracket[`round${round}`][i]?.winner && game.winner && resultsBracket[`round${round}`][i]?.winner?.name !== game.winner?.name}>
                                                    <div class="game-teams">
                                                        <span class="team" class:picked={game.winner?.name === game.team1?.name}>
                                                            {game.team1?.seed || '?'} {game.team1?.name || 'TBD'}
                                                        </span>
                                                        <span class="vs">vs</span>
                                                        <span class="team" class:picked={game.winner?.name === game.team2?.name}>
                                                            {game.team2?.seed || '?'} {game.team2?.name || 'TBD'}
                                                        </span>
                                                    </div>
                                                    <div class="game-pick">
                                                        Pick: <strong>{game.winner?.name || 'None'}</strong>
                                                    </div>
                                                </div>
                                            {/if}
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                            
                            {#if participantBrackets[selectedParticipant].winner}
                                <div class="champion-pick">
                                    <h4>🏆 Champion Pick</h4>
                                    <div class="champion-name">
                                        {participantBrackets[selectedParticipant].winner.name}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <p class="no-selection">Select a participant to view their bracket.</p>
                    {/if}
                </div>
                
            {:else if activeTab === 'stakes'}
                <div class="stakes-view">
                    <h2>Stakes in Upcoming Games</h2>
                    
                    {#if upcomingGames.length === 0}
                        <p class="no-data">No upcoming games found. The tournament may be complete or results haven't been entered.</p>
                    {:else}
                        {#each upcomingGames as gameInfo}
                            <div class="stake-game">
                                <h3>{getRoundName(gameInfo.round)}: {gameInfo.team1.name} vs {gameInfo.team2.name}</h3>
                                
                                <div class="stake-columns">
                                    <div class="stake-column">
                                        <h4>{gameInfo.team1.name} ({gameInfo.team1.seed})</h4>
                                        <ul class="stake-list">
                                            {#each Object.entries(stakeData[`r${gameInfo.round}-${gameInfo.index}`] || {}) as [name, stake]}
                                                {#if stake && stake.team1 > 0}
                                                    <li>
                                                        <span class="stake-name">{name}</span>
                                                        <span class="stake-points">+{stake.team1}</span>
                                                    </li>
                                                {/if}
                                            {/each}
                                        </ul>
                                    </div>
                                    
                                    <div class="stake-column">
                                        <h4>{gameInfo.team2.name} ({gameInfo.team2.seed})</h4>
                                        <ul class="stake-list">
                                            {#each Object.entries(stakeData[`r${gameInfo.round}-${gameInfo.index}`] || {}) as [name, stake]}
                                                {#if stake && stake.team2 > 0}
                                                    <li>
                                                        <span class="stake-name">{name}</span>
                                                        <span class="stake-points">+{stake.team2}</span>
                                                    </li>
                                                {/if}
                                            {/each}
                                        </ul>
                                    </div>
                                    
                                    <div class="stake-column no-stake">
                                        <h4>No Stake</h4>
                                        <ul class="stake-list">
                                            {#each Object.entries(stakeData[`r${gameInfo.round}-${gameInfo.index}`] || {}) as [name, stake]}
                                                {#if !stake || (!stake.team1 && !stake.team2)}
                                                    <li>
                                                        <span class="stake-name">{name}</span>
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
    
    .possible {
        color: #059669;
    }
    
    .max {
        color: #6b7280;
    }
    
    /* Brackets View */
    .participant-selector {
        margin-bottom: 1.5rem;
    }
    
    .participant-selector select {
        padding: 0.5rem 1rem;
        font-size: 1rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        margin-left: 0.5rem;
    }
    
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
        padding: 0.25rem 0;
        font-size: 0.9rem;
    }
    
    .stake-points {
        font-weight: 600;
        color: #059669;
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
</style>