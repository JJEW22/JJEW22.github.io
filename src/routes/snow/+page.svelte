<script>
    import { onMount } from 'svelte';
    import '../../app.css';

    // Snow predictions data - UPDATE THIS with your friends' predictions
    const predictions = [
        { name: "Jack", predictedDate: "2025-11-29" },
        { name: "Vedant & Dina", predictedDate: "2025-12-13" },
        { name: "Shawty", predictedDate: "2025-12-03" },
        { name: "Sam", predictedDate: "2025-12-22" },
        { name: "Katelyn", predictedDate: "2025-11-18" },
        { name: "Nick", predictedDate: "2025-12-25" },
        { name: "Anish", predictedDate: "2025-12-11" },
        { name: "Aidan & Na'ama", predictedDate: "2025-12-14" },
        { name: "Tea", predictedDate: "2025-12-12" },
        { name: "Haneen & Sandy", predictedDate: "2025-12-15" },
        { name: "Moll Ball", predictedDate: "2025-12-8" },
        { name: "Calude", predictedDate: "2026-1-18" },
    ];

    let today = new Date();
    let todayString = today.toISOString().split('T')[0];
    let currentWinner = null;
    let nextChange = null;
    let processedPredictions = [];
    let hasSnowed = true; // Set to true once it actually snows
    let actualSnowDate = "2025-12-14"; // Set this when it snows

    onMount(() => {
        calculatePredictions();
    });

    function calculatePredictions() {
        const todayTime = today.getTime();

        // Process each prediction
        processedPredictions = predictions.map(pred => {
            // Parse date as local time, not UTC
            const [year, month, day] = pred.predictedDate.split('-').map(Number);
            const predDate = new Date(year, month - 1, day); // month is 0-indexed
            const predTime = predDate.getTime();
            const diffDays = Math.ceil((predTime - todayTime) / (1000 * 60 * 60 * 24));
            const diffMs = Math.abs(predTime - todayTime);
            
            return {
                ...pred,
                predictedDate: pred.predictedDate,
                displayDate: formatDate(predDate),
                predDateObj: predDate,
                daysAway: diffDays,
                isPast: diffDays < 0,
                distance: diffMs
            };
        });

        // Sort by date to calculate winning ranges
        const sortedByDate = [...processedPredictions].sort((a, b) => 
            a.predDateObj.getTime() - b.predDateObj.getTime()
        );

        // Calculate winning range for each person
        sortedByDate.forEach((pred, index) => {
            const predTime = pred.predDateObj.getTime();
            
            // Find the midpoint to previous prediction
            let rangeStart;
            if (index === 0) {
                // First person wins from beginning of time
                rangeStart = null;
            } else {
                const prevPredTime = sortedByDate[index - 1].predDateObj.getTime();
                const midpointTime = (predTime + prevPredTime) / 2;
                rangeStart = new Date(midpointTime);
                if (rangeStart.getHours() === 12) {
                    rangeStart.setHours(rangeStart.getHours() + 12);
                }
            }
            
            // Find the midpoint to next prediction
            let rangeEnd;
            if (index === sortedByDate.length - 1) {
                // Last person wins until end of time
                rangeEnd = null;
            } else {
                const nextPredTime = sortedByDate[index + 1].predDateObj.getTime();
                const midpointTime = (predTime + nextPredTime) / 2;
                rangeEnd = new Date(midpointTime);
                rangeEnd.setHours(rangeEnd.getHours() - 12);
            }
            
            pred.winningRangeStart = rangeStart;
            pred.winningRangeEnd = rangeEnd;
        });

        // Sort by how close they are to today for display
        processedPredictions.sort((a, b) => a.distance - b.distance);

        // Find current winner (closest prediction that hasn't passed)
        // const futurePredictions = processedPredictions.filter(p => !p.isPast);
        const futurePredictions = processedPredictions;
        if (futurePredictions.length > 0) {
            currentWinner = futurePredictions[0];
            
            // Find next change (second closest future prediction)
            if (futurePredictions.length > 1) {
                nextChange = futurePredictions[1];
            }
        } else {
            // All predictions are in the past
            currentWinner = processedPredictions[0]; // Closest to today
        }

        // Sort for display by date
        processedPredictions.sort((a, b) => 
            new Date(a.predictedDate).getTime() - new Date(b.predictedDate).getTime()
        );
    }

    function formatDate(date) {
        const options = { month: 'long', day: 'numeric', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    function formatDateShort(date) {
        const options = { month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    function formatWinningRange(pred) {
        if (!pred.winningRangeStart && !pred.winningRangeEnd) {
            return "Always";
        }
        if (!pred.winningRangeStart) {
            return `Before or on ${formatDateShort(pred.winningRangeEnd)}`;
        }
        if (!pred.winningRangeEnd) {
            return `After or on ${formatDateShort(pred.winningRangeStart)}`;
        }
        return `${formatDateShort(pred.winningRangeStart)} - ${formatDateShort(pred.winningRangeEnd)}`;
    }

    function getDaysText(days) {
        if (days === 0) return "Today!";
        if (days === 1) return "Tomorrow";
        if (days === -1) return "Yesterday";
        if (days < 0) return `${Math.abs(days)} days ago`;
        return `In ${days} days`;
    }

    function getWinDuration() {
        if (!currentWinner || !nextChange) return null;
        const currentDate = new Date(currentWinner.predictedDate);
        const nextDate = new Date(nextChange.predictedDate);
        const diffDays = Math.ceil((nextDate - currentDate) / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    // Function to mark when it actually snows
    function markSnowDate(date) {
        hasSnowed = true;
        actualSnowDate = date;
        calculateWinner();
    }

    function calculateWinner() {
        if (!actualSnowDate) return;
        
        const snowTime = new Date(actualSnowDate).getTime();
        
        // Find who was closest
        const withDistances = predictions.map(pred => {
            const predTime = new Date(pred.predictedDate).getTime();
            const distance = Math.abs(snowTime - predTime);
            const daysDiff = Math.ceil((snowTime - predTime) / (1000 * 60 * 60 * 24));
            
            return {
                ...pred,
                distance,
                daysDiff,
                displayDate: formatDate(new Date(pred.predictedDate))
            };
        });
        
        withDistances.sort((a, b) => a.distance - b.distance);
        currentWinner = withDistances[0];
        processedPredictions = withDistances;
    }

    $: winDuration = getWinDuration();
</script>

<svelte:head>
    <title>First Snow Predictions</title>
    <meta name="description" content="Predicting the first snow of the season">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>❄️ First Snow Predictions ❄️</h1>
        
        <div class="info-section">
            <div class="today-banner">
                <span class="label">Today's Date:</span>
                <span class="date">{formatDate(today)}</span>
            </div>

            {#if !hasSnowed}
                <div class="winner-card">
                    <h2>Current Leader</h2>
                    {#if currentWinner}
                        <div class="winner-content">
                            <div class="winner-name">{currentWinner.name}</div>
                            <div class="winner-prediction">
                                Predicted: {currentWinner.displayDate}
                            </div>
                            <div class="winner-status">
                                {getDaysText(currentWinner.daysAway)}
                            </div>
                            {#if nextChange && winDuration}
                                <div class="win-duration">
                                    Will remain leader for {winDuration} {winDuration === 1 ? 'day' : 'days'}
                                    <br>
                                    <span class="next-leader">Next: {nextChange.name} ({nextChange.displayDate})</span>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="winner-card final">
                    <h2>🎉 Final Winner!</h2>
                    <div class="winner-content">
                        <div class="winner-name">{currentWinner.name}</div>
                        <div class="winner-prediction">
                            Predicted: {currentWinner.displayDate}
                        </div>
                        <div class="winner-prediction">
                            Actually snowed: {formatDate(new Date(actualSnowDate))}
                        </div>
                        <div class="winner-status">
                            Off by {Math.abs(currentWinner.daysDiff)} {Math.abs(currentWinner.daysDiff) === 1 ? 'day' : 'days'}!
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <h2>All Predictions</h2>
        <div class="table-wrapper">
            <table class="predictions-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Name</th>
                        <th>Predicted Date</th>
                        <th>Winning Range</th>
                        <th>Status</th>
                        {#if hasSnowed}
                            <th>Accuracy</th>
                        {/if}
                    </tr>
                </thead>
                <tbody>
                    {#each processedPredictions as prediction, index}
                        <tr class:winner={!hasSnowed && prediction.name === currentWinner?.name}
                            class:past={false}>
                            <td class="rank-cell">
                                {#if !hasSnowed && prediction.name === currentWinner?.name}
                                    <span class="medal">🏆</span>
                                {:else}
                                    {index + 1}
                                {/if}
                            </td>
                            <td class="name-cell">{prediction.name}</td>
                            <td class="date-cell">{prediction.displayDate}</td>
                            <td class="range-cell">{formatWinningRange(prediction)}</td>
                            <td class="status-cell">
                                {#if !hasSnowed}
                                    <span class:status-past={prediction.isPast}
                                          class:status-today={prediction.daysAway === 0}
                                          class:status-future={!prediction.isPast && prediction.daysAway !== 0}>
                                        {getDaysText(prediction.daysAway)}
                                    </span>
                                {:else}
                                    <span>Snow fell {formatDate(new Date(actualSnowDate))}</span>
                                {/if}
                            </td>
                            {#if hasSnowed}
                                <td class="accuracy-cell">
                                    {Math.abs(prediction.daysDiff)} {Math.abs(prediction.daysDiff) === 1 ? 'day' : 'days'} off
                                </td>
                            {/if}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- Admin button to mark when it actually snows (remove in production) -->
        <!-- {#if !hasSnowed}
            <div class="admin-section">
                <button class="admin-button" on:click={() => markSnowDate(todayString)}>
                    ❄️ Mark that it snowed today
                </button>
            </div>
        {/if} -->
    </main>
</div>

<style>
    .container {
        max-width: 1000px;
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
        text-align: center;
    }
    
    h2 {
        font-size: 1.5rem;
        margin: 2rem 0 1rem 0;
        color: #333;
    }
    
    .info-section {
        margin-bottom: 3rem;
    }
    
    .today-banner {
        background: #f0f7ff;
        padding: 1rem;
        border-radius: 8px;
        text-align: center;
        margin-bottom: 2rem;
        border: 2px solid #0066cc;
    }
    
    .today-banner .label {
        font-weight: 600;
        color: #0066cc;
        margin-right: 0.5rem;
    }
    
    .today-banner .date {
        font-size: 1.25rem;
        font-weight: 700;
        color: #1a1a1a;
    }
    
    .winner-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
    }
    
    .winner-card.final {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    }
    
    .winner-card h2 {
        margin: 0 0 1.5rem 0;
        color: white;
        text-align: center;
        font-size: 1.75rem;
    }
    
    .winner-content {
        text-align: center;
    }
    
    .winner-name {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 1rem;
    }
    
    .winner-prediction {
        font-size: 1.25rem;
        margin-bottom: 0.5rem;
        opacity: 0.95;
    }
    
    .winner-status {
        font-size: 1.5rem;
        font-weight: 600;
        margin-top: 1rem;
    }
    
    .win-duration {
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid rgba(255, 255, 255, 0.3);
        font-size: 1rem;
        opacity: 0.9;
    }
    
    .next-leader {
        font-size: 0.9rem;
        opacity: 0.8;
    }
    
    .table-wrapper {
        overflow-x: auto;
        margin-bottom: 2rem;
    }
    
    .predictions-table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .predictions-table thead {
        background: #4a5568;
    }
    
    .predictions-table th {
        color: white;
        padding: 1rem;
        text-align: left;
        font-weight: 600;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .predictions-table td {
        padding: 1rem;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .predictions-table tbody tr:last-child td {
        border-bottom: none;
    }
    
    .predictions-table tbody tr:hover {
        background: #f9fafb;
    }
    
    .predictions-table tr.winner {
        background: #fef3c7;
        font-weight: 600;
    }
    
    .predictions-table tr.winner:hover {
        background: #fde68a;
    }
    
    .predictions-table tr.past {
        opacity: 0.6;
    }
    
    .rank-cell {
        text-align: center;
        font-weight: 600;
        width: 80px;
    }
    
    .medal {
        font-size: 1.5rem;
    }
    
    .name-cell {
        font-weight: 600;
        color: #1a1a1a;
    }
    
    .date-cell {
        color: #4b5563;
    }

    .range-cell {
        color: #6b7280;
        font-size: 0.9rem;
        font-style: italic;
    }
    
    .status-cell {
        text-align: center;
    }
    
    .status-past {
        color: #dc2626;
        font-weight: 500;
    }
    
    .status-today {
        color: #059669;
        font-weight: 700;
        font-size: 1.1rem;
    }
    
    .status-future {
        color: #0066cc;
        font-weight: 500;
    }
    
    .accuracy-cell {
        text-align: center;
        font-weight: 600;
    }
    
    .admin-section {
        text-align: center;
        margin-top: 3rem;
        padding-top: 2rem;
        border-top: 2px dashed #e5e7eb;
    }
    
    .admin-button {
        padding: 0.75rem 2rem;
        background: #dc2626;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .admin-button:hover {
        background: #b91c1c;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(220, 38, 38, 0.3);
    }
    
    /* Mobile responsive */
    @media (max-width: 768px) {
        .container {
            padding: 1rem;
        }
        
        main {
            padding: 1.5rem;
        }
        
        h1 {
            font-size: 1.75rem;
        }
        
        .winner-name {
            font-size: 2rem;
        }
        
        .predictions-table {
            font-size: 0.85rem;
        }
        
        .predictions-table th,
        .predictions-table td {
            padding: 0.75rem 0.5rem;
        }
    }
</style>