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
    
    onMount(async () => {
        await loadExcelData();
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
    <meta name="description" content="Excel data visualization">
</svelte:head>

<div class="container">
    <nav class="breadcrumb">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <h1>JP Flicks - Season 2</h1>
        Welcome to Boston's premier Crokinole league season 2. We will meet Thursday's at 7:00pm and run till about 10
        <Collapsible 
        title="League Format"
        variant="minimal"
        titleSize="1.75rem"
        titleWeight="300"
        titleColor="#1a202c"
        iconType="arrow"
        >
        <p>
            This seasons league will follow a similar format to the first but take a more Fed-Ex cup approach (balancing how much you play but also how well you performed). In addition will no longer have an individual category.
        The league will run through the cold months of Boston.
        Each person can sign up for up to 2 teams.
        each team will play each other up to 2 times (with the exception of you will never play yourself).
        </p>
        <div class="subsection">
            <h3>Points for games</h3>
            <ul>
                <li>winning a game awards 2 points</li>
                <li>tieing a game awards 1 point</li>
                <li>losing a game awards 0 points</li>
                <li>winning a series (combined score of both games against a team) awards 1 bonus point</li>
            </ul>
            
            <h3>Tournaments</h3>
            This year we have 2 tournaments! Anyone including (those not in the league) can compete so if you can only come for 1 day are the ones to do it! They will take place one of the last 2 weeks before winter break (depending on availability) and at the end of the league 
            The exact format of the tournament will depend on the number of players but it will follow a round robin + elimination set up.
            League points up for grabs (half awarded to each player in tournament)
            <div class="center">
                <table>
                <thead>
                    <tr>
                        <th>Place</th>
                        <th>Winter Tourney</th>
                        <th>Final Tourney</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th>1st</th>
                        <td>6 pts</td>
                        <td>10 pts</td>
                    </tr>
                    <tr>
                        <th>2nd</th>
                        <td>4 pts</td>
                        <td>8 pts</td>
                    </tr>
                    <tr>
                        <th>3rd</th>
                        <td>2 pts</td>
                        <td>6 pts</td>
                    </tr>
                    <tr>
                        <th>4th </th>
                        <td>2 pts</td>
                        <td>4 pts</td>
                    </tr>
                    <tr>
                        <th>5th-8th </th>
                        <td>0 pts</td>
                        <td>2 pts</td>
                    </tr>
                </tbody>
            </table>
            </div>
        </div>
        
        <p>The winner of the league the team at the end with the most points! For winning the league</p>
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
            <li>the standard crokinole rules can be found <a href="https://www.worldcrokinole.com/thegame.html">here</a></li>
            <li>all shots must be a flick - you can not start with contact on the disk with the finger you shoot with</li>
            <li>your hand can not move past the shooting line (i.e. you hand move forward as part of your shot)</li>
            <li>When not playing in a regulation stool all players are only allowed to lean from their seated position (no sliding)</li>
            <li>Jack has the final say</li>
            <li>You can never deny a team a match if they ask to play and you have not already played them twice</li>
            <li>have fun</li>
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
            <div class="status success">
                Data loaded successfully! Sheets available: {Object.keys(excelData).join(', ')}
            </div>
            <div>{teams}</div>
            <!-- Your custom table/visualization will go here -->
            <section class="custom-content">
                <h2>Custom Data View</h2>
                
                <!-- Example: Show data summary -->
                <div class="data-summary">
                    {#each Object.entries(excelData) as [sheetName, sheetData]}
                        <div class="sheet-summary">
                            <h3>{sheetName}</h3>
                            <p>Rows: {sheetData.rows.length}</p>
                            <p>Columns: {sheetData.headers.length}</p>
                        </div>
                    {/each}
                </div>
                
                <!-- Add your custom table component here -->
                <!-- Example: -->
                <!-- <MyCustomTable data={createCustomTable()} /> -->
                
                <!-- Debug view (remove in production) -->
                <details class="debug">
                    <summary>Debug: View Raw Data</summary>
                    <pre>{JSON.stringify(excelData, null, 2)}</pre>
                </details>
            </section>
        {/if}
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