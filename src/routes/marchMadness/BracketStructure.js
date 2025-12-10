// Shared bracket structure and utilities for March Madness

// Scoring constants
export const SCORE_FOR_ROUND = [0, 10, 20, 30, 50, 80, 130];
export const SEED_FACTOR = [0, 1, 2, 3, 4, 5, 6];

// Region positioning
export const regionPositions = {
    topLeft: 'East',
    bottomLeft: 'West',
    topRight: 'South',
    bottomRight: 'Midwest'
};

// Standard tournament matchups: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
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

// Excel cell mappings for reading/writing brackets
export const CELL_MAPPINGS = {
    // Left side rows (East top, West bottom)
    leftR1Rows: {
        top: [7, 11, 15, 19, 23, 27, 31, 35],      // East Round 1
        bottom: [42, 46, 50, 54, 58, 62, 66, 70]   // West Round 1
    },
    leftR2Rows: {
        top: [8, 12, 16, 20, 24, 28, 32, 36],      // East Round 2
        bottom: [43, 47, 51, 55, 59, 63, 67, 71]   // West Round 2
    },
    leftS16Rows: {
        top: [10, 18, 26, 34],                      // East Sweet 16
        bottom: [45, 53, 61, 69]                    // West Sweet 16
    },
    leftE8Rows: {
        top: [14, 30],                              // East Elite 8
        bottom: [49, 65]                            // West Elite 8
    },
    leftF4Rows: {
        top: 22,                                    // East Final Four
        bottom: 57                                  // West Final Four
    },
    
    // Right side rows (South top, Midwest bottom)
    rightR1Rows: {
        top: [7, 11, 15, 19, 23, 27, 31, 35],      // South Round 1
        bottom: [42, 46, 50, 54, 58, 62, 66, 70]   // Midwest Round 1
    },
    rightR2Rows: {
        top: [8, 12, 16, 20, 24, 28, 32, 36],      // South Round 2
        bottom: [43, 47, 51, 55, 59, 63, 67, 71]   // Midwest Round 2
    },
    rightS16Rows: {
        top: [10, 18, 26, 34],                      // South Sweet 16
        bottom: [45, 53, 61, 69]                    // Midwest Sweet 16
    },
    rightE8Rows: {
        top: [14, 30],                              // South Elite 8
        bottom: [49, 65]                            // Midwest Elite 8
    },
    rightF4Rows: {
        top: 22,                                    // South Final Four
        bottom: 57                                  // Midwest Final Four
    },
    
    // Column letters
    columns: {
        leftSeed: 'B',
        leftTeam: 'C',
        leftR2: 'E',
        leftS16: 'H',
        leftE8: 'K',
        leftF4: 'N',
        championship: 'R',
        champTeam1: 'O',
        champTeam2: 'W',
        rightF4: 'AA',
        rightE8: 'AD',
        rightS16: 'AG',
        rightR2: 'AJ',
        rightTeam: 'AL',
        rightSeed: 'AM'
    },
    
    // Championship rows
    championship: {
        team1Row: 39,  // O39
        team2Row: 39,  // W39
        winnerRow: 44  // R44
    }
};

// Game structure that maps game IDs to their parent games and positions
// This defines the bracket tree structure
export const BRACKET_STRUCTURE = {
    // Round 1 games (32 games total, 8 per region)
    // Index 0-7: East, 8-15: West, 16-23: South, 24-31: Midwest
    round1: {
        gamesPerRegion: 8,
        regions: ['East', 'West', 'South', 'Midwest'],
        // Maps to round 2: games 0,1 -> r2[0], games 2,3 -> r2[1], etc.
        advancesTo: (gameIndex) => Math.floor(gameIndex / 2)
    },
    
    // Round 2 games (16 games total, 4 per region)
    round2: {
        gamesPerRegion: 4,
        advancesTo: (gameIndex) => Math.floor(gameIndex / 2)
    },
    
    // Sweet 16 (8 games total, 2 per region)
    round3: {
        gamesPerRegion: 2,
        advancesTo: (gameIndex) => Math.floor(gameIndex / 2)
    },
    
    // Elite 8 (4 games total, 1 per region)
    round4: {
        gamesPerRegion: 1,
        // Elite 8 advances to Final Four
        // Games 0 (East) and 1 (West) -> F4 game 0
        // Games 2 (South) and 3 (Midwest) -> F4 game 1
        advancesTo: (gameIndex) => Math.floor(gameIndex / 2)
    },
    
    // Final Four (2 games)
    round5: {
        games: 2,
        advancesTo: () => 0  // Both advance to championship
    },
    
    // Championship (1 game)
    round6: {
        games: 1
    }
};

