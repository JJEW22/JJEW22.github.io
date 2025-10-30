<script>

  // Sample data - replace with your actual hall of fame entries
  const hallOfFameEntries = [
    {
      eventName: 'Season 1',
      champion: "TGIAJF",
      members: "Jack + Tyler",
      record: {
        score: 12,
        record: "5-1-0",
        seriesRecord: "1-0",
        PD: "+285"
      },
      runnerUp: "Flying Horse",
      runnerUpMembers: "Katelyn + Vedant",
      runnerUpRecord: {
        score: 4,
        record: "2-0-1",
        seriesRecord: "0-0",
        PD: "+75"
      },
    },
    {
      eventName: 'Season 1 indv.',
      champion: "Tyler",
      members: "NA",
      record: {
        score: 12,
        record: "5-0-0",
        seriesRecord: "2-0",
        PD: "+285"
      },
      runnerUp: "Jack",
      runnerUpRecord: {
        score: 12,
        record: "5-0-2",
        seriesRecord: "2-0",
        PD: "+105"
      },
    },
    {
      eventName: 'Season 2',
      champion: "Your Team?",
      members: "You? + Partner?",
      record: {
        score: 40,
        record: "16-0-0",
        seriesRecord: "8-0",
        PD: "+1595"
      },
      runnerUp: "The Losers",
      runnerUpMembers: "Your + Enemy",
      runnerUpRecord: {
        score: 19,
        record: "0-15-1",
        seriesRecord: "4-4",
        PD: "-87"
      },
    }
  ];

  function formatRecord(record) {
    return `${record.score} ${record.record}<br>(${record.seriesRecord} ${record.PD})`
  }

  function formatTeamName(teamName, members) {
    if ((members === undefined) || (members === "NA")) {
        return `<span class="bold-name">${teamName}</span>`;
    } else {
        return `<span class="bold-name">${teamName}</span><br><span class="members">(${members})</span>`;
    }
  }
</script>

<div class="hall-of-fame-container">
  <div class="trophy-header">
    <span class="trophy-icon">🏆</span>
    <h2>Hall of Fame</h2>
    <span class="trophy-icon">🏆</span>
  </div>
  
  <p class="subtitle">Celebrating our legendary champions</p>
  
  <div class="table-wrapper">
    <table class="hall-of-fame-table">
      <thead>
        <tr>
            <th>Event</th>
            <th>Champion</th>
            <th>Record</th>
            <th>Runner Up</th>
            <th>Runner Up Record</th>
        </tr>
      </thead>
      <tbody>
        {#each hallOfFameEntries as entry, index}
          <tr class="champion-row">
            <td class="season-cell">
              <div class="season-badge">{entry.eventName}</div>
            </td>
            <td class="team-name">{@html formatTeamName(entry.champion, entry.members)}</td>
            <td class="record-cell">{@html formatRecord(entry.record)}</td>
            <td class="team-name">{@html formatTeamName(entry.runnerUp, entry.runnerUpMembers)}</td>
            <td class="record-cell">{@html formatRecord(entry.runnerUpRecord)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  
  <div class="hall-note">
    <p>* Record format: Score Wins-Draws-Losses (seriesRecord PD)</p>
  </div>
</div>

<style>
  .hall-of-fame-container {
    margin: 3rem 0;
    padding: 2rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  }
  
  .trophy-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  
  .trophy-header h2 {
    color: white;
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  }
  
  .trophy-icon {
    font-size: 2.5rem;
    animation: bounce 2s infinite;
  }
  
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  
  .subtitle {
    text-align: center;
    color: rgba(255, 255, 255, 0.9);
    font-size: 1.1rem;
    font-style: italic;
    margin-bottom: 2rem;
  }
  
  .table-wrapper {
    overflow-x: auto;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  .hall-of-fame-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
  }
  
  .hall-of-fame-table thead {
    background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
  }
  
  .hall-of-fame-table th {
    color: white;
    padding: 1.25rem 1rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 3px solid #fbbf24;
    text-align: center;
  }
  
  .champion-row {
    transition: all 0.3s ease;
    border-bottom: 1px solid #e5e7eb;
    text-align: center;
  }
  
  .champion-row:last-child {
    border-bottom: none;
  }
  
  .hall-of-fame-table td {
    padding: 1rem 0.75rem;
    color: #1a1a1a;
    font-size: 1rem;
    white-space: nowrap;
  }
  
  .season-cell {
    text-align: center;
  }
  
  .season-badge {
    display: inline-block;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: 700;
    font-size: 0.9rem;
    box-shadow: 0 2px 4px rgba(251, 191, 36, 0.4);
  }
  
  .team-name {
    color: #1e3a8a;
    font-size: 1.1rem;
  }

  .team-name :global(.bold-name) {
    font-weight: 700;
  }

  .team-name :global(.members) {
    font-weight: 400; /* Normal weight for members in parentheses */
  }
  
  .score-cell {
    text-align: center;
    font-weight: 700;
    font-size: 1.2rem;
    color: #059669;
  }
  
  .record-cell {
    text-align: center;
    font-weight: 600;
    color: #4b5563;
    font-family: 'Courier New', monospace;
  }
  
  .hall-note {
    margin-top: 1.5rem;
    text-align: center;
  }
  
  .hall-note p {
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.875rem;
    font-style: italic;
    margin: 0;
  }
  
  /* Mobile responsive */
  @media (max-width: 768px) {
    .hall-of-fame-container {
      padding: 1.5rem 1rem;
      margin: 2rem 0;
    }
    
    .trophy-header h2 {
      font-size: 1.75rem;
    }
    
    .trophy-icon {
      font-size: 1.75rem;
    }
    
    .subtitle {
      font-size: 0.95rem;
    }
    
    .table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    
    .hall-of-fame-table {
      min-width: 600px;
      font-size: 0.85rem;
    }
    
    .hall-of-fame-table th {
      padding: 0.75rem 0.5rem;
      font-size: 0.75rem;
    }
    
    .hall-of-fame-table td {
      padding: 0.75rem 0.5rem;
    }
    
    .team-name {
      font-size: 0.95rem;
    }
    
    .season-badge {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
    }
  }
</style>