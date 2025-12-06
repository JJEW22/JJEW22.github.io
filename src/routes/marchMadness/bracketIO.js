// Bracket I/O utilities for loading and saving bracket files

/**
 * Region positioning for Final Four matchups
 */
export const regionPositions = {
    topLeft: 'East',
    bottomLeft: 'West', 
    topRight: 'South',
    bottomRight: 'Midwest'
};

/**
 * Standard tournament matchups
 */
export const matchupPairs = [
    [1, 16],
    [8, 9],
    [5, 12],
    [4, 13],
    [6, 11],
    [3, 14],
    [7, 10],
    [2, 15]
];

/**
 * Load teams from CSV file
 * @param {string} path - Path to the CSV file
 * @returns {Promise<{teams: Object, teamsList: Array}>}
 */
export async function loadTeamsFromCSV(path) {
    const response = await fetch(path);
    
    if (!response.ok) {
        throw new Error(`Failed to load teams CSV: ${response.status}`);
    }
    
    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    // Skip header row
    const dataLines = lines.slice(1);
    
    const teams = {};
    const teamsList = dataLines.map(line => {
        const [team, seed, region] = line.split(',').map(s => s.trim());
        const teamObj = {
            name: team,
            seed: parseInt(seed),
            region: region
        };
        teams[team] = teamObj;
        return teamObj;
    });
    
    return { teams, teamsList };
}

/**
 * Initialize an empty bracket structure with teams
 * @param {Array} teamsList - List of team objects
 * @returns {Object} - Initialized bracket
 */
export function initializeBracket(teamsList) {
    const bracket = {
        round1: [],
        round2: [],
        round3: [],
        round4: [],
        round5: [],
        round6: [],
        winner: null
    };
    
    // Group teams by region
    const regions = {
        East: [],
        West: [],
        South: [],
        Midwest: []
    };
    
    teamsList.forEach(team => {
        if (regions[team.region]) {
            regions[team.region].push(team);
        }
    });
    
    // Sort each region by seed
    Object.keys(regions).forEach(region => {
        regions[region].sort((a, b) => a.seed - b.seed);
    });
    
    // Process regions in order based on positioning
    const orderedRegions = [
        regionPositions.topLeft,
        regionPositions.bottomLeft,
        regionPositions.topRight,
        regionPositions.bottomRight
    ];
    
    // Round 1 - no parent games
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
                    parentGames: null,  // Round 1 has no parents
                    gameId: `r1-${regionName}-${seed1}v${seed2}`
                });
            }
        });
    });
    
    // Round 2 - parents are pairs of Round 1 games
    bracket.round2 = Array(16).fill(null).map((_, i) => ({
        team1: null,
        team2: null,
        winner: null,
        parentGames: [bracket.round1[i * 2], bracket.round1[i * 2 + 1]],
        gameId: `r2-${i}`
    }));
    
    // Round 3 (Sweet 16) - parents are pairs of Round 2 games
    bracket.round3 = Array(8).fill(null).map((_, i) => ({
        team1: null,
        team2: null,
        winner: null,
        parentGames: [bracket.round2[i * 2], bracket.round2[i * 2 + 1]],
        gameId: `r3-${i}`
    }));
    
    // Round 4 (Elite 8) - parents are pairs of Round 3 games
    bracket.round4 = Array(4).fill(null).map((_, i) => ({
        team1: null,
        team2: null,
        winner: null,
        parentGames: [bracket.round3[i * 2], bracket.round3[i * 2 + 1]],
        gameId: `r4-${i}`
    }));
    
    // Round 5 (Final Four) - parents are pairs of Round 4 games
    bracket.round5 = [
        { 
            team1: null, 
            team2: null, 
            winner: null, 
            parentGames: [bracket.round4[0], bracket.round4[1]],
            gameId: 'semifinal-left' 
        },
        { 
            team1: null, 
            team2: null, 
            winner: null, 
            parentGames: [bracket.round4[2], bracket.round4[3]],
            gameId: 'semifinal-right' 
        }
    ];
    
    // Round 6 (Championship) - parents are the two semifinals
    bracket.round6 = [{
        team1: null,
        team2: null,
        winner: null,
        parentGames: [bracket.round5[0], bracket.round5[1]],
        gameId: 'championship'
    }];
    
    return bracket;
}

