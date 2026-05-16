<script>
    import '../../app.css';
</script>

<svelte:head>
    <title>Research - Jack Weinstein</title>
    <meta name="description" content="Research in algorithmic fairness, combinatorial optimization, and computational social science">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>Research</h1>
        
        <section class="intro">
            <p>
                I am a researcher at Northeastern University working under Professor Ravi Sundaram. 
                My research focuses on the intersection of algorithmic fairness, combinatorial optimization, 
                and computational social science. I'm particularly interested in how constraints designed to 
                promote diversity and fairness in resource allocation interact with efficiency and 
                individual incentives.
            </p>
        </section>
        
        <section class="research-areas">
            <h2>Research Interests</h2>
            <div class="area-cards">
                <div class="area-card">
                    <div class="area-icon">⚖️</div>
                    <h3>Algorithmic Fairness</h3>
                    <p>
                        Studying the externalities introduced by diversity constraints in allocation mechanisms. 
                        How do fairness interventions affect the agents they're designed to help — and those they aren't?
                    </p>
                </div>
                <div class="area-card">
                    <div class="area-icon">🧮</div>
                    <h3>Combinatorial Optimization</h3>
                    <p>
                        Analyzing the structure and tight bounds of allocation problems under constraints, 
                        particularly in matching and assignment settings.
                    </p>
                </div>
                <div class="area-card">
                    <div class="area-icon">📊</div>
                    <h3>Scientometrics</h3>
                    <p>
                        Large-scale analysis of the US patent system and academic publication networks 
                        to understand patterns in innovation and knowledge production.
                    </p>
                </div>
            </div>
        </section>
        
        <section class="publications">
            <h2>Publications</h2>
            <div class="pub-list">
                <div class="pub-item">
                    <div class="pub-type">Paper</div>
                    <h3 class="pub-title">Tight Bounds on Externality of Robust Allocations with Diversity Constraints</h3>
                    <p class="pub-authors">Jack Weinstein, advised by Ravi Sundaram</p>
                    <p class="pub-venue">Northeastern University</p>
                    <p class="pub-abstract">
                        We prove tight bounds on the externality introduced when diversity constraints are 
                        imposed on allocation mechanisms, characterizing the worst-case impact on agents 
                        outside the protected groups.
                    </p>
                </div>
            </div>
        </section>
    </main>
</div>

<style>
    .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 2rem;
    }
    
    .breadcrumb { margin-bottom: 2rem; }
    .breadcrumb a {
        color: #666; text-decoration: none; font-size: 0.9rem;
    }
    .breadcrumb a:hover { color: #0066cc; }
    
    main {
        background: white;
        border-radius: 12px;
        padding: 3rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    
    h1 {
        font-size: 2.25rem;
        margin-bottom: 0.5rem;
        color: #1a1a1a;
    }
    
    .intro {
        font-size: 1.1rem;
        color: #555;
        line-height: 1.8;
        margin-bottom: 2rem;
    }
    
    h2 {
        font-size: 1.5rem;
        color: #1a1a1a;
        margin: 2.5rem 0 1.25rem 0;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #e5e7eb;
    }
    
    /* Research area cards */
    .area-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem;
        margin-top: 1rem;
    }
    
    .area-card {
        padding: 1.5rem;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        transition: all 0.2s;
    }
    
    .area-card:hover {
        border-color: #3b82f6;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
    }
    
    .area-icon {
        font-size: 1.75rem;
        margin-bottom: 0.75rem;
    }
    
    .area-card h3 {
        font-size: 1.05rem;
        color: #1a1a1a;
        margin: 0 0 0.5rem 0;
    }
    
    .area-card p {
        font-size: 0.9rem;
        color: #6b7280;
        line-height: 1.6;
        margin: 0;
    }
    
    /* Publications */
    .pub-list {
        margin-top: 1rem;
    }
    
    .pub-item {
        padding: 1.5rem;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        margin-bottom: 1rem;
        border-left: 4px solid #3b82f6;
    }
    
    .pub-type {
        display: inline-block;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #3b82f6;
        background: #eff6ff;
        padding: 0.2rem 0.6rem;
        border-radius: 4px;
        margin-bottom: 0.5rem;
    }
    
    .pub-title {
        font-size: 1.1rem;
        color: #1a1a1a;
        margin: 0.25rem 0 0.5rem 0;
        line-height: 1.4;
    }
    
    .pub-authors {
        font-size: 0.9rem;
        color: #6b7280;
        margin: 0 0 0.25rem 0;
    }
    
    .pub-venue {
        font-size: 0.85rem;
        color: #9ca3af;
        font-style: italic;
        margin: 0 0 0.75rem 0;
    }
    
    .pub-abstract {
        font-size: 0.9rem;
        color: #555;
        line-height: 1.6;
        margin: 0;
    }
    
    .pub-links {
        display: flex;
        gap: 0.75rem;
        margin-top: 0.75rem;
    }
    
    .pub-link {
        font-size: 0.85rem;
        color: #3b82f6;
        text-decoration: none;
        font-weight: 500;
    }
    
    .pub-link:hover { text-decoration: underline; }
    
    @media (max-width: 768px) {
        .container { padding: 1rem; }
        main { padding: 2rem 1.5rem; }
        h1 { font-size: 1.75rem; }
        .area-cards { grid-template-columns: 1fr; }
    }
</style>