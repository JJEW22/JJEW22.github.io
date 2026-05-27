<script>
    let activeTab = 'standings';
    
    const tabs = [
        { id: 'standings', label: "Pick'em Standings" },
        { id: 'plTable', label: 'PL Table' },
        { id: 'games', label: 'Games' },
        { id: 'rules', label: 'Rules' }
    ];
</script>

<svelte:head>
    <title>Premier League Pick'em</title>
    <meta name="description" content="Premier League Pick'em competition">
</svelte:head>

<div class="page">
    <nav class="breadcrumb">
        <a href="/me">← Back to Home</a>
    </nav>
    
    <div class="container">
        <header>
            <h1>⚽ Premier League Pick'em</h1>
        </header>
        
        <div class="tab-bar">
            {#each tabs as tab}
                <button 
                    class="tab" 
                    class:active={activeTab === tab.id}
                    on:click={() => activeTab = tab.id}
                >
                    {tab.label}
                </button>
            {/each}
        </div>
        
        <div class="tab-content">
            {#if activeTab === 'standings'}
                <div class="placeholder">
                    <h2>Pick'em Standings</h2>
                    <p>Coming soon</p>
                </div>
            {:else if activeTab === 'plTable'}
                <div class="placeholder">
                    <h2>Premier League Table</h2>
                    <p>Coming soon</p>
                </div>
            {:else if activeTab === 'games'}
                <div class="placeholder">
                    <h2>Games</h2>
                    <p>Coming soon</p>
                </div>
            {:else if activeTab === 'rules'}
                <div class="placeholder">
                    <h2>Rules</h2>
                    <p>Coming soon</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .page {
        min-height: 100vh;
        background: #f3f4f6;
        padding: 1.5rem;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    }
    
    .breadcrumb {
        max-width: 900px;
        margin: 0 auto 1rem;
    }
    
    .breadcrumb a {
        color: #6b7280;
        text-decoration: none;
        font-size: 0.9rem;
    }
    
    .breadcrumb a:hover { color: #1a1a1a; }
    
    .container {
        max-width: 900px;
        margin: 0 auto;
    }
    
    header {
        text-align: center;
        margin-bottom: 1.5rem;
    }
    
    h1 {
        font-size: 2rem;
        font-weight: 800;
        color: #1a1a1a;
        margin: 0;
    }
    
    .tab-bar {
        display: flex;
        background: white;
        border-radius: 10px;
        padding: 0.3rem;
        gap: 0.25rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        margin-bottom: 1.5rem;
    }
    
    .tab {
        flex: 1;
        padding: 0.7rem 1rem;
        border: none;
        background: transparent;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        color: #6b7280;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .tab:hover {
        color: #1a1a1a;
        background: #f9fafb;
    }
    
    .tab.active {
        background: #3d195b;
        color: white;
        font-weight: 600;
    }
    
    .tab-content {
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        min-height: 400px;
    }
    
    .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4rem 2rem;
        min-height: 400px;
    }
    
    .placeholder h2 {
        font-size: 1.5rem;
        color: #1a1a1a;
        margin: 0 0 0.5rem;
    }
    
    .placeholder p {
        color: #9ca3af;
        font-size: 1rem;
        margin: 0;
    }
    
    @media (max-width: 600px) {
        h1 { font-size: 1.5rem; }
        .tab { font-size: 0.8rem; padding: 0.6rem 0.5rem; }
    }
</style>