/**
 * Helper to get cell value from Excel sheet
 */
function getCellValue(sheet, col, row) {
    const cell = sheet.getCell(`${col}${row}`);
    let value = cell.value;
    
    if (value && typeof value === 'object' && value.result) {
        value = value.result;
    }
    
    if (typeof value === 'string') {
        return value.trim();
    }
    return value;
}

/**
 * Find a team by name with fuzzy matching
 * @param {string} name - Team name to find
 * @param {Object} teams - Teams lookup object
 * @returns {Object|null} - Team object or null
 */
export function findTeam(name, teams) {
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
    // Return a basic team object if not found
    return { name: teamName, seed: 0 };
}

/**
 * Extract region winners from Excel sheet and populate bracket
 */
function extractRegionWinners(sheet, bracket, startIndex, config, teams) {
    const { r2Rows, s16Rows, e8Rows, f4Row, r2Col, s16Col, e8Col, f4Col } = config;
    
    // Round 1 winners (read from Round 2 cells)
    for (let i = 0; i < 8; i++) {
        const row = r2Rows[i];
        const winnerName = getCellValue(sheet, r2Col, row);
        if (winnerName) {
            const winner = findTeam(winnerName, teams);
            if (winner) {
                bracket.round1[startIndex + i].winner = winner;
                const r2GameIndex = Math.floor((startIndex + i) / 2);
                if ((startIndex + i) % 2 === 0) {
                    bracket.round2[r2GameIndex].team1 = winner;
                } else {
                    bracket.round2[r2GameIndex].team2 = winner;
                }
            }
        }
    }
    
    // Round 2 winners (read from Sweet 16 cells)
    for (let i = 0; i < 4; i++) {
        const row = s16Rows[i];
        const winnerName = getCellValue(sheet, s16Col, row);
        if (winnerName) {
            const winner = findTeam(winnerName, teams);
            if (winner) {
                const r2GameIndex = Math.floor(startIndex / 2) + i;
                bracket.round2[r2GameIndex].winner = winner;
                const r3GameIndex = Math.floor(startIndex / 4) + Math.floor(i / 2);
                if (i % 2 === 0) {
                    bracket.round3[r3GameIndex].team1 = winner;
                } else {
                    bracket.round3[r3GameIndex].team2 = winner;
                }
            }
        }
    }
    
    // Sweet 16 winners (read from Elite 8 cells)
    for (let i = 0; i < 2; i++) {
        const row = e8Rows[i];
        const winnerName = getCellValue(sheet, e8Col, row);
        if (winnerName) {
            const winner = findTeam(winnerName, teams);
            if (winner) {
                const s16GameIndex = Math.floor(startIndex / 4) + i;
                bracket.round3[s16GameIndex].winner = winner;
                const e8GameIndex = Math.floor(startIndex / 8);
                if (i === 0) {
                    bracket.round4[e8GameIndex].team1 = winner;
                } else {
                    bracket.round4[e8GameIndex].team2 = winner;
                }
            }
        }
    }
    
    // Elite 8 winner (read from Final Four cell)
    const f4WinnerName = getCellValue(sheet, f4Col, f4Row);
    if (f4WinnerName) {
        const winner = findTeam(f4WinnerName, teams);
        if (winner) {
            const e8GameIndex = Math.floor(startIndex / 8);
            bracket.round4[e8GameIndex].winner = winner;
            const semifinalIndex = e8GameIndex < 2 ? 0 : 1;
            const teamSlot = e8GameIndex % 2 === 0 ? 'team1' : 'team2';
            bracket.round5[semifinalIndex][teamSlot] = winner;
        }
    }
}

/**
 * Load bracket from Excel file
 * @param {string} path - Path to the Excel file
 * @param {Object} teams - Teams lookup object
 * @param {Array} teamsList - List of team objects
 * @returns {Promise<Object>} - Loaded bracket
 */
