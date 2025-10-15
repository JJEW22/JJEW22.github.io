<script>
    // You can add any JavaScript logic here
    let interests = [
        "Web Development",
        "Open Source",
        "Machine Learning",
        "Photography"
    ];
    
    let experience = [
        {
            role: "Software Engineer",
            company: "Tech Company",
            period: "2022 - Present",
            description: "Working on cutting-edge web applications"
        },
        {
            role: "Junior Developer",
            company: "Startup Inc",
            period: "2020 - 2022",
            description: "Full-stack development with modern technologies"
        }
    ];
</script>

<svelte:head>
    <title>About Me | Your Name</title>
    <meta name="description" content="Learn more about my background, experience, and interests">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>More About Me</h1>
        
        <section class="intro">
            <p>
                THIS IS IN PROGRESS AND IS NOT A COMPLETE REPRESENTATION OF MY CV. This is where you can share more detailed information about yourself,
                your background, your journey, and what drives you.
            </p>
        </section>
        
        <section class="content-section">
            <h2>My Journey</h2>
            <p>
                Share your professional journey, education, or how you got into your field.
                This is a great place to tell your story in more detail than your homepage bio.
            </p>
        </section>
        
        <section class="content-section">
            <h2>Experience</h2>
            <div class="experience-list">
                {#each experience as job}
                    <div class="experience-item">
                        <h3>{job.role}</h3>
                        <div class="company">{job.company} • {job.period}</div>
                        <p>{job.description}</p>
                    </div>
                {/each}
            </div>
        </section>
        
        <section class="content-section">
            <h2>Interests & Hobbies</h2>
            <div class="interests-grid">
                {#each interests as interest}
                    <div class="interest-tag">{interest}</div>
                {/each}
            </div>
            <p class="interests-description">
                When I'm not coding, I enjoy exploring new technologies, contributing to open source,
                and capturing moments through photography.
            </p>
        </section>
        
        <section class="content-section">
            <h2>Let's Connect</h2>
            <p>
                I'm always interested in new opportunities and collaborations.
                Feel free to reach out if you'd like to work together or just chat!
            </p>
            <div class="cta-buttons">
                <a href="mailto:your.email@example.com" class="button primary">Get in Touch</a>
                <a href="/" class="button secondary">Back to Home</a>
            </div>
        </section>
    </main>
</div>

<style>
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