<script>
    // Update these with your actual information
    let name = "John Wilkins";
    let role = "PhD Student at Northeastern University";
    let tagline = "CS Theory and Finance";
    
    // Social links - update with your actual links
    let socials = {
        email: "wilkins.jo@northeastern.edu",
        github: "https://github.com/JJEW22",
        linkedin: "https://linkedin.com/in/yourusername",
    };

    // Last updated date - this will be automatically updated during build
    let lastUpdated = __BUILD_DATE__;
</script>

<svelte:head>
    <title>{name} - Website</title>
    <meta name="description" content="{name}'s personal website">
</svelte:head>

<div class="page-container">
    <main>
        <section class="hero">
            <div class="hero-content">
                <h1>{name}</h1>
                <h2>{role}</h2>
                <p class="tagline">{tagline}</p>
                
                <div class="bio-section">
                    <h3>About Me</h3>
                    <div class="bio-text">
                            <p>
                            I am a fourth-year Computer Science PhD Student at Northeastern University, where I am advised by <a href="https://www.ccs.neu.edu/home/koods/"> Ravi Sundaram </a>. My research interests are in algorithmic fairness theory and its applications to personal finance outcomes.
                            </p>
                            <p>
                            In addition to conducting research I have passed the Series 65 exam and am seeking employment as an investment advisor representative while pursuing the CFP designation.
                            </p>
                    </div>
                </div>
                
                <div class="social-links">
                    {#if socials.email}
                        <a href="mailto:{socials.email}" aria-label="Email">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                            </svg>
                        </a>
                    {/if}
                    {#if socials.github}
                        <a href={socials.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                        </a>
                    {/if}
                    {#if socials.linkedin}
                        <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                        </a>
                    {/if}
                    {#if socials.twitter}
                        <a href={socials.twitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                            </svg>
                        </a>
                    {/if}
                </div>
            </div>
        </section>
    </main>
    <footer class="update-info">
        <p>Last updated: {lastUpdated}</p>
    </footer>
</div>

<style>
    :global(body) {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
        background-color: #fafafa;
    }
    
    .page-container {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    main {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
    }

    .hero {
        width: 100%;
        max-width: 800px;
    }

    .hero-content {
        background: white;
        border-radius: 12px;
        padding: 3rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }

    h1 {
        font-size: 3rem;
        margin: 0 0 0.5rem 0;
        color: #1a1a1a;
        letter-spacing: -0.025em;
    }

    h2 {
        font-size: 1.5rem;
        color: #666;
        font-weight: normal;
        margin: 0 0 1rem 0;
    }

    .tagline {
        font-size: 1.125rem;
        color: #555;
        margin-bottom: 3rem;
        font-style: italic;
    }

    .bio-section {
        margin: 3rem 0;
    }

    .bio-section h3 {
        font-size: 1.25rem;
        color: #333;
        margin-bottom: 1.5rem;
        position: relative;
        padding-bottom: 0.5rem;
    }

    .bio-section h3::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 50px;
        height: 3px;
        background: #0066cc;
        border-radius: 2px;
    }

    .bio-text {
        color: #555;
        font-size: 1.0625rem;
        line-height: 1.8;
    }

    .bio-text p {
        margin: 1rem 0;
        white-space: pre-wrap;
    }

    .bio-text p:first-child {
        margin-top: 0;
    }

    .bio-text p:last-child {
        margin-bottom: 0;
    }

    .social-links {
        display: flex;
        gap: 1.5rem;
        margin-top: 3rem;
        justify-content: center;
    }

    .social-links a {
        color: #666;
        transition: color 0.2s ease, transform 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #f5f5f5;
    }

    .social-links a:hover {
        color: #0066cc;
        transform: translateY(-2px);
        background: #e8f0fe;
    }

    .social-links svg {
        width: 20px;
        height: 20px;
    }

    /* Responsive design */
    @media (max-width: 768px) {
        main {
            padding: 1rem;
        }

        .hero-content {
            padding: 2rem;
        }

        h1 {
            font-size: 2rem;
        }

        h2 {
            font-size: 1.25rem;
        }

        .tagline {
            font-size: 1rem;
        }

        .bio-text {
            font-size: 1rem;
        }
    }

    /* Add subtle animation */
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .hero-content {
        animation: fadeIn 0.6s ease-out;
    }
    
    /* Footer styles */
    .update-info {
        text-align: center;
        padding: 2rem;
        color: #999;
        font-size: 0.875rem;
    }
    
    .update-info p {
        margin: 0;
    }
</style>