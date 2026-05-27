<script>
  // ── State ──────────────────────────────────────────────────────────────────
  let activeSection = 0;

  // Personal Info
  let age = '';
  let gender = '';
  let retirementAge = 65;

  // Income & Assets
  let annualIncome = '';
  let incomeGrowthRate = 3;
  let existingLifeInsurance = '';
  let retirementSavings = '';
  let otherAssets = '';
  let outstandingDebt = '';
  let mortgage = '';

  // Dependents
  let spouseAge = '';
  let spouseIncome = '';
  let numberOfChildren = 0;
  let children = [];
  let yearsUntilCollegePerChild = [];

  // Household Services (the unique section)
  // Childcare
  let hoursChildcarePerWeek = '';
  let childcareMarketRate = 20;
  let childcareSupervisoryHours = '';

  // Domestic / Home Management
  let hoursCleaningPerWeek = '';
  let cleaningMarketRate = 25;
  let hoursLaundryPerWeek = '';
  let laundryMarketRate = 18;
  let hoursCookingPerWeek = '';
  let cookingMarketRate = 22;
  let hoursGroceryPerWeek = '';
  let groceryMarketRate = 18;

  // Property & Outdoor
  let hoursLawnCarePerWeek = '';
  let lawnCareMarketRate = 35;
  let hoursHomeRepairPerMonth = '';
  let homeRepairMarketRate = 65;
  let hoursSnowRemovalPerYear = '';
  let snowRemovalMarketRate = 45;

  // Transportation & Logistics
  let hoursChaufferingPerWeek = '';
  let chaufferingMarketRate = 18;
  let hoursErrandsPerWeek = '';
  let errandsMarketRate = 18;

  // Financial & Administrative
  let hoursFinancialMgmtPerMonth = '';
  let financialMgmtMarketRate = 75;
  let hoursTaxPreparationPerYear = '';
  let taxPrepMarketRate = 100;
  let hoursInsuranceMgmtPerYear = '';
  let insuranceMgmtMarketRate = 75;

  // Pet Care
  let hasPets = false;
  let hoursPetCarePerWeek = '';
  let petCareMarketRate = 20;

  // Elder Care
  let providesElderCare = false;
  let hoursElderCarePerWeek = '';
  let elderCareMarketRate = 28;

  // Final Expenses
  let funeralExpenses = 15000;
  let estateSettlementCosts = '';
  let educationFundPerChild = '';

  // Results placeholder
  let showResults = false;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const sections = [
    { id: 0, label: 'Personal',    icon: '👤' },
    { id: 1, label: 'Income',      icon: '💼' },
    { id: 2, label: 'Dependents',  icon: '👨‍👩‍👧' },
    { id: 3, label: 'Home Labor',  icon: '🏠' },
    { id: 4, label: 'Final Costs', icon: '📋' },
    { id: 5, label: 'Results',     icon: '📊' },
  ];

  function next() { if (activeSection < sections.length - 1) activeSection++; }
  function prev() { if (activeSection > 0) activeSection--; }
  function goTo(i) { activeSection = i; }

  $: if (numberOfChildren !== children.length) {
    const n = parseInt(numberOfChildren) || 0;
    children = Array.from({ length: n }, (_, i) => children[i] ?? { name: '', age: '' });
  }

  function formatCurrency(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 });
  }
</script>

<!-- ─────────────────────────────────────────────────────────────────────────
     Styles
