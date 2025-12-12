<script>
    import { onMount } from 'svelte';
    
    // Props
    export let dataPath = '/marchMadness/2026/finalTournamentResults.json';
    export let savePath = '/tournamentResults.json';
    export let editable = true;
    
    // State
    let tournament = null;
    let loading = true;
    let error = null;
    let activeTab = 'tournament'; // 'tournament', 'rules'
    let hasUnsavedChanges = false;
    let saveStatus = null; // 'saving', 'saved', 'error'
    
    // Editing state
    let editingMatch = null; // { type: 'group'|'bracket'|'thirdPlace', groupIndex?, matchIndex?, roundIndex?, score1, score2 }
    
    onMount(async () => {
        try {
            const response = await fetch(dataPath);
            if (!response.ok) throw new Error(`Failed to load tournament data: ${response.status}`);
            tournament = await response.json();
            loading = false;
        } catch (err) {
            error = err.message;
            loading = false;
        }
    });
    
    // Start editing a match
    function startEditing(type, indices, currentScore1, currentScore2) {
        editingMatch = {
            type,
            ...indices,
            score1: currentScore1 ?? '',
            score2: currentScore2 ?? ''
        };
    }
    
    // Cancel editing
    function cancelEditing() {
        editingMatch = null;
    }
    
    // Save match score
    function saveMatchScore() {
        if (!editingMatch) return;
        
        const score1 = parseInt(editingMatch.score1);
        const score2 = parseInt(editingMatch.score2);
        
        if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
            alert('Please enter valid scores');
            return;
        }
        
        if (editingMatch.type === 'group') {
            const match = tournament.groups[editingMatch.groupIndex].matches[editingMatch.matchIndex];
            match.score1 = score1;
            match.score2 = score2;
            match.completed = true;
            
            // Check if group stage is complete and populate bracket
            checkAndPopulateBracket();
        } else if (editingMatch.type === 'bracket') {
            const match = tournament.bracket.rounds[editingMatch.roundIndex].matches[editingMatch.matchIndex];
            match.score1 = score1;
            match.score2 = score2;
            // Determine winner (higher score wins, or null if tie - ties might need extra handling)
            if (score1 > score2) {
                match.winner = match.team1.name;
            } else if (score2 > score1) {
                match.winner = match.team2.name;
            } else {
                match.winner = null; // Tie - might need tiebreaker
            }
            
            // Propagate winner to next round if applicable
            propagateWinner(editingMatch.roundIndex, editingMatch.matchIndex);
        } else if (editingMatch.type === 'thirdPlace') {
            tournament.bracket.thirdPlaceMatch.score1 = score1;
            tournament.bracket.thirdPlaceMatch.score2 = score2;
            if (score1 > score2) {
                tournament.bracket.thirdPlaceMatch.winner = tournament.bracket.thirdPlaceMatch.team1.name;
            } else if (score2 > score1) {
                tournament.bracket.thirdPlaceMatch.winner = tournament.bracket.thirdPlaceMatch.team2.name;
            }
        }
        
        tournament = tournament; // Trigger reactivity
        hasUnsavedChanges = true;
        editingMatch = null;
    }
    
    // Propagate winner to next round
    function propagateWinner(roundIndex, matchIndex) {
        const currentMatch = tournament.bracket.rounds[roundIndex].matches[matchIndex];
        if (!currentMatch.winner) return;
        
        const nextRoundIndex = roundIndex + 1;
        if (nextRoundIndex >= tournament.bracket.rounds.length) return;
        
        const currentRound = tournament.bracket.rounds[roundIndex];
        const nextRound = tournament.bracket.rounds[nextRoundIndex];
        
        // Figure out which match in the next round this feeds into
        let nextMatchIndex;
        let slotInMatch; // 0 = team1, 1 = team2
        
        if (currentRound.matches.length === nextRound.matches.length) {
            // 1:1 mapping (e.g., QF to SF with byes) - each match feeds into corresponding match as team2
            nextMatchIndex = matchIndex;
            slotInMatch = 1; // Winner goes to team2 slot (team1 has the bye)
        } else {
            // Standard bracket: 2 matches feed into 1
            nextMatchIndex = Math.floor(matchIndex / 2);
            slotInMatch = matchIndex % 2; // Even = team1, Odd = team2
        }
        
        const nextMatch = nextRound.matches[nextMatchIndex];
        if (!nextMatch) return;
        
        // Determine if winner goes to team1 or team2 slot
        if (slotInMatch === 0) {
            nextMatch.team1 = { name: currentMatch.winner, source: currentMatch.id, seed: null };
        } else {
            nextMatch.team2 = { name: currentMatch.winner, source: currentMatch.id, seed: null };
        }
        
        // Also update 3rd place match with losers from semifinals
        updateThirdPlaceMatch();
    }
    
    // Update 3rd place match with semifinal losers
    function updateThirdPlaceMatch() {
        if (!tournament.bracket.thirdPlaceMatch) return;
        if (!tournament.bracket.rounds || tournament.bracket.rounds.length < 2) return;
        
        // Find semifinals (second to last round)
        const semifinalRoundIndex = tournament.bracket.rounds.length - 2;
        const semifinals = tournament.bracket.rounds[semifinalRoundIndex];
        
        if (!semifinals || semifinals.name !== 'Semifinals') return;
        
        // Get losers from each semifinal
        semifinals.matches.forEach((match, index) => {
            if (match.winner) {
                const loser = match.winner === match.team1.name ? match.team2.name : match.team1.name;
                if (index === 0) {
                    tournament.bracket.thirdPlaceMatch.team1 = { name: loser, source: match.id, seed: null };
                } else {
                    tournament.bracket.thirdPlaceMatch.team2 = { name: loser, source: match.id, seed: null };
                }
            }
        });
    }
    
    // Check if all group stage matches are complete
    function isGroupStageComplete() {
        if (!tournament.groups || tournament.groups.length === 0) return false;
        return tournament.groups.every(group => 
            group.matches.every(match => match.completed)
        );
    }
    
    // Auto-populate bracket from group standings
    function populateBracketFromGroups() {
        if (!tournament.bracket || !tournament.bracket.rounds || tournament.bracket.rounds.length === 0) return;
        if (!tournament.groups || tournament.groups.length === 0) return;
        
        const firstRound = tournament.bracket.rounds[0];
        const advancementCount = tournament.format.groupAdvancement || 2;
        
        // Get standings for each group
        const allQualifiers = [];
        tournament.groups.forEach((group, groupIndex) => {
            const standings = calculateStandings(group);
            const qualifiers = standings.slice(0, advancementCount).map((team, position) => ({
                name: team.name,
                group: group.name,
                groupIndex: groupIndex,
                position: position + 1, // 1st, 2nd, etc.
                seed: position + 1
            }));
            allQualifiers.push(...qualifiers);
        });
        
        // Populate bracket based on number of groups and format
        if (tournament.groups.length === 1) {
            // Single group/league format
            
            // Check for 6-team advancement with byes (Champions League style)
            if (advancementCount === 6 && tournament.bracket.rounds.length >= 3) {
                // Format: QF (3v6, 4v5), SF (1 vs QF1 winner, 2 vs QF2 winner), Final
                const qfRound = tournament.bracket.rounds[0];
                const sfRound = tournament.bracket.rounds[1];
                
                // Quarterfinals: 3rd vs 6th, 4th vs 5th
                if (qfRound && qfRound.matches.length >= 2) {
                    qfRound.matches[0].team1 = { name: allQualifiers[2]?.name || 'TBD', source: 'League 3rd', seed: 3 };
                    qfRound.matches[0].team2 = { name: allQualifiers[5]?.name || 'TBD', source: 'League 6th', seed: 6 };
                    qfRound.matches[1].team1 = { name: allQualifiers[3]?.name || 'TBD', source: 'League 4th', seed: 4 };
                    qfRound.matches[1].team2 = { name: allQualifiers[4]?.name || 'TBD', source: 'League 5th', seed: 5 };
                }
                
                // Semifinals: 1st gets bye vs QF1 winner, 2nd gets bye vs QF2 winner
                if (sfRound && sfRound.matches.length >= 2) {
                    sfRound.matches[0].team1 = { name: allQualifiers[0]?.name || 'TBD', source: 'League 1st (BYE)', seed: 1 };
                    // team2 will be populated when QF1 winner is determined
                    sfRound.matches[1].team1 = { name: allQualifiers[1]?.name || 'TBD', source: 'League 2nd (BYE)', seed: 2 };
                    // team2 will be populated when QF2 winner is determined
                }
            }
            // 4-team advancement: 1v4, 2v3 semifinals
            else if (advancementCount >= 4 && firstRound.matches.length >= 2) {
                // Semifinals: 1v4, 2v3
                firstRound.matches[0].team1 = { name: allQualifiers[0]?.name || 'TBD', source: 'League', seed: 1 };
                firstRound.matches[0].team2 = { name: allQualifiers[3]?.name || 'TBD', source: 'League', seed: 4 };
                firstRound.matches[1].team1 = { name: allQualifiers[1]?.name || 'TBD', source: 'League', seed: 2 };
                firstRound.matches[1].team2 = { name: allQualifiers[2]?.name || 'TBD', source: 'League', seed: 3 };
            } 
            // 2-team advancement: straight to final
            else if (advancementCount >= 2 && firstRound.matches.length >= 1) {
                // Final: 1v2
                firstRound.matches[0].team1 = { name: allQualifiers[0]?.name || 'TBD', source: 'League', seed: 1 };
                firstRound.matches[0].team2 = { name: allQualifiers[1]?.name || 'TBD', source: 'League', seed: 2 };
            }
        } else if (tournament.groups.length === 2) {
            // Two groups: A1 vs B2, B1 vs A2 (crossover)
            const groupA = tournament.groups[0];
            const groupB = tournament.groups[1];
            const standingsA = calculateStandings(groupA);
            const standingsB = calculateStandings(groupB);
            
            if (firstRound.matches.length >= 2) {
                // SF1: A1 vs B2
                firstRound.matches[0].team1 = { name: standingsA[0]?.name || 'TBD', source: groupA.name, seed: 1 };
                firstRound.matches[0].team2 = { name: standingsB[1]?.name || 'TBD', source: groupB.name, seed: 2 };
                // SF2: B1 vs A2
                firstRound.matches[1].team1 = { name: standingsB[0]?.name || 'TBD', source: groupB.name, seed: 1 };
                firstRound.matches[1].team2 = { name: standingsA[1]?.name || 'TBD', source: groupA.name, seed: 2 };
            }
        } else {
            // More than 2 groups: fill in order (could be customized)
            let matchIndex = 0;
            for (let pos = 0; pos < advancementCount && matchIndex < firstRound.matches.length; pos++) {
                for (let g = 0; g < tournament.groups.length && matchIndex < firstRound.matches.length; g += 2) {
                    const standings1 = calculateStandings(tournament.groups[g]);
                    const standings2 = tournament.groups[g + 1] ? calculateStandings(tournament.groups[g + 1]) : null;
                    
                    if (standings2) {
                        // Cross-match: Group g position vs Group g+1 opposite position
                        const oppositePos = advancementCount - 1 - pos;
                        firstRound.matches[matchIndex].team1 = { 
                            name: standings1[pos]?.name || 'TBD', 
                            source: tournament.groups[g].name, 
                            seed: pos + 1 
                        };
                        firstRound.matches[matchIndex].team2 = { 
                            name: standings2[oppositePos]?.name || 'TBD', 
                            source: tournament.groups[g + 1].name, 
                            seed: oppositePos + 1 
                        };
                        matchIndex++;
                    }
                }
            }
        }
        
        tournament = tournament; // Trigger reactivity
        // Force deep reactivity update on bracket
        if (tournament.bracket) {
            tournament.bracket = { ...tournament.bracket };
        }
    }
    
    // Check and populate bracket when group stage completes
    function checkAndPopulateBracket() {
        if (isGroupStageComplete() && tournament.format.groupStage && tournament.format.knockoutStage) {
            populateBracketFromGroups();
            tournament = tournament; // Ensure reactivity update
        }
    }
    
    // Clear match result
    function clearMatchResult(type, indices) {
        if (type === 'group') {
            const match = tournament.groups[indices.groupIndex].matches[indices.matchIndex];
            match.score1 = null;
            match.score2 = null;
            match.completed = false;
            // Note: Clearing a group match might invalidate bracket, but we don't auto-clear bracket
        } else if (type === 'bracket') {
            const match = tournament.bracket.rounds[indices.roundIndex].matches[indices.matchIndex];
            match.score1 = null;
            match.score2 = null;
            match.winner = null;
            // TODO: Could also clear downstream matches
        } else if (type === 'thirdPlace') {
            tournament.bracket.thirdPlaceMatch.score1 = null;
            tournament.bracket.thirdPlaceMatch.score2 = null;
            tournament.bracket.thirdPlaceMatch.winner = null;
        }
        
        tournament = tournament;
        hasUnsavedChanges = true;
    }
    
    // Save tournament to JSON
    async function saveTournament() {
        saveStatus = 'saving';
        
        try {
            // Create a downloadable JSON file
            const dataStr = JSON.stringify(tournament, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = savePath.split('/').pop() || 'tournamentResults.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            hasUnsavedChanges = false;
            saveStatus = 'saved';
            setTimeout(() => saveStatus = null, 2000);
        } catch (err) {
            console.error('Error saving tournament:', err);
            saveStatus = 'error';
            setTimeout(() => saveStatus = null, 3000);
        }
    }
    
    // Export just the results (scores only, more compact)
    function exportResults() {
        const results = {
            tournamentName: tournament.tournamentName,
            exportedAt: new Date().toISOString(),
            groupResults: tournament.groups?.map(g => ({
                name: g.name,
                matches: g.matches.filter(m => m.completed).map(m => ({
                    team1: m.team1,
                    team2: m.team2,
                    score1: m.score1,
                    score2: m.score2
                }))
            })),
            bracketResults: tournament.bracket?.rounds.map(r => ({
                name: r.name,
                matches: r.matches.map(m => ({
                    id: m.id,
                    team1: m.team1?.name,
                    team2: m.team2?.name,
                    score1: m.score1,
                    score2: m.score2,
                    winner: m.winner
                }))
            })),
            thirdPlaceResult: tournament.bracket?.thirdPlaceMatch ? {
                team1: tournament.bracket.thirdPlaceMatch.team1?.name,
                team2: tournament.bracket.thirdPlaceMatch.team2?.name,
                score1: tournament.bracket.thirdPlaceMatch.score1,
                score2: tournament.bracket.thirdPlaceMatch.score2,
                winner: tournament.bracket.thirdPlaceMatch.winner
            } : null
        };
        
        const dataStr = JSON.stringify(results, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tournamentResults-export.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Calculate group standings from match results
    function calculateStandings(group) {
        const standings = {};
        
        // Initialize all teams
        group.teams.forEach(team => {
            standings[team] = {
                name: team,
                played: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                pointsFor: 0,
                pointsAgainst: 0,
                pointsDiff: 0,
                points: 0 // 3 for win, 1 for draw, 0 for loss
            };
        });
        
        // Process completed matches
        group.matches.filter(m => m.completed).forEach(match => {
            const t1 = standings[match.team1];
            const t2 = standings[match.team2];
            
            t1.played++;
            t2.played++;
            t1.pointsFor += match.score1;
            t1.pointsAgainst += match.score2;
            t2.pointsFor += match.score2;
            t2.pointsAgainst += match.score1;
            
            if (match.score1 > match.score2) {
                t1.wins++;
                t1.points += 3;
                t2.losses++;
            } else if (match.score2 > match.score1) {
                t2.wins++;
                t2.points += 3;
                t1.losses++;
            } else {
                t1.draws++;
                t2.draws++;
                t1.points += 1;
                t2.points += 1;
            }
        });
        
        // Calculate point differential
        Object.values(standings).forEach(team => {
            team.pointsDiff = team.pointsFor - team.pointsAgainst;
        });
        
        // Sort by points, then point differential, then points for
        return Object.values(standings).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
            return b.pointsFor - a.pointsFor;
        });
    }
    
    // Get team display name for bracket
    function getTeamDisplayName(team) {
        if (!team) return 'TBD';
        return team.name || 'TBD';
    }
    
    // Get team info (player1, player2) by team name
    function getTeamInfo(teamName) {
        if (!tournament.teams) return null;
        return tournament.teams.find(t => t.name === teamName) || null;
    }
    
    // Get unique board names from schedule (Home first, then others alphabetically)
    function getBoards() {
        if (!tournament.schedule) return [];
        const boards = new Set();
        tournament.schedule.forEach(slot => {
            slot.matches.forEach(match => {
                if (match.board) boards.add(match.board);
            });
        });
        return Array.from(boards).sort((a, b) => {
            if (a === 'Home') return -1;
            if (b === 'Home') return 1;
            return a.localeCompare(b);
        });
    }
    
    // Find group match data by team names
    function findGroupMatch(team1, team2) {
        if (!tournament.groups) return null;
        for (let groupIndex = 0; groupIndex < tournament.groups.length; groupIndex++) {
            const group = tournament.groups[groupIndex];
            for (let matchIndex = 0; matchIndex < group.matches.length; matchIndex++) {
                const match = group.matches[matchIndex];
                if ((match.team1 === team1 && match.team2 === team2) ||
                    (match.team1 === team2 && match.team2 === team1)) {
                    return { match, groupIndex, matchIndex, swapped: match.team1 !== team1 };
                }
            }
        }
        return null;
    }
    
    // Find bracket match by matchId
    function findBracketMatch(matchId) {
        if (!tournament.bracket || !matchId) return null;
        
        if (matchId === 'third' && tournament.bracket.thirdPlaceMatch) {
            return { match: tournament.bracket.thirdPlaceMatch, type: 'thirdPlace' };
        }
        
        for (let roundIndex = 0; roundIndex < tournament.bracket.rounds.length; roundIndex++) {
            const round = tournament.bracket.rounds[roundIndex];
            for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
                if (round.matches[matchIndex].id === matchId) {
                    return { match: round.matches[matchIndex], roundIndex, matchIndex, type: 'bracket' };
                }
            }
        }
        return null;
    }
    
    // Get match for a specific schedule slot and board
    function getScheduleMatch(slotIndex, board) {
        const slot = tournament.schedule[slotIndex];
        if (!slot) return null;
        return slot.matches.find(m => m.board === board) || null;
    }
    
    // Check if a schedule match is a group match
    function isGroupStageMatch(scheduleMatch) {
        return scheduleMatch && !scheduleMatch.matchId;
    }

    // Find schedule info for a group match
    function getGroupMatchSchedule(team1, team2, groupName) {
        if (!tournament.schedule) return null;
        
        for (const timeSlot of tournament.schedule) {
            for (const match of timeSlot.matches) {
                // Check both orderings of teams
                const matchesTeams = (match.team1 === team1 && match.team2 === team2) ||
                                    (match.team1 === team2 && match.team2 === team1);
                const matchesGroup = !match.group || match.group === groupName;
                
                if (matchesTeams && matchesGroup) {
                    return {
                        time: timeSlot.time,
                        board: match.board,
                        slotIndex: tournament.schedule.indexOf(timeSlot)
                    };
                }
            }
        }
        return null;
    }
    
    // Find schedule info for a bracket match by matchId
    function getBracketMatchSchedule(matchId) {
        if (!tournament.schedule || !matchId) return null;
        
        for (const timeSlot of tournament.schedule) {
            for (const match of timeSlot.matches) {
                if (match.matchId === matchId) {
                    return {
                        time: timeSlot.time,
                        board: match.board,
                        slotIndex: tournament.schedule.indexOf(timeSlot)
                    };
                }
            }
        }
        return null;
    }
    
    // Scroll to schedule time slot
    function scrollToSchedule(slotIndex) {
        activeTab = 'schedule';
        // Wait for tab to render, then scroll
        setTimeout(() => {
            const element = document.getElementById(`schedule-slot-${slotIndex}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight');
                setTimeout(() => element.classList.remove('highlight'), 2000);
            }
        }, 100);
    }
    
    // Check if a match is the "next" match (ready to be played)
    function isNextMatch(match) {
        if (match.winner) return false;
        // Match is next if both teams are determined
        const team1Ready = match.team1 && match.team1.name && match.team1.name !== 'TBD';
        const team2Ready = match.team2 && match.team2.name && match.team2.name !== 'TBD';
        return team1Ready && team2Ready;
    }
    
    // Get CSS class for bracket match
    function getMatchClass(match) {
        let classes = 'bracket-match';
        if (match.winner) classes += ' completed';
        else if (isNextMatch(match)) classes += ' next-match';
        return classes;
    }
    
    // Get team button class
    function getTeamClass(match, teamNum) {
        const team = teamNum === 1 ? match.team1 : match.team2;
        let classes = 'team-slot';
        
        if (!team || !team.name || team.name === 'TBD') {
            classes += ' tbd';
        } else if (match.winner === team.name) {
            classes += ' winner';
        } else if (match.winner && match.winner !== team.name) {
            classes += ' loser';
        }
        
        return classes;
    }
    
    function selectTab(tab) {
        activeTab = tab;
    }
</script>

{#if loading}
    <div class="loading">Loading tournament data...</div>
{:else if error}
    <div class="error">
        <h3>Error loading tournament</h3>
        <p>{error}</p>
    </div>
{:else if tournament}
    <div class="tournament-container">
        <header class="tournament-header">
            <h1>{tournament.tournamentName}</h1>
            <div class="tournament-meta">
                <span class="date">📅 {tournament.date}</span>
                <span class="location">📍 {tournament.location}</span>
            </div>
            
            {#if editable}
                <div class="save-controls">
                    <button class="save-btn" on:click={saveTournament} disabled={!hasUnsavedChanges}>
                        {#if saveStatus === 'saving'}
                            💾 Saving...
                        {:else if saveStatus === 'saved'}
                            ✅ Saved!
                        {:else if saveStatus === 'error'}
                            ❌ Error
                        {:else}
                            💾 Save Tournament
                        {/if}
                    </button>
                    <button class="export-btn" on:click={exportResults}>
                        📤 Export Results
                    </button>
                    {#if hasUnsavedChanges}
                        <span class="unsaved-indicator">● Unsaved changes</span>
                    {/if}
                </div>
            {/if}
        </header>
        
        <!-- Tab Navigation -->
        <nav class="tab-nav">
            {#if (tournament.format.groupStage && tournament.groups?.length > 0) || (tournament.format.knockoutStage && tournament.bracket)}
                <button 
                    class="tab-btn" 
                    class:active={activeTab === 'tournament'}
                    on:click={() => selectTab('tournament')}
                >
                    🏆 Tournament
                </button>
            {/if}
            <button 
                class="tab-btn" 
                class:active={activeTab === 'rules'}
                on:click={() => selectTab('rules')}
            >
                📋 Rules
            </button>
        </nav>
        
        <!-- Tab Content -->
        <div class="tab-content">
            <!-- Tournament Tab (Groups + Bracket) -->
            {#if activeTab === 'tournament'}
                <div class="tournament-view">
                    <!-- Group Stage Section -->
                    {#if tournament.format.groupStage && tournament.groups?.length > 0}
                        <div class="groups-view">
                            <!-- Group Stage Status -->
                            {#if tournament.format.knockoutStage}
                                <div class="group-stage-status">
                                    {#if isGroupStageComplete()}
                                        <span class="status-complete">✅ Group stage complete!</span>
                                        {#if editable}
                                            <button class="populate-btn" on:click={populateBracketFromGroups}>
                                                🔄 Update Bracket from Standings
                                            </button>
                                        {/if}
                                    {:else}
                                        {@const totalMatches = tournament.groups.reduce((sum, g) => sum + g.matches.length, 0)}
                                        {@const completedMatches = tournament.groups.reduce((sum, g) => sum + g.matches.filter(m => m.completed).length, 0)}
                                        <span class="status-pending">
                                            ⏳ {completedMatches} / {totalMatches} matches complete
                                        </span>
                                    {/if}
                                </div>
                            {/if}
                            
                            <!-- Side by side layout: Standings + Schedule -->
                            <div class="standings-schedule-container">
                                <!-- Left: Standings Table -->
                                <div class="standings-section">
                                    <h2>{tournament.groups.length > 1 ? 'Group Standings' : 'Standings'}</h2>
                                    {#each tournament.groups as group, groupIndex}
                                        {@const standings = calculateStandings(group)}
                                        <div class="group-card">
                                            {#if tournament.groups.length > 1}
                                                <h3>{group.name}</h3>
                                            {/if}
                                            
                                            <table class="standings-table">
                                                <thead>
                                                    <tr>
                                                        <th class="pos">#</th>
                                                        <th class="name">Team</th>
                                                        <th class="player">Player 1</th>
                                                        <th class="player">Player 2</th>
                                                        <th class="stat">W</th>
                                                        <th class="stat">D</th>
                                                        <th class="stat">L</th>
                                                        <th class="stat">+/-</th>
                                                        <th class="stat pts">Pts</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {#each standings as team, i}
                                                        {@const teamInfo = getTeamInfo(team.name)}
                                                        <tr class:qualifies={i < tournament.format.groupAdvancement}>
                                                            <td class="pos">{i + 1}</td>
                                                            <td class="name">{team.name}</td>
                                                            <td class="player">{teamInfo?.player1 || '—'}</td>
                                                            <td class="player">{teamInfo?.player2 || '—'}</td>
                                                            <td class="stat">{team.wins}</td>
                                                            <td class="stat">{team.draws}</td>
                                                            <td class="stat">{team.losses}</td>
                                                            <td class="stat diff" class:positive={team.pointsDiff > 0} class:negative={team.pointsDiff < 0}>
                                                                {team.pointsDiff > 0 ? '+' : ''}{team.pointsDiff}
                                                            </td>
                                                            <td class="stat pts">{team.points}</td>
                                                        </tr>
                                                    {/each}
                                                </tbody>
                                            </table>
                                        </div>
                                    {/each}
                                </div>
                                
                                <!-- Right: Schedule Table -->
                                <div class="schedule-section">
                                    <h2>Schedule</h2>
                                    <table class="schedule-table">
                                        <thead>
                                            <tr>
                                                <th class="time-col">Time</th>
                                                {#each getBoards() as board}
                                                    <th class="board-col">{board} Board</th>
                                                {/each}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#each tournament.schedule as timeSlot, slotIndex}
                                                <tr class="schedule-row" class:knockout-row={timeSlot.stage !== 'Group Stage' && !timeSlot.stage.includes('Float')}>
                                                    <td class="time-cell">
                                                        <span class="time-value">{timeSlot.time}</span>
                                                        {#if timeSlot.stage !== 'Group Stage'}
                                                            <span class="stage-label">{timeSlot.stage}</span>
                                                        {/if}
                                                    </td>
                                                    {#each getBoards() as board}
                                                        {@const scheduleMatch = getScheduleMatch(slotIndex, board)}
                                                        <td class="match-cell">
                                                            {#if scheduleMatch}
                                                                {#if isGroupStageMatch(scheduleMatch)}
                                                                    <!-- Group stage match -->
                                                                    {@const groupMatchData = findGroupMatch(scheduleMatch.team1, scheduleMatch.team2)}
                                                                    {#if groupMatchData}
                                                                        {@const { match, groupIndex, matchIndex, swapped } = groupMatchData}
                                                                        <div class="schedule-match-cell" class:completed={match.completed}>
                                                                            {#if editingMatch?.type === 'group' && editingMatch?.groupIndex === groupIndex && editingMatch?.matchIndex === matchIndex}
                                                                                <!-- Editing mode -->
                                                                                <div class="cell-edit">
                                                                                    <div class="edit-row">
                                                                                        <span class="edit-team">{swapped ? match.team2 : match.team1}</span>
                                                                                        <input type="number" min="0" bind:value={editingMatch.score1} class="score-input-small" />
                                                                                    </div>
                                                                                    <div class="edit-row">
                                                                                        <span class="edit-team">{swapped ? match.team1 : match.team2}</span>
                                                                                        <input type="number" min="0" bind:value={editingMatch.score2} class="score-input-small" />
                                                                                    </div>
                                                                                    <div class="edit-buttons">
                                                                                        <button class="edit-btn save" on:click={saveMatchScore}>✓</button>
                                                                                        <button class="edit-btn cancel" on:click={cancelEditing}>✕</button>
                                                                                    </div>
                                                                                </div>
                                                                            {:else}
                                                                                <!-- Display mode -->
                                                                                <div 
                                                                                    class="cell-display"
                                                                                    class:editable={editable}
                                                                                    on:click={() => editable && startEditing('group', { groupIndex, matchIndex }, match.score1, match.score2)}
                                                                                    on:keydown={(e) => e.key === 'Enter' && editable && startEditing('group', { groupIndex, matchIndex }, match.score1, match.score2)}
                                                                                    role={editable ? "button" : "text"}
                                                                                    tabindex={editable ? 0 : -1}
                                                                                >
                                                                                    <span class="team-name" class:winner={match.completed && (swapped ? match.score2 > match.score1 : match.score1 > match.score2)}>{swapped ? match.team2 : match.team1}</span>
                                                                                    {#if match.completed}
                                                                                        <span class="match-score">{swapped ? match.score2 : match.score1} - {swapped ? match.score1 : match.score2}</span>
                                                                                    {:else}
                                                                                        <span class="vs">vs</span>
                                                                                    {/if}
                                                                                    <span class="team-name" class:winner={match.completed && (swapped ? match.score1 > match.score2 : match.score2 > match.score1)}>{swapped ? match.team1 : match.team2}</span>
                                                                                </div>
                                                                                {#if editable && match.completed}
                                                                                    <button 
                                                                                        class="clear-btn-small" 
                                                                                        on:click|stopPropagation={() => clearMatchResult('group', { groupIndex, matchIndex })}
                                                                                        title="Clear result"
                                                                                    >✕</button>
                                                                                {/if}
                                                                            {/if}
                                                                        </div>
                                                                    {/if}
                                                                {:else}
                                                                    <!-- Bracket match -->
                                                                    {@const bracketMatchData = findBracketMatch(scheduleMatch.matchId)}
                                                                    {#if bracketMatchData}
                                                                        {@const { match, roundIndex, matchIndex, type } = bracketMatchData}
                                                                        <div class="schedule-match-cell bracket-cell" class:completed={match.winner}>
                                                                            {#if (type === 'bracket' && editingMatch?.type === 'bracket' && editingMatch?.roundIndex === roundIndex && editingMatch?.matchIndex === matchIndex) || (type === 'thirdPlace' && editingMatch?.type === 'thirdPlace')}
                                                                                <!-- Editing mode -->
                                                                                <div class="cell-edit">
                                                                                    <div class="edit-row">
                                                                                        <span class="edit-team">{getTeamDisplayName(match.team1)}</span>
                                                                                        <input type="number" min="0" bind:value={editingMatch.score1} class="score-input-small" />
                                                                                    </div>
                                                                                    <div class="edit-row">
                                                                                        <span class="edit-team">{getTeamDisplayName(match.team2)}</span>
                                                                                        <input type="number" min="0" bind:value={editingMatch.score2} class="score-input-small" />
                                                                                    </div>
                                                                                    <div class="edit-buttons">
                                                                                        <button class="edit-btn save" on:click={saveMatchScore}>✓</button>
                                                                                        <button class="edit-btn cancel" on:click={cancelEditing}>✕</button>
                                                                                    </div>
                                                                                </div>
                                                                            {:else}
                                                                                <!-- Display mode -->
                                                                                {@const canEdit = editable && isNextMatch(match)}
                                                                                <div 
                                                                                    class="cell-display"
                                                                                    class:editable={canEdit}
                                                                                    on:click={() => canEdit && startEditing(type, type === 'bracket' ? { roundIndex, matchIndex } : {}, match.score1, match.score2)}
                                                                                    on:keydown={(e) => e.key === 'Enter' && canEdit && startEditing(type, type === 'bracket' ? { roundIndex, matchIndex } : {}, match.score1, match.score2)}
                                                                                    role={canEdit ? "button" : "text"}
                                                                                    tabindex={canEdit ? 0 : -1}
                                                                                >
                                                                                    <span class="team-name" class:winner={match.winner === match.team1?.name} class:tbd={!match.team1?.name || match.team1.name === 'TBD'}>{getTeamDisplayName(match.team1)}</span>
                                                                                    {#if match.score1 !== null && match.score2 !== null}
                                                                                        <span class="match-score">{match.score1} - {match.score2}</span>
                                                                                    {:else}
                                                                                        <span class="vs">vs</span>
                                                                                    {/if}
                                                                                    <span class="team-name" class:winner={match.winner === match.team2?.name} class:tbd={!match.team2?.name || match.team2.name === 'TBD'}>{getTeamDisplayName(match.team2)}</span>
                                                                                </div>
                                                                                {#if editable && match.winner}
                                                                                    <button 
                                                                                        class="clear-btn-small" 
                                                                                        on:click|stopPropagation={() => clearMatchResult(type, type === 'bracket' ? { roundIndex, matchIndex } : {})}
                                                                                        title="Clear result"
                                                                                    >✕</button>
                                                                                {/if}
                                                                            {/if}
                                                                        </div>
                                                                    {:else}
                                                                        <!-- Match ID not found yet (bracket not populated) -->
                                                                        <div class="schedule-match-cell bracket-cell pending">
                                                                            <div class="cell-display">
                                                                                <span class="team-name tbd">{scheduleMatch.team1}</span>
                                                                                <span class="vs">vs</span>
                                                                                <span class="team-name tbd">{scheduleMatch.team2}</span>
                                                                            </div>
                                                                        </div>
                                                                    {/if}
                                                                {/if}
                                                            {:else}
                                                                <!-- Empty cell -->
                                                                <div class="empty-cell">—</div>
                                                            {/if}
                                                        </td>
                                                    {/each}
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    {/if}
                
                <!-- Bracket Section (below groups) -->
                {#if tournament.format.knockoutStage && tournament.bracket}
                    <div class="bracket-view">
                        <h2>{tournament.bracket.name}</h2>
                        
                        <div class="bracket-container">
                            {#each tournament.bracket.rounds as round, roundIndex}
                                <div class="bracket-round">
                                    <h3 class="round-title">{round.name}</h3>
                                    <div class="round-matches">
                                        {#each round.matches as match, matchIndex}
                                            {@const scheduleInfo = getBracketMatchSchedule(match.id)}
                                            <div class={getMatchClass(match)}>
                                                {#if scheduleInfo}
                                                    <button 
                                                        class="bracket-schedule-link"
                                                        on:click={() => scrollToSchedule(scheduleInfo.slotIndex)}
                                                        title="View in schedule"
                                                    >
                                                        🕐 {scheduleInfo.time} • Board {scheduleInfo.board}
                                                    </button>
                                                {/if}
                                                {#if editingMatch?.type === 'bracket' && editingMatch?.roundIndex === roundIndex && editingMatch?.matchIndex === matchIndex}
                                                    <!-- Editing mode -->
                                                    <div class="bracket-match-edit">
                                                        <div class="edit-team">
                                                            <span class="team-name">{getTeamDisplayName(match.team1)}</span>
                                                            <input 
                                                                type="number" 
                                                                min="0" 
                                                                bind:value={editingMatch.score1}
                                                                class="score-input"
                                                            />
                                                        </div>
                                                        <div class="edit-team">
                                                            <span class="team-name">{getTeamDisplayName(match.team2)}</span>
                                                            <input 
                                                                type="number" 
                                                                min="0" 
                                                                bind:value={editingMatch.score2}
                                                                class="score-input"
                                                            />
                                                        </div>
                                                        <div class="edit-actions">
                                                            <button class="edit-btn save" on:click={saveMatchScore}>✓ Save</button>
                                                            <button class="edit-btn cancel" on:click={cancelEditing}>✕ Cancel</button>
                                                        </div>
                                                    </div>
                                                {:else}
                                                    <!-- Display mode -->
                                                    <div 
                                                        class={getTeamClass(match, 1)}
                                                        on:click={() => editable && isNextMatch(match) && startEditing('bracket', { roundIndex, matchIndex }, match.score1, match.score2)}
                                                        on:keydown={(e) => e.key === 'Enter' && editable && isNextMatch(match) && startEditing('bracket', { roundIndex, matchIndex }, match.score1, match.score2)}
                                                        role={editable && isNextMatch(match) ? "button" : "text"}
                                                        tabindex={editable && isNextMatch(match) ? 0 : -1}
                                                        class:clickable={editable && isNextMatch(match)}
                                                    >
                                                        <span class="team-name">{getTeamDisplayName(match.team1)}</span>
                                                        {#if match.score1 !== null}
                                                            <span class="team-score">{match.score1}</span>
                                                        {/if}
                                                    </div>
                                                    <div 
                                                        class={getTeamClass(match, 2)}
                                                        on:click={() => editable && isNextMatch(match) && startEditing('bracket', { roundIndex, matchIndex }, match.score1, match.score2)}
                                                        on:keydown={(e) => e.key === 'Enter' && editable && isNextMatch(match) && startEditing('bracket', { roundIndex, matchIndex }, match.score1, match.score2)}
                                                        role={editable && isNextMatch(match) ? "button" : "text"}
                                                        tabindex={editable && isNextMatch(match) ? 0 : -1}
                                                        class:clickable={editable && isNextMatch(match)}
                                                    >
                                                        <span class="team-name">{getTeamDisplayName(match.team2)}</span>
                                                        {#if match.score2 !== null}
                                                            <span class="team-score">{match.score2}</span>
                                                        {/if}
                                                    </div>
                                                    {#if editable && match.winner}
                                                        <button 
                                                            class="clear-btn bracket-clear" 
                                                            on:click={() => clearMatchResult('bracket', { roundIndex, matchIndex })}
                                                            title="Clear result"
                                                        >🗑</button>
                                                    {/if}
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                            
                            <!-- Bronze Final (as a column in the bracket) -->
                            {#if tournament.bracket.thirdPlaceMatch}
                                {@const thirdPlaceSchedule = getBracketMatchSchedule('third')}
                                <div class="bracket-round bronze-round">
                                    <h3 class="round-title">Bronze Final</h3>
                                    <div class="round-matches">
                                        <div class="bracket-match" class:next-match={isNextMatch(tournament.bracket.thirdPlaceMatch)} class:completed={tournament.bracket.thirdPlaceMatch.winner}>
                                            {#if thirdPlaceSchedule}
                                                <button 
                                                    class="bracket-schedule-link"
                                                    on:click={() => scrollToSchedule(thirdPlaceSchedule.slotIndex)}
                                                    title="View in schedule"
                                                >
                                                    🕐 {thirdPlaceSchedule.time} • Board {thirdPlaceSchedule.board}
                                                </button>
                                            {/if}
                                            {#if editingMatch?.type === 'thirdPlace'}
                                                <!-- Editing mode -->
                                                <div class="bracket-match-edit">
                                                    <div class="edit-team">
                                                        <span class="team-name">{getTeamDisplayName(tournament.bracket.thirdPlaceMatch.team1)}</span>
                                                        <input 
                                                            type="number" 
                                                            min="0" 
                                                            bind:value={editingMatch.score1}
                                                            class="score-input"
                                                        />
                                                    </div>
                                                    <div class="edit-team">
                                                        <span class="team-name">{getTeamDisplayName(tournament.bracket.thirdPlaceMatch.team2)}</span>
                                                        <input 
                                                            type="number" 
                                                            min="0" 
                                                            bind:value={editingMatch.score2}
                                                            class="score-input"
                                                        />
                                                    </div>
                                                    <div class="edit-actions">
                                                        <button class="edit-btn save" on:click={saveMatchScore}>✓ Save</button>
                                                        <button class="edit-btn cancel" on:click={cancelEditing}>✕ Cancel</button>
                                                    </div>
                                                </div>
                                            {:else}
                                                <!-- Display mode -->
                                                <div 
                                                    class="team-slot" 
                                                    class:winner={tournament.bracket.thirdPlaceMatch.winner === tournament.bracket.thirdPlaceMatch.team1?.name}
                                                    class:loser={tournament.bracket.thirdPlaceMatch.winner && tournament.bracket.thirdPlaceMatch.winner !== tournament.bracket.thirdPlaceMatch.team1?.name}
                                                    class:clickable={editable && isNextMatch(tournament.bracket.thirdPlaceMatch)}
                                                    on:click={() => editable && isNextMatch(tournament.bracket.thirdPlaceMatch) && startEditing('thirdPlace', {}, tournament.bracket.thirdPlaceMatch.score1, tournament.bracket.thirdPlaceMatch.score2)}
                                                    on:keydown={(e) => e.key === 'Enter' && editable && isNextMatch(tournament.bracket.thirdPlaceMatch) && startEditing('thirdPlace', {}, tournament.bracket.thirdPlaceMatch.score1, tournament.bracket.thirdPlaceMatch.score2)}
                                                    role={editable && isNextMatch(tournament.bracket.thirdPlaceMatch) ? "button" : "text"}
                                                    tabindex={editable && isNextMatch(tournament.bracket.thirdPlaceMatch) ? 0 : -1}
                                                >
                                                    <span class="team-name">{getTeamDisplayName(tournament.bracket.thirdPlaceMatch.team1)}</span>
                                                    {#if tournament.bracket.thirdPlaceMatch.score1 !== null}
                                                        <span class="team-score">{tournament.bracket.thirdPlaceMatch.score1}</span>
                                                    {/if}
                                                </div>
                                                <div 
                                                    class="team-slot" 
                                                    class:winner={tournament.bracket.thirdPlaceMatch.winner === tournament.bracket.thirdPlaceMatch.team2?.name}
                                                    class:loser={tournament.bracket.thirdPlaceMatch.winner && tournament.bracket.thirdPlaceMatch.winner !== tournament.bracket.thirdPlaceMatch.team2?.name}
                                                    class:clickable={editable && isNextMatch(tournament.bracket.thirdPlaceMatch)}
                                                    on:click={() => editable && isNextMatch(tournament.bracket.thirdPlaceMatch) && startEditing('thirdPlace', {}, tournament.bracket.thirdPlaceMatch.score1, tournament.bracket.thirdPlaceMatch.score2)}
                                                    on:keydown={(e) => e.key === 'Enter' && editable && isNextMatch(tournament.bracket.thirdPlaceMatch) && startEditing('thirdPlace', {}, tournament.bracket.thirdPlaceMatch.score1, tournament.bracket.thirdPlaceMatch.score2)}
                                                    role={editable && isNextMatch(tournament.bracket.thirdPlaceMatch) ? "button" : "text"}
                                                    tabindex={editable && isNextMatch(tournament.bracket.thirdPlaceMatch) ? 0 : -1}
                                                >
                                                    <span class="team-name">{getTeamDisplayName(tournament.bracket.thirdPlaceMatch.team2)}</span>
                                                    {#if tournament.bracket.thirdPlaceMatch.score2 !== null}
                                                        <span class="team-score">{tournament.bracket.thirdPlaceMatch.score2}</span>
                                                    {/if}
                                                </div>
                                                {#if editable && tournament.bracket.thirdPlaceMatch.winner}
                                                    <button 
                                                        class="clear-btn bracket-clear" 
                                                        on:click={() => clearMatchResult('thirdPlace', {})}
                                                        title="Clear result"
                                                    >🗑</button>
                                                {/if}
                                            {/if}
                                        </div>
                                    </div>
                                    {#if tournament.bracket.thirdPlaceMatch.winner}
                                        <div class="bronze-winner">
                                            🥉 {tournament.bracket.thirdPlaceMatch.winner}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                            
                            <!-- Champion display -->
                            {#if tournament.bracket.rounds.length > 0}
                                {@const finalMatch = tournament.bracket.rounds[tournament.bracket.rounds.length - 1].matches[0]}
                                {#if finalMatch?.winner}
                                    <div class="champion-section">
                                        <h3 class="champion-title">🏆 Champion</h3>
                                        <div class="champion-name">{finalMatch.winner}</div>
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    </div>
                {/if}
                </div>
            {/if}
            
            <!-- Rules Tab -->
            {#if activeTab === 'rules'}
                <div class="rules-view">
                    <h2>Tournament Rules</h2>
                    
                    <div class="rules-container">
                        <section class="rules-section">
                            <h3>📋 Format</h3>
                            <ul>
                                <li><strong>Group Stage:</strong> All 10 players compete in a single league table, each playing 3 matches</li>
                                <li><strong>Advancement:</strong> Top 6 players advance to the knockout stage</li>
                                <li><strong>Knockout Stage:</strong> 1st and 2nd place receive byes to the semifinals; 3rd plays 6th and 4th plays 5th in quarterfinals</li>
                            </ul>
                        </section>
                        
                        <section class="rules-section">
                            <h3>🎯 Scoring</h3>
                            <ul>
                                <li><strong>Win:</strong> 3 points</li>
                                <li><strong>Draw:</strong> 1 point</li>
                                <li><strong>Loss:</strong> 0 points</li>
                                <li><strong>Tiebreaker:</strong> Point differential, then total points scored</li>
                            </ul>
                        </section>
                        
                        <section class="rules-section">
                            <h3>🎮 Match Rules</h3>
                            <ul>
                                <li>Each match consists of rounds played until one player reaches the target score</li>
                                <li>20s count as 20 points</li>
                                <li>Standard crokinole rules apply</li>
                            </ul>
                        </section>
                        
                        <section class="rules-section">
                            <h3>📍 Boards</h3>
                            <ul>
                                <li><strong>Home Board:</strong> Primary playing surface</li>
                                <li><strong>Anish Board:</strong> Secondary playing surface</li>
                                <li>Players will not play back-to-back matches on different boards</li>
                            </ul>
                        </section>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .tournament-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 1rem;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .loading, .error {
        text-align: center;
        padding: 3rem;
        font-size: 1.25rem;
    }
    
    .error {
        background: #fee;
        border: 1px solid #fcc;
        border-radius: 8px;
        color: #c00;
    }
    
    /* Header */
    .tournament-header {
        text-align: center;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 2px solid #e5e7eb;
    }
    
    .tournament-header h1 {
        margin: 0 0 0.5rem 0;
        font-size: 2rem;
        color: #1f2937;
    }
    
    .tournament-meta {
        display: flex;
        justify-content: center;
        gap: 2rem;
        color: #6b7280;
        font-size: 1rem;
    }
    
    /* Tab Navigation */
    .tab-nav {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        border-bottom: 2px solid #e5e7eb;
        padding-bottom: 0.5rem;
    }
    
    .tab-btn {
        padding: 0.75rem 1.5rem;
        border: none;
        background: none;
        font-size: 1rem;
        font-weight: 500;
        color: #6b7280;
        cursor: pointer;
        border-radius: 8px 8px 0 0;
        transition: all 0.2s;
    }
    
    .tab-btn:hover {
        background: #f3f4f6;
        color: #1f2937;
    }
    
    .tab-btn.active {
        background: #0066cc;
        color: white;
    }
    
    /* Rules View */
    .rules-view h2 {
        margin-bottom: 1.5rem;
        color: #1f2937;
    }
    
    .rules-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
    }
    
    .rules-section {
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        padding: 1.5rem;
    }
    
    .rules-section h3 {
        margin: 0 0 1rem 0;
        color: #1f2937;
        font-size: 1.1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #e5e7eb;
    }
    
    .rules-section ul {
        margin: 0;
        padding-left: 1.25rem;
    }
    
    .rules-section li {
        margin-bottom: 0.75rem;
        color: #4b5563;
        line-height: 1.5;
    }
    
    .rules-section li:last-child {
        margin-bottom: 0;
    }
    
    .rules-section li strong {
        color: #1f2937;
    }

    /* Groups View */
    .groups-view h2 {
        margin-bottom: 1.5rem;
        color: #1f2937;
    }
    
    .groups-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 1.5rem;
    }
    
    .groups-container.single-group {
        max-width: 600px;
    }
    
    .group-card {
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        overflow: hidden;
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    
    .group-card h3 {
        margin: 0;
        padding: 1rem;
        background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
        color: white;
        font-size: 1.1rem;
    }
    
    .standings-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
        flex: 1;
    }
    
    .standings-table tbody {
        display: table-row-group;
    }
    
    .standings-table tr:last-child td {
        border-bottom: none;
    }
    
    .standings-table th {
        background: #f3f4f6;
        padding: 0.5rem 0.4rem;
        text-align: center;
        font-weight: 600;
        color: #4b5563;
        border-bottom: 2px solid #e5e7eb;
    }
    
    .standings-table th.name {
        text-align: left;
        padding-left: 0.75rem;
    }
    
    .standings-table th.player {
        text-align: left;
        font-size: 0.8rem;
    }
    
    .standings-table td {
        padding: 0.6rem 0.4rem;
        text-align: center;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .standings-table td.name {
        text-align: left;
        padding-left: 0.75rem;
        font-weight: 500;
    }
    
    .standings-table td.player {
        text-align: left;
        color: #6b7280;
        font-size: 0.85rem;
    }
    
    .standings-table td.pos {
        font-weight: 600;
        color: #6b7280;
    }
    
    .standings-table td.pts {
        font-weight: 700;
        color: #1f2937;
    }
    
    .standings-table td.diff.positive {
        color: #059669;
    }
    
    .standings-table td.diff.negative {
        color: #dc2626;
    }
    
    .standings-table tr.qualifies {
        background: #ecfdf5;
    }
    
    .standings-table tr.qualifies td.pos {
        color: #059669;
    }
    
    /* Group Stage Status */
    .group-stage-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
        padding: 0.75rem 1rem;
        background: #f9fafb;
        border-radius: 8px;
    }
    
    .status-complete {
        color: #059669;
        font-weight: 600;
    }
    
    .status-pending {
        color: #6b7280;
    }
    
    .populate-btn {
        padding: 0.5rem 1rem;
        background: #0066cc;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .populate-btn:hover {
        background: #0052a3;
    }
    
    /* Side by Side Layout */
    .standings-schedule-container {
        display: grid;
        grid-template-columns: minmax(300px, 500px) 1fr;
        gap: 2rem;
        align-items: stretch;
    }
    
    .standings-section {
        display: flex;
        flex-direction: column;
    }
    
    .standings-section h2 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        color: #1f2937;
    }
    
    .schedule-section {
        min-width: 0;
    }
    
    .schedule-section h2 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        color: #1f2937;
    }
    
    /* Schedule Table */
    .schedule-table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        table-layout: fixed;
    }
    
    .schedule-table th {
        background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
        color: white;
        padding: 0.5rem 0.35rem;
        font-weight: 600;
        font-size: 0.85rem;
        text-align: center;
    }
    
    .schedule-table th.time-col {
        width: 120px;
        text-align: left;
        padding-left: 0.5rem;
    }
    
    .schedule-table th.board-col {
        /* Equal width for all board columns - calculated automatically with table-layout: fixed */
    }
    
    .schedule-row {
        border-bottom: 1px solid #e5e7eb;
    }
    
    .schedule-row:last-child {
        border-bottom: none;
    }
    
    .schedule-row.knockout-row {
        background: #fef3c7;
    }
    
    .schedule-row:hover {
        background: #f9fafb;
    }
    
    .schedule-row.knockout-row:hover {
        background: #fde68a;
    }
    
    .time-cell {
        padding: 0.35rem 0.5rem;
        vertical-align: middle;
        border-right: 1px solid #e5e7eb;
        width: 120px;
    }
    
    .time-value {
        display: block;
        font-weight: 600;
        color: #1f2937;
        font-size: 0.8rem;
    }
    
    .stage-label {
        display: block;
        font-size: 0.65rem;
        color: #6b7280;
        margin-top: 0.15rem;
        white-space: nowrap;
    }
    
    .match-cell {
        padding: 0.2rem;
        vertical-align: middle;
        border-right: 1px solid #e5e7eb;
        position: relative;
        height: 36px;
    }
    
    .match-cell:last-child {
        border-right: none;
    }
    
    .schedule-match-cell {
        background: #f9fafb;
        border-radius: 4px;
        position: relative;
        height: 100%;
    }
    
    .schedule-match-cell.completed {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
    }
    
    .schedule-match-cell.bracket-cell {
        background: #fef9c3;
        border: 1px solid #fde047;
    }
    
    .schedule-match-cell.bracket-cell.completed {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
    }
    
    .schedule-match-cell.bracket-cell.pending {
        background: #f3f4f6;
        border: 1px dashed #9ca3af;
    }
    
    .cell-display {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.3rem 0.5rem;
        font-size: 0.8rem;
        height: 100%;
        box-sizing: border-box;
        gap: 0.25rem;
    }
    
    .cell-display .team-name {
        font-weight: 500;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
    }
    
    .cell-display .team-name:first-of-type {
        text-align: left;
    }
    
    .cell-display .team-name:last-of-type {
        text-align: right;
    }
    
    .cell-display .team-name.winner {
        color: #065f46;
        font-weight: 600;
    }
    
    .cell-display .team-name.tbd {
        color: #9ca3af;
        font-style: italic;
    }
    
    .cell-display .vs {
        color: #9ca3af;
        font-size: 0.75rem;
        flex-shrink: 0;
    }
    
    .cell-display .match-score {
        font-weight: 700;
        color: #1f2937;
        background: #e5e7eb;
        padding: 0.1rem 0.35rem;
        border-radius: 3px;
        font-size: 0.75rem;
        flex-shrink: 0;
    }
    
    .schedule-match-cell.completed .cell-display .match-score {
        background: #a7f3d0;
        color: #065f46;
    }
    
    .empty-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #d1d5db;
        font-size: 1rem;
        height: 100%;
    }
    
    .cell-display.editable {
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.2s;
    }
    
    .cell-display.editable:hover {
        background: rgba(0, 102, 204, 0.1);
    }
    
    .cell-edit {
        padding: 0.25rem;
    }
    
    .edit-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
    }
    
    .edit-row .edit-team {
        font-size: 0.8rem;
        font-weight: 500;
        color: #374151;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .score-input-small {
        width: 40px;
        padding: 0.2rem 0.3rem;
        border: 2px solid #0066cc;
        border-radius: 4px;
        text-align: center;
        font-size: 0.85rem;
        font-weight: 600;
    }
    
    .score-input-small:focus {
        outline: none;
        border-color: #0052a3;
        box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
    }
    
    .edit-buttons {
        display: flex;
        gap: 0.25rem;
        justify-content: center;
        margin-top: 0.25rem;
    }
    
    .clear-btn-small {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        background: #ef4444;
        color: white;
        border-radius: 50%;
        font-size: 0.7rem;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
    }
    
    .schedule-match-cell:hover .clear-btn-small {
        opacity: 1;
    }
    
    /* Responsive for side-by-side layout */
    @media (max-width: 900px) {
        .standings-schedule-container {
            grid-template-columns: 1fr;
        }
        
        .standings-section {
            position: static;
        }
        
        .schedule-table th.board-col {
            min-width: 140px;
        }
        
        .team-row .team-name {
            max-width: 100px;
        }
    }

    .group-matches {
        padding: 1rem;
        background: #f9fafb;
    }
    
    .group-matches h4 {
        margin: 0 0 0.75rem 0;
        font-size: 0.9rem;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .group-match {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        background: white;
        border-radius: 6px;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }
    
    .group-match:last-child {
        margin-bottom: 0;
    }
    
    .group-match .team {
        flex: 1;
        color: #4b5563;
    }
    
    .group-match .team:last-child {
        text-align: right;
    }
    
    .group-match .team.winner {
        font-weight: 600;
        color: #059669;
    }
    
    .group-match .match-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
    }
    
    .group-match .score {
        padding: 0 1rem;
        font-weight: 600;
        color: #1f2937;
    }
    
    .group-match:not(.completed) {
        opacity: 0.6;
    }
    
    .group-match:not(.completed) .score {
        color: #9ca3af;
        font-weight: 400;
    }
    
    /* Schedule Link Buttons */
    .schedule-link, .bracket-schedule-link {
        background: #f3f4f6;
        border: none;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.7rem;
        color: #6b7280;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .schedule-link:hover, .bracket-schedule-link:hover {
        background: #dbeafe;
        color: #1d4ed8;
    }
    
    .bracket-schedule-link {
        position: absolute;
        top: -1.5rem;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
    }
    
    /* Schedule highlight animation */
    .time-slot.highlight {
        animation: highlightPulse 2s ease-out;
    }
    
    @keyframes highlightPulse {
        0% {
            box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.8);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
        }
    }
    
    /* Bracket View */
    .bracket-view h2 {
        margin-bottom: 1.5rem;
        color: #1f2937;
    }
    
    .bracket-container {
        display: flex;
        align-items: flex-start;
        gap: 2rem;
        overflow-x: auto;
        padding: 1rem;
        background: #f9fafb;
        border-radius: 12px;
    }
    
    .bracket-round {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 200px;
    }
    
    .round-title {
        margin: 0 0 1rem 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .round-matches {
        display: flex;
        flex-direction: column;
        gap: 2.5rem;
        justify-content: space-around;
        min-height: 100%;
    }
    
    .bracket-match {
        background: white;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        overflow: visible;
        min-width: 180px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        position: relative;
        margin-top: 1rem;
    }
    
    .bracket-match.next-match {
        border-color: #f59e0b;
        box-shadow: 0 0 12px rgba(245, 158, 11, 0.3);
    }
    
    .bracket-match.completed {
        border-color: #10b981;
    }
    
    .team-slot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .team-slot:last-child {
        border-bottom: none;
    }
    
    .team-slot .team-name {
        font-weight: 500;
        color: #1f2937;
    }
    
    .team-slot .team-score {
        font-weight: 700;
        color: #4b5563;
        background: #f3f4f6;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
    }
    
    .team-slot.tbd .team-name {
        color: #9ca3af;
        font-style: italic;
    }
    
    .team-slot.winner {
        background: #ecfdf5;
    }
    
    .team-slot.winner .team-name {
        color: #059669;
        font-weight: 600;
    }
    
    .team-slot.winner .team-score {
        background: #059669;
        color: white;
    }
    
    .team-slot.loser {
        background: #fef2f2;
        opacity: 0.7;
    }
    
    .team-slot.loser .team-name {
        color: #9ca3af;
    }
    
    /* Champion Section */
    .champion-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        border-radius: 12px;
        min-width: 150px;
    }
    
    .champion-title {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: white;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }
    
    .champion-name {
        font-size: 1.25rem;
        font-weight: 700;
        color: white;
    }
    
    /* Save Controls */
    .save-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        margin-top: 1rem;
    }
    
    .save-btn, .export-btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .save-btn {
        background: #0066cc;
        color: white;
    }
    
    .save-btn:hover:not(:disabled) {
        background: #0052a3;
    }
    
    .save-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }
    
    .export-btn {
        background: #e5e7eb;
        color: #374151;
    }
    
    .export-btn:hover {
        background: #d1d5db;
    }
    
    .unsaved-indicator {
        color: #f59e0b;
        font-size: 0.85rem;
        font-weight: 500;
    }
    
    /* Editing Styles */
    .score.editable {
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        transition: background 0.2s;
    }
    
    .score.editable:hover {
        background: #dbeafe;
    }
    
    .score-edit {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .score-input {
        width: 3rem;
        padding: 0.25rem 0.5rem;
        border: 2px solid #0066cc;
        border-radius: 4px;
        text-align: center;
        font-size: 0.9rem;
        font-weight: 600;
    }
    
    .score-input:focus {
        outline: none;
        border-color: #0052a3;
        box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.2);
    }
    
    .edit-btn {
        padding: 0.25rem 0.5rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        transition: all 0.2s;
    }
    
    .edit-btn.save {
        background: #10b981;
        color: white;
    }
    
    .edit-btn.save:hover {
        background: #059669;
    }
    
    .edit-btn.cancel {
        background: #ef4444;
        color: white;
    }
    
    .edit-btn.cancel:hover {
        background: #dc2626;
    }
    
    .clear-btn {
        padding: 0.2rem 0.4rem;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 0.75rem;
        opacity: 0.5;
        transition: opacity 0.2s;
    }
    
    .clear-btn:hover {
        opacity: 1;
    }
    
    .bracket-clear {
        position: absolute;
        top: 2px;
        right: 2px;
    }
    
    .bracket-match {
        position: relative;
    }
    
    .bracket-match-edit {
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .edit-team {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
    }
    
    .edit-team .team-name {
        flex: 1;
        font-weight: 500;
    }
    
    .edit-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        margin-top: 0.5rem;
    }
    
    .team-slot.clickable {
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .team-slot.clickable:hover {
        background: #dbeafe;
    }
    
    /* Bronze Final */
    .bronze-round {
        align-self: flex-end;
    }
    
    .bronze-round .round-matches {
        justify-content: flex-end;
    }
    
    .bronze-winner {
        margin-top: 1rem;
        font-size: 1rem;
        font-weight: 600;
        color: #78716c;
        text-align: center;
    }
    
    /* Responsive */
    @media (max-width: 768px) {
        .tournament-meta {
            flex-direction: column;
            gap: 0.5rem;
        }
        
        .save-controls {
            flex-direction: column;
            gap: 0.5rem;
        }
        
        .tab-nav {
            flex-wrap: wrap;
        }
        
        .tab-btn {
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
        }
        
        .groups-container {
            grid-template-columns: 1fr;
        }
        
        .bracket-container {
            flex-direction: column;
            align-items: stretch;
        }
        
        .bracket-round {
            min-width: auto;
        }
    }
</style>