export async function loadBracketFromExcel(path, teams, teamsList) {
    const ExcelJSModule = await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch bracket: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    
    const sheet = workbook.getWorksheet('madness');
    if (!sheet) throw new Error('Could not find "madness" sheet');
    
    // Initialize bracket with teams
    const bracket = initializeBracket(teamsList);
    
    // Extract winners from each region
    // East Region (left side, top)
    extractRegionWinners(sheet, bracket, 0, {
        r2Rows: [8, 12, 16, 20, 24, 28, 32, 36],
        s16Rows: [10, 18, 26, 34],
        e8Rows: [14, 30],
        f4Row: 22,
        r2Col: 'E', s16Col: 'H', e8Col: 'K', f4Col: 'N'
    }, teams);
    
    // West Region (left side, bottom)
    extractRegionWinners(sheet, bracket, 8, {
        r2Rows: [43, 47, 51, 55, 59, 63, 67, 71],
        s16Rows: [45, 53, 61, 69],
        e8Rows: [49, 65],
        f4Row: 57,
        r2Col: 'E', s16Col: 'H', e8Col: 'K', f4Col: 'N'
    }, teams);
    
    // South Region (right side, top)
    extractRegionWinners(sheet, bracket, 16, {
        r2Rows: [8, 12, 16, 20, 24, 28, 32, 36],
        s16Rows: [10, 18, 26, 34],
        e8Rows: [14, 30],
        f4Row: 22,
        r2Col: 'AJ', s16Col: 'AG', e8Col: 'AD', f4Col: 'AA'
    }, teams);
    
    // Midwest Region (right side, bottom)
    extractRegionWinners(sheet, bracket, 24, {
        r2Rows: [43, 47, 51, 55, 59, 63, 67, 71],
        s16Rows: [45, 53, 61, 69],
        e8Rows: [49, 65],
        f4Row: 57,
        r2Col: 'AJ', s16Col: 'AG', e8Col: 'AD', f4Col: 'AA'
    }, teams);
    
    // Championship
    const champ1 = getCellValue(sheet, 'O', 39);
    const champ2 = getCellValue(sheet, 'W', 39);
    const champion = getCellValue(sheet, 'R', 44);
    
    if (champ1) {
        const team = findTeam(champ1, teams);
        bracket.round5[0].winner = team;
        bracket.round6[0].team1 = team;
    }
    if (champ2) {
        const team = findTeam(champ2, teams);
        bracket.round5[1].winner = team;
        bracket.round6[0].team2 = team;
    }
    if (champion) {
        bracket.round6[0].winner = findTeam(champion, teams);
        bracket.winner = findTeam(champion, teams);
    }
    
    return bracket;
}

/**
 * Load bracket from path (auto-detects format)
 * @param {string} path - Path to the bracket file
 * @param {Object} teams - Teams lookup object
 * @param {Array} teamsList - List of team objects
 * @returns {Promise<Object>} - Loaded bracket
 */
export async function loadBracketFromPath(path, teams, teamsList) {
    if (path.endsWith('.xlsx')) {
        return await loadBracketFromExcel(path, teams, teamsList);
    } else if (path.endsWith('.csv')) {
        // CSV loading not yet implemented
        console.log('CSV bracket loading not yet implemented');
        return initializeBracket(teamsList);
    } else {
        throw new Error('Unsupported file format. Use .xlsx or .csv');
    }
}

/**
 * Save bracket to Excel file
 * @param {Object} bracket - Bracket object to save
 * @returns {Promise<void>}
 */
