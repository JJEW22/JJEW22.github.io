<script>
    import '../../app.css';
    import { onMount, onDestroy } from 'svelte';
    
    let showCalendly = false;
    
    // Replace with your actual Calendly URL
    const CALENDLY_URL = 'https://calendly.com/jwilkins-risenorthcapital/30min?hide_landing_page_details=1&hide_gdpr_banner=1';
    
    function handleCalendlyEvent(e) {
        if (e.data.event === 'calendly.event_scheduled') {
            window.location.href = '/advising/confirmed';
        }
    }
    
    onMount(() => {
        window.addEventListener('message', handleCalendlyEvent);
    });
    
    onDestroy(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('message', handleCalendlyEvent);
        }
    });
</script>

<svelte:head>
    <title>John Wilkins - Financial Advisor</title>
    <meta name="description" content="Personalized financial planning, investment management, and insurance solutions.">
    <script src="https://assets.calendly.com/assets/external/widget.js" async></script>
</svelte:head>

<div class="page">
    <nav class="nav-bar">
        <a href="/" class="nav-back">← Home</a>
    </nav>
    
    <!-- Hero -->
    <header class="hero">
        <div class="hero-content">
            <p class="hero-eyebrow">Financial Representative · Rise North Capital</p>
            <h1>John (Jack) Wilkins</h1>
            <p class="hero-tagline">Helping you build a financial plan that works for your life — not the other way around.</p>
            <div class="hero-actions">
                <a href="#schedule" class="btn btn-primary">Schedule a Consultation</a>
                <a href="#services" class="btn btn-outline">See Services</a>
            </div>
        </div>
    </header>
    
    <main>
        <!-- About -->
        <section id="about" class="section">
            <h2>About Me</h2>
            <div class="about-content">
                <p>
                    I'm a financial representative at Rise North Capital based in Braintree, MA. I work with 
                    individuals and families to develop personalized strategies for growing and protecting 
                    their wealth. Whether you're just starting to invest, planning for retirement, or 
                    looking to protect your family with the right insurance coverage, I'm here to help 
                    you make informed decisions with confidence.
                </p>
                <p>
                    I believe in straightforward, transparent advice. My approach starts with understanding 
                    your goals, your timeline, and your comfort with risk — then building a plan that 
                    reflects all three.
                </p>
                <div class="credentials">
                    <div class="credential">
                        <span class="cred-icon">📜</span>
                        <div>
                            <strong>Series 65</strong>
                            <span>Investment Adviser Representative</span>
                        </div>
                    </div>
                    <div class="credential">
                        <span class="cred-icon">📜</span>
                        <div>
                            <strong>SIE</strong>
                            <span>Securities Industry Essentials</span>
                        </div>
                    </div>
                    <div class="credential">
                        <span class="cred-icon">📜</span>
                        <div>
                            <strong>MA Life Insurance Producer</strong>
                            <span>License #1651</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        
        <!-- Services -->
        <section id="services" class="section">
            <h2>Services</h2>
            <div class="services-grid">
                <div class="service-card">
                    <div class="service-icon">📈</div>
                    <h3>Investment Management</h3>
                    <p>
                        Portfolio construction and ongoing management tailored to your goals and risk tolerance. 
                        I'll help you build a diversified strategy and adjust it as your life evolves.
                    </p>
                </div>
                <div class="service-card">
                    <div class="service-icon">🏦</div>
                    <h3>Retirement Planning</h3>
                    <p>
                        Whether retirement is 5 years away or 35, having a plan matters. I'll help you 
                        figure out how much you need, the best accounts to use, and how to get there.
                    </p>
                </div>
                <div class="service-card">
                    <div class="service-icon">🛡️</div>
                    <h3>Insurance Solutions</h3>
                    <p>
                        Life insurance, disability coverage, and other protection products to make sure 
                        your family and your assets are covered if the unexpected happens.
                    </p>
                </div>
                <div class="service-card">
                    <div class="service-icon">🎯</div>
                    <h3>Financial Planning</h3>
                    <p>
                        A comprehensive look at your full financial picture — budgeting, debt management, 
                        tax efficiency, and goal setting — all in one cohesive plan.
                    </p>
                </div>
            </div>
        </section>
        
        <!-- How it works -->
        <section class="section">
            <h2>How It Works</h2>
            <div class="steps">
                <div class="step">
                    <div class="step-num">1</div>
                    <div class="step-content">
                        <h3>Free Consultation</h3>
                        <p>We'll have an introductory conversation to understand where you are and where you want to be.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">2</div>
                    <div class="step-content">
                        <h3>Personalized Plan</h3>
                        <p>I'll put together a strategy based on your goals, timeline, and risk comfort.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">3</div>
                    <div class="step-content">
                        <h3>Ongoing Support</h3>
                        <p>We'll meet regularly to review progress, rebalance as needed, and adjust as your life changes.</p>
                    </div>
                </div>
            </div>
        </section>
        
        <!-- Schedule -->
        <section id="schedule" class="section schedule-section">
            <h2>Schedule a Consultation</h2>
            <p class="schedule-intro">
                Ready to get started? Book a free introductory call and we'll talk through your goals.
            </p>
            
            <div class="calendly-container">
                <div class="calendly-inline-widget" 
                     data-url={CALENDLY_URL}
                     style="min-width:320px;height:700px;">
                </div>
            </div>
        </section>
        
        <!-- Contact -->
        <section class="section contact-section">
            <h2>Get in Touch</h2>
            <p>Have questions before booking? Feel free to reach out directly.</p>
            <div class="contact-methods">
                <a href="mailto:jack@risenorthcapital.com" class="contact-item">
                    <span class="contact-icon">✉️</span>
                    <span>Email me</span>
                </a>
            </div>
        </section>
    </main>
    
    <footer class="page-footer">
        <p>Jack Wilkins · Financial Representative · Rise North Capital</p>
    </footer>
