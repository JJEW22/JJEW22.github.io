<script>
    import { onMount } from 'svelte';
    import * as XLSX from 'xlsx';
    import Collapsible from '$lib/Collapsible.svelte';
    import HallOfFame from '$lib/HallOfFame.svelte';
    import brownJPFlicksLogo from '$lib/assets/brownJPFlicksLogo.svg';
    import patternColorLogo from '$lib/assets/colorJPFlicksCollisionLogo-pattern.svg';
    import patternBrownLogo from '$lib/assets/brownJPFlicksCollisionLogo-pattern.svg';
    import '../../app.css';
    
    // Data storage
    let loading = true;
    let error = null;
    let excelData = {}; // Will store all sheet data
    let dataReady = false;
    let team_names = []; // will store the name of all teams
    let teams_info = undefined; // will store all the teams info
    let tournamentPoints = {}; // will store tournament points per team
    $: teamsWithRanking = undefined;
    
    // Page background element
    let pageBackground;
    
    // Set background on mount - smaller icons with more whitespace, diagonal pattern
    $: if (pageBackground) {
        pageBackground.style.backgroundImage = `url(${patternColorLogo}), url(${patternBrownLogo})`;
        // Offset the second logo diagonally (not a perfect grid)
        pageBackground.style.backgroundPosition = '0 0, 90px 60px';
        pageBackground.style.backgroundSize = '150px 150px, 150px 150px';
        pageBackground.style.backgroundRepeat = 'repeat';
    }

    const WIN_SCORE = 2;
    const TIES_SCORE = 1;
    const LOSS_SCORE = 0;
    const SERIES_WIN_SCORE = 1;
    const UNPLAYED_STRING = "UNPLAYED"
    const WONT_PLAY_STRING = "XXX"
    const SESSION_COUNT = 9
    
    const HOME_GAME_STRING = 'Council'
    const AWAY_GAME_STRING = 'Anish'
    
    // Adjustment constant for games per session calculation (C in the algorithm)
    const GAMES_PER_SESSION_ADJUSTMENT = 0.1;
    
    // Team that will be adjusted last to ensure even total (players not on other teams)
    const LAST_TEAM_FOR_ADJUSTMENT = 'Kalice';

    // Tournament points file
    const TOURNAMENT_POINTS_FILE = '/marchMadness/2026/tournamentPoints.json'

    // file information
    const HOME_GAMES_PAGE_NAME = "HomeGames"
    const AWAY_GAMES_PAGE_NAME = "AwayGames"
    const TEAM_INFO_PAGE_NAME = 'TeamInfo'
    const SEASON_NUMBER = 2
    const FILE_PREFIX = 'jpFlicksSeason'
    const FILE_NAME = `${FILE_PREFIX}${SEASON_NUMBER}.xlsx`

    // access constants
    const TEAM_NAME = 'teamName'
    const PLAYER_ONE = 'player1'
    const PLAYER_TWO = 'player2'
    const IS_HOME = 'isHome'
    const PLAYED = 'played'
    const PLAYER1_TEAM1 = 'player1_team1'
    const PLAYER2_TEAM1 = 'player2_team1'
    const PLAYER1_TEAM2 = 'player1_team2'
    const PLAYER2_TEAM2 = 'player2_team2'

    // Get the date of the next Thursday (or today if Thursday) for consistent seeding
    function getThursdaySeed() {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, 4 = Thursday
        
        let thursday;
        if (dayOfWeek === 4) {
            // Today is Thursday
            thursday = today;
        } else {
            // Calculate days until next Thursday
            const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7;
            thursday = new Date(today);
            thursday.setDate(today.getDate() + daysUntilThursday);
        }
        
        // Return as YYYYMMDD number for seed
        return thursday.getFullYear() * 10000 + 
               (thursday.getMonth() + 1) * 100 + 
               thursday.getDate();
    }
    
    // Seeded random number generator (mulberry32)
    function seededRandom(seed) {
        return function() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    
    // Get the current Thursday seed
    const thursdaySeed = getThursdaySeed();
    const random = seededRandom(thursdaySeed);
    console.log('🗓️ THURSDAY SEED:', thursdaySeed);

    /**
     * Compute the number of games each team should play this week.
     * 
     * Algorithm:
     * 1. Calculate X = (remaining games) / SESSION_COUNT for each team
     * 2. Add adjustment C to get X + C
     * 3. Probabilistically round: decimal part = probability of rounding up
     * 4. Ensure each team plays at least 1 game
     * 5. Cap players on multiple teams to 3 games total (unless their X values sum > 3)
     * 6. Adjust last team (Kalice) to ensure total is even
     * 
     * @param {Array} games - Array of all unplayed games
     * @param {Array} teamsInfo - Array of team info with player1, player2, teamName
     * @param {Function} randomFn - Seeded random function
     * @returns {Object} - Map of teamName -> number of games to play
     */
    function computeGamesPerTeam(games, teamsInfo, randomFn) {
        if (!games || !teamsInfo || games.length === 0) return {};
        
        // Step 1: Count remaining games per team
        const remainingGamesPerTeam = {};
        games.forEach(game => {
            if (!game.played) {
                remainingGamesPerTeam[game.team1] = (remainingGamesPerTeam[game.team1] || 0) + 1;
                remainingGamesPerTeam[game.team2] = (remainingGamesPerTeam[game.team2] || 0) + 1;
            }
        });
        
        // Step 2: Calculate X + C for each team and probabilistically round
        const gamesPerTeam = {};
        const teamXValues = {}; // Store X values for multi-team cap calculation
        
        Object.keys(remainingGamesPerTeam).forEach(teamName => {
            const remaining = remainingGamesPerTeam[teamName];
            const X = remaining / SESSION_COUNT;
            teamXValues[teamName] = X;
            
            const adjusted = X + GAMES_PER_SESSION_ADJUSTMENT;
            const floor = Math.floor(adjusted);
            const decimal = adjusted - floor;
            
            // Probabilistic rounding: decimal is probability of rounding up
            const roundedGames = randomFn() < decimal ? floor + 1 : floor;
            
            // Ensure at least 1 game per team
            gamesPerTeam[teamName] = Math.max(1, roundedGames);
        });
        
        // Step 3: Build player -> teams mapping
        const playerTeams = {};
        teamsInfo.forEach(team => {
            const p1 = team.player1?.toLowerCase();
            const p2 = team.player2?.toLowerCase();
            
            if (p1) {
                if (!playerTeams[p1]) playerTeams[p1] = [];
                playerTeams[p1].push(team.teamName);
            }
            if (p2) {
                if (!playerTeams[p2]) playerTeams[p2] = [];
                playerTeams[p2].push(team.teamName);
            }
        });
        
        // Step 4: Cap multi-team players at 3 games (unless X1 + X2 > 3)
        Object.entries(playerTeams).forEach(([player, teams]) => {
            if (teams.length > 1) {
                const totalGames = teams.reduce((sum, t) => sum + (gamesPerTeam[t] || 0), 0);
                const totalX = teams.reduce((sum, t) => sum + (teamXValues[t] || 0), 0);
                
                const cap = Math.max(3, Math.ceil(totalX));
                
                if (totalGames > cap) {
                    // Need to reduce - find team with lowest X value (excluding last team)
                    const sortedTeams = teams
                        .filter(t => t !== LAST_TEAM_FOR_ADJUSTMENT)
                        .sort((a, b) => (teamXValues[a] || 0) - (teamXValues[b] || 0));
                    
                    let excess = totalGames - cap;
                    for (const teamToReduce of sortedTeams) {
                        if (excess <= 0) break;
                        const currentGames = gamesPerTeam[teamToReduce];
                        const reduction = Math.min(excess, currentGames - 1); // Keep at least 1
                        if (reduction > 0) {
                            gamesPerTeam[teamToReduce] -= reduction;
                            excess -= reduction;
                        }
                    }
                }
            }
        });
        
        // Step 5: Compute max games per player for rebalancing checks
        // Formula: MAX(1 + n, CEIL(X_1 + X_2 + ... + X_n)) where n = number of teams
        const maxGamesPerPlayer = {};
        Object.entries(playerTeams).forEach(([player, teams]) => {
            const n = teams.length;
            const totalX = teams.reduce((sum, t) => sum + (teamXValues[t] || 0), 0);
            maxGamesPerPlayer[player] = Math.max(1 + n, Math.ceil(totalX));
        });
        
        // Step 6: Calculate total and adjust last team for even sum
        let totalGames = Object.values(gamesPerTeam).reduce((sum, g) => sum + g, 0);
        
        if (totalGames % 2 !== 0) {
            // Adjust Kalice to make it even
            if (gamesPerTeam[LAST_TEAM_FOR_ADJUSTMENT] !== undefined) {
                // Decide whether to add or subtract based on their X value
                const kaliceX = teamXValues[LAST_TEAM_FOR_ADJUSTMENT] || 0;
                const kaliceCurrent = gamesPerTeam[LAST_TEAM_FOR_ADJUSTMENT];
                
                if (kaliceCurrent > kaliceX + GAMES_PER_SESSION_ADJUSTMENT) {
                    // Current is higher than expected, reduce by 1
                    gamesPerTeam[LAST_TEAM_FOR_ADJUSTMENT] = Math.max(1, kaliceCurrent - 1);
                } else {
                    // Add 1
                    gamesPerTeam[LAST_TEAM_FOR_ADJUSTMENT] = kaliceCurrent + 1;
                }
            }
        }
        
        // Recalculate total for logging
        totalGames = Object.values(gamesPerTeam).reduce((sum, g) => sum + g, 0);
        
        return { gamesPerTeam, remainingGamesPerTeam, teamXValues, totalGames, maxGamesPerPlayer };
    }

    /**
     * Select specific games for this week that satisfy the games-per-team constraints.
     * 
     * Algorithm:
     * 1. First, find a matching to give each team their first game (no team plays twice in matching)
     *    - Even teams: perfect matching
     *    - Odd teams: near-perfect matching, leftover team gets 2 games
     * 2. Then assign additional games for teams needing 2+ games
     *    - Constraint: No player should face the same opponent twice
     *      (i.e., if Team A plays Team B, Team A can't also play Team C if B and C share a player)
     * 
     * @param {Object} gamesPerTeam - Map of teamName -> number of games to play this week
     * @param {Array} unplayedGames - Array of unplayed games
     * @param {Function} randomFn - Seeded random function
     * @returns {Set} - Set of game IDs that are selected for this week
     */
    function selectGamesForWeek(gamesPerTeam, unplayedGames, randomFn) {
        if (!gamesPerTeam || !unplayedGames || unplayedGames.length === 0) return new Set();
        
        const selectedGameIds = new Set();
        const selectedGames = []; // Keep track of actual game objects for constraint checking
        
        // Track remaining games needed per team
        const remainingNeeded = { ...gamesPerTeam };
        
        // Helper: Get players for a team from a game object
        function getPlayersForTeam(game, teamName) {
            if (game.team1 === teamName) {
                return [game[PLAYER1_TEAM1]?.toLowerCase(), game[PLAYER2_TEAM1]?.toLowerCase()].filter(Boolean);
            } else if (game.team2 === teamName) {
                return [game[PLAYER1_TEAM2]?.toLowerCase(), game[PLAYER2_TEAM2]?.toLowerCase()].filter(Boolean);
            }
            return [];
        }
        
        // Helper: Get opponent team name from a game
        function getOpponentTeam(game, myTeam) {
            return game.team1 === myTeam ? game.team2 : game.team1;
        }
        
        // Helper: Get opponent players from a game
        function getOpponentPlayers(game, myTeam) {
            return getPlayersForTeam(game, getOpponentTeam(game, myTeam));
        }
        
        // Helper: Check if two teams share any players
        function teamsSharePlayers(game1, team1, game2, team2) {
            const players1 = getPlayersForTeam(game1, getOpponentTeam(game1, team1));
            const players2 = getPlayersForTeam(game2, getOpponentTeam(game2, team2));
            return players1.some(p => players2.includes(p));
        }
        
        // Helper: Check if adding a game violates the no-shared-opponent constraint
        function violatesSharedOpponentConstraint(newGame, teamName) {
            const newOpponentPlayers = getOpponentPlayers(newGame, teamName);
            
            // Check against all games already selected for this team
            for (const existingGame of selectedGames) {
                if (existingGame.team1 !== teamName && existingGame.team2 !== teamName) continue;
                
                const existingOpponentPlayers = getOpponentPlayers(existingGame, teamName);
                
                // Check if any opponent player is shared
                if (newOpponentPlayers.some(p => existingOpponentPlayers.includes(p))) {
                    return true;
                }
            }
            return false;
        }
        
        // Helper: Select a game and update tracking
        function selectGame(game) {
            const gameId = getGameId(game);
            selectedGameIds.add(gameId);
            selectedGames.push(game);
            remainingNeeded[game.team1]--;
            remainingNeeded[game.team2]--;
        }
        
        // PHASE 1: Find initial matching (each team plays at most 1 game)
        const teams = Object.keys(gamesPerTeam);
        const numTeams = teams.length;
        
        // Shuffle available games for randomness (assign random values once, then sort)
        let availableGames = [...unplayedGames]
            .map(game => ({ game, sortKey: randomFn() }))
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(item => item.game);
        
        // Greedy matching: iterate through shuffled games, add if neither team is matched yet
        const matchedTeams = new Set();
        
        for (const game of availableGames) {
            if (remainingNeeded[game.team1] > 0 && remainingNeeded[game.team2] > 0 &&
                !matchedTeams.has(game.team1) && !matchedTeams.has(game.team2)) {
                
                selectGame(game);
                matchedTeams.add(game.team1);
                matchedTeams.add(game.team2);
            }
            
            // Stop if we've matched all teams we can
            if (matchedTeams.size >= numTeams - (numTeams % 2)) break;
        }
        
        // For odd number of teams, the unmatched team should get a second game
        if (numTeams % 2 === 1) {
            const unmatchedTeam = teams.find(t => !matchedTeams.has(t));
            if (unmatchedTeam && remainingNeeded[unmatchedTeam] > 0) {
                // Find a game for the unmatched team
                const validGames = availableGames.filter(game => {
                    if (selectedGameIds.has(getGameId(game))) return false;
                    const isTeamInGame = game.team1 === unmatchedTeam || game.team2 === unmatchedTeam;
                    const otherTeam = game.team1 === unmatchedTeam ? game.team2 : game.team1;
                    return isTeamInGame && remainingNeeded[otherTeam] > 0;
                });
                
                if (validGames.length > 0) {
                    const randomIndex = Math.floor(randomFn() * validGames.length);
                    selectGame(validGames[randomIndex]);
                }
            }
        }
        
        // PHASE 2: Assign remaining games respecting shared-opponent constraint
        let iterations = 0;
        const maxIterations = 1000;
        
        while (iterations < maxIterations) {
            iterations++;
            
            // Find teams that still need games
            const teamsNeedingGames = Object.entries(remainingNeeded)
                .filter(([team, needed]) => needed > 0)
                .map(([team]) => team);
            
            if (teamsNeedingGames.length === 0) break;
            
            // Find valid games: both teams need games AND doesn't violate shared-opponent constraint
            const validGames = availableGames.filter(game => {
                if (selectedGameIds.has(getGameId(game))) return false;
                if (remainingNeeded[game.team1] <= 0 || remainingNeeded[game.team2] <= 0) return false;
                
                // Check shared-opponent constraint for both teams
                if (violatesSharedOpponentConstraint(game, game.team1)) return false;
                if (violatesSharedOpponentConstraint(game, game.team2)) return false;
                
                return true;
            });
            
            if (validGames.length === 0) {
                console.warn('Could not fully satisfy game constraints with shared-opponent restriction.');
                break;
            }
            
            // Select a random valid game
            const randomIndex = Math.floor(randomFn() * validGames.length);
            selectGame(validGames[randomIndex]);
        }
        
        return selectedGameIds;
    }

    /**
     * Assign flex order (1 through n) to each team for rebalancing priority.
     * Lower flex number = higher priority for rebalancing.
     * 
     * Sorting criteria:
     * 1. Fewer scheduled games this week (teams with 1 game before teams with 2)
     * 2. Tiebreaker: More games remaining in season
     * 3. Tiebreaker: Random (using seeded random)
     * 
     * @param {Object} gamesPerTeam - Map of teamName -> number of games scheduled this week
     * @param {Object} remainingGamesPerTeam - Map of teamName -> total remaining games in season
     * @param {Function} randomFn - Seeded random function
     * @returns {Object} - Map of teamName -> flex score (1 to n)
     */
    function assignFlexOrder(gamesPerTeam, remainingGamesPerTeam, randomFn) {
        if (!gamesPerTeam) return {};
        
        // Create array of teams with their sorting criteria
        const teams = Object.keys(gamesPerTeam).map(teamName => ({
            teamName,
            scheduledGames: gamesPerTeam[teamName] || 0,
            remainingGames: remainingGamesPerTeam[teamName] || 0,
            randomValue: randomFn() // For tiebreaking
        }));
        
        // Sort by criteria
        teams.sort((a, b) => {
            // 1. Fewer scheduled games first (ascending)
            if (a.scheduledGames !== b.scheduledGames) {
                return a.scheduledGames - b.scheduledGames;
            }
            // 2. More remaining games first (descending)
            if (a.remainingGames !== b.remainingGames) {
                return b.remainingGames - a.remainingGames;
            }
            // 3. Random tiebreaker
            return a.randomValue - b.randomValue;
        });
        
        // Assign flex scores (1 to n)
        const flexOrder = {};
        teams.forEach((team, index) => {
            flexOrder[team.teamName] = index + 1;
        });
        
        return flexOrder;
    }

    /**
     * Log all weekly schedule information to console.
     * Called after all calculations are complete.
     */
    function logWeeklySchedule(gamesPerTeam, remainingGamesPerTeam, teamXValues, totalGamesTarget, selectedGameIds, flexOrder, unplayedGames) {
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║            WEEKLY CROKINOLE SCHEDULE                           ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('Thursday seed:', thursdaySeed);
        console.log('Sessions remaining:', SESSION_COUNT);
        console.log('');
        
        // Team breakdown with flex scores
        console.log('┌─────────────────────────────────────────────────────────────────┐');
        console.log('│ TEAM BREAKDOWN                                                  │');
        console.log('├─────────────────────────────────────────────────────────────────┤');
        Object.entries(gamesPerTeam)
            .sort((a, b) => (flexOrder[a[0]] || 999) - (flexOrder[b[0]] || 999))
            .forEach(([team, games]) => {
                const X = teamXValues[team]?.toFixed(2) || '?';
                const remaining = remainingGamesPerTeam[team] || 0;
                const flex = flexOrder[team] || '?';
                console.log(`│ ${team.padEnd(15)} | ${games} game(s) this week | ${remaining.toString().padStart(2)} remaining | X=${X} | Flex: ${flex}`);
            });
        console.log('└─────────────────────────────────────────────────────────────────┘');
        console.log('');
        console.log(`Target games this week: ${totalGamesTarget} (${totalGamesTarget % 2 === 0 ? 'even ✓' : 'odd ✗'})`);
        console.log('');
        
        // Selected games
        console.log('┌─────────────────────────────────────────────────────────────────┐');
        console.log('│ SELECTED GAMES FOR THIS WEEK                                    │');
        console.log('├─────────────────────────────────────────────────────────────────┤');
        const selectedGamesArray = unplayedGames.filter(g => selectedGameIds.has(getGameId(g)));
        if (selectedGamesArray.length === 0) {
            console.log('│ No games selected                                               │');
        } else {
            selectedGamesArray.forEach(game => {
                const flex1 = flexOrder[game.team1] || '?';
                const flex2 = flexOrder[game.team2] || '?';
                const board = game.isHome ? HOME_GAME_STRING : AWAY_GAME_STRING;
                console.log(`│ ${game.team1} (Flex:${flex1}) vs ${game.team2} (Flex:${flex2}) @ ${board}`);
            });
        }
        console.log('└─────────────────────────────────────────────────────────────────┘');
        console.log(`Total selected: ${selectedGameIds.size} games`);
        console.log('');
        
        // Flex order
        console.log('┌─────────────────────────────────────────────────────────────────┐');
        console.log('│ FLEX ORDER (Rebalancing Priority)                               │');
        console.log('├─────────────────────────────────────────────────────────────────┤');
        Object.entries(flexOrder)
            .sort((a, b) => a[1] - b[1])
            .forEach(([team, flex]) => {
                const scheduled = gamesPerTeam[team] || 0;
                const remaining = remainingGamesPerTeam[team] || 0;
                console.log(`│ ${flex.toString().padStart(2)}. ${team.padEnd(15)} (${scheduled} scheduled, ${remaining} remaining)`);
            });
        console.log('└─────────────────────────────────────────────────────────────────┘');
        console.log('');
    }

    // Configuration
    const config = {
        fileName: FILE_NAME, // Your Excel file name
        sheetsToLoad: [HOME_GAMES_PAGE_NAME, AWAY_GAMES_PAGE_NAME, TEAM_INFO_PAGE_NAME], // Which sheets to load (by index or names)
    };
    
    onMount(async () => {
        await loadTournamentPoints();
        await loadExcelData();
        // Add smooth scrolling to all anchor links
        const links = document.querySelectorAll('a[href^="#"]');
        
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                if (!targetId) return;
                
                const targetElement = document.querySelector(targetId);
                
                if (targetElement) {
                    // You can adjust the offset here (e.g., for fixed headers)
                    const offset = 80; // Adjust based on your header height
                    const elementPosition = targetElement.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - offset;
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Update URL without jumping
                    history.pushState(null, null, targetId);
                }
            });
        });
        
        // Handle scroll events
        const handleScroll = () => {
            // Update scroll progress
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            // scrollProgress = (winScroll / height) * 100;
            
            // // Show/hide back to top button
            // showBackToTop = winScroll > 300;
        };
        
        window.addEventListener('scroll', handleScroll);
        
        // Handle direct navigation to hash
        if (window.location.hash) {
            setTimeout(() => {
                const target = document.querySelector(window.location.hash);
                if (target) {
                    const offset = 80;
                    const elementPosition = target.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - offset;
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }

        const tableWrappers = document.querySelectorAll('.table-wrapper');
        
        tableWrappers.forEach(wrapper => {
            const table = wrapper.querySelector('table');
            
            // Check if table is wider than wrapper
            if (table.scrollWidth > wrapper.clientWidth) {
                wrapper.setAttribute('data-scrollable', '');
                
                // Remove indicator after first scroll
                wrapper.addEventListener('scroll', function() {
                    this.classList.add('has-scrolled');
                }, { once: true });
            }
        });
        
        // Cleanup
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    });

    async function loadTournamentPoints() {
        try {
            const response = await fetch(TOURNAMENT_POINTS_FILE);
            if (response.ok) {
                tournamentPoints = await response.json();
                console.log('Tournament points loaded:', tournamentPoints);
            } else {
                console.log('No tournament points file found, using empty object');
                tournamentPoints = {};
            }
        } catch (err) {
            console.log('Error loading tournament points, using empty object:', err);
            tournamentPoints = {};
        }
    }

    // Helper function to get tournament points for a team
    function getTournamentPoints(teamName) {
        return tournamentPoints[teamName] || 0;
    }

    async function loadExcelData() {
        loading = true;
        error = null;
        
        try {
            // Fetch the Excel file
            const response = await fetch(`/${config.fileName}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load ${config.fileName}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            
            // Parse the Excel file
            const workbook = XLSX.read(arrayBuffer, {
                type: 'array',
                cellDates: true,
                cellNF: false,
                cellText: false
            });
            
            // Load specified sheets
            const sheetsToLoad = config.sheetsToLoad.map(sheet => {
                if (typeof sheet === 'number') {
                    return workbook.SheetNames[sheet];
                }
                return sheet;
            }).filter(name => name && workbook.SheetNames.includes(name));
            
            // Extract data from each sheet
            sheetsToLoad.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                
                // Convert to JSON (array of objects with column headers as keys)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    defval: '', // Default value for empty cells
                    blankrows: false // Skip blank rows
                });
                
                // Also get raw array data if needed
                const arrayData = XLSX.utils.sheet_to_json(worksheet, {
                    header: 1, // Get as array of arrays
                    defval: '',
                    blankrows: false
                });
                
                // Filter out empty headers and clean the data
                const rawHeaders = arrayData[0] || [];
                const validHeaderIndices = [];
                const cleanHeaders = [];
                
                // Identify valid headers (non-empty, non-whitespace)
                rawHeaders.forEach((header, index) => {
                    const cleanedHeader = typeof header === 'string' ? header.trim() : header;
                    if (cleanedHeader !== '' && cleanedHeader !== null && cleanedHeader !== undefined) {
                        validHeaderIndices.push(index);
                        cleanHeaders.push(cleanedHeader);
                    }
                });
                
                // Filter rows to only include columns with valid headers
                const cleanRows = arrayData.slice(1).map(row => {
                    return validHeaderIndices.map(index => row[index] || '');
                });
                
                // Clean JSON data to remove empty-header properties
                const cleanJsonData = jsonData.map(row => {
                    const cleanedRow = {};
                    for (const key in row) {
                        const cleanedKey = typeof key === 'string' ? key.trim() : key;
                        // Only include properties with non-empty keys
                        if (cleanedKey !== '' && cleanedKey !== null && cleanedKey !== undefined) {
                            cleanedRow[cleanedKey] = row[key];
                        }
                    }
                    return cleanedRow;
                });
                
                // Store both formats with cleaned data
                excelData[sheetName] = {
                    json: cleanJsonData, // Array of objects with cleaned keys
                    array: [cleanHeaders, ...cleanRows], // Array of arrays with valid columns only
                    headers: cleanHeaders, // Valid headers only
                    rows: cleanRows, // Data rows with valid columns only
                };
                
                console.log(`Loaded ${sheetName}:`, {
                    headers: cleanHeaders,
                    rowCount: cleanRows.length,
                    sampleRow: cleanJsonData[0]
                });
            });
            
            team_names = getTeams(HOME_GAMES_PAGE_NAME);

            let teamInfo = pullTeamInfo();
            console.log('teamInfo');
            console.log(teamInfo);
            teams_info = pullWinsInfo(teamInfo);
            console.log('TEAMS INFO!');
            console.log(teams_info);

            let teamsWithScores = teams_info.map(team => {
                const tourneyPts = getTournamentPoints(team.teamName);
                return {
                    ...team,
                    tournamentPoints: tourneyPts,
                    score: (WIN_SCORE * team.wins) + (TIES_SCORE * team.ties) + (SERIES_WIN_SCORE * team.seriesWins) + tourneyPts,
                    gamesPlayed: team.wins + team.ties + team.losses
                };
            });
            
            let ranking = teamsWithScores.sort((a, b) => {
                if (a.score !== b.score) {
                    return -1 * (a.score - b.score);
                }

                if (a.pointDiff !== b.pointDiff) {
                    return -1 * (a.pointDiff - b.pointDiff);
                }

                return a.gamesPlayed - b.gamesPlayed;
            });

            teamsWithRanking = ranking.map((team, index) => ({
                ...team,
                ranking: index + 1
            }));

            sortTable('ranking');
                
            dataReady = true;
            // Log the loaded data for debugging
            console.log('Excel data loaded:', excelData);
                
        } catch (err) {
            error = err.message;
            console.error('Error loading Excel file:', err);
        } finally {
            loading = false;
        }
    }
    
    // Helper functions to access data
    function getSheetData(sheetName, format = 'json') {
        if (!excelData[sheetName]) return null;
        return excelData[sheetName][format];
    }
    
    function getColumnData(sheetName, columnIndex) {
        const sheet = excelData[sheetName];
        if (!sheet) return [];
        
        return sheet.rows.map(row => row[columnIndex] || '');
    }
    
    function getRowData(sheetName, rowIndex) {
        const sheet = excelData[sheetName];
        if (!sheet) return [];
        
        return sheet.rows[rowIndex] || [];
    }

    function getTeams(sheetName) {
        const sheet = excelData[sheetName];
        const tempTeams = [...sheet.headers]
        tempTeams.shift()
        return tempTeams;
    }
    
    // Pull the Team Info
    function pullTeamInfo() {
        const teamData = getSheetData('TeamInfo', 'json');
        console.log("the data")
        console.log(teamData)
        console.log(teamData[0])
        console.log(teamData[0]["Player 1"])
        let final_info = teamData.map((info) => ({
            teamName: info.name,
            player1: info["Player 1"],
            player2: info["Player 2"]
        }))
        
        return final_info;
    }

    // returns true if game value is unplayed
    function isUnplayed(game_value) {
        return (typeof game_value === "string") && ((game_value === UNPLAYED_STRING) || (game_value === WONT_PLAY_STRING));
    }

    function isValidGame(game_value) {
        return (typeof game_value === "number") || (game_value === UNPLAYED_STRING);
    }

    function update_team_for_game(team_info, score) {
        if (score > 0) {
            team_info.wins += 1
        } else if (score < 0) {  
            team_info.losses += 1
        }
        else {
            team_info.ties += 1
        }
        team_info.pointDiff += score
        
    }

    function update_series(team_info, home_score, away_score) {
        const combined_score = home_score + away_score
        if (combined_score > 0) {
            team_info.seriesWins += 1
        } else if (combined_score < 0) {
            team_info.seriesLosses += 1
        } else {
            throw new Error("Given a series that ended in a tie");
        }
    }


    function update_for_series(team_info, home_result, away_result) {
        if (home_result === undefined || away_result === undefined) {
            throw new Error(`Given a result that is undefined | Home: ${home_result}, Away: ${away_result}`)
        }

        if (!isUnplayed(home_result)) {
            update_team_for_game(team_info, home_result)
        }

        if (!isUnplayed(away_result)) {
            update_team_for_game(team_info, away_result)
        }

        if (!isUnplayed(home_result) && !isUnplayed(away_result)) {
            update_series(team_info, home_result, away_result);
        }
        
        
    }


    function pullWinsInfo(teamInfo) {
        const homeGames = getSheetData(HOME_GAMES_PAGE_NAME, 'json');
        const awayGames = getSheetData(AWAY_GAMES_PAGE_NAME, 'json');
        return teamInfo.map((val, idx) => {
            let teamInfo = {
                ...val,
                wins: 0,
                losses: 0,
                ties: 0,
                pointDiff: 0,
                seriesWins: 0,
                seriesLosses: 0,
            }
            function compare_names(row) {
                return row.teamName.toLowerCase() === val.teamName.toLowerCase();
            }
            const homeRowIndex = homeGames.findIndex(compare_names);
            if (homeRowIndex === -1) {
                console.log(homeGames)
                throw Error(`unable to find name in home games: name: ${val.teamName}`)
            }
            const awayRowIndex = awayGames.findIndex(compare_names);
            if (awayRowIndex === -1) {
                console.log(awayGames)
                throw Error(`unable to find name in home games: name: ${val.teamName}`)
            }

            const homeRow = homeGames[homeRowIndex];
            const awayRow = awayGames[awayRowIndex];
            team_names.forEach((team_name) => {
                if (team_name === homeRow.name) {
                    return;
                }
                let homeResult = homeRow[team_name]
                if (homeResult === undefined) {
                    console.log(`error home undefined Name: ${team_name}`)
                    throw new Error('Home result is undefined')
                }
                let awayResult = awayRow[team_name]
                if (awayResult === undefined) {
                    console.log(`error away undefined Name: ${team_name}`)
                    throw new Error('Home result is undefined')
                }
                update_for_series(teamInfo, homeResult, awayResult)
            })


            return teamInfo
        }
        
        )
    }


    // Sample data structure - replace with your actual data
    
    // Sort configuration
    let sortColumn = 'ranking';
    let sortDirection = 'desc';
    // Add this computed property to calculate scores before sorting
    
    // Update sort function to work with the computed scores
    let sortedTeams = [];
    
    function sortTable(column) {
        if (sortColumn === column) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn = column;
            sortDirection = ['teamName', 'player1', 'player2'].includes(column) ? 'asc' : 'desc';
        }
        if (teamsWithRanking !== undefined) {
            sortedTeams = [...teamsWithRanking].sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];
            
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });
        }
    }
    
    // Update getSortIndicator to use proper arrows
    function getSortIndicator(column) {
        if (sortColumn !== column) return '';
        return sortDirection === 'asc' ? '↑' : '↓';
    }

    let allGames = [
        { team1: "Thunder Hawks", player1_team1: "John", player2_team1: "Sarah", team2: "Lightning Bolts", player1_team2: "Mike", player2_team2: "Emma", isHome: false, played: false },
        { team1: "Thunder Hawks", player1_team1: "John", player2_team1: "Sarah", team2: "Fire Dragons", player1_team2: "Alex", player2_team2: "Lisa", isHome: true, played: false },
        { team1: "Lightning Bolts", player1_team1: "Mike", player2_team1: "Emma", team2: "Ice Wolves", player1_team2: "Tom", player2_team2: "Jane", isHome: false, played: false },
        { team1: "Fire Dragons", player1_team1: "Alex", player2_team1: "Lisa", team2: "Storm Eagles", player1_team2: "John", player2_team2: "Kate", isHome: false, played: false },
        { team1: "Fire Dragons", player1_team1: "Alex", player2_team1: "Lisa", team2: "Storm Eagles", player1_team2: "John", player2_team2: "Kate", isHome: true, played: false },
        // Add more games...
    ];
    
    // State variables
    let playerName = '';
    let filteredGames = [];
    let hiddenTeams = new Set(); // Teams to hide from the display
    let teamGameCounts = {};
    let rebalancedGameIds = new Set(); // Track games added through rebalancing
    
    // Generate a unique ID for a game (for tracking suggestions)
    function getGameId(game) {
        return `${game.team1}-${game.team2}-${game.isHome}`;
    }
    
    // Check if a game is scheduled for this week (original or rebalanced)
    function isGameSuggested(game) {
        const gameId = getGameId(game);
        return selectedGamesThisWeek.has(gameId) || rebalancedGameIds.has(gameId);
    }
    
    // Check if a game was added through rebalancing (for different styling if needed)
    function isGameRebalanced(game) {
        return rebalancedGameIds.has(getGameId(game));
    }
    
    /**
     * Rebalance the schedule when players are hidden.
     * Adds replacement games for teams that lost scheduled games due to hidden players.
     */
    function rebalanceSchedule() {
        rebalancedGameIds = new Set();
        
        if (!dataReady || !allGames.length || hiddenTeams.size === 0) {
            return;
        }
        
        const unplayedGames = allGames.filter(g => !g.played);
        
        // Step 1: Find removed edges (scheduled games that are now invalid)
        const removedEdges = [];
        unplayedGames.forEach(game => {
            if (!selectedGamesThisWeek.has(getGameId(game))) return; // Not a scheduled game
            
            const team1Hidden = hiddenTeams.has(game.team1);
            const team2Hidden = hiddenTeams.has(game.team2);
            
            if (team1Hidden || team2Hidden) {
                removedEdges.push({
                    game,
                    team1Hidden,
                    team2Hidden
                });
            }
        });
        
        if (removedEdges.length === 0) return;
        
        // Step 2: Filter removed edges and count games needed per team
        const gamesNeeded = {}; // teamName -> count of replacement games needed
        
        removedEdges.forEach(edge => {
            // If both teams hidden, ignore
            if (edge.team1Hidden && edge.team2Hidden) return;
            
            // The present team needs a replacement
            if (!edge.team1Hidden) {
                gamesNeeded[edge.game.team1] = (gamesNeeded[edge.game.team1] || 0) + 1;
            }
            if (!edge.team2Hidden) {
                gamesNeeded[edge.game.team2] = (gamesNeeded[edge.game.team2] || 0) + 1;
            }
        });
        
        if (Object.keys(gamesNeeded).length === 0) return;
        
        console.log('🔄 REBALANCING DEBUG 🔄');
        console.log('Games needed:', gamesNeeded);
        
        // Track which games have been used as replacements
        const usedGameIds = new Set();
        
        // Track which opponent pairings have been made (to prevent same opponent twice)
        // Key: "teamA-teamB" (sorted alphabetically), Value: true
        const usedPairings = new Set();
        
        function getPairingKey(teamA, teamB) {
            return [teamA, teamB].sort().join('-');
        }
        
        // Helper: Find available games between two teams
        function getAvailableGameBetween(teamA, teamB) {
            // Check if this pairing has already been used
            if (usedPairings.has(getPairingKey(teamA, teamB))) return null;
            
            return unplayedGames.find(game => {
                const gameId = getGameId(game);
                // Not already scheduled or used as replacement
                if (selectedGamesThisWeek.has(gameId) || usedGameIds.has(gameId)) return false;
                // Not involving hidden teams
                if (hiddenTeams.has(game.team1) || hiddenTeams.has(game.team2)) return false;
                // Is between these two teams
                return (game.team1 === teamA && game.team2 === teamB) ||
                       (game.team1 === teamB && game.team2 === teamA);
            });
        }
        
        // Helper: Get players for a team
        function getPlayersForTeam(teamName) {
            const teamInfo = teams_info?.find(t => t.teamName === teamName);
            if (!teamInfo) return [];
            return [teamInfo.player1?.toLowerCase(), teamInfo.player2?.toLowerCase()].filter(Boolean);
        }
        
        // Helper: Count scheduled games for a player (original + rebalanced so far)
        function countPlayerGames(playerName) {
            const playerLower = playerName.toLowerCase();
            let count = 0;
            
            // Count original scheduled games (that aren't cancelled due to hidden teams)
            unplayedGames.forEach(game => {
                if (!selectedGamesThisWeek.has(getGameId(game))) return;
                if (hiddenTeams.has(game.team1) || hiddenTeams.has(game.team2)) return;
                
                const players = [
                    game[PLAYER1_TEAM1]?.toLowerCase(),
                    game[PLAYER2_TEAM1]?.toLowerCase(),
                    game[PLAYER1_TEAM2]?.toLowerCase(),
                    game[PLAYER2_TEAM2]?.toLowerCase()
                ];
                if (players.includes(playerLower)) count++;
            });
            
            // Count rebalanced games assigned so far
            rebalancedGameIds.forEach(gameId => {
                const game = unplayedGames.find(g => getGameId(g) === gameId);
                if (!game) return;
                
                const players = [
                    game[PLAYER1_TEAM1]?.toLowerCase(),
                    game[PLAYER2_TEAM1]?.toLowerCase(),
                    game[PLAYER1_TEAM2]?.toLowerCase(),
                    game[PLAYER2_TEAM2]?.toLowerCase()
                ];
                if (players.includes(playerLower)) count++;
            });
            
            return count;
        }
        
        // Helper: Check if adding a game to a team would exceed any player's max
        function wouldExceedPlayerMax(teamName) {
            const players = getPlayersForTeam(teamName);
            for (const player of players) {
                const currentGames = countPlayerGames(player);
                const maxGames = maxGamesPerPlayer[player] || 999;
                if (currentGames >= maxGames) {
                    return true;
                }
            }
            return false;
        }
        
        // Step 3: Get teams sorted by flex order
        const teamsNeedingGames = Object.keys(gamesNeeded)
            .sort((a, b) => (flexOrder[a] || 999) - (flexOrder[b] || 999));
        
        console.log('Teams needing games (sorted by flex):', teamsNeedingGames);
        
        // Phase 1: Match teams that lost games with each other
        console.log('--- PHASE 1: Matching teams that lost games with each other ---');
        const teamsInNeedSet = new Set(teamsNeedingGames);
        
        for (const teamA of teamsNeedingGames) {
            while (gamesNeeded[teamA] > 0) {
                // Find best partner from teams that also need games
                let bestPartner = null;
                let bestGame = null;
                
                for (const teamB of teamsNeedingGames) {
                    if (teamB === teamA) continue;
                    if (gamesNeeded[teamB] <= 0) continue;
                    
                    const game = getAvailableGameBetween(teamA, teamB);
                    if (game) {
                        // Take the first valid one (already sorted by flex)
                        bestPartner = teamB;
                        bestGame = game;
                        break;
                    }
                }
                
                if (bestGame) {
                    const gameId = getGameId(bestGame);
                    usedGameIds.add(gameId);
                    rebalancedGameIds.add(gameId);
                    usedPairings.add(getPairingKey(teamA, bestPartner)); // Track this pairing
                    gamesNeeded[teamA]--;
                    gamesNeeded[bestPartner]--;
                    console.log(`Phase 1: Paired ${teamA} with ${bestPartner}`);
                } else {
                    // No partner found in Phase 1, move to Phase 2
                    console.log(`Phase 1: No partner found for ${teamA} in Phase 1 (${gamesNeeded[teamA]} games still needed)`);
                    break;
                }
            }
        }
        
        // Log remaining games needed after Phase 1
        const remainingAfterPhase1 = Object.entries(gamesNeeded).filter(([t, c]) => c > 0);
        console.log('--- END PHASE 1 ---');
        console.log('Games still needed after Phase 1:', Object.fromEntries(remainingAfterPhase1));
        
        // Phase 2: Match remaining teams with teams that didn't lose games
        console.log('--- PHASE 2: Matching with teams that did not lose games ---');
        const teamsGivenGamesInPhase2 = new Set();
        
        for (const teamA of teamsNeedingGames) {
            while (gamesNeeded[teamA] > 0) {
                // Find best partner from teams NOT in the needing set
                let bestPartner = null;
                let bestGame = null;
                
                // Get all teams sorted by flex (any team that isn't hidden and hasn't been given a replacement game in phase 2)
                const otherTeams = Object.keys(flexOrder)
                    .filter(t => t !== teamA && !hiddenTeams.has(t))
                    .sort((a, b) => (flexOrder[a] || 999) - (flexOrder[b] || 999));
                
                for (const teamB of otherTeams) {
                    // Skip if already given a game in phase 2
                    if (teamsGivenGamesInPhase2.has(teamB)) continue;
                    
                    // Skip if adding a game would exceed any of teamB's players' max games
                    if (wouldExceedPlayerMax(teamB)) {
                        console.log(`Phase 2: Skipping ${teamB} - player(s) at max games`);
                        continue;
                    }
                    
                    const game = getAvailableGameBetween(teamA, teamB);
                    if (game) {
                        bestPartner = teamB;
                        bestGame = game;
                        break;
                    }
                }
                
                if (bestGame) {
                    const gameId = getGameId(bestGame);
                    usedGameIds.add(gameId);
                    rebalancedGameIds.add(gameId);
                    usedPairings.add(getPairingKey(teamA, bestPartner)); // Track this pairing
                    gamesNeeded[teamA]--;
                    teamsGivenGamesInPhase2.add(bestPartner);
                    console.log(`Phase 2: Paired ${teamA} with ${bestPartner}`);
                } else {
                    // No partner found at all
                    console.log(`Could not find replacement for ${teamA} (${gamesNeeded[teamA]} games still needed)`);
                    break;
                }
            }
        }
        
        console.log('--- END PHASE 2 ---');
        const remainingAfterPhase2 = Object.entries(gamesNeeded).filter(([t, c]) => c > 0);
        if (remainingAfterPhase2.length > 0) {
            console.log('⚠️ Games still needed after Phase 2 (unfulfilled):', Object.fromEntries(remainingAfterPhase2));
        } else {
            console.log('✅ All replacement games found!');
        }
        
        console.log('Rebalanced games:', [...rebalancedGameIds]);
        rebalancedGameIds = new Set(rebalancedGameIds); // Trigger reactivity
    }
    
    // Get the opponent team for a game given the player's perspective
    function getOpponentTeamForPlayer(game, searchName) {
        const playerInTeam1 = game[PLAYER1_TEAM1].toLowerCase().includes(searchName) || 
                             game[PLAYER2_TEAM1].toLowerCase().includes(searchName);
        return playerInTeam1 ? game.team2 : game.team1;
    }
    
    // Filter games based on player name
    function filterGamesByPlayer() {
        if (!playerName.trim()) {
            filteredGames = [];
            teamGameCounts = {};
            return;
        }
        
        const searchName = playerName.toLowerCase().trim();
        const showAll = searchName === 'all';
        
        let playerGames;
        
        if (showAll) {
            // Show all scheduled games (original + rebalanced)
            playerGames = allGames.filter(game => {
                if (game.played) return false;
                return isGameSuggested(game);
            });
        } else {
            // Filter games where the player is involved and not yet played
            playerGames = allGames.filter(game => {
                if (game.played) return false;
                
                const playerInTeam1 = game[PLAYER1_TEAM1].toLowerCase().includes(searchName) || 
                                     game[PLAYER1_TEAM2].toLowerCase().includes(searchName);
                const playerInTeam2 = game[PLAYER2_TEAM1].toLowerCase().includes(searchName) || 
                                     game[PLAYER2_TEAM2].toLowerCase().includes(searchName);
                
                return playerInTeam1 || playerInTeam2;
            });
        }
        
        // Apply hidden teams filter
        filteredGames = playerGames.filter(game => {
            return !hiddenTeams.has(game.team1) && !hiddenTeams.has(game.team2);
        });
        
        // Sort games:
        // 1. Scheduled games (suggested) at the top
        // 2. Non-scheduled games sorted by opponent's flex score (lowest first)
        filteredGames = filteredGames.sort((a, b) => {
            const aSuggested = isGameSuggested(a);
            const bSuggested = isGameSuggested(b);
            
            // Scheduled games first
            if (aSuggested && !bSuggested) return -1;
            if (!aSuggested && bSuggested) return 1;
            
            // For non-scheduled games, sort by opponent's flex score (lowest first)
            if (!aSuggested && !bSuggested && !showAll) {
                const aOpponent = getOpponentTeamForPlayer(a, searchName);
                const bOpponent = getOpponentTeamForPlayer(b, searchName);
                const aFlex = flexOrder[aOpponent] || 999;
                const bFlex = flexOrder[bOpponent] || 999;
                return aFlex - bFlex;
            }
            
            return 0;
        });
        
        // Count games per team
        updateTeamCounts();
    }
    
    // Update team game counts - fixed to track all teams
    function updateTeamCounts() {
        teamGameCounts = {};
        const searchName = playerName.toLowerCase().trim();
        const showAll = searchName === 'all';
        
        // First pass: count all games including hidden ones
        allGames.forEach(game => {
            if (game.played) return;
            
            if (showAll) {
                // For "all", count scheduled games by team
                if (isGameSuggested(game)) {
                    teamGameCounts[game.team1] = (teamGameCounts[game.team1] || 0) + 1;
                    teamGameCounts[game.team2] = (teamGameCounts[game.team2] || 0) + 1;
                }
            } else {
                // Check which team the player is on
                const playerInTeam1 = game[PLAYER1_TEAM1].toLowerCase().includes(searchName) || 
                                     game[PLAYER2_TEAM1].toLowerCase().includes(searchName);
                const playerInTeam2 = game[PLAYER1_TEAM2].toLowerCase().includes(searchName) || 
                                     game[PLAYER2_TEAM2].toLowerCase().includes(searchName);
                
                if (playerInTeam1 || playerInTeam2) {
                    if (playerInTeam1) {
                        teamGameCounts[game.team1] = (teamGameCounts[game.team1] || 0) + 1;
                    }
                    if (playerInTeam2) {
                        teamGameCounts[game.team2] = (teamGameCounts[game.team2] || 0) + 1;
                    }
                }
            }
        });
    }
    
    // Toggle team filter
    function toggleTeamFilter(teamName) {
        if (hiddenTeams.has(teamName)) {
            hiddenTeams.delete(teamName);
        } else {
            hiddenTeams.add(teamName);
        }
        hiddenTeams = new Set(hiddenTeams); // Trigger reactivity
        rebalanceSchedule(); // Rebalance after hiding/showing teams
        filterGamesByPlayer(); // Re-filter games
    }
    
    // Get all unique players from all games (for the player toggle buttons)
    function getAllPlayers() {
        if (!teams_info) return [];
        
        const playersSet = new Set();
        teams_info.forEach(team => {
            if (team.player1) playersSet.add(team.player1);
            if (team.player2) playersSet.add(team.player2);
        });
        
        return Array.from(playersSet).sort();
    }
    
    // Get teams for a specific player
    function getTeamsForPlayer(playerNameToFind) {
        if (!teams_info) return [];
        
        const playerLower = playerNameToFind.toLowerCase();
        return teams_info
            .filter(team => 
                team.player1?.toLowerCase() === playerLower || 
                team.player2?.toLowerCase() === playerLower
            )
            .map(team => team.teamName);
    }
    
    // Check if a player is "hidden" (all their teams are hidden)
    function isPlayerHidden(playerNameToCheck) {
        const teams = getTeamsForPlayer(playerNameToCheck);
        if (teams.length === 0) return false;
        return teams.every(team => hiddenTeams.has(team));
    }
    
    // Toggle all teams for a player
    function togglePlayerFilter(playerNameToToggle) {
        const teams = getTeamsForPlayer(playerNameToToggle);
        const allHidden = isPlayerHidden(playerNameToToggle);
        
        if (allHidden) {
            // Show all teams for this player
            teams.forEach(team => hiddenTeams.delete(team));
        } else {
            // Hide all teams for this player
            teams.forEach(team => hiddenTeams.add(team));
        }
        
        hiddenTeams = new Set(hiddenTeams); // Trigger reactivity
        rebalanceSchedule(); // Rebalance after hiding/showing teams
        filterGamesByPlayer(); // Re-filter games
    }
    
    // Reactive: Get all players for display (only after data is loaded)
    $: allPlayers = dataReady && teams_info ? getAllPlayers() : [];
    $: if (dataReady) console.log('🎯 ALL PLAYERS DEBUG 🎯', allPlayers);
    $: if (dataReady) console.log('🎯 TEAMS INFO DEBUG 🎯', teams_info);
    
    // Get player's team for a specific game
    function getPlayerTeam(game) {
        const searchName = playerName.toLowerCase().trim();
        const playerInTeam1 = game[PLAYER1_TEAM1].toLowerCase().includes(searchName) || 
                             game[PLAYER2_TEAM1].toLowerCase().includes(searchName);
        
        return playerInTeam1 ? game.team1 : game.team2;
    }
    
    // Get opponent team for a specific game
    function getOpponentTeam(game) {
        const playerTeam = getPlayerTeam(game);
        return playerTeam === game.team1 ? game.team2 : game.team1;
    }
    
    // Reset filters
    function resetFilters() {
        hiddenTeams.clear();
        rebalancedGameIds = new Set(); // Clear rebalanced games
        filterGamesByPlayer();
    }

    function getInfoForTeam(teams_info, team_name) {
        let result = undefined
        teams_info.forEach((val) => {
            if (val[TEAM_NAME].toLowerCase() === team_name.toLowerCase()) {
                result = val;
            }
        })

        return result
    }
    
    // Total games count
    $: shownGames = filteredGames.length;
    
    // Check if we're in "all" mode
    $: isAllMode = playerName.toLowerCase().trim() === 'all';
    
    // Total unplayed games in the season
    $: totalUnplayedGames = allGames.filter(g => !g.played).length;

    // Filter played games for the player, organized by team
    $: playedGames = (() => {
        if (!playerName || !allGames.length) return [];
        
        const searchName = playerName.toLowerCase().trim();
        if (!searchName) return [];
        
        return allGames.filter(game => {
            if (!game.played) return false;
            
            const playerInTeam1 = game[PLAYER1_TEAM1].toLowerCase().includes(searchName) || 
                                 game[PLAYER2_TEAM1].toLowerCase().includes(searchName);
            const playerInTeam2 = game[PLAYER1_TEAM2].toLowerCase().includes(searchName) || 
                                 game[PLAYER2_TEAM2].toLowerCase().includes(searchName);
            
            return playerInTeam1 || playerInTeam2;
        });
    })();

    // Group played games by the player's team with all display data pre-computed
    $: playedGamesByTeam = (() => {
        if (!playedGames.length) return {};
        
        const searchName = playerName.toLowerCase().trim();
        const grouped = {};
        
        console.log('=== GROUPING PLAYED GAMES ===');
        console.log('Search name:', searchName);
        console.log('Total played games:', playedGames.length);
        
        playedGames.forEach((game, index) => {
            console.log(`Game ${index}:`, game.team1, 'vs', game.team2);
            console.log(`  Player1_Team1: ${game[PLAYER1_TEAM1]}, Player2_Team1: ${game[PLAYER2_TEAM1]}`);
            console.log(`  Player1_Team2: ${game[PLAYER1_TEAM2]}, Player2_Team2: ${game[PLAYER2_TEAM2]}`);
            
            const playerInTeam1 = game[PLAYER1_TEAM1].toLowerCase().includes(searchName) || 
                                 game[PLAYER2_TEAM1].toLowerCase().includes(searchName);
            const playerInTeam2 = game[PLAYER1_TEAM2].toLowerCase().includes(searchName) || 
                                 game[PLAYER2_TEAM2].toLowerCase().includes(searchName);
            
            console.log(`  playerInTeam1: ${playerInTeam1}, playerInTeam2: ${playerInTeam2}`);
            
            // Add to team1's group if player is on team1
            if (playerInTeam1) {
                const playerTeam = game.team1;
                const opponentTeam = game.team2;
                const playerResult = game.result; // positive = team1 won
                
                let resultObj;
                if (playerResult > 0) {
                    resultObj = { text: 'W', class: 'win', diff: `+${playerResult}` };
                } else if (playerResult < 0) {
                    resultObj = { text: 'L', class: 'loss', diff: `${playerResult}` };
                } else {
                    resultObj = { text: 'D', class: 'draw', diff: '0' };
                }
                
                if (!grouped[playerTeam]) {
                    grouped[playerTeam] = [];
                }
                grouped[playerTeam].push({
                    opponentTeam,
                    result: resultObj,
                    board: game.isHome ? HOME_GAME_STRING : AWAY_GAME_STRING
                });
                console.log(`  Added to ${playerTeam} group`);
            }
            
            // Add to team2's group if player is on team2
            if (playerInTeam2) {
                const playerTeam = game.team2;
                const opponentTeam = game.team1;
                const playerResult = -game.result; // flip for team2 perspective
                
                let resultObj;
                if (playerResult > 0) {
                    resultObj = { text: 'W', class: 'win', diff: `+${playerResult}` };
                } else if (playerResult < 0) {
                    resultObj = { text: 'L', class: 'loss', diff: `${playerResult}` };
                } else {
                    resultObj = { text: 'D', class: 'draw', diff: '0' };
                }
                
                if (!grouped[playerTeam]) {
                    grouped[playerTeam] = [];
                }
                grouped[playerTeam].push({
                    opponentTeam,
                    result: resultObj,
                    board: game.isHome ? HOME_GAME_STRING : AWAY_GAME_STRING
                });
                console.log(`  Added to ${playerTeam} group`);
            }
        });
        
        console.log('=== FINAL GROUPED DATA ===');
        Object.entries(grouped).forEach(([team, games]) => {
            console.log(`${team}: ${games.length} games`, games);
        });
        
        return grouped;
    })();

    function gameInGames(games, team1, team2, isHome) {
        let gameExists = false;
        // if (team1 === 'TGIAJF' || team2 === 'TGIAJF') {
        //         console.log('high lvl', team1, team2, isHome, games)
        // }
        games.forEach((game) => {
            let alreadyExists = (game.team1.toLowerCase() === team1.toLowerCase())
                && (game.team2.toLowerCase() === team2.toLowerCase())
                && (game[IS_HOME] === isHome)
            let flippedExists = (game.team2.toLowerCase() === team1.toLowerCase())
                && (game.team1.toLowerCase() === team2.toLowerCase())
                && (game[IS_HOME] === isHome)

            // if (team1 === 'TGIAJF' || team2 === 'TGIAJF') {
            //     console.log(game.team1, game.team2, game, alreadyExists, flippedExists)
            // }

            if (alreadyExists || flippedExists)
            {
                gameExists = true;
            }
        })
        return gameExists
    }

    function generateGamesFromSheet(games, gamesMatrix, teams_info, isHomeGame) {
        console.log('generating games');
        console.log('team info', teams_info)
        gamesMatrix.forEach((game_row) => {
            const team_name = game_row[TEAM_NAME]
            for (const key in game_row) {
                const game_value = game_row[key]
                if (isValidGame(game_value) && (!gameInGames(games, team_name, key, isHomeGame))) {
                    const team1Info = getInfoForTeam(teams_info, team_name)
                    const team2Info = getInfoForTeam(teams_info, key)
                    if (team1Info === undefined || team2Info === undefined) {
                        throw Error(`undefined teamInfo ${team1Info} ${team2Info}`);
                    }
                    games.push({
                    team1: team1Info[TEAM_NAME],
                    player1_team1: team1Info[PLAYER_ONE],
                    player2_team1: team1Info[PLAYER_TWO],
                    team2: team2Info[TEAM_NAME],
                    player1_team2: team2Info[PLAYER_ONE],
                    player2_team2: team2Info[PLAYER_TWO],
                    played: !isUnplayed(game_value),
                    isHome: isHomeGame,
                    result: game_value
                    })
            }
            }
            
        })
    }
    
    // Generate games data from your Excel data
    function generateGamesData() {
        if (!dataReady) return [];
        
        const games = [];
        const teams_data = teams_info; // Your existing team info
        const homeGames = getSheetData(HOME_GAMES_PAGE_NAME, 'json');
        const awayGames = getSheetData(AWAY_GAMES_PAGE_NAME, 'json');

        generateGamesFromSheet(games, homeGames, teams_data, true);
        generateGamesFromSheet(games, awayGames, teams_data, false);
        
        console.log('done', games)
        return games;

    }
    
    // Update allGames when data is ready
    $: if (dataReady) {
        allGames = generateGamesData();
    }
    
    // Compute weekly schedule when data is ready
    let weeklyGamesPerTeam = {};
    let remainingGamesPerTeam = {};
    let selectedGamesThisWeek = new Set();
    let flexOrder = {};
    let maxGamesPerPlayer = {};
    
    $: if (dataReady && allGames.length > 0 && teams_info) {
        const unplayedGames = allGames.filter(g => !g.played);
        const randomFn = seededRandom(thursdaySeed);
        
        // Step 1: Compute how many games each team should play
        const result = computeGamesPerTeam(unplayedGames, teams_info, randomFn);
        weeklyGamesPerTeam = result.gamesPerTeam;
        remainingGamesPerTeam = result.remainingGamesPerTeam;
        maxGamesPerPlayer = result.maxGamesPerPlayer;
        
        // Step 2: Select specific games for this week
        selectedGamesThisWeek = selectGamesForWeek(weeklyGamesPerTeam, unplayedGames, seededRandom(thursdaySeed + 1));
        
        // Step 3: Assign flex order for rebalancing
        flexOrder = assignFlexOrder(weeklyGamesPerTeam, remainingGamesPerTeam, seededRandom(thursdaySeed + 2));
        
        // Step 4: Log everything to console
        logWeeklySchedule(
            weeklyGamesPerTeam, 
            remainingGamesPerTeam, 
            result.teamXValues, 
            result.totalGames, 
            selectedGamesThisWeek, 
            flexOrder, 
            unplayedGames
        );
        
        console.log('🎮 MAX GAMES PER PLAYER:', maxGamesPerPlayer);
    }

</script>

<svelte:head>
    <title>JP Flicks</title>
    <meta name="description" content="Crokinole better than ever">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta property="og:image" content={brownJPFlicksLogo}>
    <link rel="icon" type="image/svg+xml" href={brownJPFlicksLogo}>
</svelte:head>

<div class="page-background" bind:this={pageBackground}>
<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>JP Flicks - Season 2: The Crok Wars</h1>
        <p>
            Boston's premier Crokinole league <b>JP Flicks is back for a season 2</b>! We will meet <b>Thursdays at 7pm</b> and run till about 10pm.
            This seasons league is planned to go from late October to end of March and will <b>feature 2 tournaments</b> that will have their own prizes.
            Because of the longer format we only request that you believe you could make it to half the sessions and request to join no later than the 3rd session.
            <b>Check League Format for a full breakdown</b> of session dates and tournament dates. 
        </p>
        <Collapsible 
        id="league-format"
        title="League Format"
        variant="minimal"
        titleSize="1.75rem"
        titleWeight="300"
        titleColor="#1a202c"
        iconType="arrow"
        >
        <p>
            This seasons league will follow a similar format to the first with some changes. 
        </p>
            <div class="subsection">
            <h3>Similarities</h3>
            <ul>
                <li>Each person can sign up for up to 2 teams</li>
                <li>Each team will play each other up to 2 times (with the exception of you will never play yourself).</li>
                <li>Each game awards <a href="#point-per-game">points</a> based on outcome</li>
                <li>The winner of the league the team at the end with the most points!</li>
            </ul>
            <h3>Differences</h3>
            <ul>
                <li>More crokinole (8 more sessions to be exact)! Meaning more time to play, with a lower requirement to be there each week</li>
                <li>2 new <a href="#tournaments-section">Tournaments</a> that also award points</li>
                <li>Prizes for winning the league and each of the tournaments</li>
                <li>No longer an individual category</li>

            </ul>
            <h3>Schedule</h3>
            </div>

            <div class="table-wrapper">
                <table class="basic-table">
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Session 0</td>
                        <td>October 23rd</td>
                    </tr>
                    <tr>
                        <td>First Day of League</td>
                        <td>October 30th</td>
                    </tr>
                    <tr>
                        <td>Off for Thanksgiving</td>
                        <td>November 27th</td>
                    </tr>
                    <tr>
                        <td><b>Winter Tournament</b></td>
                        <td>December 11th</td>
                    </tr>
                    <tr>
                        <td>Beginning of holiday</td>
                        <td>December 17th</td>
                    </tr>
                    <tr>
                        <td>Games Resume</td>
                        <td>January 8th</td>
                    </tr>
                    <tr>
                        <td>Off for Spring Break</td>
                        <td>March 5th</td>
                    </tr>
                    <tr>
                        <td><b>Final Tournament</b></td>
                        <td>March 26th</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="subsection">
            <h3 id="point-per-game">Points for games</h3>
            <ul>
                <li>Winning a game awards 2 points</li>
                <li>Tieing a game awards 1 point</li>
                <li>Losing a game awards 0 points</li>
                <li>Winning a series (combined score of both games against a team) awards 1 bonus point</li>
                <li>In the event of a tie in a series each team is awarded 0.5 points</li>
            </ul>
            
            <h3 id="tournaments-section"> <a href="/jpFlicks/tournament">Tournaments</a></h3>
            This year we have 2 tournaments! Anyone including (those not in the league) can compete so if you can only come for 1 day these are the ones to do it! 
            The exact format of the tournament will depend on the number of players but it will follow a round robin + elimination set up.
            League points up for grabs (half awarded to each player in the team unless only 1 member of the team is present)
                <div class="table-wrapper">
                    <table class="basic-table">
                <thead>
                    <tr>
                        <th>Place</th>
                        <th>Winter Tourney</th>
                        <th>Final Tourney</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><b>1st</b></td>
                        <td>5 pts</td>
                        <td>6 pts</td>
                    </tr>
                    <tr>
                        <td><b>2nd</b></td>
                        <td>4 pts</td>
                        <td>5 pts</td>
                    </tr>
                    <tr>
                        <td><b>3rd</b></td>
                        <td>3 pts</td>
                        <td>4 pts</td>
                    </tr>
                    <tr>
                        <td><b>4th</b></td>
                        <td>2 pts</td>
                        <td>3 pts</td>
                    </tr>
                    <tr>
                        <td><b>5th-6th</b></td>
                        <td>1 pts</td>
                        <td>2 pts</td>
                    </tr>
                </tbody>
            </table>
                </div> 
        </div>
        
    </Collapsible>
        
        <Collapsible 
        title="Game Rules"
        variant="minimal"
        titleSize="1.75rem"
        titleWeight="300"
        titleColor="#1a202c"
        iconType="arrow"
        >
        <ul>
            <li>Each game consists of at least 2 rounds and at most 4</li>
            <li>If after a round a team is winning by 100 points they win the game</li>
            <li>After 4 rounds the winner is the team with the most points. Ties are possible</li>
            <li>The standard crokinole rules can be found <a href="https://www.worldcrokinole.com/thegame.html">here</a></li>
            <li>All shots must be a flick - you can not start with contact on the disk with the finger you shoot with</li>
            <li>Your hand can not move past the shooting line (i.e. you hand move forward as part of your shot)</li>
            <li>When not playing in a regulation stool all players are only allowed to lean from their seated position (no sliding)</li>
            <li>Jack has the final say</li>
            <li>You can never deny a team a match if they ask to play and you have not already played them twice</li>
            <li>HAVE FUN</li>
        </ul>
        </Collapsible>
        <Collapsible 
        id="games-finder"
        title="Games Finder"
        variant="minimal"
        titleSize="1.75rem"
        titleWeight="300"
        titleColor="#1a202c"
        iconType="arrow"
        >
<div class="games-finder-container">
    <p class="intro-text">
            Find all the games you need to play across your teams. 
            Type your name below to see your remaining matches.
    </p>
        
        <!-- The rest of the games finder component code goes here -->
        <!-- (Copy from the first artifact) -->
    <div class="search-section">
        <div class="search-bar">
            <input 
                type="text" 
                placeholder="Enter your name..." 
                bind:value={playerName}
                on:input={filterGamesByPlayer}
                class="name-input"
            />
            {#if playerName}
                <button on:click={() => { playerName = ''; filterGamesByPlayer(); }} class="clear-btn">
                    Clear
                </button>
            {/if}
        </div>
        
        {#if playerName && (shownGames > 0 || hiddenTeams.size > 0)}
            <div class="summary-section">
                <div class="total-games">
                    {#if isAllMode}
                        Showing <strong>{shownGames}</strong> scheduled games out of {totalUnplayedGames} total matchups remaining this season.
                    {:else}
                        Showing <strong>{shownGames}</strong> out of {Object.values(teamGameCounts).reduce((accumulator, currentValue) => {
                            return accumulator + currentValue;
                        })} Total games to play. On average you need to play {(Object.values(teamGameCounts).reduce((accumulator, currentValue) => {return accumulator + currentValue;}) / SESSION_COUNT).toFixed(2)} games per session to complete all your games by the end of the season.
                    {/if}
                    {#if hiddenTeams.size > 0 && shownGames === 0}
                        <span class="filtered-warning"> (All games filtered out)</span>
                    {/if}
                </div>
                
                <div class="team-summary">
                    <h4>Filter by player:</h4>
                    <div class="player-pills">
                        {#each allPlayers as player}
                            <button 
                                class="player-pill"
                                class:hidden={isPlayerHidden(player)}
                                on:click={() => togglePlayerFilter(player)}
                                title="Click to {isPlayerHidden(player) ? 'show' : 'hide'} all games with {player}"
                            >
                                {player}
                                {#if isPlayerHidden(player)}
                                    <span class="pill-icon">✕</span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                    
                    <h4>Games by team:</h4>
                    <div class="team-pills">
                        {#each Object.entries(teamGameCounts) as [team, count]}
                            <button 
                                class="team-pill"
                                class:hidden={hiddenTeams.has(team)}
                                on:click={() => toggleTeamFilter(team)}
                                title="Click to {hiddenTeams.has(team) ? 'show' : 'hide'} games with {team}"
                            >
                                {#if isAllMode}
                                    {team}: {count} {count === 1 ? 'game' : 'games'} this week ({((remainingGamesPerTeam[team] || 0) / SESSION_COUNT).toFixed(2)} Avg) | Flex: {flexOrder[team] || '?'}
                                {:else}
                                    {team}: {count} {count === 1 ? 'game' : 'games'} ({(count / SESSION_COUNT).toFixed(2)} Avg) | Flex: {flexOrder[team] || '?'}
                                {/if}
                                {#if hiddenTeams.has(team)}
                                    <span class="pill-icon">✕</span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                    
                    {#if hiddenTeams.size > 0}
                        <div class="active-filters">
                            <h4>Active filters (hidden teams):</h4>
                            <div class="filter-tags">
                                {#each [...hiddenTeams] as team}
                                    <div class="filter-tag">
                                        <span>{team}</span>
                                        <button 
                                            class="remove-filter"
                                            on:click={() => toggleTeamFilter(team)}
                                            title="Show games with {team}"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </div>
                        <button on:click={resetFilters} class="reset-btn">
                            Clear all filters
                        </button>
                    {/if}
                </div>
            </div>
            
            {#if shownGames > 0}
            <div class="games-table-wrapper">
                <table class="games-table">
                    <thead>
                        <tr>
                            <th>Your Team</th>
                            <th>Your Partner</th>
                            <th>vs</th>
                            <th>Opponent Team</th>
                            <th>Opponent 1</th>
                            <th>Opponent 2</th>
                            <th>Board</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredGames as game}
                            {@const playerTeam = getPlayerTeam(game)}
                            {@const opponentTeam = getOpponentTeam(game)}
                            {@const isTeam1 = playerTeam === game.team1}
                            {@const suggested = isGameSuggested(game)}
                            {@const rebalanced = isGameRebalanced(game)}
                            <tr class:suggested-game={suggested && !rebalanced} class:rebalanced-game={rebalanced}>
                                <td class="team-name" class:suggested-cell={suggested && !rebalanced} class:rebalanced-cell={rebalanced}>
                                    {#if rebalanced}<span class="rebalanced-star">🔄</span>{:else if suggested}<span class="suggested-star">⭐</span>{/if}
                                    <button 
                                        class="team-link"
                                        on:click={() => toggleTeamFilter(playerTeam)}
                                        title="Click to hide games with {playerTeam}"
                                    >
                                        {playerTeam}
                                    </button>
                                </td>
                                <td class:suggested-cell={suggested && !rebalanced} class:rebalanced-cell={rebalanced}>
                                    {#if isTeam1}
                                        {game[PLAYER1_TEAM1] === playerName ? game[PLAYER2_TEAM1] : game[PLAYER1_TEAM1]}
                                    {:else}
                                        {game[PLAYER1_TEAM2] === playerName ? game[PLAYER2_TEAM2] : game[PLAYER1_TEAM2]}
                                    {/if}
                                </td>
                                <td class="vs" class:suggested-cell={suggested && !rebalanced} class:rebalanced-cell={rebalanced}>vs</td>
                                <td class="team-name" class:suggested-cell={suggested && !rebalanced} class:rebalanced-cell={rebalanced}>
                                    <button 
                                        class="team-link"
                                        on:click={() => toggleTeamFilter(opponentTeam)}
                                        title="Click to hide games with {opponentTeam}"
                                    >
                                        {opponentTeam}
                                    </button>
                                </td>
                                <td class:suggested-cell={suggested && !rebalanced} class:rebalanced-cell={rebalanced}>{isTeam1 ? game[PLAYER1_TEAM2] : game[PLAYER1_TEAM1]}</td>
                                <td class:suggested-cell={suggested && !rebalanced} class:rebalanced-cell={rebalanced}>{isTeam1 ? game[PLAYER2_TEAM2] : game[PLAYER2_TEAM1]}</td>
                                <td class:suggested-cell={suggested && !rebalanced} class:rebalanced-cell={rebalanced}>{game.isHome ? HOME_GAME_STRING : AWAY_GAME_STRING}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {:else if hiddenTeams.size > 0}
            <div class="no-games filtered">
                <p>All games have been filtered out.</p>
                <button on:click={resetFilters} class="reset-btn-large">
                    Show all games
                </button>
            </div>
            {:else}
            <div class="no-games">
                No games found for "{playerName}"
            </div>
            {/if}
        {/if}
        
        <!-- Played Games Section -->
        {#if playerName && playedGames.length > 0}
            <div class="played-games-section">
                <h3>Completed Games ({playedGames.length})</h3>
                
                {#each Object.entries(playedGamesByTeam) as [teamName, games]}
                    <div class="team-games-group">
                        <h4>{teamName} ({games.length} {games.length === 1 ? 'game' : 'games'})</h4>
                        <div class="games-table-wrapper">
                            <table class="games-table played-games-table">
                                <thead>
                                    <tr>
                                        <th>Result</th>
                                        <th>Your Team</th>
                                        <th>vs</th>
                                        <th>Opponent</th>
                                        <th>+/-</th>
                                        <th>Board</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each games as game}
                                        <tr>
                                            <td class="result-cell {game.result.class}">{game.result.text}</td>
                                            <td class="team-name">{teamName}</td>
                                            <td class="vs">vs</td>
                                            <td class="team-name">{game.opponentTeam}</td>
                                            <td class="diff-cell {game.result.class}">{game.result.diff}</td>
                                            <td>{game.board}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
        </Collapsible>
        {#if loading}
            <div class="status">Loading Excel data...</div>
        {:else if error}
            <div class="error">
                <h3>Error loading file</h3>
                <p>{error}</p>
            </div>
        {:else if dataReady}
        <p></p>
            <!-- <div class="status success">
                Data loaded successfully! Sheets available: {Object.keys(excelData).join(', ')}
            </div> -->

            <div class="standings-container">
    <h2>League Standings</h2>
    
    <div class="table-wrapper">
        <table class="standings-table">
            <thead>
    <tr>
        <th>
            #
        </th>
        <th>
            Team
        </th>
        <th class="sortable numeric" on:click={() => sortTable('gamesPlayed')}>
            GP {getSortIndicator('gamesPlayed')}
        </th>
        <th class="sortable numeric" on:click={() => sortTable('seriesWins')}>
            Series W {getSortIndicator('seriesWins')}
        </th>
        <th class="sortable numeric" on:click={() => sortTable('tournamentPoints')}>
            TP {getSortIndicator('tournamentPoints')}
        </th>
        <th class="sortable numeric" on:click={() => sortTable('wins')}>
            W {getSortIndicator('wins')}
        </th>
        <th class="sortable numeric" on:click={() => sortTable('ties')}>
            D {getSortIndicator('ties')}
        </th>
        <th class="sortable numeric" on:click={() => sortTable('losses')}>
            L {getSortIndicator('losses')}
        </th>
        <th class="sortable numeric highlight" on:click={() => sortTable('ranking')}>
            Score {getSortIndicator('ranking')}
        </th>
        <th class="sortable numeric" on:click={() => sortTable('pointDiff')}>
            +/- {getSortIndicator('pointDiff')}
        </th>
                <th>
            Player 1
        </th>
        <th>
            Player 2
        </th>
    </tr>
</thead>

<!-- Update tbody to use sortedTeams instead of rankedTeams -->
<tbody>
    {#each sortedTeams as team, index}
        <tr class:top-three={sortColumn === 'score' && sortDirection === 'desc' && index < 3}>
            <td class="position-column">
                {#if team.ranking === 1}
                    <span class="medal gold">🥇</span>
                {:else if team.ranking === 2}
                    <span class="medal silver">🥈</span>
                {:else if team.ranking === 3}
                    <span class="medal bronze">🥉</span>
                {:else}
                    {team.ranking}
                {/if}
            </td>
            <td class="team-name">{team.teamName}</td>
            <td class="numeric">{team.gamesPlayed}</td>
            <td class="numeric">{team.seriesWins}</td>
            <td class="numeric">{team.tournamentPoints}</td>
            <td class="numeric">{team.wins}</td>
            <td class="numeric">{team.ties}</td>
            <td class="numeric">{team.losses}</td>
            <td class="numeric highlight">{team.score}</td>
            <td class="numeric {team.pointDiff >= 0 ? 'positive' : 'negative'}">
                {team.pointDiff > 0 ? '+' : ''}{team.pointDiff}
            </td>
            <td>{team.player1}</td>
            <td>{team.player2}</td>
        </tr>
    {/each}
</tbody>
        </table>
    </div>
    
    <div class="table-legend">
    <p><strong>#:</strong> ranking | <strong>GP:</strong> Games Played | <strong>TP:</strong> Tournament Points | <strong>W:</strong> Wins | <strong>D:</strong> Draws | <strong>L:</strong> Losses | <strong>+/-:</strong> Point Differential</p>
</div>
<HallOfFame />
</div>
        {/if}
    </main>
</div>
</div>

<style>
    /* Page background with repeating logo pattern */
    .page-background {
        min-height: 100vh;
        background-color: #4a9b9b;
        background-repeat: repeat;
        padding: 1rem 0;
    }

   /* Center tables on ALL screen sizes - more specific selector */
    .table-wrapper,
    :global(.mobile-friendly) .table-wrapper {
        max-width: 850px;
        margin: 1rem auto;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }

    /* Mobile adjustments - keep centered but allow horizontal scroll */
    @media (max-width: 768px) {
        .table-wrapper,
        :global(.mobile-friendly) .table-wrapper {
            max-width: 850px;
            margin: 1rem auto;
            padding: 0 1rem;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
        
        /* Visual indicator that table is scrollable */
        .table-wrapper,
        :global(.mobile-friendly) .table-wrapper {
            background: 
                linear-gradient(to right, white 30%, rgba(255, 255, 255, 0)),
                linear-gradient(to right, rgba(255, 255, 255, 0), white 70%) 100% 0,
                linear-gradient(to right, rgba(0, 0, 0, 0.1), transparent 10%),
                linear-gradient(to left, rgba(0, 0, 0, 0.1), transparent 10%) 100% 0;
            background-repeat: no-repeat;
            background-size: 40px 100%, 40px 100%, 10px 100%, 10px 100%;
            background-attachment: local, local, scroll, scroll;
        }
    }

    /* Ensure minimum table width */
    .basic-table {
        min-width: 300px;
        width: 100%;
    }

    /* Optional: Add horizontal scroll indicator */
    .table-wrapper[data-scrollable]::after,
    :global(.mobile-friendly) .table-wrapper[data-scrollable]::after {
        content: '← Swipe to see more →';
        display: block;
        text-align: center;
        padding: 0.5rem;
        font-size: 0.75rem;
        color: #666;
    }

    /* Hide indicator once user has scrolled */
    .table-wrapper.has-scrolled::after,
    :global(.mobile-friendly) .table-wrapper.has-scrolled::after {
        display: none;
    }

    /* Add these styles to your existing <style> section */

    /* Mobile-specific adjustments */
    @media (max-width: 768px) {
        /* Container and main layout */
        .container {
            padding: 1rem;
        }
        
        main {
            padding: 1.5rem;
            border-radius: 8px;
        }
        
        /* Typography adjustments */
        h1 {
            font-size: 1.75rem;
            margin-bottom: 1rem;
            line-height: 1.2;
        }
        
        h3 {
            font-size: 1.25rem;
        }
        
        p {
            font-size: 0.95rem;
            line-height: 1.6;
        }
        
        /* Remove subsection margin on mobile */
        .subsection {
            margin-left: 0;
        }
        
        /* Make center div full width on mobile */
        .center {
            width: 100%;
            margin: 0;
            overflow-x: auto;
        }
        
        /* Table adjustments */
        .basic-table {
            font-size: 0.85rem;
            box-shadow: none;
            border: 1px solid #e2e8f0;
        }
        
        .basic-table th {
            padding: 0.75rem 0.5rem;
            font-size: 0.75rem;
        }
        
        .basic-table td {
            padding: 0.75rem 0.5rem;
        }
        
        /* Make tables scrollable */
        .table-wrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 0 -1rem;
            padding: 0 1rem;
        }
        
        /* Lists */
        ul {
            padding-left: 1.5rem;
        }
        
        li {
            margin-bottom: 0.5rem;
            font-size: 0.95rem;
        }
        
        /* Breadcrumb */
        .breadcrumb {
            margin-bottom: 1rem;
        }
    }

    /* Even smaller screens */
    @media (max-width: 480px) {
        h1 {
            font-size: 1.5rem;
        }
        
        main {
            padding: 1rem;
        }
        
        /* Stack table cells on very small screens */
        .basic-table thead {
            display: none;
        }
        
        .basic-table tbody tr {
            display: block;
            margin-bottom: 1rem;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
        }
        
        .basic-table td {
            display: block;
            text-align: right;
            padding: 0.5rem;
            position: relative;
            padding-left: 50%;
        }
        
        .basic-table td:before {
            content: attr(data-label);
            position: absolute;
            left: 0.5rem;
            font-weight: 600;
            text-align: left;
        }
    }

    /* Improved base styles for better mobile experience */
    * {
        box-sizing: border-box;
    }

    /* Prevent horizontal scroll */
    body {
        overflow-x: hidden;
    }

    /* Make links easier to tap on mobile */
    a {
        padding: 0.25rem 0;
        display: inline-block;
    }

    /* Larger touch targets for Collapsible headers on mobile */
    @media (max-width: 768px) {
        :global(.collapsible .header) {
            padding: 1rem !important;
            touch-action: manipulation;
        }
    }

    /* Add smooth scrolling */
    :global(html) {
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
    }

    /* Ensure tables don't break layout */
    table {
        max-width: 100%;
        overflow-x: auto;
    }

    /* Responsive images if you add any */
    img {
        max-width: 100%;
        height: auto;
    }

    /* Style 1: Clean and Modern */
        .basic-table {
            width: 100%;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            table-layout: fixed; /* Forces table to use full width */
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-collapse: collapse;
        }
        
        .basic-table th {
            background: #4a5568;
            color: white;
            font-weight: 600;
            text-align: left;
            padding: 1rem;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .basic-table td {
            padding: 1rem;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .basic-table tbody tr:last-child td {
            border-bottom: none;
        }

    .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
    }
    
    .breadcrumb {
        margin-bottom: 2rem;
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
        padding: 3rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    
    h1 {
        font-size: 2.5rem;
        margin-bottom: 2rem;
        color: #1a1a1a;
    }
    
    .status {
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 2rem;
        background: #f0f0f0;
        color: #666;
    }
    
    .status.success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }
    
    .error {
        background: #fee;
        border: 1px solid #fcc;
        border-radius: 8px;
        padding: 2rem;
        color: #c00;
    }
    
    .error h3 {
        margin-top: 0;
    }
    
    .custom-content {
        margin-top: 2rem;
    }
    
    .data-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin: 1rem 0;
    }
    
    .sheet-summary {
        background: #f9f9f9;
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid #eee;
    }
    
    .sheet-summary h3 {
        margin-top: 0;
        color: #333;
    }
    
    .sheet-summary p {
        margin: 0.5rem 0;
        color: #666;
    }
    
    .debug {
        margin-top: 3rem;
        padding: 1rem;
        background: #f5f5f5;
        border-radius: 8px;
    }
    
    .debug summary {
        cursor: pointer;
        font-weight: 600;
        color: #666;
    }
    
    .debug pre {
        margin-top: 1rem;
        overflow-x: auto;
        font-size: 0.875rem;
    }

    .subsection {
        margin-left: 50px; /* Adjust the value as needed */
    }

    .center {
        width: 50%; /* Or any specific width */
        margin: 0 auto;
    }

    .standings-container {
        margin: 2rem 0;
    }
    
    h2 {
        margin-bottom: 1.5rem;
        color: #1a1a1a;
    }
    
    .table-wrapper {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        margin-bottom: 1rem;
    }
    
    .standings-table {
        width: 100%;
        min-width: 700px;
        border-collapse: collapse;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    /* Header styles */
    th {
        background: #2c5aa0;
        color: white;
        padding: 1rem 0.75rem;
        text-align: left;
        font-weight: 600;
        font-size: 0.875rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        white-space: nowrap;
    }
    
    th.sortable {
        cursor: pointer;
        user-select: none;
        transition: background-color 0.2s;
    }
    
    th.sortable:hover {
        background: #1e4080;
    }
    
    th.numeric {
        text-align: center;
    }
    
    /* Cell styles */
    td {
        padding: 0.875rem 0.75rem;
        border-bottom: 1px solid #e5e7eb;
    }
    
    tbody tr:last-child td {
        border-bottom: none;
    }
    
    tbody tr:hover {
        background: #f0f9ff;
    }
    
    /* Position column */
    .position-column {
        width: 50px;
        text-align: center;
        font-weight: 600;
    }
    
    .medal {
        font-size: 1.25rem;
    }
    
    /* Team name styling */
    .team-name {
        font-weight: 600;
        color: #1a1a1a;
    }
    
    /* Numeric columns */
    .numeric {
        text-align: center;
    }
    
    /* Highlight score column */
    .highlight {
        background: rgba(44, 90, 160, 0.1);
        font-weight: 700;
    }
    
    th.highlight {
        background: #1e4080;
    }
    
    /* Point differential coloring */
    .positive {
        color: #059669;
    }
    
    .negative {
        color: #dc2626;
    }
    
    /* Top 3 teams highlighting */
    .top-three {
        background: #fef3c7;
    }
    
    .top-three:hover {
        background: #fde68a;
    }
    
    /* Table legend */
    .table-legend {
        margin-top: 1rem;
        font-size: 0.875rem;
        color: #666;
        text-align: center;
    }
    
    /* Mobile responsive */
    @media (max-width: 768px) {
        h2 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
        }
        
        .table-wrapper {
            margin: 0 -1rem;
            padding: 0;
        }
        
        .standings-table {
            font-size: 0.75rem;
            min-width: 600px;
        }
        
        th {
            padding: 0.5rem;
            font-size: 0.7rem;
        }
        
        td {
            padding: 0.5rem;
        }
        
        .position-column {
            width: 40px;
        }
        
        .medal {
            font-size: 1rem;
        }
    }
    
    /* Sort indicators */
    th.sortable::after {
        content: ' ↕';
        opacity: 0.3;
        font-size: 0.75em;
    }
    
    th.sortable:hover::after {
        opacity: 0.6;
    }

    .games-finder-container {
        margin: 2rem 0;
    }
    
    .search-section {
        margin-bottom: 2rem;
    }
    
    .search-bar {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }
    
    .name-input {
        flex: 1;
        max-width: 400px;
        padding: 0.75rem 1rem;
        font-size: 1rem;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        transition: border-color 0.2s;
    }
    
    .name-input:focus {
        outline: none;
        border-color: #2c5aa0;
    }
    
    .clear-btn {
        padding: 0.75rem 1.5rem;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        transition: background 0.2s;
    }
    
    .clear-btn:hover {
        background: #dc2626;
    }
    
    .summary-section {
        background: #f3f4f6;
        padding: 1.5rem;
        border-radius: 8px;
        margin-bottom: 2rem;
    }
    
    .total-games {
        font-size: 1.25rem;
        margin-bottom: 1rem;
        color: #1a1a1a;
    }
    
    .team-summary h4 {
        margin: 0 0 0.75rem 0;
        color: #4b5563;
    }
    
    .team-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    
    .player-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    
    .player-pill {
        padding: 0.4rem 0.8rem;
        background: #059669;
        color: white;
        border: none;
        border-radius: 16px;
        cursor: pointer;
        font-size: 0.8rem;
        transition: all 0.2s;
        position: relative;
    }
    
    .player-pill:hover {
        background: #047857;
        transform: translateY(-1px);
    }
    
    .player-pill.hidden {
        background: #9ca3af;
        text-decoration: line-through;
    }
    
    .team-pill {
        padding: 0.5rem 1rem;
        background: #2c5aa0;
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;
        position: relative;
    }
    
    .team-pill:hover {
        background: #1e4080;
        transform: translateY(-1px);
    }
    
    .team-pill.hidden {
        background: #9ca3af;
        text-decoration: line-through;
    }
    
    .pill-icon {
        margin-left: 0.5rem;
    }
    
    .reset-btn {
        padding: 0.5rem 1rem;
        background: transparent;
        color: #2c5aa0;
        border: 1px solid #2c5aa0;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;
    }
    
    .reset-btn:hover {
        background: #2c5aa0;
        color: white;
    }
    
    .games-table-wrapper {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }
    
    .games-table {
        width: 100%;
        min-width: 600px;
        border-collapse: collapse;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .games-table th {
        background: #4a5568;
        color: white;
        padding: 0.75rem;
        text-align: left;
        font-weight: 600;
        font-size: 0.875rem;
        white-space: nowrap;
    }
    
    .games-table td {
        padding: 0.75rem;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .games-table tbody tr:last-child td {
        border-bottom: none;
    }
    
    .games-table tbody tr:hover {
        background: #f9fafb;
    }
    
    /* Suggested game styles */
    .suggested-game {
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border-left: 4px solid #f59e0b;
    }
    
    .suggested-game:hover {
        background: linear-gradient(135deg, #fde68a 0%, #fcd34d 100%);
    }
    
    .suggested-star {
        margin-right: 0.5rem;
        font-size: 1rem;
    }
    
    .suggested-cell {
        font-weight: 600;
    }
    
    /* Rebalanced game styles (replacement games) */
    .rebalanced-game {
        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
        border-left: 4px solid #3b82f6;
    }
    
    .rebalanced-game:hover {
        background: linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%);
    }
    
    .rebalanced-star {
        margin-right: 0.5rem;
        font-size: 1rem;
    }
    
    .rebalanced-cell {
        font-weight: 600;
    }
    
    .team-name {
        font-weight: 600;
    }
    
    .team-link {
        background: none;
        border: none;
        color: #2c5aa0;
        cursor: pointer;
        text-decoration: underline;
        font-weight: 600;
        padding: 0;
        transition: color 0.2s;
    }
    
    .team-link:hover {
        color: #1e4080;
    }
    
    .vs {
        text-align: center;
        color: #6b7280;
        font-weight: 500;
    }
    
    .no-games.filtered {
        text-align: center;
        padding: 2rem;
        background: #fff5f5;
        border: 1px solid #fecaca;
        border-radius: 8px;
        margin-top: 1rem;
    }
    
    .reset-btn-large {
        margin-top: 1rem;
        padding: 0.75rem 2rem;
        background: #2c5aa0;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 500;
        transition: all 0.2s;
    }
    
    .reset-btn-large:hover {
        background: #1e4080;
        transform: translateY(-1px);
    }
    
    .filtered-warning {
        color: #dc2626;
        font-size: 0.875rem;
    }
    
    .active-filters {
        margin: 1.5rem 0 1rem 0;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }
    
    .active-filters h4 {
        margin: 0 0 0.75rem 0;
        color: #6b7280;
        font-size: 0.875rem;
    }
    
    .filter-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    
    .filter-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.5rem;
        background: #fef3c7;
        border: 1px solid #fbbf24;
        border-radius: 6px;
        font-size: 0.875rem;
        color: #92400e;
    }
    
    .filter-tag span {
        font-weight: 500;
    }
    
    .remove-filter {
        background: none;
        border: none;
        color: #b45309;
        cursor: pointer;
        font-size: 1.2rem;
        line-height: 1;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
    }
    
    .remove-filter:hover {
        background: #fbbf24;
        color: #78350f;
    }
    
    @media (max-width: 768px) {
        .search-bar {
            flex-direction: column;
        }
        
        .name-input {
            max-width: none;
        }
        
        .team-pills {
            gap: 0.4rem;
        }
        
        .player-pills {
            gap: 0.4rem;
        }
        
        .player-pill {
            font-size: 0.75rem;
            padding: 0.3rem 0.6rem;
        }
        
        .team-pill {
            font-size: 0.8rem;
            padding: 0.4rem 0.8rem;
        }
        
        .games-table {
            font-size: 0.8rem;
            min-width: 500px;
        }
        
        .games-table th,
        .games-table td {
            padding: 0.5rem;
        }
    }
    
    /* Played Games Section Styles */
    .played-games-section {
        margin-top: 2rem;
        padding-top: 2rem;
        border-top: 2px solid #e5e7eb;
    }
    
    .played-games-section h3 {
        margin: 0 0 1.5rem 0;
        color: #1a202c;
        font-size: 1.25rem;
    }
    
    .team-games-group {
        margin-bottom: 1.5rem;
    }
    
    .team-games-group h4 {
        margin: 0 0 0.75rem 0;
        color: #4a5568;
        font-size: 1rem;
        font-weight: 600;
    }
    
    .played-games-table {
        min-width: 400px;
    }
    
    .result-cell {
        font-weight: 700;
        text-align: center;
        width: 60px;
    }
    
    .result-cell.win {
        color: #059669;
        background-color: #d1fae5;
    }
    
    .result-cell.loss {
        color: #dc2626;
        background-color: #fee2e2;
    }
    
    .result-cell.draw {
        color: #d97706;
        background-color: #fef3c7;
    }
    
    .diff-cell {
        font-weight: 600;
        text-align: center;
    }
    
    .diff-cell.win {
        color: #059669;
    }
    
    .diff-cell.loss {
        color: #dc2626;
    }
    
    .diff-cell.draw {
        color: #d97706;
    }
</style>