/**
 * Initialize an empty bracket structure
 */
export function createEmptyBracket() {
    return {
        round1: Array(32).fill(null).map((_, i) => ({
            team1: null,
            team2: null,
            winner: null,
            gameId: `r1-${i}`,
            round: 1
        })),
        round2: Array(16).fill(null).map((_, i) => ({
            team1: null,
            team2: null,
            winner: null,
            gameId: `r2-${i}`,
            round: 2
        })),
        round3: Array(8).fill(null).map((_, i) => ({
            team1: null,
            team2: null,
            winner: null,
            gameId: `r3-${i}`,
            round: 3
        })),
        round4: Array(4).fill(null).map((_, i) => ({
            team1: null,
            team2: null,
            winner: null,
            gameId: `r4-${i}`,
            round: 4
        })),
        round5: Array(2).fill(null).map((_, i) => ({
            team1: null,
            team2: null,
            winner: null,
            gameId: `r5-${i}`,
            round: 5
        })),
        round6: [{
            team1: null,
            team2: null,
            winner: null,
            gameId: 'r6-0',
            round: 6
        }],
        winner: null
    };
}

/**
 * Initialize bracket with teams from CSV data
 */
export function initializeBracketWithTeams(teams) {
    const bracket = createEmptyBracket();
    
    // Group teams by region
    const regions = {
        East: [],
        West: [],
        South: [],
        Midwest: []
    };
    
    teams.forEach(team => {
        if (regions[team.region]) {
            regions[team.region].push(team);
        }
    });
    
    // Sort each region by seed
    Object.keys(regions).forEach(region => {
        regions[region].sort((a, b) => a.seed - b.seed);
    });
    
    // Process regions in order: East, West, South, Midwest
    const orderedRegions = [
        regionPositions.topLeft,     // East
        regionPositions.bottomLeft,  // West
        regionPositions.topRight,    // South
        regionPositions.bottomRight  // Midwest
    ];
    
    let gameIndex = 0;
    orderedRegions.forEach(regionName => {
        const regionTeams = regions[regionName];
        
        matchupPairs.forEach(([seed1, seed2]) => {
            const team1 = regionTeams.find(t => t.seed === seed1);
            const team2 = regionTeams.find(t => t.seed === seed2);
            
            if (team1 && team2) {
                bracket.round1[gameIndex] = {
                    team1: team1,
                    team2: team2,
                    winner: null,
                    region: regionName,
                    gameId: `r1-${regionName}-${seed1}v${seed2}`,
                    round: 1
                };
            }
            gameIndex++;
        });
    });
    
    return bracket;
}

/**
 * Get the region for a game based on its index and round
 */
export function getRegionForGame(round, gameIndex) {
    if (round === 1) {
        if (gameIndex < 8) return 'East';
        if (gameIndex < 16) return 'West';
        if (gameIndex < 24) return 'South';
        return 'Midwest';
    } else if (round === 2) {
        if (gameIndex < 4) return 'East';
        if (gameIndex < 8) return 'West';
        if (gameIndex < 12) return 'South';
        return 'Midwest';
    } else if (round === 3) {
        if (gameIndex < 2) return 'East';
        if (gameIndex < 4) return 'West';
        if (gameIndex < 6) return 'South';
        return 'Midwest';
    } else if (round === 4) {
        if (gameIndex === 0) return 'East';
        if (gameIndex === 1) return 'West';
        if (gameIndex === 2) return 'South';
        return 'Midwest';
    }
    return 'Finals';
}

/**
 * Compute score for a bracket against results
 * @param {Object} resultsBracket - The official results bracket
 * @param {Object} picksBracket - The user's picks bracket
 * @param {Object} teamsData - Map of team names to their data (for seeds)
 * @param {Object} options - Scoring options
 */