</div>

<style>
    .page {
        min-height: 100vh;
        background: #fafafa;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    }
    
    .nav-bar {
        max-width: 1000px;
        margin: 0 auto;
        padding: 1.5rem 2rem 0;
    }
    
    .nav-back {
        color: #6b7280;
        text-decoration: none;
        font-size: 0.9rem;
    }
    
    .nav-back:hover { color: #1a1a1a; }
    
    /* Hero */
    .hero {
        max-width: 1000px;
        margin: 0 auto;
        padding: 3rem 2rem 2rem;
    }
    
    .hero-content {
        background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%);
        border-radius: 16px;
        padding: 3.5rem;
        color: white;
    }
    
    .hero-eyebrow {
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        opacity: 0.8;
        margin: 0 0 0.75rem 0;
    }
    
    .hero h1 {
        font-size: 2.75rem;
        font-weight: 800;
        margin: 0 0 1rem 0;
        line-height: 1.1;
    }
    
    .hero-tagline {
        font-size: 1.2rem;
        opacity: 0.9;
        max-width: 550px;
        line-height: 1.6;
        margin: 0 0 2rem 0;
    }
    
    .hero-actions {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
    }
    
    /* Buttons */
    .btn {
        display: inline-block;
        padding: 0.85rem 1.75rem;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.95rem;
        text-decoration: none;
        transition: all 0.2s;
        cursor: pointer;
    }
    
    .btn-primary {
        background: #22c55e;
        color: white;
    }
    
    .btn-primary:hover {
        background: #16a34a;
        transform: translateY(-1px);
    }
    
    .btn-outline {
        background: transparent;
        color: white;
        border: 2px solid rgba(255,255,255,0.4);
    }
    
    .btn-outline:hover {
        border-color: white;
        background: rgba(255,255,255,0.1);
    }
    
    /* Main content */
    main {
        max-width: 1000px;
        margin: 0 auto;
        padding: 0 2rem;
    }
    
    .section {
        background: white;
        border-radius: 12px;
        padding: 2.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    
    .section h2 {
        font-size: 1.5rem;
        color: #1a1a1a;
        margin: 0 0 1.25rem 0;
    }
    
    /* About */
    .about-content p {
        color: #555;
        line-height: 1.8;
        font-size: 1.05rem;
        margin: 0 0 1rem 0;
    }
    
    .credentials {
        display: flex;
        gap: 1.5rem;
        margin-top: 1.5rem;
        flex-wrap: wrap;
    }
    
    .credential {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.25rem;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
    }
    
    .cred-icon { font-size: 1.25rem; }
    
    .credential strong {
        display: block;
        font-size: 0.9rem;
        color: #1a1a1a;
    }
    
    .credential span {
        font-size: 0.8rem;
        color: #6b7280;
    }
    
    /* Services */
    .services-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1.25rem;
    }
    
    .service-card {
        padding: 1.75rem;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        transition: all 0.2s;
    }
    
    .service-card:hover {
        border-color: #22c55e;
        box-shadow: 0 2px 8px rgba(34, 197, 94, 0.1);
    }
    
    .service-icon {
        font-size: 1.5rem;
        margin-bottom: 0.75rem;
    }
    
    .service-card h3 {
        font-size: 1.1rem;
        color: #1a1a1a;
        margin: 0 0 0.5rem 0;
    }
    
    .service-card p {
        font-size: 0.9rem;
        color: #6b7280;
        line-height: 1.6;
        margin: 0;
    }
    
    /* Steps */
    .steps {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    
    .step {
        display: flex;
        gap: 1.25rem;
        align-items: flex-start;
    }
    
    .step-num {
        width: 40px;
        height: 40px;
        background: #1e3a5f;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 1.1rem;
        flex-shrink: 0;
    }
    
    .step-content h3 {
        font-size: 1.05rem;
        color: #1a1a1a;
        margin: 0 0 0.25rem 0;
    }
    
    .step-content p {
        font-size: 0.95rem;
        color: #6b7280;
        margin: 0;
        line-height: 1.5;
    }
    
    /* Schedule */
    .schedule-intro {
        color: #555;
        font-size: 1.05rem;
        margin: 0 0 1.5rem 0;
    }
    
    .calendly-container {
        border-radius: 8px;
        overflow: hidden;
    }
    
    .calendly-placeholder {
        border: 2px dashed #d1d5db;
        border-radius: 12px;
        padding: 3rem;
        text-align: center;
        background: #f9fafb;
    }
    
    .placeholder-icon { font-size: 2.5rem; }
    
    .placeholder-content h3 {
        margin: 0.75rem 0 0.5rem;
        color: #1a1a1a;
    }
    
    .placeholder-content p {
        color: #6b7280;
        margin: 0 0 1.25rem;
    }
    
    /* Contact */
    .contact-section p {
        color: #555;
        margin: 0 0 1.25rem;
    }
    
    .contact-methods {
        display: flex;
        gap: 1rem;
    }
    
    .contact-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1.5rem;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        text-decoration: none;
        color: #1a1a1a;
        font-weight: 500;
        transition: all 0.2s;
    }
    
    .contact-item:hover {
        border-color: #1e3a5f;
        background: #f0f7ff;
    }
    
    .contact-icon { font-size: 1.25rem; }
    
    /* Footer */
    .page-footer {
        max-width: 1000px;
        margin: 0 auto;
        padding: 2rem;
        text-align: center;
    }
    
    .page-footer p {
        font-size: 0.85rem;
        color: #9ca3af;
    }
    
    @media (max-width: 768px) {
        .hero-content { padding: 2.5rem 1.75rem; }
        .hero h1 { font-size: 2rem; }
        .hero-tagline { font-size: 1.05rem; }
        .services-grid { grid-template-columns: 1fr; }
        .credentials { flex-direction: column; }
        .section { padding: 2rem 1.5rem; }
        main { padding: 0 1rem; }
    }
</style>