<script>
    import { onMount } from 'svelte';
    
    // Props
    export let configPath = '/marchMadness/2026/scoring-config.json';
    export let compact = false;  // If true, show a more compact version
    
    // State
    let config = null;
    let loading = true;
    let error = null;
    
    onMount(async () => {
        await loadConfig();
    });
    
    async function loadConfig() {
        try {
            const response = await fetch(configPath);
            if (!response.ok) {
                throw new Error(`Failed to load scoring config: ${response.status}`);
            }
            config = await response.json();
            loading = false;
        } catch (err) {
            error = err.message;
            loading = false;
            console.error('Error loading scoring config:', err);
        }
    }
    
    // Compute total possible points (all correct picks, no upsets)
    $: maxBasePoints = config ? config.scoreForRound.reduce((sum, pts, i) => {
        if (i === 0) return sum;
        const gamesInRound = Math.pow(2, 6 - i);  // 32, 16, 8, 4, 2, 1
        return sum + (pts * gamesInRound);
    }, 0) : 0;
</script>

{#if loading}
    <div class="rules-loading">Loading rules...</div>
{:else if error}
    <div class="rules-error">
        <p>Could not load scoring rules: {error}</p>
    </div>
{:else if config}
    <div class="rules-container" class:compact>
        <h2 class="rules-title">Scoring Rules</h2>
        
        <section class="rules-section">
            <h3>Base Points per Round</h3>
            <p class="rules-description">{config.description.baseScoring}</p>
            <table class="scoring-table">
                <thead>
                    <tr>
                        <th>Round</th>
                        <th>Points per Correct Pick</th>
                        <th>Games</th>
                        <th>Max Points</th>
                    </tr>
                </thead>
                <tbody>
                    {#each config.roundNames as roundName, i}
                        {#if i > 0}
                            {@const gamesInRound = Math.pow(2, 6 - i)}
                            {@const maxForRound = config.scoreForRound[i] * gamesInRound}
                            <tr>
                                <td class="round-name">{roundName}</td>
                                <td class="points">{config.scoreForRound[i]}</td>
                                <td class="games">{gamesInRound}</td>
                                <td class="max-points">{maxForRound}</td>
                            </tr>
                        {/if}
                    {/each}
                    <tr class="total-row">
                        <td class="round-name"><strong>Total</strong></td>
                        <td></td>
                        <td class="games"><strong>63</strong></td>
                        <td class="max-points"><strong>{maxBasePoints}</strong></td>
                    </tr>
                </tbody>
            </table>
        </section>
        
        <section class="rules-section">
            <h3>Upset Bonus</h3>
            <p class="rules-description">{config.description.upsetBonus}</p>
            <table class="scoring-table">
                <thead>
                    <tr>
                        <th>Round</th>
                        <th>Seed Factor</th>
                        <th>Example</th>
                    </tr>
                </thead>
                <tbody>
                    {#each config.roundNames as roundName, i}
                        {#if i > 0}
                            {@const factor = config.seedFactor[i]}
                            {@const exampleBonus = factor * 5}
                            <tr>
                                <td class="round-name">{roundName}</td>
                                <td class="factor">×{factor}</td>
                                <td class="example">
                                    {#if factor > 0}
                                        12 beats 5 → +{exampleBonus} pts
                                    {:else}
                                        No bonus
                                    {/if}
                                </td>
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
            <p class="rules-note">
                <strong>Formula:</strong> (Winner Seed − Lower Seed) × Seed Factor
            </p>
        </section>
        
        {#if !compact}
            <section class="rules-section">
                <h3>Example Calculation</h3>
                <div class="example-box">
                    <p><strong>Scenario:</strong> You correctly pick a 12-seed to beat a 5-seed in the Round of 64.</p>
                    <ul>
                        <li>Base points: <strong>{config.scoreForRound[1]}</strong> (Round of 64)</li>
                        <li>Upset bonus: (12 − 5) × {config.seedFactor[1]} = <strong>{7 * config.seedFactor[1]}</strong></li>
                        <li>Total: <strong>{config.scoreForRound[1] + 7 * config.seedFactor[1]}</strong> points</li>
                    </ul>
                </div>
            </section>
            
            <section class="rules-section">
                <h3>Tiebreaker</h3>
                <p class="rules-description">{config.description.tiebreaker}</p>
            </section>
            
            {#if config.startBonus && Object.keys(config.startBonus).length > 0}
                <section class="rules-section">
                    <h3>Starting Bonuses</h3>
                    <p class="rules-description">Some participants have starting bonus points:</p>
                    <ul class="bonus-list">
                        {#each Object.entries(config.startBonus) as [name, bonus]}
                            <li><strong>{name}:</strong> +{bonus} points</li>
                        {/each}
                    </ul>
                </section>
            {/if}
        {/if}
    </div>
{/if}

<style>
    .rules-container {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .rules-container.compact {
        padding: 1rem;
    }
    
    .rules-title {
        margin: 0 0 1.5rem 0;
        font-size: 1.5rem;
        color: #1e293b;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 0.75rem;
    }
    
    .compact .rules-title {
        font-size: 1.25rem;
        margin-bottom: 1rem;
    }
    
    .rules-section {
        margin-bottom: 1.5rem;
    }
    
    .rules-section:last-child {
        margin-bottom: 0;
    }
    
    .rules-section h3 {
        font-size: 1.1rem;
        color: #334155;
        margin: 0 0 0.75rem 0;
    }
    
    .compact .rules-section h3 {
        font-size: 1rem;
    }
    
    .rules-description {
        color: #64748b;
        margin: 0 0 1rem 0;
        line-height: 1.5;
    }
    
    .scoring-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
    }
    
    .compact .scoring-table {
        font-size: 0.85rem;
    }
    
    .scoring-table th,
    .scoring-table td {
        padding: 0.6rem 0.75rem;
        text-align: left;
        border-bottom: 1px solid #e2e8f0;
    }
    
    .scoring-table th {
        background: #f8fafc;
        font-weight: 600;
        color: #475569;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.025em;
    }
    
    .scoring-table tbody tr:hover {
        background: #f8fafc;
    }
    
    .round-name {
        font-weight: 500;
        color: #334155;
    }
    
    .points, .factor, .games, .max-points {
        text-align: center;
        font-family: 'Monaco', 'Menlo', monospace;
    }
    
    .points, .max-points {
        color: #059669;
        font-weight: 600;
    }
    
    .factor {
        color: #7c3aed;
        font-weight: 600;
    }
    
    .example {
        color: #64748b;
        font-size: 0.85rem;
    }
    
    .total-row {
        background: #f0fdf4 !important;
        border-top: 2px solid #10b981;
    }
    
    .total-row td {
        border-bottom: none;
    }
    
    .rules-note {
        margin: 0.75rem 0 0 0;
        padding: 0.75rem;
        background: #f8fafc;
        border-radius: 6px;
        font-size: 0.9rem;
        color: #475569;
    }
    
    .example-box {
        background: #fffbeb;
        border: 1px solid #fcd34d;
        border-radius: 8px;
        padding: 1rem;
    }
    
    .example-box p {
        margin: 0 0 0.75rem 0;
        color: #92400e;
    }
    
    .example-box ul {
        margin: 0;
        padding-left: 1.5rem;
        color: #78350f;
    }
    
    .example-box li {
        margin-bottom: 0.25rem;
    }
    
    .bonus-list {
        margin: 0;
        padding-left: 1.5rem;
    }
    
    .bonus-list li {
        margin-bottom: 0.25rem;
        color: #475569;
    }
    
    .rules-loading {
        text-align: center;
        padding: 2rem;
        color: #64748b;
    }
    
    .rules-error {
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        padding: 1rem;
        color: #dc2626;
    }
    
    /* Mobile responsive */
    @media (max-width: 640px) {
        .rules-container {
            padding: 1rem;
        }
        
        .scoring-table th,
        .scoring-table td {
            padding: 0.5rem;
            font-size: 0.8rem;
        }
        
        .example {
            display: none;
        }
    }
</style>