<script>
    import { onMount } from 'svelte';
    
    // Props
    export let dataPath = '/tournamentData.json';
    export let savePath = '/tournamentResults.json';
    export let editable = true;
    
    // State
    let tournament = null;
    let loading = true;
    let error = null;
    let activeTab = 'tournament'; // 'schedule', 'tournament'
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
        
        // Figure out which match in the next round this feeds into
        const nextMatchIndex = Math.floor(matchIndex / 2);
        const nextMatch = tournament.bracket.rounds[nextRoundIndex].matches[nextMatchIndex];
        
        if (!nextMatch) return;
        
        // Determine if winner goes to team1 or team2 slot
        if (matchIndex % 2 === 0) {
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
            // Single group/league: 1st vs 4th, 2nd vs 3rd (if 4 advance)
            // Or 1st vs 2nd if only 2 advance
            if (advancementCount >= 4 && firstRound.matches.length >= 2) {
                // Semifinals: 1v4, 2v3
                firstRound.matches[0].team1 = { name: allQualifiers[0]?.name || 'TBD', source: 'League', seed: 1 };
                firstRound.matches[0].team2 = { name: allQualifiers[3]?.name || 'TBD', source: 'League', seed: 4 };
                firstRound.matches[1].team1 = { name: allQualifiers[1]?.name || 'TBD', source: 'League', seed: 2 };
                firstRound.matches[1].team2 = { name: allQualifiers[2]?.name || 'TBD', source: 'League', seed: 3 };
            } else if (advancementCount >= 2 && firstRound.matches.length >= 1) {
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
    }
    
    // Check and populate bracket when group stage completes
    function checkAndPopulateBracket() {
        if (isGroupStageComplete() && tournament.format.groupStage && tournament.format.knockoutStage) {
            populateBracketFromGroups();
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
            <button 
                class="tab-btn" 
                class:active={activeTab === 'schedule'}
                on:click={() => selectTab('schedule')}
            >
                🕐 Schedule
            </button>
            {#if (tournament.format.groupStage && tournament.groups?.length > 0) || (tournament.format.knockoutStage && tournament.bracket)}
                <button 
                    class="tab-btn" 
                    class:active={activeTab === 'tournament'}
                    on:click={() => selectTab('tournament')}
                >
                    🏆 Tournament
                </button>
            {/if}
        </nav>
        
        <!-- Tab Content -->
        <div class="tab-content">
            <!-- Schedule Tab -->
            {#if activeTab === 'schedule'}
                <div class="schedule-view">
                    <h2>Match Schedule</h2>
                    
                    {#each tournament.schedule as timeSlot, slotIndex}
                        <div class="time-slot" id="schedule-slot-{slotIndex}">
                            <div class="time-header">
                                <span class="time">{timeSlot.time}</span>
                                <span class="stage-badge">{timeSlot.stage}</span>
                            </div>
                            <div class="slot-matches">
                                {#each timeSlot.matches as match}
                                    <div class="schedule-match">
                                        <span class="board">Board {match.board}</span>
                                        <span class="matchup">
                                            <span class="team">{match.team1}</span>
                                            <span class="vs">vs</span>
                                            <span class="team">{match.team2}</span>
                                        </span>
                                        {#if match.group}
                                            <span class="group-tag">{match.group}</span>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            
            <!-- Tournament Tab (Groups + Bracket) -->
            {:else if activeTab === 'tournament'}
                <div class="tournament-view">
                    <!-- Group Stage Section -->
                    {#if tournament.format.groupStage && tournament.groups?.length > 0}
                        <div class="groups-view">
                            <h2>{tournament.groups.length > 1 ? 'Group Standings' : 'Standings'}</h2>
                            
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
                            
                            <div class="groups-container" class:single-group={tournament.groups.length === 1}>
                                {#each tournament.groups as group, groupIndex}
                                    {@const standings = calculateStandings(group)}
                                    <div class="group-card">
                                        <h3>{group.name}</h3>
                                        
                                        <table class="standings-table">
                                            <thead>
                                                <tr>
                                                    <th class="pos">#</th>
                                                    <th class="name">Player</th>
                                                    <th class="stat">P</th>
                                                    <th class="stat">W</th>
                                                    <th class="stat">D</th>
                                            <th class="stat">L</th>
                                            <th class="stat">+/-</th>
                                            <th class="stat pts">Pts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each standings as team, i}
                                            <tr class:qualifies={i < tournament.format.groupAdvancement}>
                                                <td class="pos">{i + 1}</td>
                                                <td class="name">{team.name}</td>
                                                <td class="stat">{team.played}</td>
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
                                
                <!-- Group Matches -->
                                <div class="group-matches">
                                    <h4>Matches</h4>
                                    {#each group.matches as match, matchIndex}
                                        {@const scheduleInfo = getGroupMatchSchedule(match.team1, match.team2, group.name)}
                                        <div class="group-match" class:completed={match.completed}>
                                            <span class="team" class:winner={match.completed && match.score1 > match.score2}>
                                                {match.team1}
                                            </span>
                                            
                                            {#if editingMatch?.type === 'group' && editingMatch?.groupIndex === groupIndex && editingMatch?.matchIndex === matchIndex}
                                                <!-- Editing mode -->
                                                <div class="score-edit">
                                                    <input 
                                                        type="number" 
                                                        min="0" 
                                                        bind:value={editingMatch.score1}
                                                        class="score-input"
                                                    />
                                                    <span>-</span>
                                                    <input 
                                                        type="number" 
                                                        min="0" 
                                                        bind:value={editingMatch.score2}
                                                        class="score-input"
                                                    />
                                                    <button class="edit-btn save" on:click={saveMatchScore}>✓</button>
                                                    <button class="edit-btn cancel" on:click={cancelEditing}>✕</button>
                                                </div>
                                            {:else}
                                                <!-- Display mode -->
                                                <div class="match-center">
                                                    {#if scheduleInfo}
                                                        <button 
                                                            class="schedule-link"
                                                            on:click={() => scrollToSchedule(scheduleInfo.slotIndex)}
                                                            title="View in schedule"
                                                        >
                                                            🕐 {scheduleInfo.time} • Board {scheduleInfo.board}
                                                        </button>
                                                    {/if}
                                                    <span 
                                                        class="score" 
                                                        class:editable={editable}
                                                        on:click={() => editable && startEditing('group', { groupIndex, matchIndex }, match.score1, match.score2)}
                                                        on:keydown={(e) => e.key === 'Enter' && editable && startEditing('group', { groupIndex, matchIndex }, match.score1, match.score2)}
                                                        role={editable ? "button" : "text"}
                                                        tabindex={editable ? 0 : -1}
                                                    >
                                                        {#if match.completed}
                                                            {match.score1} - {match.score2}
                                                        {:else}
                                                            vs
                                                        {/if}
                                                    </span>
                                                    {#if editable && match.completed}
                                                        <button 
                                                            class="clear-btn" 
                                                            on:click={() => clearMatchResult('group', { groupIndex, matchIndex })}
                                                            title="Clear result"
                                                        >🗑</button>
                                                    {/if}
                                                </div>
                                            {/if}
                                            
                                            <span class="team" class:winner={match.completed && match.score2 > match.score1}>
                                                {match.team2}
                                            </span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
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
                        
                        <!-- 3rd Place Match -->
                        {#if tournament.bracket.thirdPlaceMatch}
                            {@const thirdPlaceSchedule = getBracketMatchSchedule('third')}
                            <div class="third-place-section">
                                <h3>🥉 3rd Place Match</h3>
                                {#if thirdPlaceSchedule}
                                    <button 
                                        class="schedule-link"
                                        on:click={() => scrollToSchedule(thirdPlaceSchedule.slotIndex)}
                                        title="View in schedule"
                                    >
                                        🕐 {thirdPlaceSchedule.time} • Board {thirdPlaceSchedule.board}
                                    </button>
                                {/if}
                                <div class="third-place-match" class:next-match={isNextMatch(tournament.bracket.thirdPlaceMatch)} class:completed={tournament.bracket.thirdPlaceMatch.winner}>
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
                                {#if tournament.bracket.thirdPlaceMatch.winner}
                                    <div class="third-place-winner">
                                        🥉 {tournament.bracket.thirdPlaceMatch.winner}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/if}
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .tournament-container {
        max-width: 1200px;
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
    
    /* Schedule View */
    .schedule-view h2 {
        margin-bottom: 1.5rem;
        color: #1f2937;
    }
    
    .time-slot {
        margin-bottom: 1.5rem;
        background: #f9fafb;
        border-radius: 12px;
        overflow: hidden;
    }
    
    .time-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
        color: white;
    }
    
    .time {
        font-size: 1.1rem;
        font-weight: 600;
    }
    
    .stage-badge {
        background: rgba(255,255,255,0.2);
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        font-size: 0.85rem;
    }
    
    .slot-matches {
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .schedule-match {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        background: white;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .board {
        background: #e5e7eb;
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        font-size: 0.85rem;
        font-weight: 500;
        color: #4b5563;
    }
    
    .matchup {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }
    
    .matchup .team {
        font-weight: 500;
        color: #1f2937;
    }
    
    .matchup .vs {
        color: #9ca3af;
        font-size: 0.85rem;
    }
    
    .group-tag {
        background: #dbeafe;
        color: #1d4ed8;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
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
    
    /* 3rd Place Match */
    .third-place-section {
        margin-top: 2rem;
        padding: 1.5rem;
        background: #f9fafb;
        border-radius: 12px;
        text-align: center;
    }
    
    .third-place-section h3 {
        margin: 0 0 1rem 0;
        color: #78716c;
        font-size: 1rem;
    }
    
    .third-place-match {
        display: inline-flex;
        flex-direction: column;
        background: white;
        border: 2px solid #d6d3d1;
        border-radius: 8px;
        min-width: 200px;
        position: relative;
    }
    
    .third-place-match.next-match {
        border-color: #f59e0b;
        box-shadow: 0 0 12px rgba(245, 158, 11, 0.3);
    }
    
    .third-place-match.completed {
        border-color: #a8a29e;
    }
    
    .third-place-match .team-slot {
        padding: 0.75rem 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .third-place-match .team-slot:last-child {
        border-bottom: none;
    }
    
    .third-place-winner {
        margin-top: 1rem;
        font-size: 1.1rem;
        font-weight: 600;
        color: #78716c;
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