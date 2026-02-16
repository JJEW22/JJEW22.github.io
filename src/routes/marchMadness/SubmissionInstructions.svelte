<script>
    // Customize these for your tournament
    export let deadline = 'Wednesday, March 18th at 11:59 PM EST';
    export let contactName = 'Jack';
    export let contactMethod = 'email';
    export let year = '2026';
</script>

<div class="submission-container">
    <h2 class="submission-title">📋 How to Submit Your Bracket</h2>
    
    <div class="steps">
        <div class="step">
            <span class="step-number">1</span>
            <div class="step-content">
                <h3>Fill out your bracket</h3>
                <p>Click on teams above to pick your winners for each round, all the way through the championship game.</p>
            </div>
        </div>
        
        <div class="step">
            <span class="step-number">2</span>
            <div class="step-content">
                <h3>Download your bracket</h3>
                <p>Once you're happy with your picks, use the <strong>Save as JSON/EXCEL</strong> buttons at the top to download your bracket file. (Excel preferred)</p>
            </div>
        </div>
        
        <div class="step">
            <span class="step-number">3</span>
            <div class="step-content">
                <h3>Send it to {contactName}</h3>
                <p>Send your downloaded bracket file to {contactName} via <strong>{contactMethod}</strong>. Also this year you are incentivized to send it along with a name for your bracket</p>
            </div>
        </div>
    </div>
    
    <div class="deadline-box">
        <span class="deadline-icon">⏰</span>
        <div>
            <strong>Submission Deadline</strong>
            <p>{deadline}</p>
            <p>Any submissions that are late will lose 20 points and after the start of the first rnd of 64 game wont be accepted</p>
        </div>
    </div>
</div>

<style>
    .submission-container {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border-left: 4px solid #2563eb;
    }
    
    .submission-title {
        margin: 0 0 1.25rem 0;
        font-size: 1.5rem;
        color: #1e293b;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 0.75rem;
    }
    
    .steps {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 1.25rem;
    }
    
    .step {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
    }
    
    .step-number {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        background: #2563eb;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.95rem;
    }
    
    .step-content h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
        color: #334155;
    }
    
    .step-content p {
        margin: 0;
        color: #64748b;
        line-height: 1.5;
        font-size: 0.95rem;
    }
    
    .deadline-box {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: #fef3c7;
        border: 1px solid #fbbf24;
        border-radius: 8px;
        padding: 1rem;
    }
    
    .deadline-icon {
        font-size: 1.5rem;
    }
    
    .deadline-box strong {
        display: block;
        color: #92400e;
        font-size: 0.95rem;
    }
    
    .deadline-box p {
        margin: 0.2rem 0 0 0;
        color: #78350f;
        font-size: 0.95rem;
    }
    
    @media (max-width: 640px) {
        .submission-container {
            padding: 1rem;
        }
        
        .submission-title {
            font-size: 1.25rem;
        }
    }
</style>