───────────────────────────────────────────────────────────────────────────── -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

  :root {
    --ink:        #1a1f2e;
    --ink-soft:   #4a5168;
    --ink-muted:  #8891a8;
    --bg:         #f5f4f0;
    --surface:    #ffffff;
    --border:     #e2e0d8;
    --green:      #1a6b4a;
    --green-soft: #d4ede3;
    --amber:      #b8691a;
    --amber-soft: #faecd4;
    --red-soft:   #fde8e8;
    --shadow-sm:  0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.05);
    --shadow-md:  0 4px 16px rgba(0,0,0,.09), 0 2px 6px rgba(0,0,0,.06);
    --r:          10px;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .calc-root {
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    color: var(--ink);
    background: var(--bg);
    min-height: 100vh;
    padding: 2rem 1rem 4rem;
  }

  /* ── Header ── */
  .calc-header {
    max-width: 760px;
    margin: 0 auto 2rem;
  }
  .calc-header h1 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    line-height: 1.15;
    color: var(--ink);
  }
  .calc-header h1 em {
    font-style: italic;
    color: var(--green);
  }
  .calc-header p {
    margin-top: .6rem;
    color: var(--ink-soft);
    max-width: 540px;
    line-height: 1.6;
  }

  /* ── Progress nav ── */
  .step-nav {
    display: flex;
    gap: .4rem;
    flex-wrap: wrap;
    max-width: 760px;
    margin: 0 auto 1.6rem;
  }
  .step-btn {
    display: flex;
    align-items: center;
    gap: .35rem;
    padding: .45rem .85rem;
    border-radius: 50px;
    border: 1.5px solid var(--border);
    background: var(--surface);
    font-family: 'DM Sans', sans-serif;
    font-size: .82rem;
    font-weight: 500;
    color: var(--ink-muted);
    cursor: pointer;
    transition: all .18s;
  }
  .step-btn:hover  { border-color: var(--green); color: var(--green); }
  .step-btn.active { background: var(--green); border-color: var(--green); color: #fff; }
  .step-btn .icon  { font-size: 1rem; }

  /* ── Card ── */
  .card {
    max-width: 760px;
    margin: 0 auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r);
    box-shadow: var(--shadow-md);
    overflow: hidden;
  }
  .card-head {
    padding: 1.6rem 2rem 1.2rem;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(135deg, #f9f8f5 0%, #ffffff 100%);
  }
  .card-head h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.4rem;
    color: var(--ink);
  }
  .card-head p {
    margin-top: .3rem;
    font-size: .88rem;
    color: var(--ink-muted);
  }
  .card-body { padding: 1.8rem 2rem; }

  /* ── Field groups ── */
  .field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.2rem 1.6rem;
  }
  .field-grid.three { grid-template-columns: 1fr 1fr 1fr; }
  .field-grid.full  { grid-template-columns: 1fr; }
  @media (max-width: 560px) {
    .field-grid, .field-grid.three { grid-template-columns: 1fr; }
    .card-body { padding: 1.2rem 1rem; }
  }

  .field { display: flex; flex-direction: column; gap: .35rem; }
  .field label {
    font-size: .82rem;
    font-weight: 600;
    color: var(--ink-soft);
    letter-spacing: .01em;
    text-transform: uppercase;
  }
  .field input, .field select {
    padding: .6rem .8rem;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    font-family: 'DM Sans', sans-serif;
    font-size: .95rem;
    color: var(--ink);
    background: #fafaf8;
    transition: border-color .15s, box-shadow .15s;
    outline: none;
  }
  .field input:focus, .field select:focus {
    border-color: var(--green);
    box-shadow: 0 0 0 3px rgba(26,107,74,.12);
    background: #fff;
  }
  .field .hint {
    font-size: .78rem;
    color: var(--ink-muted);
    line-height: 1.4;
  }
  .field.span2 { grid-column: span 2; }
  @media (max-width: 560px) { .field.span2 { grid-column: span 1; } }

  /* ── Sub-sections ── */
  .sub-section {
    margin-top: 1.8rem;
    padding-top: 1.4rem;
    border-top: 1px solid var(--border);
  }
  .sub-section:first-child { margin-top: 0; padding-top: 0; border-top: none; }
  .sub-label {
    font-size: .78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--green);
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: .4rem;
  }
  .sub-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--green-soft);
  }

  /* ── Toggle ── */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .7rem 1rem;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    background: #fafaf8;
    margin-bottom: .8rem;
  }
  .toggle-row span { font-size: .9rem; color: var(--ink-soft); font-weight: 500; }
  .toggle {
    position: relative;
    width: 42px;
    height: 24px;
    cursor: pointer;
  }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-track {
    position: absolute;
    inset: 0;
    background: var(--border);
    border-radius: 50px;
    transition: background .2s;
  }
  .toggle input:checked ~ .toggle-track { background: var(--green); }
  .toggle-thumb {
    position: absolute;
    top: 3px; left: 3px;
    width: 18px; height: 18px;
    background: #fff;
    border-radius: 50%;
    transition: transform .2s;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
  }
  .toggle input:checked ~ .toggle-thumb { transform: translateX(18px); }

  /* ── Rate note ── */
  .rate-note {
    grid-column: span 2;
    font-size: .8rem;
    color: var(--ink-muted);
    background: var(--amber-soft);
    border: 1px solid #e8c98a;
    border-radius: 6px;
    padding: .6rem .9rem;
    line-height: 1.5;
  }
  @media (max-width: 560px) { .rate-note { grid-column: span 1; } }

  /* ── Children rows ── */
  .child-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: .8rem;
    padding: .9rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: .6rem;
  }
  .child-row-label {
    grid-column: span 2;
    font-size: .78rem;
    font-weight: 700;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: .05em;
  }

  /* ── Results ── */
  .results-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.4rem;
  }
  .result-card {
    padding: 1.1rem 1.2rem;
    border-radius: 8px;
    border: 1.5px solid var(--border);
  }
  .result-card.highlight {
    background: var(--green);
    border-color: var(--green);
    color: #fff;
  }
  .result-card .rc-label {
    font-size: .78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .05em;
    opacity: .7;
  }
  .result-card .rc-value {
    font-family: 'DM Serif Display', serif;
    font-size: 1.7rem;
    margin-top: .2rem;
  }
  .result-card .rc-note {
    font-size: .78rem;
    margin-top: .3rem;
    opacity: .65;
  }
  .result-breakdown {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .rb-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: .7rem 1rem;
    border-bottom: 1px solid var(--border);
    font-size: .9rem;
  }
  .rb-row:last-child { border-bottom: none; }
  .rb-row:nth-child(even) { background: #fafaf8; }
  .rb-row .rb-label { color: var(--ink-soft); }
  .rb-row .rb-val   { font-weight: 600; color: var(--ink); }
  .rb-row.total     { background: var(--green-soft); }
  .rb-row.total .rb-label { font-weight: 700; color: var(--green); }
  .rb-row.total .rb-val   { font-size: 1.05rem; color: var(--green); }

  .disclaimer {
    margin-top: 1.4rem;
    padding: 1rem 1.2rem;
    background: #fafaf8;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: .8rem;
    color: var(--ink-muted);
    line-height: 1.6;
  }

  /* ── Navigation buttons ── */
  .card-footer {
    padding: 1.2rem 2rem;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    background: #fafaf8;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    padding: .65rem 1.4rem;
    border-radius: 8px;
    font-family: 'DM Sans', sans-serif;
    font-size: .9rem;
    font-weight: 600;
    cursor: pointer;
    border: 1.5px solid transparent;
    transition: all .18s;
  }
  .btn-ghost {
    background: transparent;
    border-color: var(--border);
    color: var(--ink-soft);
  }
  .btn-ghost:hover { border-color: var(--ink-soft); color: var(--ink); }
  .btn-primary {
    background: var(--green);
    color: #fff;
  }
  .btn-primary:hover { background: #155a3d; }
  .btn:disabled { opacity: .4; cursor: not-allowed; }
</style>

<!-- ─────────────────────────────────────────────────────────────────────────
     Markup
───────────────────────────────────────────────────────────────────────────── -->
<div class="calc-root">

  <header class="calc-header">
    <h1>Your <em>True Value</em> to the Home</h1>
    <p>
      A life insurance needs calculator that goes beyond income — accounting for every
      role you fill and every service you provide to your household each day.
    </p>
  </header>

  <!-- Step nav -->
  <nav class="step-nav">
    {#each sections as s}
      <button class="step-btn {activeSection === s.id ? 'active' : ''}" on:click={() => goTo(s.id)}>
        <span class="icon">{s.icon}</span> {s.label}
      </button>
    {/each}
  </nav>

  <div class="card">

    <!-- ── SECTION 0: Personal Info ──────────────────────────────────────── -->
    {#if activeSection === 0}
      <div class="card-head">
        <h2>Personal Information</h2>
        <p>Basic details used to calculate your income replacement horizon.</p>
      </div>
      <div class="card-body">
        <div class="field-grid">
          <div class="field">
            <label>Your Age</label>
            <input type="number" bind:value={age} placeholder="e.g. 35" min="18" max="80" />
          </div>
          <div class="field">
            <label>Gender</label>
            <select bind:value={gender}>
              <option value="">Select…</option>
              <option>Male</option>
              <option>Female</option>
              <option>Prefer not to say</option>
            </select>
            <span class="hint">Used for actuarial life expectancy estimates.</span>
          </div>
          <div class="field">
            <label>Target Retirement Age</label>
            <input type="number" bind:value={retirementAge} min="50" max="75" />
          </div>
          <div class="field">
            <label>Health Status</label>
            <select>
              <option value="">Select…</option>
              <option>Excellent</option>
              <option>Good</option>
              <option>Average</option>
              <option>Below Average</option>
            </select>
          </div>
          <div class="field span2">
            <label>Do you currently have any life insurance policies?</label>
            <select>
              <option value="">Select…</option>
              <option>No existing coverage</option>
              <option>Yes — through employer only</option>
              <option>Yes — individual policy</option>
              <option>Yes — both employer and individual</option>
            </select>
          </div>
        </div>
      </div>

    <!-- ── SECTION 1: Income & Assets ───────────────────────────────────── -->
    {:else if activeSection === 1}
      <div class="card-head">
        <h2>Income &amp; Financial Assets</h2>
        <p>Your earning potential and existing financial resources.</p>
      </div>
      <div class="card-body">

        <div class="sub-section">
          <div class="sub-label">📥 Income</div>
          <div class="field-grid">
            <div class="field">
              <label>Your Annual Gross Income</label>
              <input type="number" bind:value={annualIncome} placeholder="$0" />
            </div>
            <div class="field">
              <label>Expected Annual Income Growth (%)</label>
              <input type="number" bind:value={incomeGrowthRate} step="0.5" min="0" max="15" />
            </div>
            <div class="field">
              <label>Spouse / Partner Annual Income</label>
              <input type="number" bind:value={spouseIncome} placeholder="$0" />
            </div>
            <div class="field">
              <label>Years to Retirement</label>
              <input type="number" value={retirementAge - (parseInt(age) || 0)} readonly />
              <span class="hint">Calculated from your age and retirement age above.</span>
            </div>
          </div>
        </div>

        <div class="sub-section">
          <div class="sub-label">🏦 Assets &amp; Debts</div>
          <div class="field-grid">
            <div class="field">
              <label>Existing Life Insurance Coverage</label>
              <input type="number" bind:value={existingLifeInsurance} placeholder="$0" />
              <span class="hint">Total death benefit across all policies.</span>
            </div>
            <div class="field">
              <label>Retirement Savings (401k, IRA, etc.)</label>
              <input type="number" bind:value={retirementSavings} placeholder="$0" />
            </div>
            <div class="field">
              <label>Other Savings &amp; Investments</label>
              <input type="number" bind:value={otherAssets} placeholder="$0" />
            </div>
            <div class="field">
              <label>Remaining Mortgage Balance</label>
              <input type="number" bind:value={mortgage} placeholder="$0" />
            </div>
            <div class="field">
              <label>Other Outstanding Debt</label>
              <input type="number" bind:value={outstandingDebt} placeholder="$0" />
              <span class="hint">Auto loans, student loans, credit cards, etc.</span>
            </div>
            <div class="field">
              <label>Spouse's Annual Spending Needs</label>
              <input type="number" placeholder="$0" />
              <span class="hint">Estimated annual living expenses if you were gone.</span>
            </div>
          </div>
        </div>

      </div>

    <!-- ── SECTION 2: Dependents ─────────────────────────────────────────── -->
    {:else if activeSection === 2}
      <div class="card-head">
        <h2>Dependents</h2>
        <p>Information about your spouse and children affects how long coverage is needed.</p>
      </div>
      <div class="card-body">

        <div class="sub-section">
          <div class="sub-label">💍 Spouse / Partner</div>
          <div class="field-grid">
            <div class="field">
              <label>Spouse's Age</label>
              <input type="number" bind:value={spouseAge} placeholder="e.g. 33" />
            </div>
            <div class="field">
              <label>Spouse's Employment Status</label>
              <select>
                <option value="">Select…</option>
                <option>Full-time employed</option>
                <option>Part-time employed</option>
                <option>Self-employed</option>
                <option>Stay-at-home</option>
                <option>Retired</option>
              </select>
            </div>
            <div class="field span2">
              <label>Would your spouse need to re-enter the workforce or increase hours?</label>
              <select>
                <option value="">Select…</option>
                <option>No — already working full time</option>
                <option>Yes — currently part-time or stay-at-home</option>
                <option>Uncertain</option>
              </select>
            </div>
          </div>
        </div>

        <div class="sub-section">
          <div class="sub-label">👧 Children</div>
          <div class="field-grid">
            <div class="field">
              <label>Number of Children</label>
              <input type="number" bind:value={numberOfChildren} min="0" max="10" />
            </div>
            <div class="field">
              <label>Plan to Fund College Education?</label>
              <select>
                <option value="">Select…</option>
                <option>Yes — full funding</option>
                <option>Yes — partial funding</option>
                <option>No</option>
                <option>Unsure</option>
              </select>
            </div>
          </div>

          {#each children as child, i}
            <div class="child-row" style="margin-top: .8rem">
              <span class="child-row-label">Child {i + 1}</span>
              <div class="field">
                <label>Name (optional)</label>
                <input type="text" bind:value={child.name} placeholder="e.g. Emma" />
              </div>
              <div class="field">
                <label>Age</label>
                <input type="number" bind:value={child.age} min="0" max="25" placeholder="0" />
              </div>
            </div>
          {/each}

        </div>

        <div class="sub-section">
          <div class="sub-label">👴 Other Dependents</div>
          <div class="field-grid">
            <div class="field span2">
              <label>Do you financially support other dependents?</label>
              <select>
                <option value="">Select…</option>
                <option>No</option>
                <option>Yes — aging parents</option>
                <option>Yes — disabled family member</option>
                <option>Yes — other relatives</option>
                <option>Multiple of the above</option>
              </select>
            </div>
            <div class="field">
              <label>Annual Support Amount</label>
              <input type="number" placeholder="$0" />
            </div>
            <div class="field">
              <label>Expected Years of Support</label>
              <input type="number" placeholder="e.g. 10" />
            </div>
          </div>
        </div>

      </div>

    <!-- ── SECTION 3: Household Services ────────────────────────────────── -->
    {:else if activeSection === 3}
      <div class="card-head">
        <h2>Household Services &amp; Labor</h2>
        <p>
          If you were gone, your family would need to pay someone for everything you currently do.
          Enter your approximate weekly hours for each role — we'll calculate its market replacement cost.
        </p>
      </div>
      <div class="card-body">

        <!-- Childcare -->
        {#if parseInt(numberOfChildren) > 0}
        <div class="sub-section">
          <div class="sub-label">👶 Childcare &amp; Parenting</div>
          <div class="field-grid">
            <div class="field">
              <label>Direct Childcare Hours / Week</label>
              <input type="number" bind:value={hoursChildcarePerWeek} placeholder="e.g. 20" min="0" />
              <span class="hint">Bathing, dressing, feeding, homework help, bedtime.</span>
            </div>
            <div class="field">
              <label>Market Rate ($/hr)</label>
              <input type="number" bind:value={childcareMarketRate} step="0.5" />
              <span class="hint">Avg. nanny / daycare rate in your area.</span>
            </div>
            <div class="field">
              <label>Supervisory / Oversight Hours / Week</label>
              <input type="number" bind:value={childcareSupervisoryHours} placeholder="e.g. 15" min="0" />
              <span class="hint">Presence at home while kids are awake but not actively engaged.</span>
            </div>
            <div class="field">
              <label>Transportation to Activities (hrs/wk)</label>
              <input type="number" bind:value={hoursChaufferingPerWeek} placeholder="e.g. 5" min="0" />
            </div>
            <div class="rate-note">
              💡 According to the U.S. Department of Labor, full-time childcare for one child can cost
              $10,000–$30,000 per year depending on location and care type.
            </div>
          </div>
        </div>
        {/if}

        <!-- Domestic -->
        <div class="sub-section">
          <div class="sub-label">🧹 Domestic &amp; Household Management</div>
          <div class="field-grid">
            <div class="field">
              <label>Cleaning Hours / Week</label>
              <input type="number" bind:value={hoursCleaningPerWeek} placeholder="e.g. 3" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={cleaningMarketRate} step="0.5" />
            </div>
            <div class="field">
              <label>Cooking &amp; Meal Prep Hours / Week</label>
              <input type="number" bind:value={hoursCookingPerWeek} placeholder="e.g. 6" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={cookingMarketRate} step="0.5" />
            </div>
            <div class="field">
              <label>Laundry &amp; Ironing Hours / Week</label>
              <input type="number" bind:value={hoursLaundryPerWeek} placeholder="e.g. 2" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={laundryMarketRate} step="0.5" />
            </div>
            <div class="field">
              <label>Grocery Shopping Hours / Week</label>
              <input type="number" bind:value={hoursGroceryPerWeek} placeholder="e.g. 2" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={groceryMarketRate} step="0.5" />
            </div>
          </div>
        </div>

        <!-- Property -->
        <div class="sub-section">
          <div class="sub-label">🌿 Property &amp; Outdoor Maintenance</div>
          <div class="field-grid">
            <div class="field">
              <label>Lawn Care Hours / Week (seasonal)</label>
              <input type="number" bind:value={hoursLawnCarePerWeek} placeholder="e.g. 2" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={lawnCareMarketRate} step="0.5" />
            </div>
            <div class="field">
              <label>Home Repair / DIY Hours / Month</label>
              <input type="number" bind:value={hoursHomeRepairPerMonth} placeholder="e.g. 4" min="0" />
              <span class="hint">Plumbing fixes, painting, general handyman tasks.</span>
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={homeRepairMarketRate} step="0.5" />
            </div>
            <div class="field">
              <label>Snow Removal Hours / Year</label>
              <input type="number" bind:value={hoursSnowRemovalPerYear} placeholder="e.g. 20" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={snowRemovalMarketRate} step="0.5" />
            </div>
          </div>
        </div>

        <!-- Admin / Finance -->
        <div class="sub-section">
          <div class="sub-label">📂 Financial &amp; Administrative Management</div>
          <div class="field-grid">
            <div class="field">
              <label>Bill Pay &amp; Budgeting Hours / Month</label>
              <input type="number" bind:value={hoursFinancialMgmtPerMonth} placeholder="e.g. 3" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={financialMgmtMarketRate} step="0.5" />
            </div>
            <div class="field">
              <label>Tax Preparation Hours / Year</label>
              <input type="number" bind:value={hoursTaxPreparationPerYear} placeholder="e.g. 5" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={taxPrepMarketRate} step="0.5" />
            </div>
            <div class="field">
              <label>Insurance &amp; Benefits Management (hrs/yr)</label>
              <input type="number" bind:value={hoursInsuranceMgmtPerYear} placeholder="e.g. 4" min="0" />
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={insuranceMgmtMarketRate} step="0.5" />
            </div>
          </div>
        </div>

        <!-- Errands -->
        <div class="sub-section">
          <div class="sub-label">🚗 Errands &amp; Logistics</div>
          <div class="field-grid">
            <div class="field">
              <label>General Errands Hours / Week</label>
              <input type="number" bind:value={hoursErrandsPerWeek} placeholder="e.g. 2" min="0" />
              <span class="hint">Post office, pharmacy, dry cleaning, etc.</span>
            </div>
            <div class="field">
              <label>Rate ($/hr)</label>
              <input type="number" bind:value={errandsMarketRate} step="0.5" />
            </div>
          </div>
        </div>

        <!-- Pet Care -->
        <div class="sub-section">
          <div class="toggle-row">
            <span>🐾 Do you have pets requiring regular care?</span>
            <label class="toggle">
              <input type="checkbox" bind:checked={hasPets} />
              <div class="toggle-track"></div>
              <div class="toggle-thumb"></div>
            </label>
          </div>
          {#if hasPets}
            <div class="field-grid">
              <div class="field">
                <label>Pet Care Hours / Week</label>
                <input type="number" bind:value={hoursPetCarePerWeek} placeholder="e.g. 5" min="0" />
                <span class="hint">Walking, feeding, vet trips, grooming.</span>
              </div>
              <div class="field">
                <label>Rate ($/hr)</label>
                <input type="number" bind:value={petCareMarketRate} step="0.5" />
              </div>
            </div>
          {/if}
        </div>

        <!-- Elder Care -->
        <div class="sub-section">
          <div class="toggle-row">
            <span>🧓 Do you provide care for an aging parent or relative?</span>
            <label class="toggle">
              <input type="checkbox" bind:checked={providesElderCare} />
              <div class="toggle-track"></div>
              <div class="toggle-thumb"></div>
            </label>
          </div>
          {#if providesElderCare}
            <div class="field-grid">
              <div class="field">
                <label>Elder Care Hours / Week</label>
                <input type="number" bind:value={hoursElderCarePerWeek} placeholder="e.g. 10" min="0" />
              </div>
              <div class="field">
                <label>Rate ($/hr)</label>
                <input type="number" bind:value={elderCareMarketRate} step="0.5" />
                <span class="hint">Home health aide market rate.</span>
              </div>
            </div>
          {/if}
        </div>

      </div>

    <!-- ── SECTION 4: Final Expenses & One-Time Costs ─────────────────────── -->
    {:else if activeSection === 4}
      <div class="card-head">
        <h2>Final Expenses &amp; One-Time Costs</h2>
        <p>Immediate costs your family would face and education goals for your children.</p>
      </div>
      <div class="card-body">

        <div class="sub-section">
          <div class="sub-label">⚰️ End-of-Life Expenses</div>
          <div class="field-grid">
            <div class="field">
              <label>Estimated Funeral &amp; Burial Costs</label>
              <input type="number" bind:value={funeralExpenses} />
              <span class="hint">National average is approximately $7,000–$15,000.</span>
            </div>
            <div class="field">
              <label>Estate Settlement / Legal Costs</label>
              <input type="number" bind:value={estateSettlementCosts} placeholder="e.g. 5000" />
              <span class="hint">Attorney fees, probate, executor costs.</span>
            </div>
            <div class="field">
              <label>Outstanding Medical Bills</label>
              <input type="number" placeholder="$0" />
            </div>
            <div class="field">
              <label>Emergency Fund Cushion</label>
              <input type="number" placeholder="e.g. 20000" />
              <span class="hint">Additional buffer for unexpected transitional costs.</span>
            </div>
          </div>
        </div>

        <div class="sub-section">
          <div class="sub-label">🎓 Education Funding</div>
          <div class="field-grid">
            <div class="field">
              <label>Desired College Fund Per Child</label>
              <input type="number" bind:value={educationFundPerChild} placeholder="e.g. 100000" />
              <span class="hint">Average 4-year public university cost is ~$100k total today.</span>
            </div>
            <div class="field">
              <label>Current 529 / Education Savings</label>
              <input type="number" placeholder="$0" />
              <span class="hint">Total across all children's accounts.</span>
            </div>
          </div>
        </div>

        <div class="sub-section">
          <div class="sub-label">🏠 Housing Transition</div>
          <div class="field-grid">
            <div class="field">
              <label>Would the family need to move or downsize?</label>
              <select>
                <option value="">Select…</option>
                <option>No — spouse can maintain current home</option>
                <option>Possibly — depends on income situation</option>
                <option>Yes — would need to downsize</option>
                <option>Yes — would need to relocate</option>
              </select>
            </div>
            <div class="field">
              <label>Estimated Moving / Transition Costs</label>
              <input type="number" placeholder="$0" />
            </div>
          </div>
        </div>

        <div class="sub-section">
          <div class="sub-label">🩺 Benefits Replacement</div>
          <div class="field-grid">
            <div class="field">
              <label>Annual Value of Employer Health Insurance</label>
              <input type="number" placeholder="e.g. 8000" />
              <span class="hint">What spouse would need to pay out-of-pocket or through COBRA.</span>
            </div>
            <div class="field">
              <label>Other Benefits to Replace (annual)</label>
              <input type="number" placeholder="e.g. 2000" />
              <span class="hint">Dental, vision, disability, FSA, etc.</span>
            </div>
          </div>
        </div>

      </div>

    <!-- ── SECTION 5: Results ─────────────────────────────────────────────── -->
    {:else if activeSection === 5}
      <div class="card-head">
        <h2>Your Estimated Coverage Needs</h2>
        <p>A summary of your total household value and recommended life insurance coverage.</p>
      </div>
      <div class="card-body">

        <div class="results-grid">
          <div class="result-card highlight">
            <div class="rc-label">Recommended Coverage</div>
            <div class="rc-value">—</div>
            <div class="rc-note">Calculated once all fields are complete</div>
          </div>
          <div class="result-card">
            <div class="rc-label">Coverage Gap</div>
            <div class="rc-value">—</div>
            <div class="rc-note">Recommended minus existing coverage</div>
          </div>
          <div class="result-card">
            <div class="rc-label">Income Replacement Value</div>
            <div class="rc-value">—</div>
            <div class="rc-note">Future earnings, discounted to present</div>
          </div>
          <div class="result-card">
            <div class="rc-label">Household Labor Value</div>
            <div class="rc-value">—</div>
            <div class="rc-note">Annual market cost × coverage years</div>
          </div>
        </div>

        <div class="result-breakdown">
          <div class="rb-row">
            <span class="rb-label">Income Replacement (present value)</span>
            <span class="rb-val">—</span>
          </div>
          <div class="rb-row">
            <span class="rb-label">Household Services Replacement</span>
            <span class="rb-val">—</span>
          </div>
          <div class="rb-row">
            <span class="rb-label">Childcare &amp; Parenting Labor</span>
            <span class="rb-val">—</span>
          </div>
          <div class="rb-row">
            <span class="rb-label">Mortgage &amp; Debt Payoff</span>
            <span class="rb-val">—</span>
          </div>
          <div class="rb-row">
            <span class="rb-label">Education Funding (all children)</span>
            <span class="rb-val">—</span>
          </div>
          <div class="rb-row">
            <span class="rb-label">Final Expenses &amp; One-Time Costs</span>
            <span class="rb-val">—</span>
          </div>
          <div class="rb-row">
            <span class="rb-label">Benefits Replacement</span>
            <span class="rb-val">—</span>
          </div>
          <div class="rb-row">
            <span class="rb-label" style="color:var(--amber)">Less: Existing Coverage &amp; Assets</span>
            <span class="rb-val" style="color:var(--amber)">— (−)</span>
          </div>
          <div class="rb-row total">
            <span class="rb-label">Total Recommended Coverage</span>
            <span class="rb-val">—</span>
          </div>
        </div>

        <div class="disclaimer">
          <strong>Disclaimer:</strong> This calculator provides an educational estimate only and does not
          constitute financial or insurance advice. Results are based on inputs you provide and
          simplified actuarial assumptions. Please consult a licensed insurance professional or
          financial advisor before purchasing a policy.
        </div>

      </div>
    {/if}

    <!-- ── Footer nav ── -->
    <div class="card-footer">
      <button class="btn btn-ghost" on:click={prev} disabled={activeSection === 0}>
        ← Back
      </button>
      <button class="btn btn-primary" on:click={next} disabled={activeSection === sections.length - 1}>
        {activeSection === sections.length - 2 ? 'See Results →' : 'Continue →'}
      </button>
    </div>

  </div>
</div>