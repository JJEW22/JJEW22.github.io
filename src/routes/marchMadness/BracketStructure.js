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
                        roundBreakdown[round] += upsetBonus;
                    }
                }
            }
        });
    }
    
    return {
        totalScore,
        correctPicks,
        roundBreakdown
    };
}

/**
 * Compute remaining possible points for a bracket
 */
export function computePossibleRemaining(resultsBracket, picksBracket, teamsData) {
    let possibleRemaining = 0;
    
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
                possibleRemaining += SCORE_FOR_ROUND[round];
            }
        });
    }
    
    return possibleRemaining;
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