<script>
    import { resolve } from '$app/paths';
    import '../../app.css';
    import jpFlicksLogo from '$lib/assets/colorJPFlicksLogo.svg';

    // Every image in src/lib/assets/me/, by file name without its extension
    // ("snow.jpg" -> "snow"). Found at build time, so a card only links an image
    // that exists -- a missing one would 404 and fail the prerender.
    /** @type {Record<string, string>} */
    const cardImages = Object.fromEntries(
        Object.entries(
            import.meta.glob('/src/lib/assets/me/*.{jpg,jpeg,png,webp,gif,svg}', {
                eager: true,
                import: 'default'
            })
        ).map(([path, url]) => [(path.split('/').pop() ?? '').replace(/\.[^.]+$/, ''), String(url)])
    );

    // Each project's card image: `image` names a file in src/lib/assets/me/
    // (see the README there), or `imageUrl` gives one directly. `fit: 'contain'`
    // shows a logo whole on a plain background instead of cropping it. A project
    // with no image file yet keeps the folder placeholder.
    const projects = [
        {
            title: "JP Flicks",
            description: "Website for hosting Boston's premier Crokinole league. We play weekly, reach out if you are interested!",
            link: "/jpFlicks",
            imageUrl: jpFlicksLogo,
            fit: 'contain',
            display: true
        },
        {
            title: "Snow Predictions",
            description: "Track and compete on first snow predictions with friends",
            link: "/snow",
            image: 'snow',
            display: true
        },
        {
            title: "March Madness Bracket",
            description: "Create and manage March Madness tournament brackets",
            link: "/marchMadness",
            image: 'marchMadness',
            display: true
        },
        {
            title: "JP Pizza Bracket",
            description: "24 pizzerias, 4 divisions, 1 champion. Rating the best pizza in JP and Mission Hill.",
            link: "/pizzaBracket",
            image: 'pizzaBracket',
            display: true
        },
        {
            title: "Premier League Pickem",
            description: "Pick a winner in every match, predict where all 20 clubs finish, and get scored on both across the season.",
            link: "/premierLeaguePickem",
            image: 'premierLeaguePickem',
            display: true
        },
        {
            title: "meSoup",
            description: "A map of every body of water I've swum in — ocean, lake, river, quarry and the odd hotel pool.",
            link: "/meSoup",
            image: 'meSoup',
            display: true
        },
        {
            title: "Krillion, rescored",
            description: "Paste your Krillion end screen and get a score based on how many players actually gave each answer.",
            link: "/krillion",
            image: 'krillion',
            display: true
        },
        {
            title: "Ultra tracker",
            description: "Follow me live during an ultra marathon — my phone posts its GPS here as I run.",
            link: "/ultra",
            image: 'ultra',
            display: true
        },
    ];

    // Only the projects switched on above, each with its image resolved.
    const displayedProjects = projects
        .filter(project => project.display)
        .map(project => ({
            ...project,
            src: project.imageUrl ?? (project.image ? cardImages[project.image] : null) ?? null
        }));
</script>

