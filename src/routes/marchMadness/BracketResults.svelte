<script>
    import { onMount } from 'svelte';
    import { 
        SCORE_FOR_ROUND, 
        SEED_FACTOR,
        SCORE_DIFF_BUCKETS,
        regionPositions,
        matchupPairs,
        createEmptyBracket,
        initializeBracketWithTeams,
        computeScore,
        computePossibleRemaining,
        computeStakeInGame,
        letterToNumber,
        loadScoringConfig
    } from './BracketStructure.js';
    import { loadBracketFromPath } from './bracketIO.js';
    import BracketView from './BracketView.svelte';
    import MarchMadnessRules from './MarchMadnessRules.svelte';
    
    // Configuration
    const YEAR = '2026';
    const BRACKETS_PATH = `/marchMadness/${YEAR}/brackets`;
    const TEAMS_FILE = `/marchMadness/${YEAR}/ThisYearTeams${YEAR}.csv`;
    const RESULTS_FILE = `/marchMadness/${YEAR}/results-bracket-march-madness-${YEAR}`;
    const OPTIMAL_BRACKETS_FILE = `/marchMadness/${YEAR}/optimal-brackets.json`;
    const SCORING_CONFIG_FILE = `/marchMadness/${YEAR}/scoring-config.json`;
    const STAR_BONUSES_FILE = `/marchMadness/${YEAR}/starBonuses.json`;
    
    // State
    let loading = true;
    let error = null;
    let activeTab = 'standings'; // 'standings', 'brackets', 'stakes', 'stars', 'rules'
    
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
    let nextGamePreferences = {};  // Map of game key -> preferences per participant (for winning)
    let nextGameLosePreferences = {};  // Map of game key -> preferences per participant (for losing)
    let optimalBrackets = {};  // Map of name -> optimal bracket for max possible score
    
    // Star bonus data
    let scoringConfig = null;  // Full scoring config including starBonus array
    let starBonuses = [];  // Array of star bonus awards
    let participantStarPoints = {};  // Map of name -> total star points
    let participantAwardCount = {};  // Map of name -> number of awards won
    
    onMount(async () => {
        try {
            // Load scoring config first
            await loadScoringConfigData();
            
            await loadTeams();
            await loadResults();
            await loadParticipants();
            await loadAllBrackets();
            await loadWinProbabilities();
            await loadOptimalBrackets();
            await loadStarBonuses();
            calculateStarPoints();
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
    
    async function loadScoringConfigData() {
        await loadScoringConfig(SCORING_CONFIG_FILE);
        // Also fetch the full config for starBonus array
        try {
            const response = await fetch(SCORING_CONFIG_FILE);
            if (response.ok) {
                scoringConfig = await response.json();
            }
        } catch (e) {
            console.warn('Could not load scoring config for star bonuses');
        }
    }
    
    async function loadStarBonuses() {
        try {
            const response = await fetch(STAR_BONUSES_FILE);
            if (response.ok) {
                starBonuses = await response.json();
            }
        } catch (e) {
            console.log('No star bonuses file found');
            starBonuses = [];
        }
    }
    
    /**
     * Calculate star points for each participant based on awards won
     */
    function calculateStarPoints() {
        participantStarPoints = {};
        participantAwardCount = {};
        
        // Initialize all participants
        participants.forEach(name => {
            participantStarPoints[name.toLowerCase()] = 0;
            participantAwardCount[name.toLowerCase()] = 0;
        });
        
        if (!scoringConfig?.starBonus || !starBonuses.length) return;
        
        const starBonusPoints = scoringConfig.starBonus;
        
        for (const award of starBonuses) {
            if (!award.Winners || award.Winners.length === 0) continue;
            
            // Check if this is a split award (name contains "/")
            const isSplitAward = award.name.includes('/') && Array.isArray(award.Winners[0]);
            
            if (isSplitAward) {
                // Split award: Winners is array of arrays
                // Total winner count is sum of all sublist lengths
                const totalWinners = award.Winners.reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
                const pointsPerWinner = starBonusPoints[Math.min(totalWinners - 1, starBonusPoints.length - 1)] || 0;
                
                // Award points to each winner in each sublist
                for (const winnerList of award.Winners) {
                    if (!Array.isArray(winnerList)) continue;
                    for (const winner of winnerList) {
                        const normalizedName = winner.toLowerCase();
                        if (participantStarPoints[normalizedName] !== undefined) {
                            participantStarPoints[normalizedName] += pointsPerWinner;
                            participantAwardCount[normalizedName] += 1;
                        }
                    }
                }
            } else {
                // Regular award: Winners is flat array of names
                const winnerCount = award.Winners.length;
                const pointsPerWinner = starBonusPoints[Math.min(winnerCount - 1, starBonusPoints.length - 1)] || 0;
                
                for (const winner of award.Winners) {
                    const normalizedName = winner.toLowerCase();
                    if (participantStarPoints[normalizedName] !== undefined) {
                        participantStarPoints[normalizedName] += pointsPerWinner;
                        participantAwardCount[normalizedName] += 1;
                    }
                }
            }
        }
    }
    
    /**
     * Get star points for a participant (case-insensitive)
     */
    function getStarPoints(name) {
        return participantStarPoints[name.toLowerCase()] || 0;
    }
    
    /**
     * Get award count for a participant (case-insensitive)
     */
    function getAwardCount(name) {
        return participantAwardCount[name.toLowerCase()] || 0;
    }
    
    /**
     * Get all badges earned by a participant (case-insensitive)
     * For split awards, returns individual sub-awards the participant won
     */
    function getEarnedBadges(name) {
        const normalizedName = name.toLowerCase();
        const earned = [];
        
        for (const award of starBonuses) {
            if (!award.Winners || award.Winners.length === 0) continue;
            
            const isSplitAward = award.name.includes('/') && Array.isArray(award.Winners[0]);
            
            if (isSplitAward) {
                // Split award: check each sublist
                const awardNames = award.name.split('/');
                const splitImages = award.images || awardNames.map(splitName => {
                    const splitSlug = splitName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                    return `/marchMadness/${YEAR}/badges/${splitSlug}.png`;
                });
                
                for (let i = 0; i < award.Winners.length; i++) {
                    const winnerList = award.Winners[i];
                    if (Array.isArray(winnerList) && winnerList.some(w => w.toLowerCase() === normalizedName)) {
                        // This participant won this sub-award
                        earned.push({
                            name: awardNames[i] || `Award ${i + 1}`,
                            imagePath: splitImages[i],
                            originalAward: award,
                            subIndex: i,
                            isSplit: true
                        });
                    }
                }
            } else {
                // Regular award
                if (award.Winners.some(winner => winner.toLowerCase() === normalizedName)) {
                    const badgeSlug = award.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                    const imagePath = award.image || `/marchMadness/${YEAR}/badges/${badgeSlug}.png`;
                    
                    earned.push({
                        name: award.name,
                        imagePath: imagePath,
                        originalAward: award,
                        isSplit: false
                    });
                }
            }
        }
        
        return earned;
    }
    
    /**
     * Scroll to a badge card in the awards section
     */
    function scrollToBadge(badgeSlug) {
        const element = document.getElementById(`badge-${badgeSlug}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add a brief highlight effect
            element.classList.add('highlight-badge');
            setTimeout(() => element.classList.remove('highlight-badge'), 1500);
        }
    }
    
    /**
     * Get points for an award based on number of winners
     * For split awards, pass the total count across all sublists
     */
    function getAwardPoints(winnerCount) {
        if (!scoringConfig?.starBonus || winnerCount === 0) return 0;
        const starBonusPoints = scoringConfig.starBonus;
        return starBonusPoints[Math.min(winnerCount - 1, starBonusPoints.length - 1)] || 0;
    }
    
    /**
     * Get total winner count for an award (handles split awards)
     */
    function getTotalWinnerCount(award) {
        if (!award.Winners || award.Winners.length === 0) return 0;
        
        const isSplitAward = award.name.includes('/') && Array.isArray(award.Winners[0]);
        
        if (isSplitAward) {
            return award.Winners.reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
        } else {
            return award.Winners.length;
        }
    }
    
    /**
     * Check if an award has any winners (handles split awards)
     */
    function awardHasWinners(award) {
        if (!award.Winners || award.Winners.length === 0) return false;
        
        const isSplitAward = award.name.includes('/') && Array.isArray(award.Winners[0]);
        
        if (isSplitAward) {
            return award.Winners.some(list => Array.isArray(list) && list.length > 0);
        } else {
            return award.Winners.length > 0;
        }
    }
    
    /**
     * Prepare awards for display (keeps split awards together)
     */
    function prepareAwardsForDisplay(awards) {
        console.log('=== Star Bonus Image Debug ===');
        console.log('Total awards to prepare:', awards.length);
        
        return awards.map(award => {
            const isSplitAward = award.name.includes('/') && Array.isArray(award.Winners?.[0]);
            const badgeSlug = award.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            
            // Use image from JSON if provided, otherwise generate path from slug
            const imagePath = award.image || `/marchMadness/${YEAR}/badges/${badgeSlug}.png`;
            
            console.log(`Award: "${award.name}"`);
            console.log(`  Badge slug: "${badgeSlug}"`);
            console.log(`  Image from JSON: "${award.image || '(not set)'}"`);
            console.log(`  Final image path: "${imagePath}"`);
            console.log(`  Is split: ${isSplitAward}`);
            console.log(`  Winners:`, award.Winners);
            
            // Test if image exists
            const img = new Image();
            img.onload = () => console.log(`  ✓ Image loaded successfully: ${imagePath}`);
            img.onerror = () => console.log(`  ✗ Image failed to load: ${imagePath}`);
            img.src = imagePath;
            
            if (isSplitAward) {
                const awardNames = award.name.split('/');
                const totalWinners = getTotalWinnerCount(award);
                const hasAnyWinners = award.Winners.some(list => Array.isArray(list) && list.length > 0);
                
                // For split awards, check for images array or generate from split names
                const splitImages = award.images || awardNames.map(splitName => {
                    const splitSlug = splitName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                    return `/marchMadness/${YEAR}/badges/${splitSlug}.png`;
                });
                
                // Log split image paths
                awardNames.forEach((splitName, i) => {
                    const splitImagePath = splitImages[i] || `/marchMadness/${YEAR}/badges/${splitName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`;
                    console.log(`  Split "${splitName}" -> "${splitImagePath}"`);
                    
                    const splitImg = new Image();
                    splitImg.onload = () => console.log(`    ✓ Split image loaded: ${splitImagePath}`);
                    splitImg.onerror = () => console.log(`    ✗ Split image failed: ${splitImagePath}`);
                    splitImg.src = splitImagePath;
                });
                
                return {
                    ...award,
                    isSplit: true,
                    splitNames: awardNames,
                    splitImages: splitImages,
                    imagePath: imagePath,
                    totalWinnersForPoints: totalWinners,
                    hasWinners: hasAnyWinners
                };
            } else {
                return {
                    ...award,
                    isSplit: false,
                    imagePath: imagePath,
                    totalWinnersForPoints: award.Winners?.length || 0,
                    hasWinners: award.Winners && award.Winners.length > 0
                };
            }
        });
    }
    
    /**
     * Get display string for split award winners
     */
    function formatSplitWinners(award) {
        if (!award.isSplit) return award.Winners?.join(', ') || '';
        
        const parts = [];
        const awardNames = award.splitNames || award.name.split('/');
        
        for (let i = 0; i < awardNames.length; i++) {
            const winners = award.Winners[i];
            if (Array.isArray(winners) && winners.length > 0) {
                parts.push(`${awardNames[i]}: ${winners.join(', ')}`);
            }
        }
        
        return parts.join(' | ');
    }
    
    /**
     * Group star bonuses by round
     */
    function getStarBonusesByRound() {
        const grouped = {};
        for (const award of starBonuses) {
            const round = String(award.round);
            if (!grouped[round]) {
                grouped[round] = [];
            }
            grouped[round].push(award);
        }
        return grouped;
    }
    
    /**
     * Get sorted round keys for display
     */
    function getSortedRoundKeys(grouped) {
        const keys = Object.keys(grouped);
        return keys.sort((a, b) => {
            // Numbers first, then "unknown"
            const aNum = parseInt(a);
            const bNum = parseInt(b);
            if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
            if (!isNaN(aNum)) return -1;
            if (!isNaN(bNum)) return 1;
            return a.localeCompare(b);
        });
    }
    
    /**
     * Get round display name
     */
    function getRoundDisplayName(round) {
        const roundNum = parseInt(round);
        if (!isNaN(roundNum) && scoringConfig?.roundNames?.[roundNum]) {
            return `Round ${roundNum}: ${scoringConfig.roundNames[roundNum]}`;
        }
        if (round === 'unknown') return 'Unknown Round';
        return `Round ${round}`;
    }
    
    /**
     * Generate a placeholder SVG badge for awards
     * @param {string} name - Award name
     * @param {boolean} earned - Whether the badge has been earned
     */
    function generatePlaceholderBadge(name, earned) {
        // Generate a consistent color based on the award name
        const colors = [
            { primary: '#f59e0b', secondary: '#fbbf24', accent: '#d97706' }, // Gold
            { primary: '#3b82f6', secondary: '#60a5fa', accent: '#2563eb' }, // Blue
            { primary: '#10b981', secondary: '#34d399', accent: '#059669' }, // Green
            { primary: '#8b5cf6', secondary: '#a78bfa', accent: '#7c3aed' }, // Purple
            { primary: '#ef4444', secondary: '#f87171', accent: '#dc2626' }, // Red
            { primary: '#ec4899', secondary: '#f472b6', accent: '#db2777' }, // Pink
            { primary: '#06b6d4', secondary: '#22d3ee', accent: '#0891b2' }, // Cyan
        ];
        
        // Pick color based on name hash
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash) + name.charCodeAt(i);
            hash = hash & hash;
        }
        const colorSet = colors[Math.abs(hash) % colors.length];
        
        // Get initials (up to 2 characters)
        const initials = name.split(/\s+/).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2);
        
        const fillColor = earned ? colorSet.primary : '#9ca3af';
        const strokeColor = earned ? colorSet.accent : '#6b7280';
        const secondaryColor = earned ? colorSet.secondary : '#d1d5db';
        
        return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <!-- Outer ring -->
            <circle cx="50" cy="50" r="46" fill="none" stroke="${strokeColor}" stroke-width="3"/>
            <!-- Badge background -->
            <circle cx="50" cy="50" r="42" fill="${fillColor}"/>
            <!-- Inner highlight -->
            <circle cx="50" cy="50" r="36" fill="${secondaryColor}" opacity="0.3"/>
            <!-- Star decoration at top -->
            <polygon points="50,8 52,14 58,14 53,18 55,24 50,20 45,24 47,18 42,14 48,14" fill="${earned ? '#fff' : '#e5e7eb'}" opacity="0.9"/>
            <!-- Initials -->
            <text x="50" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="${earned ? '#fff' : '#6b7280'}">${initials}</text>
            ${!earned ? `<!-- Lock overlay -->
            <circle cx="50" cy="50" r="42" fill="rgba(0,0,0,0.3)"/>` : ''}
        </svg>`;
    }
    
    async function loadTeams() {
        const response = await fetch(TEAMS_FILE);
        if (!response.ok) throw new Error(`Failed to load teams: ${response.status}`);
        
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        const header = lines[0].split(',').map(s => s.trim().replace(/^\ufeff/, '')); // Remove BOM if present
        
        // Find column indices
        const nameIdx = header.findIndex(h => h.toUpperCase() === 'TEAM');
        const seedIdx = header.findIndex(h => h.toUpperCase() === 'SEED');
        const regionIdx = header.findIndex(h => h.toUpperCase() === 'REGION');
        const probR32Idx = header.findIndex(h => h.toLowerCase() === 'prob_r32');
        const probR16Idx = header.findIndex(h => h.toLowerCase() === 'prob_r16');
        const probR8Idx = header.findIndex(h => h.toLowerCase() === 'prob_r8');
        const probR4Idx = header.findIndex(h => h.toLowerCase() === 'prob_r4');
        const probR2Idx = header.findIndex(h => h.toLowerCase() === 'prob_r2');
        const probWinIdx = header.findIndex(h => h.toLowerCase() === 'prob_win');
        
        teamsList = lines.slice(1).map(line => {
            const cols = line.split(',').map(s => s.trim());
            const team = { 
                name: cols[nameIdx] || cols[0], 
                seed: parseInt(cols[seedIdx] || cols[1]), 
                region: cols[regionIdx] || cols[2],
                // Probability of reaching each round (for vegas odds display)
                prob_r32: probR32Idx >= 0 ? parseFloat(cols[probR32Idx]) || 0 : null,
                prob_r16: probR16Idx >= 0 ? parseFloat(cols[probR16Idx]) || 0 : null,
                prob_r8: probR8Idx >= 0 ? parseFloat(cols[probR8Idx]) || 0 : null,
                prob_r4: probR4Idx >= 0 ? parseFloat(cols[probR4Idx]) || 0 : null,
                prob_r2: probR2Idx >= 0 ? parseFloat(cols[probR2Idx]) || 0 : null,
                prob_win: probWinIdx >= 0 ? parseFloat(cols[probWinIdx]) || 0 : null
            };
            teams[team.name] = team;
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
                    nextGameLosePreferences = data.next_game_lose_preferences || {};
                } else if (data.probabilities) {
                    // Old format with just 'probabilities'
                    winProbabilities = data.probabilities;
                    loseProbabilities = {};
                    averagePlaces = {};
                    winningScenarios = data.winning_scenarios || {};
                    losingScenarios = {};
                    nextGamePreferences = data.next_game_preferences || {};
                    nextGameLosePreferences = {};
                } else {
                    // Very old format - just probabilities object
                    winProbabilities = data;
                    loseProbabilities = {};
                    averagePlaces = {};
                    winningScenarios = {};
                    losingScenarios = {};
                    nextGamePreferences = {};
                    nextGameLosePreferences = {};
                }
            } else {
                // No probabilities file - leave empty
                winProbabilities = {};
                loseProbabilities = {};
                averagePlaces = {};
                winningScenarios = {};
                losingScenarios = {};
                nextGamePreferences = {};
                nextGameLosePreferences = {};
            }
        } catch (e) {
            console.log('No win probabilities file found');
            winProbabilities = {};
            loseProbabilities = {};
            averagePlaces = {};
            winningScenarios = {};
            losingScenarios = {};
            nextGamePreferences = {};
            nextGameLosePreferences = {};
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
            r1Col: 'C', r2Col: 'E', s16Col: 'H', e8Col: 'K', f4Col: 'N',
            r1ScoreCol: 'D', r2ScoreCol: 'F', s16ScoreCol: 'I', e8ScoreCol: 'L'
        });
        
        // West Region (left side, bottom)
        extractRegionWinners(sheet, bracket, 'West', 8, {
            r1Rows: [42, 46, 50, 54, 58, 62, 66, 70],
            r2Rows: [43, 47, 51, 55, 59, 63, 67, 71],
            s16Rows: [45, 53, 61, 69],
            e8Rows: [49, 65],
            f4Row: 57,
            r1Col: 'C', r2Col: 'E', s16Col: 'H', e8Col: 'K', f4Col: 'N',
            r1ScoreCol: 'D', r2ScoreCol: 'F', s16ScoreCol: 'I', e8ScoreCol: 'L'
        });
        
        // South Region (right side, top)
        extractRegionWinners(sheet, bracket, 'South', 16, {
            r1Rows: [7, 11, 15, 19, 23, 27, 31, 35],
            r2Rows: [8, 12, 16, 20, 24, 28, 32, 36],
            s16Rows: [10, 18, 26, 34],
            e8Rows: [14, 30],
            f4Row: 22,
            r1Col: 'AL', r2Col: 'AJ', s16Col: 'AG', e8Col: 'AD', f4Col: 'AA',
            r1ScoreCol: 'AK', r2ScoreCol: 'AI', s16ScoreCol: 'AF', e8ScoreCol: 'AC'
        });
        
        // Midwest Region (right side, bottom)
        extractRegionWinners(sheet, bracket, 'Midwest', 24, {
            r1Rows: [42, 46, 50, 54, 58, 62, 66, 70],
            r2Rows: [43, 47, 51, 55, 59, 63, 67, 71],
            s16Rows: [45, 53, 61, 69],
            e8Rows: [49, 65],
            f4Row: 57,
            r1Col: 'AL', r2Col: 'AJ', s16Col: 'AG', e8Col: 'AD', f4Col: 'AA',
            r1ScoreCol: 'AK', r2ScoreCol: 'AI', s16ScoreCol: 'AF', e8ScoreCol: 'AC'
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
        
        // Final Four scores (round 5)
        // Left Final Four: score at O22 and O57 (for the two teams feeding into championship)
        const f4Score1 = getCellValue(sheet, 'O', 22);  // East winner score
        const f4Score2 = getCellValue(sheet, 'O', 57);  // West winner score  
        const f4Score3 = getCellValue(sheet, 'Z', 22);  // South winner score
        const f4Score4 = getCellValue(sheet, 'Z', 57);  // Midwest winner score
        
        if (f4Score1 !== null && f4Score1 !== undefined && f4Score1 !== '') {
            bracket.round5[0].score1 = Number(f4Score1);
        }
        if (f4Score2 !== null && f4Score2 !== undefined && f4Score2 !== '') {
            bracket.round5[0].score2 = Number(f4Score2);
        }
        if (f4Score3 !== null && f4Score3 !== undefined && f4Score3 !== '') {
            bracket.round5[1].score1 = Number(f4Score3);
        }
        if (f4Score4 !== null && f4Score4 !== undefined && f4Score4 !== '') {
            bracket.round5[1].score2 = Number(f4Score4);
        }
        
        // Championship game scores (round 6)
        const champScore1 = getCellValue(sheet, 'P', 39);  // Team 1 score
        const champScore2 = getCellValue(sheet, 'V', 39);  // Team 2 score
        if (champScore1 !== null && champScore1 !== undefined && champScore1 !== '') {
            bracket.round6[0].score1 = Number(champScore1);
        }
        if (champScore2 !== null && champScore2 !== undefined && champScore2 !== '') {
            bracket.round6[0].score2 = Number(champScore2);
        }
        
        return bracket;
    }
    
    function extractRegionWinners(sheet, bracket, region, startIndex, config) {
        const { r1Rows, r2Rows, s16Rows, e8Rows, f4Row, r1Col, r2Col, s16Col, e8Col, f4Col,
                r1ScoreCol, r2ScoreCol, s16ScoreCol, e8ScoreCol, f4ScoreCol } = config;
        
        // Round 1 winners (from Round 2 cells) and scores
        for (let i = 0; i < 8; i++) {
            const winnerRow = r2Rows[i];
            const winner = getCellValue(sheet, r2Col, winnerRow);
            if (winner) {
                bracket.round1[startIndex + i].winner = findTeam(winner);
            }
            
            // Extract Round 1 scores from team rows
            // Team 1 is at r1Rows[i], Team 2 is at r1Rows[i] + 2
            if (r1ScoreCol) {
                const team1Row = r1Rows[i];
                const team2Row = r1Rows[i] + 2;
                const score1 = getCellValue(sheet, r1ScoreCol, team1Row);
                const score2 = getCellValue(sheet, r1ScoreCol, team2Row);
                if (score1 !== null && score1 !== undefined && score1 !== '') {
                    bracket.round1[startIndex + i].score1 = Number(score1);
                }
                if (score2 !== null && score2 !== undefined && score2 !== '') {
                    bracket.round1[startIndex + i].score2 = Number(score2);
                }
            }
        }
        
        // Round 2 winners (from Sweet 16 cells) and scores
        for (let i = 0; i < 4; i++) {
            const winnerRow = s16Rows[i];
            const winner = getCellValue(sheet, s16Col, winnerRow);
            if (winner) {
                const r2Index = Math.floor(startIndex / 2) + i;
                bracket.round2[r2Index].winner = findTeam(winner);
            }
            
            // Extract Round 2 scores from winner rows
            // Team 1 is at r2Rows[i*2], Team 2 is at r2Rows[i*2 + 1]
            if (r2ScoreCol) {
                const r2Index = Math.floor(startIndex / 2) + i;
                const team1Row = r2Rows[i * 2];
                const team2Row = r2Rows[i * 2 + 1];
                const score1 = getCellValue(sheet, r2ScoreCol, team1Row);
                const score2 = getCellValue(sheet, r2ScoreCol, team2Row);
                if (score1 !== null && score1 !== undefined && score1 !== '') {
                    bracket.round2[r2Index].score1 = Number(score1);
                }
                if (score2 !== null && score2 !== undefined && score2 !== '') {
                    bracket.round2[r2Index].score2 = Number(score2);
                }
            }
        }
        
        // Sweet 16 winners (from Elite 8 cells) and scores
        for (let i = 0; i < 2; i++) {
            const winnerRow = e8Rows[i];
            const winner = getCellValue(sheet, e8Col, winnerRow);
            if (winner) {
                const s16Index = Math.floor(startIndex / 4) + i;
                bracket.round3[s16Index].winner = findTeam(winner);
            }
            
            // Extract Sweet 16 scores
            // Team 1 is at s16Rows[i*2], Team 2 is at s16Rows[i*2 + 1]
            if (s16ScoreCol) {
                const s16Index = Math.floor(startIndex / 4) + i;
                const team1Row = s16Rows[i * 2];
                const team2Row = s16Rows[i * 2 + 1];
                const score1 = getCellValue(sheet, s16ScoreCol, team1Row);
                const score2 = getCellValue(sheet, s16ScoreCol, team2Row);
                if (score1 !== null && score1 !== undefined && score1 !== '') {
                    bracket.round3[s16Index].score1 = Number(score1);
                }
                if (score2 !== null && score2 !== undefined && score2 !== '') {
                    bracket.round3[s16Index].score2 = Number(score2);
                }
            }
        }
        
        // Elite 8 winner (from Final Four cell) and scores
        const f4Winner = getCellValue(sheet, f4Col, f4Row);
        if (f4Winner) {
            const e8Index = Math.floor(startIndex / 8);
            bracket.round4[e8Index].winner = findTeam(f4Winner);
        }
        
        // Extract Elite 8 scores
        // Team 1 is at e8Rows[0], Team 2 is at e8Rows[1]
        if (e8ScoreCol) {
            const e8Index = Math.floor(startIndex / 8);
            const score1 = getCellValue(sheet, e8ScoreCol, e8Rows[0]);
            const score2 = getCellValue(sheet, e8ScoreCol, e8Rows[1]);
            if (score1 !== null && score1 !== undefined && score1 !== '') {
                bracket.round4[e8Index].score1 = Number(score1);
            }
            if (score2 !== null && score2 !== undefined && score2 !== '') {
                bracket.round4[e8Index].score2 = Number(score2);
            }
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
    
    /**
     * Calculate the total score differential for a participant's correct picks,
     * along with counts in each category bucket.
     * For each game they picked correctly, adds |score1 - score2| to their total.
     * 
     * Returns: { total: number, counts: number[] }
     * - total: sum of all differentials
     * - counts: array of counts for each category (based on SCORE_DIFF_BUCKETS)
     */
    function calculateScoreDifferential(resultsBracket, picksBracket) {
        if (!resultsBracket || !picksBracket) return { total: 0, counts: [] };
        
        let totalDifferential = 0;
        const differentials = [];  // Collect all differentials to categorize
        
        for (let round = 1; round <= 6; round++) {
            const roundKey = `round${round}`;
            const resultsGames = resultsBracket[roundKey] || [];
            const picksGames = picksBracket[roundKey] || [];
            
            for (let i = 0; i < resultsGames.length; i++) {
                const resultGame = resultsGames[i];
                const pickGame = picksGames[i];
                
                // Skip if no result winner yet or no pick made
                if (!resultGame?.winner || !pickGame?.winner) continue;
                
                // Check if the pick was correct
                const resultWinner = resultGame.winner.name || resultGame.winner;
                const pickWinner = pickGame.winner.name || pickGame.winner;
                
                if (resultWinner === pickWinner) {
                    // Correct pick - add the score differential if scores exist
                    if (resultGame.score1 !== undefined && resultGame.score2 !== undefined) {
                        const differential = Math.abs(Number(resultGame.score1) - Number(resultGame.score2));
                        totalDifferential += differential;
                        differentials.push(differential);
                    }
                }
            }
        }
        
        // Categorize differentials into buckets
        const counts = categorizeDifferentials(differentials);
        
        return { total: totalDifferential, counts };
    }
    
    /**
     * Categorize differentials into buckets based on SCORE_DIFF_BUCKETS.
     * e.g., buckets [5, 10] creates categories: 0-5, 6-10, >10
     */
    function categorizeDifferentials(differentials) {
        if (!SCORE_DIFF_BUCKETS || SCORE_DIFF_BUCKETS.length === 0) {
            return [];
        }
        
        // Create counts array with one extra slot for "greater than last bucket"
        const counts = new Array(SCORE_DIFF_BUCKETS.length + 1).fill(0);
        
        for (const diff of differentials) {
            let placed = false;
            for (let i = 0; i < SCORE_DIFF_BUCKETS.length; i++) {
                if (diff <= SCORE_DIFF_BUCKETS[i]) {
                    counts[i]++;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                // Greater than all buckets
                counts[SCORE_DIFF_BUCKETS.length]++;
            }
        }
        
        return counts;
    }
    
    /**
     * Generate the column header showing bucket ranges.
     * e.g., [5, 10] -> "Diff (0-5, 6-10, 11+)"
     */
    function getDiffColumnHeader() {
        if (!SCORE_DIFF_BUCKETS || SCORE_DIFF_BUCKETS.length === 0) {
            return "Diff";
        }
        
        const ranges = [];
        let prevMax = 0;
        
        for (let i = 0; i < SCORE_DIFF_BUCKETS.length; i++) {
            const max = SCORE_DIFF_BUCKETS[i];
            ranges.push(`${prevMax}-${max}`);
            prevMax = max + 1;
        }
        
        // Add the final "X+" range
        ranges.push(`${prevMax}+`);
        
        return `Diff (${ranges.join(', ')})`;
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
            
            // Calculate score differential for correct picks (tiebreaker)
            const scoreDifferential = calculateScoreDifferential(resultsBracket, bracket);
            
            // Get star bonus points
            const starPoints = getStarPoints(name);
            const totalScore = scoreResult.totalScore + starPoints;
            
            standings.push({
                name,
                score: totalScore,
                baseScore: scoreResult.totalScore,
                starPoints: starPoints,
                correctPicks: scoreResult.correctPicks,
                seedBonus: scoreResult.seedBonus,
                possibleRemaining: possibleRemainingResult.total,
                possibleBase: possibleRemainingResult.basePoints,
                possibleBonus: possibleRemainingResult.bonusPoints,
                winProbability: winProbabilities[name] ?? null,
                loseProbability: loseProbabilities[name] ?? null,
                averagePlace: averagePlaces[name] ?? null,
                roundBreakdown: scoreResult.roundBreakdown,
                picksPerRound,
                scoreDifferential
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
    
    /**
     * Get the vegas odds (probability) for a team to win a game in a specific round.
     * The probability is the team's chance of reaching the NEXT round.
     * @param {Object} team - Team object with probability fields
     * @param {number} round - Current round number (1-6)
     * @returns {number|null} Probability or null if not available
     */
    function getVegasOdds(team, round) {
        if (!team) return null;
        
        // Map round to the probability column for reaching the next round
        const probMap = {
            1: team.prob_r32,  // Round 1 → probability of reaching Round of 32
            2: team.prob_r16,  // Round 2 → probability of reaching Sweet 16
            3: team.prob_r8,   // Round 3 → probability of reaching Elite 8
            4: team.prob_r4,   // Round 4 → probability of reaching Final Four
            5: team.prob_r2,   // Round 5 → probability of reaching Championship
            6: team.prob_win   // Round 6 → probability of winning
        };
        
        return probMap[round] ?? null;
    }
    
    /**
     * Get vegas odds for both teams in a game and validate they sum to ~1
     * @param {Object} team1 - First team
     * @param {Object} team2 - Second team
     * @param {number} round - Round number
     * @returns {{ team1Odds: number|null, team2Odds: number|null, warning: string|null }}
     */
    function getGameOdds(team1, team2, round) {
        const team1Odds = getVegasOdds(teams[team1?.name], round);
        const team2Odds = getVegasOdds(teams[team2?.name], round);
        
        let warning = null;
        
        if (team1Odds !== null && team2Odds !== null) {
            const sum = team1Odds + team2Odds;
            if (Math.abs(sum - 1) > 0.01) {
                warning = `Warning: Odds for ${team1?.name} vs ${team2?.name} sum to ${(sum * 100).toFixed(1)}% instead of 100%`;
                console.warn(warning);
            }
        }
        
        return { team1Odds, team2Odds, warning };
    }
    
    /**
     * Format odds as percentage
     */
    function formatOdds(odds) {
        if (odds === null || odds === undefined) return '-';
        return `${(odds * 100).toFixed(1)}%`;
    }
    
    /**
     * Format a scheduled time for display
     * @param {string} isoTime - ISO 8601 datetime string
     * @returns {string} Formatted date/time string
     */
    function formatScheduledTime(isoTime) {
        if (!isoTime) return null;
        
        try {
            const date = new Date(isoTime);
            
            // Format: "Thu, Mar 19 at 12:15 PM ET"
            const options = { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'America/New_York'
            };
            
            const formatted = date.toLocaleString('en-US', options);
            return `${formatted} ET`;
        } catch (e) {
            console.error('Error formatting time:', e);
            return null;
        }
    }
    
    /**
     * Get schedule info for a game
     */
    function getScheduleInfo(game) {
        if (!game) return null;
        
        const scheduledTime = formatScheduledTime(game.scheduledTime);
        const network = game.network || null;
        const location = game.location || null;
        
        if (!scheduledTime && !network && !location) return null;
        
        return { scheduledTime, network, location };
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
        const winProb = winProbabilities[participantName] || 0;
        
        // If participant has 0% win probability, use lose preferences instead
        if (winProb === 0) {
            const gamePrefs = nextGameLosePreferences[gameKey];
            if (!gamePrefs || !gamePrefs.preferences) return null;
            const pref = gamePrefs.preferences[participantName] || null;
            if (pref) {
                // Mark this as a lose preference so we can style it differently
                return { ...pref, isLosePreference: true };
            }
            return null;
        }
        
        // Otherwise use win preferences
        const gamePrefs = nextGamePreferences[gameKey];
        if (!gamePrefs || !gamePrefs.preferences) return null;
        const pref = gamePrefs.preferences[participantName] || null;
        if (pref) {
            return { ...pref, isLosePreference: false };
        }
        return null;
    }
    
    /**
     * Format preference as tuple string (Team1: X%, Team2: Y%)
     */
    /**
     * Generate a short abbreviation for a team name
     * Starts with 2-3 chars, adds more only if needed to differentiate
     */
    function getTeamAbbreviation(teamName, otherTeamName) {
        if (!teamName) return '??';
        
        // Helper to create abbreviation of given length
        const makeAbbrev = (name, len) => {
            // Remove common suffixes and clean up
            const cleaned = name.replace(/\./g, '').replace(/St\s/g, 'St');
            
            // If it's short enough already, just use it
            if (cleaned.length <= len) return cleaned;
            
            // Try to use capital letters / word starts
            const words = cleaned.split(/[\s\/]+/);
            if (words.length > 1) {
                // Multi-word: use first letter of each word (all caps for acronym)
                const initials = words.map(w => w[0]).join('').toUpperCase();
                if (initials.length >= 2) return initials.slice(0, Math.max(len, initials.length));
            }
            
            // Single word: take first N characters, capitalize only first letter
            const abbrev = cleaned.slice(0, len);
            return abbrev.charAt(0).toUpperCase() + abbrev.slice(1).toLowerCase();
        };
        
        // Start with 3 characters
        let len = 3;
        let abbrev1 = makeAbbrev(teamName, len);
        let abbrev2 = makeAbbrev(otherTeamName, len);
        
        // Increase length until they're different (up to 6 chars)
        while (abbrev1 === abbrev2 && len < 6) {
            len++;
            abbrev1 = makeAbbrev(teamName, len);
            abbrev2 = makeAbbrev(otherTeamName, len);
        }
        
        return abbrev1;
    }
    
    /**
     * Format a percentage according to the rules:
     * - >= 0.1%: 2 decimal places (e.g., 92.34%, 0.15%)
     * - 0.001% to < 0.1%: round to thousandths (e.g., 0.045%)
     * - < 0.001%: scientific notation with 3 sig figs (e.g., 8.22e-5%)
     * - exactly 0: show "0%"
     */
    function formatProbabilityPercent(prob) {
        if (prob === null || prob === undefined) return 'N/A';
        
        const pct = prob * 100;
        
        // Exactly 0
        if (pct === 0) return '0%';
        
        // >= 0.1%: 2 decimal places
        if (pct >= 0.1) {
            return pct.toFixed(2) + '%';
        }
        
        // 0.001% to < 0.1%: round to thousandths
        if (pct >= 0.001) {
            return pct.toFixed(3) + '%';
        }
        
        // < 0.001%: scientific notation with 2 decimal places (3 sig figs)
        return pct.toExponential(2) + '%';
    }
    
    /**
     * Format the ratio (max of t1/t2, t2/t1)
     */
    function formatRatio(t1, t2) {
        if (t1 === 0 && t2 === 0) return '—';
        if (t1 === 0 || t2 === 0) return '∞';
        
        const ratio = Math.max(t1 / t2, t2 / t1);
        
        if (ratio >= 100) {
            return ratio.toFixed(0) + '×';
        } else if (ratio >= 10) {
            return ratio.toFixed(1) + '×';
        } else {
            return ratio.toFixed(2) + '×';
        }
    }
    
    function formatPreferenceTuple(pref, team1Name, team2Name) {
        if (!pref) return 'N/A';
        
        const t1 = pref.team1;
        const t2 = pref.team2;
        
        // Get abbreviations
        const abbrev1 = getTeamAbbreviation(team1Name, team2Name);
        const abbrev2 = getTeamAbbreviation(team2Name, team1Name);
        
        // Format percentages
        const t1Pct = formatProbabilityPercent(t1);
        const t2Pct = formatProbabilityPercent(t2);
        
        // Calculate ratio
        const ratio = formatRatio(t1, t2);
        
        // Calculate absolute difference
        const diff = Math.abs(t1 - t2);
        const diffPct = formatProbabilityPercent(diff);
        
        return `${abbrev1}: ${t1Pct}, ${abbrev2}: ${t2Pct}, ${ratio}, Δ${diffPct}`;
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
            <button 
                class="tab" 
                class:active={activeTab === 'stars'}
                on:click={() => selectTab('stars')}
            >
                ⭐ Stars
            </button>
            <button 
                class="tab" 
                class:active={activeTab === 'rules'}
                on:click={() => selectTab('rules')}
            >
                📜 Rules
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
                                <th>⭐ Stars</th>
                                <th>Correct Picks</th>
                                <th>Underdog</th>
                                <th>Possible</th>
                                <th>Win %</th>
                                <th>Lose %</th>
                                <th>Avg Place</th>
                                <th title="Sum of score differentials for correct picks (tiebreaker)">{getDiffColumnHeader()}</th>
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
                                    <td class="star-points">
                                        {#if entry.starPoints > 0}
                                            +{entry.starPoints}
                                        {:else}
                                            -
                                        {/if}
                                    </td>
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
                                    <td class="total-points">
                                        {#if entry.scoreDifferential && entry.scoreDifferential.total > 0}
                                            {entry.scoreDifferential.total}
                                            {#if entry.scoreDifferential.counts && entry.scoreDifferential.counts.length > 0}
                                                <span class="diff-counts">({entry.scoreDifferential.counts.join(', ')})</span>
                                            {/if}
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
                                resultsPath={`${RESULTS_FILE}.json`}
                                {stakeData}
                                showScores={true}
                                on:nextGameClick={handleNextGameClick}
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
                    
                    <div class="stakes-legend">
                        <p class="stakes-description">
                            This shows what each participant has riding on upcoming games. Each column represents a team, showing who benefits if that team wins.
                        </p>
                        <div class="stakes-legend-example">
                            <div class="example-column">
                                <div class="example-header">
                                    <span>Team Name (seed)</span>
                                    <span class="vegas-odds-example">odds%</span>
                                </div>
                                <div class="example-row">
                                    <span class="example-name">participant</span>
                                    <span class="example-points">+pts</span>
                                    <span class="example-pref">(% scenarios)</span>
                                </div>
                            </div>
                            <div class="example-explanation">
                                <div class="explanation-item"><strong>odds%</strong> — Vegas probability to win this game</div>
                                <div class="explanation-item"><strong>+pts</strong> — Points riding on this team winning</div>
                                <div class="explanation-item"><strong>(team1 %, team2 %, ratio, delta)</strong> — Odds of winning/<span class="lose-text">losing</span> based on which team wins w/ resulting positive ratio and difference</div>
                            </div>
                        </div>
                    </div>
                    
                    {#if upcomingGames.length === 0}
                        <p class="no-data">No upcoming games found. The tournament may be complete or results haven't been entered.</p>
                    {:else}
                        {#each upcomingGames as gameInfo}
                            {@const gameKey = `r${gameInfo.round}-${gameInfo.index}`}
                            {@const odds = getGameOdds(gameInfo.team1, gameInfo.team2, gameInfo.round)}
                            {@const schedule = getScheduleInfo(gameInfo.game)}
                            <div class="stake-game" id="stake-game-{gameKey}">
                                <div class="stake-game-header">
                                    <h3>{getRoundName(gameInfo.round)}: {gameInfo.team1.name} vs {gameInfo.team2.name}</h3>
                                    {#if schedule}
                                        <div class="game-schedule">
                                            {#if schedule.scheduledTime}
                                                <span class="schedule-time">📅 {schedule.scheduledTime}</span>
                                            {/if}
                                            {#if schedule.network}
                                                <span class="schedule-network">📺 {schedule.network}</span>
                                            {/if}
                                            {#if schedule.location}
                                                <span class="schedule-location">📍 {schedule.location}</span>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                                {#if odds.warning}
                                    <p class="odds-warning">⚠️ {odds.warning}</p>
                                {/if}
                                
                                <div class="stake-columns">
                                    <div class="stake-column">
                                        <h4>
                                            <span>{gameInfo.team1.name} ({gameInfo.team1.seed})</span>
                                            <span class="vegas-odds">{formatOdds(odds.team1Odds)}</span>
                                        </h4>
                                        <ul class="stake-list">
                                            {#each Object.entries(stakeData[gameKey] || {}) as [name, stake]}
                                                {#if stake && stake.team1 > 0}
                                                    {@const pref = getPreference(gameKey, name)}
                                                    <li>
                                                        <span class="stake-name">{name}</span>
                                                        <span class="stake-points">+{stake.team1}</span>
                                                        <span class="stake-pref" class:lose-pref={pref?.isLosePreference}>({formatPreferenceTuple(pref, gameInfo.team1.name, gameInfo.team2.name)})</span>
                                                    </li>
                                                {/if}
                                            {/each}
                                        </ul>
                                    </div>
                                    
                                    <div class="stake-column">
                                        <h4>
                                            <span>{gameInfo.team2.name} ({gameInfo.team2.seed})</span>
                                            <span class="vegas-odds">{formatOdds(odds.team2Odds)}</span>
                                        </h4>
                                        <ul class="stake-list">
                                            {#each Object.entries(stakeData[gameKey] || {}) as [name, stake]}
                                                {#if stake && stake.team2 > 0}
                                                    {@const pref = getPreference(gameKey, name)}
                                                    <li>
                                                        <span class="stake-name">{name}</span>
                                                        <span class="stake-points">+{stake.team2}</span>
                                                        <span class="stake-pref" class:lose-pref={pref?.isLosePreference}>({formatPreferenceTuple(pref, gameInfo.team1.name, gameInfo.team2.name)})</span>
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
                                                        <span class="stake-pref" class:lose-pref={pref?.isLosePreference}>({formatPreferenceTuple(pref, gameInfo.team1.name, gameInfo.team2.name)})</span>
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
            {:else if activeTab === 'stars'}
                <div class="stars-view">
                    <h2>⭐ Star Bonus Awards</h2>
                    
                    <!-- Summary Table -->
                    <div class="stars-summary">
                        <h3>Summary</h3>
                        <table class="stars-summary-table">
                            <thead>
                                <tr>
                                    <th>Participant</th>
                                    <th>Badges Earned</th>
                                    <th>Star Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each participants.sort((a, b) => getStarPoints(b) - getStarPoints(a)) as name}
                                    {@const earnedBadges = getEarnedBadges(name)}
                                    <tr>
                                        <td class="name">{name}</td>
                                        <td class="badges-earned">
                                            {#if earnedBadges.length > 0}
                                                <div class="mini-badges">
                                                    {#each earnedBadges as badge}
                                                        {@const badgeSlug = badge.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
                                                        <button 
                                                            class="mini-badge" 
                                                            title={badge.name}
                                                            on:click={() => scrollToBadge(badgeSlug)}
                                                        >
                                                            <img 
                                                                src={badge.imagePath}
                                                                alt={badge.name}
                                                                class="mini-badge-image"
                                                                on:load={() => console.log(`✓ Mini badge loaded: ${badge.imagePath}`)}
                                                                on:error={(e) => {
                                                                    console.log(`✗ Mini badge FAILED: ${badge.imagePath}`);
                                                                    e.target.outerHTML = generatePlaceholderBadge(badge.name, true);
                                                                }}
                                                            />
                                                        </button>
                                                    {/each}
                                                </div>
                                            {:else}
                                                <span class="no-badges">—</span>
                                            {/if}
                                        </td>
                                        <td class="points">
                                            {#if getStarPoints(name) > 0}
                                                +{getStarPoints(name)}
                                            {:else}
                                                0
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Awards by Round -->
                    <div class="awards-by-round">
                        <h3>Awards by Round</h3>
                        {#each getSortedRoundKeys(getStarBonusesByRound()) as roundKey}
                            {@const roundAwards = getStarBonusesByRound()[roundKey]}
                            {@const preparedAwards = prepareAwardsForDisplay(roundAwards)}
                            <div class="round-section">
                                <h4>{getRoundDisplayName(roundKey)}</h4>
                                <div class="badges-grid">
                                    {#each preparedAwards as award}
                                        {@const awardPoints = getAwardPoints(award.totalWinnersForPoints)}
                                        {@const badgeSlug = award.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
                                        <div 
                                            id="badge-{badgeSlug}"
                                            class="badge-card" 
                                            class:earned={award.hasWinners} 
                                            class:locked={!award.hasWinners}
                                            class:split-award={award.isSplit}
                                        >
                                            <div class="badge-image-container" class:split-images={award.isSplit}>
                                                {#if award.isSplit}
                                                    <!-- Split award: show multiple images with slashes -->
                                                    <div class="split-badge-row">
                                                        {#each award.splitNames as splitName, i}
                                                            {@const splitImagePath = award.splitImages[i]}
                                                            {@const splitHasWinner = Array.isArray(award.Winners[i]) && award.Winners[i].length > 0}
                                                            {#if i > 0}
                                                                <span class="split-separator">/</span>
                                                            {/if}
                                                            <div class="split-badge-item" class:earned={splitHasWinner} class:locked={!splitHasWinner}>
                                                                <img 
                                                                    src={splitImagePath}
                                                                    alt={splitName}
                                                                    class="split-badge-image"
                                                                    class:locked={!splitHasWinner}
                                                                    on:load={() => console.log(`✓ Split badge loaded: ${splitImagePath}`)}
                                                                    on:error={(e) => {
                                                                        console.log(`✗ Split badge FAILED: ${splitImagePath}`);
                                                                        e.target.src = `data:image/svg+xml,${encodeURIComponent(generatePlaceholderBadge(splitName, !splitHasWinner))}`;
                                                                    }}
                                                                />
                                                            </div>
                                                        {/each}
                                                    </div>
                                                {:else}
                                                    <!-- Regular (non-split) badge - always show image -->
                                                    <img 
                                                        src={award.imagePath}
                                                        alt={award.name}
                                                        class="badge-image"
                                                        class:locked={!award.hasWinners}
                                                        on:load={() => console.log(`✓ Badge image loaded: ${award.imagePath}`)}
                                                        on:error={(e) => {
                                                            console.log(`✗ Badge image FAILED: ${award.imagePath}`);
                                                            e.target.src = `data:image/svg+xml,${encodeURIComponent(generatePlaceholderBadge(award.name, !award.hasWinners))}`;
                                                        }}
                                                    />
                                                {/if}
                                            </div>
                                            
                                            <div class="badge-info">
                                                <div class="badge-header">
                                                    <span class="badge-name">{award.name}</span>
                                                    {#if award.hasWinners}
                                                        <span class="badge-points">+{awardPoints}</span>
                                                    {/if}
                                                </div>
                                                
                                                {#if award.hasWinners}
                                                    <div class="badge-winners">
                                                        {#if award.isSplit}
                                                            {formatSplitWinners(award)}
                                                        {:else}
                                                            {award.Winners.join(', ')}
                                                        {/if}
                                                    </div>
                                                    <div class="badge-reason">
                                                        {award.reason}
                                                    </div>
                                                {:else}
                                                    <div class="badge-locked-text">
                                                        🔒 Not yet awarded
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                        
                        {#if starBonuses.length === 0}
                            <p class="no-data">No star bonus awards configured.</p>
                        {/if}
                    </div>
                </div>
            {:else if activeTab === 'rules'}
                <div class="rules-view">
                    <MarchMadnessRules configPath={SCORING_CONFIG_FILE} />
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
    
    .stake-game-header {
        margin-bottom: 1rem;
    }
    
    .stake-game h3 {
        margin-bottom: 0.5rem;
        color: #1f2937;
    }
    
    .game-schedule {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        font-size: 0.85rem;
        color: #6b7280;
    }
    
    .schedule-time {
        color: #4b5563;
        font-weight: 500;
    }
    
    .schedule-network {
        color: #2563eb;
        font-weight: 500;
    }
    
    .schedule-location {
        color: #6b7280;
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
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .vegas-odds {
        font-weight: 600;
        color: #059669;
        font-size: 0.85rem;
    }
    
    .odds-warning {
        color: #b45309;
        font-size: 0.8rem;
        margin-bottom: 0.5rem;
        padding: 0.25rem 0.5rem;
        background: #fef3c7;
        border-radius: 4px;
    }
    
    /* Stakes Legend */
    .stakes-legend {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 1rem 1.25rem;
        margin-bottom: 1.5rem;
    }
    
    .stakes-description {
        margin: 0 0 1rem 0;
        font-size: 0.9rem;
        color: #4b5563;
        line-height: 1.5;
    }
    
    .stakes-legend-example {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
        align-items: flex-start;
    }
    
    .example-column {
        background: white;
        border-radius: 6px;
        padding: 0.75rem;
        min-width: 200px;
        border: 1px solid #e5e7eb;
    }
    
    .example-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.85rem;
        font-weight: 600;
        padding-bottom: 0.5rem;
        margin-bottom: 0.5rem;
        border-bottom: 2px solid #0066cc;
    }
    
    .example-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        color: #6b7280;
    }
    
    .example-name {
        flex: 1;
        font-style: italic;
    }
    
    .example-points {
        color: #059669;
        font-weight: 600;
    }
    
    .example-pref {
        color: #6b7280;
        font-size: 0.75rem;
    }
    
    .example-explanation {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        font-size: 0.8rem;
        color: #6b7280;
    }
    
    .explanation-item {
        line-height: 1.4;
    }
    
    .vegas-odds-example {
        color: #059669;
        font-weight: 600;
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
    
    .stake-pref.lose-pref {
        color: #b45309;  /* Muted red/orange for lose preferences */
    }
    
    .lose-text {
        color: #b45309;  /* Muted red/orange for "losing" text in legend */
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
    
    /* Total points column styling */
    .standings-table .total-points {
        color: #7c3aed;
        font-weight: 500;
    }
    
    .standings-table .diff-counts {
        color: #6b7280;
        font-weight: 400;
        font-size: 0.85em;
        margin-left: 2px;
    }
    
    /* Win probability column styling (keep green) */
    .standings-table .win-prob {
        color: #166534;
        font-weight: 500;
    }
    
    /* Star points column styling */
    .standings-table .star-points {
        color: #b45309;
        font-weight: 500;
    }
    
    /* Rules view */
    .rules-view {
        max-width: 800px;
        margin: 0 auto;
    }
    
    /* Stars view */
    .stars-view {
        max-width: 1000px;
        margin: 0 auto;
    }
    
    .stars-view h2 {
        margin-bottom: 1.5rem;
        color: #1f2937;
    }
    
    .stars-view h3 {
        font-size: 1.2rem;
        color: #374151;
        margin: 1.5rem 0 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #e5e7eb;
    }
    
    /* Stars Summary Table */
    .stars-summary {
        margin-bottom: 2rem;
    }
    
    .stars-summary-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
    }
    
    .stars-summary-table th,
    .stars-summary-table td {
        padding: 0.75rem 1rem;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .stars-summary-table th {
        background: #f9fafb;
        font-weight: 600;
        color: #374151;
    }
    
    .stars-summary-table .badges-earned {
        padding: 0.5rem 1rem;
    }
    
    .mini-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        align-items: center;
    }
    
    .mini-badge {
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        border-radius: 50%;
        transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .mini-badge:hover {
        transform: scale(1.15);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .mini-badge-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    
    .mini-badge :global(svg) {
        width: 100%;
        height: 100%;
    }
    
    .no-badges {
        color: #9ca3af;
    }
    
    /* Badge highlight animation when scrolled to */
    .badge-card.highlight-badge {
        animation: badge-pulse 1.5s ease-out;
    }
    
    @keyframes badge-pulse {
        0% {
            box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.7);
        }
        50% {
            box-shadow: 0 0 0 15px rgba(251, 191, 36, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(251, 191, 36, 0);
        }
    }
    
    .stars-summary-table .points {
        text-align: right;
        font-weight: 600;
        color: #b45309;
    }
    
    /* Awards by Round */
    .awards-by-round {
        margin-bottom: 2rem;
    }
    
    .round-section {
        margin-bottom: 2rem;
    }
    
    .round-section h4 {
        font-size: 1rem;
        color: #6b7280;
        margin-bottom: 1rem;
        font-weight: 500;
    }
    
    /* Badge Grid */
    .badges-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 1.5rem;
        align-items: stretch;
    }
    
    .badge-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: white;
        border-radius: 12px;
        padding: 1rem 0.75rem;
        border: 2px solid #e5e7eb;
        transition: all 0.3s ease;
        text-align: center;
        min-height: 220px;
    }
    
    .badge-card.split-award {
        padding: 1rem 0.5rem;
    }
    
    .badge-card.earned {
        border-color: #fbbf24;
        background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
        box-shadow: 0 4px 12px rgba(251, 191, 36, 0.2);
    }
    
    .badge-card.earned:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(251, 191, 36, 0.3);
    }
    
    .badge-card.locked {
        opacity: 0.7;
        filter: saturate(0.3);
    }
    
    /* Badge Image */
    .badge-image-container {
        width: 70px;
        height: 70px;
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    
    .badge-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    
    /* Locked (not yet awarded) badge styling */
    .badge-image.locked,
    .split-badge-image.locked {
        filter: grayscale(100%);
        opacity: 0.5;
    }
    
    .badge-placeholder {
        width: 100%;
        height: 100%;
    }
    
    .badge-placeholder :global(svg) {
        width: 100%;
        height: 100%;
    }
    
    /* Badge Info */
    .badge-info {
        width: 100%;
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    
    .badge-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        margin-bottom: 0.5rem;
    }
    
    .badge-name {
        font-weight: 600;
        color: #1f2937;
        font-size: 0.95rem;
        line-height: 1.2;
    }
    
    /* Split award styling */
    .badge-image-container.split-images {
        width: 100%;
        height: 70px;
    }
    
    .split-badge-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.1rem;
    }
    
    .split-separator {
        font-size: 1.1rem;
        font-weight: 300;
        color: #9ca3af;
        margin: 0;
    }
    
    .split-badge-item {
        width: 50px;
        height: 50px;
        flex-shrink: 0;
    }
    
    .split-badge-item.locked {
        opacity: 0.5;
        filter: saturate(0.3);
    }
    
    .split-badge-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    
    .split-badge-placeholder {
        width: 100%;
        height: 100%;
    }
    
    .split-badge-placeholder :global(svg) {
        width: 100%;
        height: 100%;
    }
    
    .badge-points {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
        padding: 0.2rem 0.6rem;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 700;
    }
    
    .badge-winners {
        font-size: 0.9rem;
        font-weight: 500;
        color: #374151;
        margin-bottom: 0.5rem;
    }
    
    .badge-reason {
        font-size: 0.8rem;
        color: #6b7280;
        font-style: italic;
        line-height: 1.4;
        padding-top: 0.5rem;
        border-top: 1px solid #e5e7eb;
    }
    
    .badge-locked-text {
        color: #9ca3af;
        font-size: 0.85rem;
        padding: 0.25rem 0;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    /* Mobile responsive for stars view */
    @media (max-width: 640px) {
        .badges-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
        }
        
        .badge-card {
            padding: 1rem;
        }
        
        .badge-image-container {
            width: 60px;
            height: 60px;
        }
        
        .split-badge-item {
            width: 32px;
            height: 32px;
        }
        
        .badge-name {
            font-size: 0.85rem;
        }
        
        .badge-reason {
            font-size: 0.75rem;
        }
    }
    
    @media (max-width: 400px) {
        .badges-grid {
            grid-template-columns: 1fr;
        }
    }
</style>