export function computeScore(resultsBracket, picksBracket, teamsData, options = {}) {
    const {
        scoringVector = SCORE_FOR_ROUND,
        rounds = new Set([1, 2, 3, 4, 5, 6]),
        applySeedBonus = true
    } = options;
    
    let totalScore = 0;
    let correctPicks = 0;
    let seedBonus = 0;  // Track seed bonus separately
    let roundBreakdown = [0, 0, 0, 0, 0, 0, 0]; // Index by round
    
    // Iterate through all rounds
    for (let round = 1; round <= 6; round++) {
        if (!rounds.has(round)) continue;
        
        const roundKey = `round${round}`;
        const resultsRound = resultsBracket[roundKey];
        const picksRound = picksBracket[roundKey];
        
        if (!resultsRound || !picksRound) continue;
        
        resultsRound.forEach((resultGame, index) => {
            const pickGame = picksRound[index];
            
            if (!resultGame || !pickGame) return;
            if (!resultGame.winner || !pickGame.winner) return;
            
            // Check if pick matches result
            if (resultGame.winner.name === pickGame.winner.name) {
                const points = scoringVector[round];
                totalScore += points;
                roundBreakdown[round] += points;
                correctPicks++;
                
                // Apply upset bonus if enabled
                if (applySeedBonus && resultGame.team1 && resultGame.team2) {
                    const team1Seed = teamsData[resultGame.team1.name]?.seed || resultGame.team1.seed;
                    const team2Seed = teamsData[resultGame.team2.name]?.seed || resultGame.team2.seed;
                    const winnerSeed = teamsData[resultGame.winner.name]?.seed || resultGame.winner.seed;
                    
                    // Upset bonus: if higher seed (larger number) wins
                    const expectedWinnerSeed = Math.min(team1Seed, team2Seed);
                    if (winnerSeed > expectedWinnerSeed) {
                        const upsetBonus = (winnerSeed - expectedWinnerSeed) * SEED_FACTOR[round];
                        totalScore += upsetBonus;
                        seedBonus += upsetBonus;
                        roundBreakdown[round] += upsetBonus;
                    }
                }
            }
        });
    }
    
    return {
        totalScore,
        correctPicks,
        seedBonus,
        roundBreakdown
    };
}

/**
 * Compute remaining possible points for a bracket, including potential seed bonuses.
 * @param {Object} resultsBracket - The official results bracket
 * @param {Object} picksBracket - The user's picks bracket
 * @param {Object} teamsData - Map of team names to their data (for seeds)
 * @returns {Object} { basePoints, bonusPoints, total }
 */
export function computePossibleRemaining(resultsBracket, picksBracket, teamsData) {
    let basePoints = 0;
    let bonusPoints = 0;
    
    // Find teams still alive in the tournament
    const remainingTeams = new Set();
    
    for (let round = 1; round <= 6; round++) {
        const roundKey = `round${round}`;
        const resultsRound = resultsBracket[roundKey];
        
        if (!resultsRound) continue;
        
        resultsRound.forEach(game => {
            if (!game) return;
            
            // If game hasn't been played yet
            if (!game.winner) {
                if (game.team1) remainingTeams.add(game.team1.name);
                if (game.team2) remainingTeams.add(game.team2.name);
            }
        });
    }
    
    // Calculate possible points from remaining games
    for (let round = 1; round <= 6; round++) {
        const roundKey = `round${round}`;
        const resultsRound = resultsBracket[roundKey];
        const picksRound = picksBracket[roundKey];
        
        if (!resultsRound || !picksRound) continue;
        
        resultsRound.forEach((resultGame, index) => {
            const pickGame = picksRound[index];
            
            if (!resultGame || !pickGame) return;
            
            // If game hasn't been decided yet and user's pick is still alive
            if (!resultGame.winner && pickGame.winner && remainingTeams.has(pickGame.winner.name)) {
                // Add base points for this round
                basePoints += SCORE_FOR_ROUND[round];
                
                // Calculate potential seed bonus: MAX(0, seed_chosen - seed_opponent) * SEED_FACTOR[round]
                if (resultGame.team1 && resultGame.team2) {
                    const pickName = pickGame.winner.name;
                    const team1Name = resultGame.team1.name;
                    const team2Name = resultGame.team2.name;
                    
                    const pickSeed = teamsData[pickName]?.seed || pickGame.winner.seed;
                    const opponentName = (pickName === team1Name) ? team2Name : team1Name;
                    const opponentSeed = teamsData[opponentName]?.seed || 
                        (pickName === team1Name ? resultGame.team2.seed : resultGame.team1.seed);
                    
                    if (pickSeed && opponentSeed && pickSeed > opponentSeed) {
                        bonusPoints += (pickSeed - opponentSeed) * SEED_FACTOR[round];
                    }
                }
            }
        });
    }
    
    return { basePoints, bonusPoints, total: basePoints + bonusPoints };
}

