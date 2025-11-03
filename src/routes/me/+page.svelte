<script>
    import '../../app.css';

     // Projects data
    const projects = [
        {
            title: "JP Flicks",
            description: "Website for hosting Boston's premier Crokinole league. We play weekly, reach out if you are interested!",
            link: "/jpFlicks",
            image: null, // Optional: add image URL
        },
        {
            title: "Project Two",
            description: "A brief description of your second project. What problem does it solve? What technologies did you use?",
            link: "#",
            image: null,
        },
        {
            title: "Project Three",
            description: "Description of your third project goes here. Keep it concise but informative.",
            link: "#",
            image: null,
        },
        {
            title: "Project Four",
            description: "Another exciting project you've worked on. Highlight the key features or achievements.",
            link: "#",
            image: null,
        },
        {
            title: "Project Five",
            description: "Your fifth project description. What makes this project unique or interesting?",
            link: "#",
            image: null
        },
        {
            title: "Project Six",
            description: "Last project example. You can add as many projects as you want to this array.",
            link: "#",
            image: null,
        }
    ];
</script>

<svelte:head>
    <title>Just For Me</title>
    <meta name="description" content="Just for me and also you">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>Me Page</h1>
        
        <section class="intro">
            <p>
                You found the page that is "Just For Me". On here I link to random projects I am working on or stuff I am experimenting with, feel free to check it out!
            </p>
        </section>
        
        <div class="projects-grid">
            {#each projects as project}
                <a href={project.link} class="project-card">
                    {#if project.image}
                        <div class="card-image" style="background-image: url({project.image})"></div>
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
        background-size: cover;
        background-position: center;
        background-color: #f3f4f6;
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

