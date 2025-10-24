<script>
    import { onMount } from 'svelte';
    import * as XLSX from 'xlsx';
    import Collapsible from '$lib/Collapsible.svelte';
    
    // Configuration
    const config = {
        fileName: 'jpFlicksDoubles.xlsx', // Your Excel file name
        sheetsToLoad: [0, 1], // Which sheets to load (by index or names)
        // sheetsToLoad: ['Sheet1', 'Sheet2'], // Or use sheet names
    };
    
    // Data storage
    let loading = true;
    let error = null;
    let excelData = {}; // Will store all sheet data
    let dataReady = false;
    let teams = []; // will store the name of all teams

    onMount(() => {
        // Add smooth scrolling to all anchor links
        
    });
    
    // Function to scroll to top
    function scrollToTop() {
        window.scrollTo({ 
            top: 0, 
            behavior: 'smooth' 
        });
    }
    
    onMount(async () => {
        await loadExcelData();
        // Add smooth scrolling to all anchor links
        const links = document.querySelectorAll('a[href^="#"]');
        
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                if (!targetId) return;
                
                const targetElement = document.querySelector(targetId);
                
                if (targetElement) {
                    // You can adjust the offset here (e.g., for fixed headers)
                    const offset = 80; // Adjust based on your header height
                    const elementPosition = targetElement.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - offset;
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Update URL without jumping
                    history.pushState(null, null, targetId);
                }
            });
        });
        
        // Handle scroll events
        const handleScroll = () => {
            // Update scroll progress
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            scrollProgress = (winScroll / height) * 100;
            
            // Show/hide back to top button
            showBackToTop = winScroll > 300;
        };
        
        window.addEventListener('scroll', handleScroll);
        
        // Handle direct navigation to hash
        if (window.location.hash) {
            setTimeout(() => {
                const target = document.querySelector(window.location.hash);
                if (target) {
                    const offset = 80;
                    const elementPosition = target.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - offset;
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }

        const tableWrappers = document.querySelectorAll('.table-wrapper');
        
        tableWrappers.forEach(wrapper => {
            const table = wrapper.querySelector('table');
            
            // Check if table is wider than wrapper
            if (table.scrollWidth > wrapper.clientWidth) {
                wrapper.setAttribute('data-scrollable', '');
                
                // Remove indicator after first scroll
                wrapper.addEventListener('scroll', function() {
                    this.classList.add('has-scrolled');
                }, { once: true });
            }
        });
        
        // Cleanup
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    });

    async function loadExcelData() {
        loading = true;
        error = null;
        
        try {
            // Fetch the Excel file
            const response = await fetch(`/${config.fileName}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load ${config.fileName}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            
            // Parse the Excel file
            const workbook = XLSX.read(arrayBuffer, {
                type: 'array',
                cellDates: true,
                cellNF: false,
                cellText: false
            });
            
            // Load specified sheets
            const sheetsToLoad = config.sheetsToLoad.map(sheet => {
                if (typeof sheet === 'number') {
                    return workbook.SheetNames[sheet];
                }
                return sheet;
            }).filter(name => name && workbook.SheetNames.includes(name));
            
            // Extract data from each sheet
            sheetsToLoad.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                
                // Convert to JSON (array of objects with column headers as keys)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    defval: '', // Default value for empty cells
                    blankrows: false // Skip blank rows
                });
                
                // Also get raw array data if needed
                const arrayData = XLSX.utils.sheet_to_json(worksheet, {
                    header: 1, // Get as array of arrays
                    defval: '',
                    blankrows: false
                });
                
                // Store both formats
                excelData[sheetName] = {
                    json: jsonData, // Array of objects [{col1: val1, col2: val2}, ...]
                    array: arrayData, // Array of arrays [[val1, val2], ...]
                    headers: arrayData[0] || [], // First row as headers
                    rows: arrayData.slice(1), // Data rows only
                };
            });
            teams = getTeams("Sheet1")
            dataReady = true;
            
            // Log the loaded data for debugging
            console.log('Excel data loaded:', excelData);
            
        } catch (err) {
            error = err.message;
            console.error('Error loading Excel file:', err);
        } finally {
            loading = false;
        }
    }
    
    // Helper functions to access data
    function getSheetData(sheetName, format = 'json') {
        if (!excelData[sheetName]) return null;
        return excelData[sheetName][format];
    }
    
    function getColumnData(sheetName, columnIndex) {
        const sheet = excelData[sheetName];
        if (!sheet) return [];
        
        return sheet.rows.map(row => row[columnIndex] || '');
    }
    
    function getRowData(sheetName, rowIndex) {
        const sheet = excelData[sheetName];
        if (!sheet) return [];
        
        return sheet.rows[rowIndex] || [];
    }

    function getTeams(sheetName) {
        const sheet = excelData[sheetName];
        const tempTeams = [...sheet.headers]
        tempTeams.shift()
        return tempTeams;
    }
    
    // Example: Create custom table from loaded data
    function createCustomTable() {
        if (!dataReady) return [];
        
        // Example: Combine data from two sheets
        const sheet1Data = getSheetData('Sheet1', 'json');
        const sheet2Data = getSheetData('Sheet2', 'json');
        
        // Your custom logic here
        // This is just an example that combines data
        return sheet1Data?.map((row, index) => ({
            ...row,
            // Add data from sheet 2 if exists
            ...(sheet2Data?.[index] || {})
        })) || [];
    }
    
    // Example: Get specific columns from different sheets
    function getCombinedColumns() {
        if (!dataReady) return [];
        
        const sheet1Col0 = getColumnData('Sheet1', 0); // First column of Sheet1
        const sheet2Col2 = getColumnData('Sheet2', 2); // Third column of Sheet2
        
        // Combine into a new structure
        return sheet1Col0.map((val, index) => ({
            sheet1Value: val,
            sheet2Value: sheet2Col2[index] || 'N/A'
        }));
    }

</script>

<svelte:head>
    <title>JP Flicks</title>
    <meta name="description" content="Crokinole better than ever">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>JP Flicks - Season 2: The Crok Wars</h1>
        <p>
            Boston's premier Crokinole league <b>JP Flicks is back for a season 2</b>! We will meet <b>Thursday's at 7pm</b> and run till about 10pm.
            This seasons league is planned to go from late October to end of March and will <b>feature 2 tournaments</b> that will have their own prizes.
            Because of the longer format we only request that you believe you could make it to half the sessions and request to join no later than the 3rd session.
            <b>Check League Format for a full breakdown</b> of session dates and tournament dates. 
        </p>
        <Collapsible 
        id="league-format"
        title="League Format"
        variant="minimal"
        titleSize="1.75rem"
        titleWeight="300"
        titleColor="#1a202c"
        iconType="arrow"
        >
        <p>
            This seasons league will follow a similar format to the first with some changes. 
        </p>
            <div class="subsection">
            <h3>Similarities</h3>
            <ul>
                <li>Each person can sign up for up to 2 teams</li>
                <li>Each team will play each other up to 2 times (with the exception of you will never play yourself).</li>
                <li>Each game awards <a href="#point-per-game">points</a> based on outcome</li>
                <li>The winner of the league the team at the end with the most points!</li>
            </ul>
            <h3>Differences</h3>
            <ul>
                <li>More crokinole (8 more sessions to be exact)! Meaning more time to play, with a lower requirement to be there each week</li>
                <li>2 new <a href="#tournaments-section">Tournaments</a> that also award points</li>
                <li>Prizes for winning the league and each of the tournaments</li>
                <li>No longer an individual category</li>

            </ul>
            <h3>Schedule</h3>
            </div>

            <div class="table-wrapper">
                <table class="basic-table">
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Session 0</td>
                        <td>October 23rd</td>
                    </tr>
                    <tr>
                        <td>First Day of League</td>
                        <td>October 30th</td>
                    </tr>
                    <tr>
                        <td>Off for Thanksgiving</td>
                        <td>November 27th</td>
                    </tr>
                    <tr>
                        <td><b>Winter Tournament</b></td>
                        <td>December 11th</td>
                    </tr>
                    <tr>
                        <td>Beginning of holiday</td>
                        <td>December 17th</td>
                    </tr>
                    <tr>
                        <td>Games Resume</td>
                        <td>January 8th</td>
                    </tr>
                    <tr>
                        <td>Off for Spring Break</td>
                        <td>March 5th</td>
                    </tr>
                    <tr>
                        <td><b>Final Tournament</b></td>
                        <td>March 26th</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="subsection">
            <h3 id="point-per-game">Points for games</h3>
            <ul>
                <li>Winning a game awards 2 points</li>
                <li>Tieing a game awards 1 point</li>
                <li>Losing a game awards 0 points</li>
                <li>Winning a series (combined score of both games against a team) awards 1 bonus point</li>
            </ul>
            
            <h3 id="tournaments-section">Tournaments</h3>
            This year we have 2 tournaments! Anyone including (those not in the league) can compete so if you can only come for 1 day these are the ones to do it! 
            The exact format of the tournament will depend on the number of players but it will follow a round robin + elimination set up.
            League points up for grabs (half awarded to each player in the team)
                <div class="table-wrapper">
                    <table class="basic-table">
                <thead>
                    <tr>
                        <th>Place</th>
                        <th>Winter Tourney</th>
                        <th>Final Tourney</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><b>1st</b></td>
                        <td>6 pts</td>
                        <td>10 pts</td>
                    </tr>
                    <tr>
                        <td><b>2nd</b></td>
                        <td>4 pts</td>
                        <td>8 pts</td>
                    </tr>
                    <tr>
                        <td><b>3rd</b></td>
                        <td>2 pts</td>
                        <td>6 pts</td>
                    </tr>
                    <tr>
                        <td><b>4th</b></td>
                        <td>2 pts</td>
                        <td>4 pts</td>
                    </tr>
                    <tr>
                        <td><b>5th-8th</b></td>
                        <td>0 pts</td>
                        <td>2 pts</td>
                    </tr>
                </tbody>
            </table>
                </div> 
        </div>
        
    </Collapsible>
        
        <Collapsible 
        title="Game Rules"
        variant="minimal"
        titleSize="1.75rem"
        titleWeight="300"
        titleColor="#1a202c"
        iconType="arrow"
        >
        <ul>
            <li>Each game consists of at least 2 rounds and at most 4</li>
            <li>If after a round a team is winning by 100 points they win the game</li>
            <li>After 4 rounds the winner is the team with the most points. Ties are possible</li>
            <li>The standard crokinole rules can be found <a href="https://www.worldcrokinole.com/thegame.html">here</a></li>
            <li>All shots must be a flick - you can not start with contact on the disk with the finger you shoot with</li>
            <li>Your hand can not move past the shooting line (i.e. you hand move forward as part of your shot)</li>
            <li>When not playing in a regulation stool all players are only allowed to lean from their seated position (no sliding)</li>
            <li>Jack has the final say</li>
            <li>You can never deny a team a match if they ask to play and you have not already played them twice</li>
            <li>HAVE FUN</li>
        </ul>
        </Collapsible>
        {#if loading}
            <div class="status">Loading Excel data...</div>
        {:else if error}
            <div class="error">
                <h3>Error loading file</h3>
                <p>{error}</p>
            </div>
        {:else if dataReady}
        <p></p>
            <!-- <div class="status success">
                Data loaded successfully! Sheets available: {Object.keys(excelData).join(', ')}
            </div>
            <div>{teams}</div> -->

            <!-- Your custom table/visualization will go here -->
            <!-- <section class="custom-content">
                <h2>Custom Data View</h2>
                
                <div class="data-summary">
                    {#each Object.entries(excelData) as [sheetName, sheetData]}
                        <div class="sheet-summary">
                            <h3>{sheetName}</h3>
                            <p>Rows: {sheetData.rows.length}</p>
                            <p>Columns: {sheetData.headers.length}</p>
                        </div>
                    {/each}
                </div> -->
                
                <!-- Add your custom table component here -->
                <!-- Example: -->
                <!-- <MyCustomTable data={createCustomTable()} /> -->
                
                <!-- Debug view (remove in production) -->
                <!-- <details class="debug">
                    <summary>Debug: View Raw Data</summary>
                    <pre>{JSON.stringify(excelData, null, 2)}</pre>
                </details>
            </section> -->
        {/if}
    </main>
</div>

<style>

    /* Center tables on desktop only */
    @media (min-width: 769px) {
        .table-wrapper {
            max-width: 600px;
            margin: 1rem auto;
        }
    }
    
    /* Full width on mobile */
    @media (max-width: 768px) {
        .table-wrapper {
            margin: 1rem -1.5rem; /* Negative margins to extend beyond padding */
            padding: 0 1rem;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
        
        /* Visual indicator that table is scrollable */
        .table-wrapper {
            background: 
                linear-gradient(to right, white 30%, rgba(255, 255, 255, 0)),
                linear-gradient(to right, rgba(255, 255, 255, 0), white 70%) 100% 0,
                linear-gradient(to right, rgba(0, 0, 0, 0.1), transparent 10%),
                linear-gradient(to left, rgba(0, 0, 0, 0.1), transparent 10%) 100% 0;
            background-repeat: no-repeat;
            background-size: 40px 100%, 40px 100%, 10px 100%, 10px 100%;
            background-attachment: local, local, scroll, scroll;
        }
    }
    
    /* Ensure minimum table width */
    .basic-table {
        min-width: 300px;
        width: 100%;
    }
    
    /* Optional: Add horizontal scroll indicator */
    .table-wrapper[data-scrollable]::after {
        content: '← Swipe to see more →';
        display: block;
        text-align: center;
        padding: 0.5rem;
        font-size: 0.75rem;
        color: #666;
    }
    
    /* Hide indicator once user has scrolled */
    .table-wrapper.has-scrolled::after {
        display: none;
    }

    /* Add these styles to your existing <style> section */

    /* Mobile-specific adjustments */
    @media (max-width: 768px) {
        /* Container and main layout */
        .container {
            padding: 1rem;
        }
        
        main {
            padding: 1.5rem;
            border-radius: 8px;
        }
        
        /* Typography adjustments */
        h1 {
            font-size: 1.75rem;
            margin-bottom: 1rem;
            line-height: 1.2;
        }
        
        h3 {
            font-size: 1.25rem;
        }
        
        p {
            font-size: 0.95rem;
            line-height: 1.6;
        }
        
        /* Remove subsection margin on mobile */
        .subsection {
            margin-left: 0;
        }
        
        /* Make center div full width on mobile */
        .center {
            width: 100%;
            margin: 0;
            overflow-x: auto;
        }
        
        /* Table adjustments */
        .basic-table {
            font-size: 0.85rem;
            box-shadow: none;
            border: 1px solid #e2e8f0;
        }
        
        .basic-table th {
            padding: 0.75rem 0.5rem;
            font-size: 0.75rem;
        }
        
        .basic-table td {
            padding: 0.75rem 0.5rem;
        }
        
        /* Make tables scrollable */
        .table-wrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 0 -1rem;
            padding: 0 1rem;
        }
        
        /* Lists */
        ul {
            padding-left: 1.5rem;
        }
        
        li {
            margin-bottom: 0.5rem;
            font-size: 0.95rem;
        }
        
        /* Breadcrumb */
        .breadcrumb {
            margin-bottom: 1rem;
        }
    }

    /* Even smaller screens */
    @media (max-width: 480px) {
        h1 {
            font-size: 1.5rem;
        }
        
        main {
            padding: 1rem;
        }
        
        /* Stack table cells on very small screens */
        .basic-table thead {
            display: none;
        }
        
        .basic-table tbody tr {
            display: block;
            margin-bottom: 1rem;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
        }
        
        .basic-table td {
            display: block;
            text-align: right;
            padding: 0.5rem;
            position: relative;
            padding-left: 50%;
        }
        
        .basic-table td:before {
            content: attr(data-label);
            position: absolute;
            left: 0.5rem;
            font-weight: 600;
            text-align: left;
        }
    }

    /* Improved base styles for better mobile experience */
    * {
        box-sizing: border-box;
    }

    /* Prevent horizontal scroll */
    body {
        overflow-x: hidden;
    }

    /* Make links easier to tap on mobile */
    a {
        padding: 0.25rem 0;
        display: inline-block;
    }

    /* Larger touch targets for Collapsible headers on mobile */
    @media (max-width: 768px) {
        :global(.collapsible .header) {
            padding: 1rem !important;
            touch-action: manipulation;
        }
    }

    /* Add smooth scrolling */
    :global(html) {
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
    }

    /* Ensure tables don't break layout */
    table {
        max-width: 100%;
        overflow-x: auto;
    }

    /* Responsive images if you add any */
    img {
        max-width: 100%;
        height: auto;
    }

    /* Style 1: Clean and Modern */
        .basic-table {
            width: 100%;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            table-layout: fixed; /* Forces table to use full width */
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-collapse: collapse;
        }
        
        .basic-table th {
            background: #4a5568;
            color: white;
            font-weight: 600;
            text-align: left;
            padding: 1rem;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .basic-table td {
            padding: 1rem;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .basic-table tbody tr:last-child td {
            border-bottom: none;
        }

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
        margin-bottom: 2rem;
        color: #1a1a1a;
    }
    
    .status {
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 2rem;
        background: #f0f0f0;
        color: #666;
    }
    
    .status.success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }
    
    .error {
        background: #fee;
        border: 1px solid #fcc;
        border-radius: 8px;
        padding: 2rem;
        color: #c00;
    }
    
    .error h3 {
        margin-top: 0;
    }
    
    .custom-content {
        margin-top: 2rem;
    }
    
    .data-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin: 1rem 0;
    }
    
    .sheet-summary {
        background: #f9f9f9;
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid #eee;
    }
    
    .sheet-summary h3 {
        margin-top: 0;
        color: #333;
    }
    
    .sheet-summary p {
        margin: 0.5rem 0;
        color: #666;
    }
    
    .debug {
        margin-top: 3rem;
        padding: 1rem;
        background: #f5f5f5;
        border-radius: 8px;
    }
    
    .debug summary {
        cursor: pointer;
        font-weight: 600;
        color: #666;
    }
    
    .debug pre {
        margin-top: 1rem;
        overflow-x: auto;
        font-size: 0.875rem;
    }

    .subsection {
        margin-left: 50px; /* Adjust the value as needed */
    }

    .center {
        width: 50%; /* Or any specific width */
        margin: 0 auto;
    }
</style>