/**
 * Compute stake in a specific game for a bracket
 * Returns how many points are riding on each team winning
 */
export function computeStakeInGame(resultsBracket, picksBracket, round, gameIndex) {
    const roundKey = `round${round}`;
    const resultGame = resultsBracket[roundKey]?.[gameIndex];
    const pickGame = picksBracket[roundKey]?.[gameIndex];
    
    if (!resultGame || !pickGame) return null;
    if (!resultGame.team1 || !resultGame.team2) return null;
    
    const team1Name = resultGame.team1.name;
    const team2Name = resultGame.team2.name;
    const pickedWinner = pickGame.winner?.name;
    
    if (!pickedWinner) return { team1: 0, team2: 0, hasPick: false };
    
    const pickIsTeam1 = pickedWinner === team1Name;
    const pickIsTeam2 = pickedWinner === team2Name;
    
    // If user picked neither team (their pick was eliminated earlier), they have no stake
    if (!pickIsTeam1 && !pickIsTeam2) {
        return { team1: 0, team2: 0, hasPick: false, pickedTeam: pickedWinner };
    }
    
    // Calculate total stake: sum of points for this round + all future rounds
    // where the user has this team advancing
    const teamToCheck = pickIsTeam1 ? team1Name : team2Name;
    let totalStake = 0;
    
    // Add points for current round
    totalStake += SCORE_FOR_ROUND[round];
    
    // Check future rounds to see how far the user has this team advancing
    for (let futureRound = round + 1; futureRound <= 6; futureRound++) {
        const futureRoundKey = `round${futureRound}`;
        const futureGames = picksBracket[futureRoundKey];
        
        if (!futureGames) break;
        
        // Check if the team appears as a winner in any game of this future round
        let teamAdvances = false;
        for (const game of futureGames) {
            if (game && game.winner && game.winner.name === teamToCheck) {
                teamAdvances = true;
                break;
            }
        }
        
        if (teamAdvances) {
            totalStake += SCORE_FOR_ROUND[futureRound];
        } else {
            // Team doesn't advance past this round in user's bracket
            break;
        }
    }
    
    // Also check if user has this team as the overall winner
    if (picksBracket.winner && picksBracket.winner.name === teamToCheck) {
        // Winner points are included in round 6, so no extra addition needed
    }
    
    return {
        team1: pickIsTeam1 ? totalStake : 0,
        team2: pickIsTeam2 ? totalStake : 0,
        hasPick: true,
        pickedTeam: pickedWinner
    };
}

/**
 * Letter to column number conversion (for Excel parsing)
 */
export function letterToNumber(letter) {
    const letters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
    const lowerLetter = letter.toLowerCase();
    
    if (lowerLetter.length === 1) {
        return letters.indexOf(lowerLetter);
    } else if (lowerLetter.length === 2) {
        // Handle two-letter columns like 'AA', 'AL', etc.
        const first = letters.indexOf(lowerLetter[0]);
        const second = letters.indexOf(lowerLetter[1]);
        return (first + 1) * 26 + second;
    }
    return -1;
}

/**
 * Column number to letter conversion
 */
export function numberToLetter(num) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (num < 26) {
        return letters[num];
    } else {
        const first = Math.floor(num / 26) - 1;
        const second = num % 26;
        return letters[first] + letters[second];
    }
}