export async function saveBracketToExcel(bracket) {
    const ExcelJSModule = await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('madness');
    
    // Set up the header
    sheet.getCell('A1').value = '2026 March Madness Bracket';
    
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
    
    // Date headers
    sheet.getCell('B4').value = 'March 20-21';
    sheet.getCell('E4').value = 'March 22-23';
    sheet.getCell('H4').value = 'March 27-28';
    sheet.getCell('K4').value = 'March 29-30';
    sheet.getCell('N4').value = 'April 5';
    sheet.getCell('R4').value = 'April 7';
    sheet.getCell('AA4').value = 'April 5';
    sheet.getCell('AD4').value = 'March 30-31';
    sheet.getCell('AG4').value = 'March 28-29';
    sheet.getCell('AJ4').value = 'March 22-23';
    sheet.getCell('AL4').value = 'March 20-21';
    
    const getTeamName = (team) => team ? team.name : '';
    const getWinnerName = (game) => game && game.winner ? game.winner.name : '';
    
    // === EAST REGION (Top Left) ===
    const eastR1 = bracket.round1.slice(0, 8);
    const eastRows = [7, 11, 15, 19, 23, 27, 31, 35];
    
    eastR1.forEach((game, i) => {
        const row = eastRows[i];
        sheet.getCell(`B${row}`).value = game.team1?.seed || '';
        sheet.getCell(`C${row}`).value = getTeamName(game.team1);
        sheet.getCell(`B${row + 2}`).value = game.team2?.seed || '';
        sheet.getCell(`C${row + 2}`).value = getTeamName(game.team2);
    });
    
    const eastR2Rows = [8, 12, 16, 20, 24, 28, 32, 36];
    eastR1.forEach((game, i) => {
        sheet.getCell(`E${eastR2Rows[i]}`).value = getWinnerName(game);
    });
    
    const eastS16Rows = [10, 18, 26, 34];
    bracket.round2.slice(0, 4).forEach((game, i) => {
        sheet.getCell(`H${eastS16Rows[i]}`).value = getWinnerName(game);
    });
    
    sheet.getCell('K14').value = getWinnerName(bracket.round3[0]);
    sheet.getCell('K30').value = getWinnerName(bracket.round3[1]);
    sheet.getCell('N22').value = getWinnerName(bracket.round4[0]);
    sheet.getCell('K22').value = 'East';
    
    // === WEST REGION (Bottom Left) ===
    const westR1 = bracket.round1.slice(8, 16);
    const westRows = [42, 46, 50, 54, 58, 62, 66, 70];
    
    westR1.forEach((game, i) => {
        const row = westRows[i];
        sheet.getCell(`B${row}`).value = game.team1?.seed || '';
        sheet.getCell(`C${row}`).value = getTeamName(game.team1);
        sheet.getCell(`B${row + 2}`).value = game.team2?.seed || '';
        sheet.getCell(`C${row + 2}`).value = getTeamName(game.team2);
    });
    
    const westR2Rows = [43, 47, 51, 55, 59, 63, 67, 71];
    westR1.forEach((game, i) => {
        sheet.getCell(`E${westR2Rows[i]}`).value = getWinnerName(game);
    });
    
    const westS16Rows = [45, 53, 61, 69];
    bracket.round2.slice(4, 8).forEach((game, i) => {
        sheet.getCell(`H${westS16Rows[i]}`).value = getWinnerName(game);
    });
    
    sheet.getCell('K49').value = getWinnerName(bracket.round3[2]);
    sheet.getCell('K65').value = getWinnerName(bracket.round3[3]);
    sheet.getCell('N57').value = getWinnerName(bracket.round4[1]);
    sheet.getCell('K57').value = 'Midwest';
    
    // === SOUTH REGION (Top Right) ===
    const southR1 = bracket.round1.slice(16, 24);
    const southRows = [7, 11, 15, 19, 23, 27, 31, 35];
    
    southR1.forEach((game, i) => {
        const row = southRows[i];
        sheet.getCell(`AL${row}`).value = getTeamName(game.team1);
        sheet.getCell(`AM${row}`).value = game.team1?.seed || '';
        sheet.getCell(`AL${row + 2}`).value = getTeamName(game.team2);
        sheet.getCell(`AM${row + 2}`).value = game.team2?.seed || '';
    });
    
    const southR2Rows = [8, 12, 16, 20, 24, 28, 32, 36];
    southR1.forEach((game, i) => {
        sheet.getCell(`AJ${southR2Rows[i]}`).value = getWinnerName(game);
    });
    
    const southS16Rows = [10, 18, 26, 34];
    bracket.round2.slice(8, 12).forEach((game, i) => {
        sheet.getCell(`AG${southS16Rows[i]}`).value = getWinnerName(game);
    });
    
    sheet.getCell('AD14').value = getWinnerName(bracket.round3[4]);
    sheet.getCell('AD30').value = getWinnerName(bracket.round3[5]);
    sheet.getCell('AA22').value = getWinnerName(bracket.round4[2]);
    sheet.getCell('AD22').value = 'South';
    
    // === MIDWEST REGION (Bottom Right) ===
    const midwestR1 = bracket.round1.slice(24, 32);
    const midwestRows = [42, 46, 50, 54, 58, 62, 66, 70];
    
    midwestR1.forEach((game, i) => {
        const row = midwestRows[i];
        sheet.getCell(`AL${row}`).value = getTeamName(game.team1);
        sheet.getCell(`AM${row}`).value = game.team1?.seed || '';
        sheet.getCell(`AL${row + 2}`).value = getTeamName(game.team2);
        sheet.getCell(`AM${row + 2}`).value = game.team2?.seed || '';
    });
    
    const midwestR2Rows = [43, 47, 51, 55, 59, 63, 67, 71];
    midwestR1.forEach((game, i) => {
        sheet.getCell(`AJ${midwestR2Rows[i]}`).value = getWinnerName(game);
    });
    
    const midwestS16Rows = [45, 53, 61, 69];
    bracket.round2.slice(12, 16).forEach((game, i) => {
        sheet.getCell(`AG${midwestS16Rows[i]}`).value = getWinnerName(game);
    });
    
    sheet.getCell('AD49').value = getWinnerName(bracket.round3[6]);
    sheet.getCell('AD65').value = getWinnerName(bracket.round3[7]);
    sheet.getCell('AA57').value = getWinnerName(bracket.round4[3]);
    sheet.getCell('AD57').value = 'West';
    
    // === CHAMPIONSHIP ===
    sheet.getCell('O39').value = getWinnerName(bracket.round5[0]);
    sheet.getCell('W39').value = getWinnerName(bracket.round5[1]);
    sheet.getCell('R44').value = bracket.winner ? bracket.winner.name : '';
    sheet.getCell('R46').value = 'National Champions';
    
    sheet.getCell('S50').value = 'Tie-Breaker';
    sheet.getCell('S51').value = '';
    sheet.getCell('R54').value = 'Total Points in Championship Game';
    
    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'march-madness-bracket-2026.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Get the set of eliminated teams from results bracket
 * @param {Object} resultsBracket - The official results bracket
 * @returns {Set<string>} - Set of eliminated team names
 */
export function getEliminatedTeams(resultsBracket) {
    const eliminated = new Set();
    
    for (let round = 1; round <= 6; round++) {
        const roundKey = `round${round}`;
        const games = resultsBracket[roundKey];
        
        if (!games) continue;
        
        games.forEach(game => {
            if (game && game.winner) {
                // The team that didn't win is eliminated
                if (game.team1 && game.team1.name !== game.winner.name) {
                    eliminated.add(game.team1.name);
                }
                if (game.team2 && game.team2.name !== game.winner.name) {
                    eliminated.add(game.team2.name);
                }
            }
        });
    }
    
    return eliminated;
}

/**
 * Determine the status of a pick for coloring
 * @param {Object} game - The game from user's bracket
 * @param {number} round - Round number (1-6)
 * @param {number} gameIndex - Index of the game in the round
 * @param {Object} resultsBracket - The official results bracket
 * @param {Set<string>} eliminatedTeams - Set of eliminated team names
 * @returns {'correct'|'incorrect'|'pending'|'none'} - Status of the pick
 */
export function getPickStatus(game, round, gameIndex, resultsBracket, eliminatedTeams) {
    if (!game || !game.winner) {
        return 'none';
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