<script>
    import { onMount } from 'svelte';
    import { 
        loadScoringConfig,
        createEmptyBracket,
        initializeBracketWithTeams,
        regionPositions
    } from './BracketStructure.js';
    import BracketDisplay from './BracketDisplay.svelte';
    import MarchMadnessRules from './MarchMadnessRules.svelte';
    
    // Configuration
    const YEAR = '2026';
    const TEAMS_FILE = `/marchMadness/${YEAR}/ThisYearTeams${YEAR}.csv`;
    const SCORING_CONFIG_FILE = `/marchMadness/${YEAR}/scoring-config.json`;
    
    // State
    let loading = true;
    let error = null;
    let teams = [];
    let bracket = null;
    
    onMount(async () => {
        try {
            await loadScoringConfig(SCORING_CONFIG_FILE);
            await loadTeams();
            initializeBracket();
            loading = false;
        } catch (err) {
            error = err.message;
            console.error('Error loading data:', err);
            loading = false;
        }
    });
    
    async function loadTeams() {
        const response = await fetch(TEAMS_FILE);
        if (!response.ok) {
            throw new Error(`Failed to load teams CSV: ${response.status}`);
        }
        
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        // Skip header row
        const dataLines = lines.slice(1);
        
        teams = dataLines.map(line => {
            const [team, seed, region] = line.split(',').map(s => s.trim());
            return {
                name: team,
                seed: parseInt(seed),
                region: region
            };
        });
        
        console.log('Loaded teams:', teams);
    }
    
    function initializeBracket() {
        bracket = initializeBracketWithTeams(teams);
    }
    
    /**
     * Handle winner selection from BracketDisplay
     */
    function handleSelectWinner(event) {
        const { round, gameIndex, team } = event.detail;
        selectWinner(round, gameIndex, team);
    }
    
    /**
     * Select a winner and propagate to next rounds
     */
    function selectWinner(round, gameIndex, team) {
        const game = bracket[`round${round}`][gameIndex];
        game.winner = team;
        
        // Advance winner to next round
        if (round < 6) {
            const nextRound = `round${round + 1}`;
            
            if (round === 4) {
                // Elite 8 to Final 4: Map regions to correct semifinal games
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
    }
    
    /**
     * Download bracket as JSON file
     */
    function downloadJSON() {
        const dataStr = JSON.stringify(bracket, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `bracket-march-madness-${YEAR}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * Download bracket as Excel file
     */
    async function downloadExcel() {
        const ExcelJS = await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm');
        
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('madness');
        
        // Header
        sheet.getCell('A1').value = `${YEAR} March Madness Bracket`;
        
        // Round headers
        sheet.getCell('B3').value = 'First Round';
        sheet.getCell('E3').value = 'Second Round';
        sheet.getCell('H3').value = 'Sweet 16';
        sheet.getCell('K3').value = 'Elite 8';
        sheet.getCell('N3').value = 'Final Four';
        sheet.getCell('R3').value = 'Championship';
        sheet.getCell('AA3').value = 'Final Four';
        sheet.getCell('AD3').value = 'Elite 8';
        sheet.getCell('AG3').value = 'Sweet 16';
        sheet.getCell('AJ3').value = 'Second Round';
        sheet.getCell('AL3').value = 'First Round';
        
        // Helper functions
        const getTeamName = (team) => team ? team.name : '';
        const getWinnerName = (game) => game && game.winner ? game.winner.name : '';
        
        // Region row mappings
        const topRows = [7, 11, 15, 19, 23, 27, 31, 35];
        const bottomRows = [42, 46, 50, 54, 58, 62, 66, 70];
        const r2TopRows = [8, 12, 16, 20, 24, 28, 32, 36];
        const r2BottomRows = [43, 47, 51, 55, 59, 63, 67, 71];
        const s16TopRows = [10, 18, 26, 34];
        const s16BottomRows = [45, 53, 61, 69];
        
        // === LEFT SIDE (East + West/Midwest) ===
        
        // East (games 0-7)
        bracket.round1.slice(0, 8).forEach((game, i) => {
            const row = topRows[i];
            sheet.getCell(`B${row}`).value = game.team1?.seed || '';
            sheet.getCell(`C${row}`).value = getTeamName(game.team1);
            sheet.getCell(`B${row + 2}`).value = game.team2?.seed || '';
            sheet.getCell(`C${row + 2}`).value = getTeamName(game.team2);
        });
        
        // East Round 2
        bracket.round2.slice(0, 4).forEach((game, i) => {
            sheet.getCell(`E${r2TopRows[i * 2]}`).value = getWinnerName(bracket.round1[i * 2]);
            sheet.getCell(`E${r2TopRows[i * 2 + 1]}`).value = getWinnerName(bracket.round1[i * 2 + 1]);
        });
        
        // East Sweet 16
        bracket.round3.slice(0, 2).forEach((game, i) => {
            sheet.getCell(`H${s16TopRows[i * 2]}`).value = getWinnerName(bracket.round2[i * 2]);
            sheet.getCell(`H${s16TopRows[i * 2 + 1]}`).value = getWinnerName(bracket.round2[i * 2 + 1]);
        });
        
        // East Elite 8
        sheet.getCell('K14').value = getWinnerName(bracket.round3[0]);
        sheet.getCell('K30').value = getWinnerName(bracket.round3[1]);
        sheet.getCell('K22').value = regionPositions.topLeft;
        
        // East Final Four
        sheet.getCell('N22').value = getWinnerName(bracket.round4[0]);
        
        // West/Midwest (games 8-15)
        bracket.round1.slice(8, 16).forEach((game, i) => {
            const row = bottomRows[i];
            sheet.getCell(`B${row}`).value = game.team1?.seed || '';
            sheet.getCell(`C${row}`).value = getTeamName(game.team1);
            sheet.getCell(`B${row + 2}`).value = game.team2?.seed || '';
            sheet.getCell(`C${row + 2}`).value = getTeamName(game.team2);
        });
        
        // West Round 2
        bracket.round2.slice(4, 8).forEach((game, i) => {
            sheet.getCell(`E${r2BottomRows[i * 2]}`).value = getWinnerName(bracket.round1[8 + i * 2]);
            sheet.getCell(`E${r2BottomRows[i * 2 + 1]}`).value = getWinnerName(bracket.round1[8 + i * 2 + 1]);
        });
        
        // West Sweet 16
        bracket.round3.slice(2, 4).forEach((game, i) => {
            sheet.getCell(`H${s16BottomRows[i * 2]}`).value = getWinnerName(bracket.round2[4 + i * 2]);
            sheet.getCell(`H${s16BottomRows[i * 2 + 1]}`).value = getWinnerName(bracket.round2[4 + i * 2 + 1]);
        });
        
        // West Elite 8
        sheet.getCell('K49').value = getWinnerName(bracket.round3[2]);
        sheet.getCell('K65').value = getWinnerName(bracket.round3[3]);
        sheet.getCell('K57').value = regionPositions.bottomLeft;
        
        // West Final Four
        sheet.getCell('N57').value = getWinnerName(bracket.round4[1]);
        
        // === RIGHT SIDE (South + Midwest/West) ===
        
        // South (games 16-23)
        bracket.round1.slice(16, 24).forEach((game, i) => {
            const row = topRows[i];
            sheet.getCell(`AL${row}`).value = getTeamName(game.team1);
            sheet.getCell(`AM${row}`).value = game.team1?.seed || '';
            sheet.getCell(`AL${row + 2}`).value = getTeamName(game.team2);
            sheet.getCell(`AM${row + 2}`).value = game.team2?.seed || '';
        });
        
        // South Round 2
        bracket.round2.slice(8, 12).forEach((game, i) => {
            sheet.getCell(`AJ${r2TopRows[i * 2]}`).value = getWinnerName(bracket.round1[16 + i * 2]);
            sheet.getCell(`AJ${r2TopRows[i * 2 + 1]}`).value = getWinnerName(bracket.round1[16 + i * 2 + 1]);
        });
        
        // South Sweet 16
        bracket.round3.slice(4, 6).forEach((game, i) => {
            sheet.getCell(`AG${s16TopRows[i * 2]}`).value = getWinnerName(bracket.round2[8 + i * 2]);
            sheet.getCell(`AG${s16TopRows[i * 2 + 1]}`).value = getWinnerName(bracket.round2[8 + i * 2 + 1]);
        });
        
        // South Elite 8
        sheet.getCell('AD14').value = getWinnerName(bracket.round3[4]);
        sheet.getCell('AD30').value = getWinnerName(bracket.round3[5]);
        sheet.getCell('AD22').value = regionPositions.topRight;
        
        // South Final Four
        sheet.getCell('AA22').value = getWinnerName(bracket.round4[2]);
        
        // Midwest/West (games 24-31)
        bracket.round1.slice(24, 32).forEach((game, i) => {
            const row = bottomRows[i];
            sheet.getCell(`AL${row}`).value = getTeamName(game.team1);
            sheet.getCell(`AM${row}`).value = game.team1?.seed || '';
            sheet.getCell(`AL${row + 2}`).value = getTeamName(game.team2);
            sheet.getCell(`AM${row + 2}`).value = game.team2?.seed || '';
        });
        
        // Midwest Round 2
        bracket.round2.slice(12, 16).forEach((game, i) => {
            sheet.getCell(`AJ${r2BottomRows[i * 2]}`).value = getWinnerName(bracket.round1[24 + i * 2]);
            sheet.getCell(`AJ${r2BottomRows[i * 2 + 1]}`).value = getWinnerName(bracket.round1[24 + i * 2 + 1]);
        });
        
        // Midwest Sweet 16
        bracket.round3.slice(6, 8).forEach((game, i) => {
            sheet.getCell(`AG${s16BottomRows[i * 2]}`).value = getWinnerName(bracket.round2[12 + i * 2]);
            sheet.getCell(`AG${s16BottomRows[i * 2 + 1]}`).value = getWinnerName(bracket.round2[12 + i * 2 + 1]);
        });
        
        // Midwest Elite 8
        sheet.getCell('AD49').value = getWinnerName(bracket.round3[6]);
        sheet.getCell('AD65').value = getWinnerName(bracket.round3[7]);
        sheet.getCell('AD57').value = regionPositions.bottomRight;
        
        // Midwest Final Four
        sheet.getCell('AA57').value = getWinnerName(bracket.round4[3]);
        
        // === CHAMPIONSHIP ===
        sheet.getCell('O39').value = getWinnerName(bracket.round5[0]);
        sheet.getCell('W39').value = getWinnerName(bracket.round5[1]);
        sheet.getCell('R44').value = bracket.winner ? bracket.winner.name : '';
        sheet.getCell('R46').value = 'National Champions';
        
        // Tiebreaker section
        sheet.getCell('S50').value = 'Tie-Breaker';
        sheet.getCell('R54').value = 'Total Points in Championship Game';
        
        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `march-madness-bracket-${YEAR}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
</script>

{#if loading}
    <div class="loading">Loading teams...</div>
{:else if error}
    <div class="error">
        <h3>Error loading data</h3>
        <p>{error}</p>
    </div>
{:else if bracket}
    <div class="bracket-create">
        <div class="controls">
            <button class="btn save-btn" on:click={downloadJSON}>💾 Save as JSON</button>
            <button class="btn excel-btn" on:click={downloadExcel}>📊 Save as Excel</button>
            <button class="btn reset-btn" on:click={resetBracket}>🔄 Reset Bracket</button>
        </div>
        
        <BracketDisplay 
            {bracket} 
            interactive={true}
            on:selectWinner={handleSelectWinner}
        />
        
        <div class="rules-section">
            <MarchMadnessRules configPath={SCORING_CONFIG_FILE} />
        </div>
    </div>
{/if}

<style>
    .loading {
        text-align: center;
        padding: 3rem;
        font-size: 1.25rem;
        color: #64748b;
    }
    
    .error {
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        padding: 2rem;
        color: #dc2626;
        text-align: center;
    }
    
    .error h3 {
        margin-top: 0;
    }
    
    .bracket-create {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    
    .controls {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
    }
    
    .btn {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .save-btn {
        background: #0066cc;
        color: white;
    }
    
    .save-btn:hover {
        background: #0052a3;
    }
    
    .excel-btn {
        background: #16a34a;
        color: white;
    }
    
    .excel-btn:hover {
        background: #15803d;
    }
    
    .reset-btn {
        background: #e5e7eb;
        color: #374151;
    }
    
    .reset-btn:hover {
        background: #d1d5db;
    }
    
    .rules-section {
        margin-top: 2rem;
        padding-top: 2rem;
        border-top: 2px solid #e2e8f0;
        max-width: 800px;
        margin-left: auto;
        margin-right: auto;
    }
    
    @media (max-width: 640px) {
        .controls {
            flex-direction: column;
            align-items: stretch;
        }
        
        .btn {
            text-align: center;
        }
    }
</style>