/**
 * Build the optimal bracket for maximum possible score.
 * 
 * Algorithm:
 * 1. Find the team(s) the participant picked to go furthest that are still alive
 * 2. Have them win all their games up to that point
 * 3. For each opponent the participant picked for these teams, if still alive,
 *    have them win up to the point where they meet
 * 4. Repeat until no more teams to process
 * 
 * @param {Object} resultsBracket - The actual tournament results (with some games TBD)
 * @param {Object} picksBracket - The participant's picks
 * @param {Object} teamsData - Map of team names to team data
 * @returns {Object} The optimal bracket with winners filled in (null for TBD)
 */
export function buildOptimalBracket(resultsBracket, picksBracket, teamsData) {
    // Deep clone the results bracket as our starting point
    const optimalBracket = JSON.parse(JSON.stringify(resultsBracket));
    
    // Track which teams are still alive (not eliminated)
    const aliveTeams = new Set();
    
    // First, find all teams still alive from the results bracket
    for (let round = 1; round <= 6; round++) {
        const roundKey = `round${round}`;
        const games = resultsBracket[roundKey] || [];
        
        for (const game of games) {
            if (!game) continue;
            
            if (!game.winner) {
                // Game not decided - both teams (if present) are alive
                if (game.team1?.name) aliveTeams.add(game.team1.name);
                if (game.team2?.name) aliveTeams.add(game.team2.name);
            }
        }
    }
    
    // Find the furthest round where participant has a pick that's still alive
    // and get all such teams at that level
    let startingTeams = [];
    
    for (let round = 6; round >= 1; round--) {
        const teamsAtRound = getPicksAtRound(picksBracket, round, aliveTeams);
        if (teamsAtRound.length > 0) {
            startingTeams = teamsAtRound;
            break;
        }
    }
    
    // Process teams using a stack
    // Each item is { teamName, targetRound } - the team should win up to targetRound
    const toProcess = [];
    
    // Add starting teams - they should win up to their furthest picked round
    for (const teamName of startingTeams) {
        const furthestRound = getFurthestRound(picksBracket, teamName);
        toProcess.push({ teamName, targetRound: furthestRound });
    }
    
    // Track which teams we've already processed to avoid duplicates
    const processed = new Set();
    
    while (toProcess.length > 0) {
        const { teamName, targetRound } = toProcess.pop();
        
        if (processed.has(teamName)) continue;
        processed.add(teamName);
        
        // Have this team win all their games up to targetRound
        const opponents = markTeamWinning(optimalBracket, picksBracket, teamName, targetRound, teamsData, aliveTeams);
        
        // Add opponents to the processing stack
        for (const opponent of opponents) {
            if (!processed.has(opponent.teamName) && aliveTeams.has(opponent.teamName)) {
                toProcess.push(opponent);
            }
        }
    }
    
    return optimalBracket;
}

/**
 * Get all teams the participant picked to reach a specific round that are still alive
 */
function getPicksAtRound(picksBracket, round, aliveTeams) {
    const teams = [];
    
    if (round === 6) {
        // Championship winner
        const champ = picksBracket.round6?.[0]?.winner?.name;
        if (champ && aliveTeams.has(champ)) teams.push(champ);
    } else if (round === 5) {
        // Finalists (winners of round 5)
        for (const game of picksBracket.round5 || []) {
            if (game?.winner?.name && aliveTeams.has(game.winner.name)) {
                teams.push(game.winner.name);
            }
        }
    } else {
        // For earlier rounds, get winners of that round
        const roundKey = `round${round}`;
        for (const game of picksBracket[roundKey] || []) {
            if (game?.winner?.name && aliveTeams.has(game.winner.name)) {
                teams.push(game.winner.name);
            }
        }
    }
    
    return [...new Set(teams)]; // Remove duplicates
}

/**
 * Find the furthest round a team reaches in the participant's bracket
 */
function getFurthestRound(picksBracket, teamName) {
    // Check from championship down
    if (picksBracket.round6?.[0]?.winner?.name === teamName) return 6;
    
    for (let round = 5; round >= 1; round--) {
        const roundKey = `round${round}`;
        for (const game of picksBracket[roundKey] || []) {
            if (game?.winner?.name === teamName) return round;
        }
    }
    
    return 0;
}

