<script>
</script>

<svelte:head>
    <title>Consultation Booked - Jack Weinstein</title>
</svelte:head>

<div class="confirmation">
    <div class="card">
        <span class="icon">✅</span>
        <h1>You're All Set!</h1>
        <p>Your consultation has been booked. You'll receive a confirmation email from Calendly shortly.</p>
        <p class="sub">Looking forward to speaking with you.</p>
        <a href="/advising" class="btn">← Back to Advising</a>
    </div>
</div>

<style>
    .confirmation {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fafafa;
        padding: 2rem;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    }
    
    .card {
        background: white;
        border-radius: 12px;
        padding: 3rem;
        text-align: center;
        max-width: 500px;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    
    .icon { font-size: 3rem; }
    
    h1 {
        font-size: 1.75rem;
        color: #1a1a1a;
        margin: 1rem 0 0.75rem;
    }
    
    p {
        color: #555;
        font-size: 1.05rem;
        line-height: 1.6;
        margin: 0 0 0.5rem;
    }
    
    .sub {
        color: #9ca3af;
        font-size: 0.95rem;
        margin-bottom: 1.5rem;
    }
    
    .btn {
        display: inline-block;
        padding: 0.65rem 1.5rem;
        background: #1e3a5f;
        color: white;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 500;
        transition: all 0.2s;
    }
    
    .btn:hover {
        background: #2c5282;
        transform: translateY(-1px);
    }
</style>