<svelte:head>
    <title>Just For Me</title>
    <meta name="description" content="Just for me and also you">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href={resolve('/')}>← Back to Home</a>
    </nav>
    
    <main>
        <h1>Me Page</h1>
        
        <section class="intro">
            <p>
                You found the page that is "Just For Me". On here I link to random projects I am working on or stuff I am experimenting with, feel free to check it out!
            </p>
        </section>
        
        <div class="projects-grid">
            {#each displayedProjects as project (project.link)}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- links come from the static project list above; resolve() only takes a literal route -->
                <a href={project.link} class="project-card">
                    {#if project.src}
                        <div class="card-image" class:contain={project.fit === 'contain'}>
                            <img src={project.src} alt="" loading="lazy" />
                        </div>
                    {:else}
                        <div class="card-image placeholder">
                            <span class="placeholder-icon">📁</span>
                        </div>
                    {/if}
                    
                    <div class="card-content">
                        <h2 class="card-title">{project.title}</h2>
                        <p class="card-description">{project.description}</p>
                    </div>
                    
                    <div class="card-footer">
                        <span class="view-project">View Project →</span>
                    </div>
                </a>
            {/each}
        </div>

    </main>
</div>

<style>
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
        margin-bottom: 0.5rem;
        color: #1a1a1a;
    }
    
    .subtitle {
        font-size: 1.1rem;
        color: #666;
        margin-bottom: 3rem;
    }
    
    /* Projects grid - 3 columns on desktop */
    .projects-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2rem;
    }
    
    /* Project card styles */
    .project-card {
        display: flex;
        flex-direction: column;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.3s ease;
        text-decoration: none;
        color: inherit;
        height: 100%;
    }
    
    .project-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
        border-color: #0066cc;
    }
    
    /* Card image */
    .card-image {
        width: 100%;
        height: 200px;
        overflow: hidden;
        background-color: #f3f4f6;
    }

    .card-image img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    /* A logo, shown whole rather than cropped. */
    .card-image.contain {
        padding: 1.25rem;
        box-sizing: border-box;
        background: #f8f5ef;
    }

    .card-image.contain img {
        object-fit: contain;
    }
    
    .card-image.placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    
    .placeholder-icon {
        font-size: 4rem;
    }
    
    /* Card content */
    .card-content {
        padding: 1.5rem;
        flex: 1;
    }
    
    .card-title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.75rem 0;
        color: #1a1a1a;
    }
    
    .card-description {
        font-size: 0.95rem;
        color: #666;
        line-height: 1.6;
        margin: 0;
    }
    
    /* Tags */
    .card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 1rem;
    }
    
    .tag {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        background: #e5e7eb;
        color: #4b5563;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    /* Card footer */
    .card-footer {
        padding: 1rem 1.5rem;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
    }
    
    .view-project {
        color: #0066cc;
        font-weight: 500;
        font-size: 0.9rem;
    }
    
    .project-card:hover .view-project {
        text-decoration: underline;
    }
    
    /* Tablet - 2 columns */
    @media (max-width: 1024px) {
        .projects-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1.5rem;
        }
    }
    
    /* Mobile - 1 column */
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
        
        .subtitle {
            font-size: 1rem;
            margin-bottom: 2rem;
        }
        
        .projects-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
        }
        
        .card-image {
            height: 180px;
        }
        
        .card-title {
            font-size: 1.25rem;
        }
    }
    .container {
        max-width: 800px;
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
        transition: color 0.2s;
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
    
    h2 {
        font-size: 1.75rem;
        margin: 2.5rem 0 1.5rem 0;
        color: #333;
        position: relative;
        padding-bottom: 0.5rem;
    }
    
    h2::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 50px;
        height: 3px;
        background: #0066cc;
        border-radius: 2px;
    }
    
    .intro {
        font-size: 1.125rem;
        color: #555;
        margin-bottom: 3rem;
        line-height: 1.7;
    }
    
    .content-section {
        margin: 3rem 0;
    }
    
    .content-section p {
        color: #555;
        line-height: 1.8;
    }
    
    .experience-list {
        margin-top: 1.5rem;
    }
    
    .experience-item {
        margin-bottom: 2rem;
        padding-bottom: 2rem;
        border-bottom: 1px solid #eee;
    }
    
    .experience-item:last-child {
        border-bottom: none;
    }
    
    .experience-item h3 {
        font-size: 1.25rem;
        margin-bottom: 0.5rem;
        color: #1a1a1a;
    }
    
    .company {
        color: #666;
        font-size: 0.95rem;
        margin-bottom: 0.75rem;
    }
    
    .interests-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin: 1.5rem 0;
    }
    
    .interest-tag {
        background: #f0f7ff;
        color: #0066cc;
        padding: 0.5rem 1.25rem;
        border-radius: 25px;
        font-size: 0.95rem;
    }
    
    .interests-description {
        margin-top: 1.5rem;
    }
    
    .cta-buttons {
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
        flex-wrap: wrap;
    }
    
    .button {
        padding: 0.75rem 1.5rem;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 500;
        transition: all 0.2s;
        display: inline-block;
    }
    
    .button.primary {
        background: #0066cc;
        color: white;
    }
    
    .button.primary:hover {
        background: #0052a3;
        transform: translateY(-2px);
    }
    
    .button.secondary {
        background: #f5f5f5;
        color: #333;
    }
    
    .button.secondary:hover {
        background: #e8e8e8;
    }
    
    @media (max-width: 768px) {
        .container {
            padding: 1rem;
        }
        
        main {
            padding: 2rem 1.5rem;
        }
        
        h1 {
            font-size: 2rem;
        }
        
        h2 {
            font-size: 1.5rem;
        }
    }
</style>