/**
 * Mark a team as winning all their games up to targetRound in the optimal bracket.
 * Returns list of opponents that should be processed next.
 */
function markTeamWinning(optimalBracket, picksBracket, teamName, targetRound, teamsData, aliveTeams) {
    const opponents = [];
    
    // Find which games this team needs to win
    for (let round = 1; round <= targetRound; round++) {
        const roundKey = `round${round}`;
        const optimalGames = optimalBracket[roundKey] || [];
        const picksGames = picksBracket[roundKey] || [];
        
        for (let i = 0; i < optimalGames.length; i++) {
            const game = optimalGames[i];
            const pickGame = picksGames[i];
            
            if (!game || game.winner) continue; // Already decided
            
            // Check if this team is in this game (or should be)
            const team1Name = game.team1?.name;
            const team2Name = game.team2?.name;
            
            if (team1Name === teamName || team2Name === teamName) {
                // This team is in this game - mark them as winner
                game.winner = teamsData[teamName] || { name: teamName };
                
                // Find who the participant picked as opponent and add to process list
                if (pickGame?.team1?.name && pickGame.team1.name !== teamName && aliveTeams.has(pickGame.team1.name)) {
                    const oppFurthest = getFurthestRoundInPath(picksBracket, pickGame.team1.name, round);
                    opponents.push({ teamName: pickGame.team1.name, targetRound: Math.min(oppFurthest, round) });
                }
                if (pickGame?.team2?.name && pickGame.team2.name !== teamName && aliveTeams.has(pickGame.team2.name)) {
                    const oppFurthest = getFurthestRoundInPath(picksBracket, pickGame.team2.name, round);
                    opponents.push({ teamName: pickGame.team2.name, targetRound: Math.min(oppFurthest, round) });
                }
                
                // Propagate winner to next round
                propagateWinner(optimalBracket, round, i, teamsData[teamName] || { name: teamName });
                
                break; // Found the game, move to next round
            }
            
            // Check if team needs to be placed in this game (team slot is empty but team should be here)
            if (!team1Name || !team2Name) {
                // Check if participant's bracket has this team in this game
                const pickTeam1 = pickGame?.team1?.name;
                const pickTeam2 = pickGame?.team2?.name;
                
                if (pickTeam1 === teamName || pickTeam2 === teamName) {
                    // Place the team and mark as winner
                    if (!team1Name && pickTeam1 === teamName) {
                        game.team1 = teamsData[teamName] || { name: teamName };
                    } else if (!team2Name && pickTeam2 === teamName) {
                        game.team2 = teamsData[teamName] || { name: teamName };
                    }
                    game.winner = teamsData[teamName] || { name: teamName };
                    
                    // Add opponent from picks
                    const oppName = pickTeam1 === teamName ? pickTeam2 : pickTeam1;
                    if (oppName && aliveTeams.has(oppName)) {
                        const oppFurthest = getFurthestRoundInPath(picksBracket, oppName, round);
                        opponents.push({ teamName: oppName, targetRound: Math.min(oppFurthest, round) });
                    }
                    
                    propagateWinner(optimalBracket, round, i, teamsData[teamName] || { name: teamName });
                    break;
                }
            }
        }
    }
    
    return opponents;
}

/**
 * Get the furthest round a team reaches in picks, but capped at maxRound
 */
function getFurthestRoundInPath(picksBracket, teamName, maxRound) {
    for (let round = maxRound; round >= 1; round--) {
        const roundKey = `round${round}`;
        for (const game of picksBracket[roundKey] || []) {
            if (game?.winner?.name === teamName) return round;
        }
    }
    return 1;
}

/**
 * Propagate a winner to the next round's game
 */
function propagateWinner(bracket, currentRound, gameIndex, winner) {
    if (currentRound >= 6) return;
    
    const nextRound = currentRound + 1;
    const nextRoundKey = `round${nextRound}`;
    const nextGameIndex = Math.floor(gameIndex / 2);
    const isFirstTeam = gameIndex % 2 === 0;
    
    const nextGame = bracket[nextRoundKey]?.[nextGameIndex];
    if (!nextGame) return;
    
    if (isFirstTeam) {
        nextGame.team1 = winner;
    } else {
        nextGame.team2 = winner;
    }
}