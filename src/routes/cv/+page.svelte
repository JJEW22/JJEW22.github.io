<script>
    // Education data
    const education = [
        {
            institution: "Northeastern University",
            school: "Khoury College of Computer Sciences",
            location: "Boston, MA",
            degrees: [
                {
                    degree: "B.S. in Computer Science & Physics",
                    minor: "minor in Mathematics",
                    gpa: "3.90",
                    startDate: "Fall 2019",
                    endDate: "May 2023"
                },
                {
                    degree: "Candidate for PhD in Computer Science",
                    minor: null,
                    gpa: null,
                    startDate: null,
                    endDate: "Expected May 2028"
                }
            ],
            courses: ["Advanced ML", "Advanced Algorithms", "Complexity Theory", "Foundations of Software Eng."],
            activities: ["Theory Seminar Co-Organizer", "Fun in Theory Run Club Organizer", "GENU-UAW"]
        }
    ];

    // Technical Skills data
    const skills = {
        certifications: ["Series 65"],
        languages: {
            proficient: ["Python", "C++", "Java", "TypeScript"],
            familiar: ["MATLAB", "JavaScript", "Swift", "Racket", "ACL2 Sedan"]
        },
        technologies: ["pandas", "LaTeX", "NumPy", "Tableau", "CVXpy", "ROS", "Angular", "React", "scikit-learn", "tensorflow"]
    };

    // Experience data
    const experience = [
        {
            company: "Northeastern University CRI",
            title: "Commercialization Specialist",
            location: "Boston, MA",
            startDate: "Spring 2023",
            endDate: "Present",
            accomplishments: [
                "Filter incoming invention disclosures for commercial viability and patentability",
                "Perform outreach for license deals by packing similar IP together and developing marketing materials for distribution"
            ]
        },
        {
            company: "Northeastern University",
            title: "Research Assistant",
            location: "Boston, MA",
            startDate: "Fall 2023",
            endDate: "Present, Summer 2022",
            accomplishments: [
                "Conduct research part time in algorithmic fairness advised by Professor Ravi Sundaram",
                "Proved a tight bound on externality introduced by Robust Allocations with Diversity Constraints",
                "Aided a team with analysis of scientrometrics of all US patents"
            ]
        },
        {
            company: "RKF Eng.",
            title: "Software Engineer",
            location: "Bethesda, MD",
            startDate: "Summer 2023",
            endDate: "Summer 2021 - Winter 2021",
            accomplishments: [
                "Optimized existing C++ simulation code reducing asymptotic runtime, resulting in over 10 times speed up",
                "Pioneered python project to automate creation and filing of 500 forms saving an estimated 250 man hours"
            ]
        },
        {
            company: "Northeastern University",
            title: "Teaching Assistant",
            location: "Boston, MA",
            startDate: "Fall 2022",
            endDate: "Present",
            accomplishments: [
                "Assisted students learning by giving lectures, creating problem sets, and hosting hours of office"
            ]
        },
        {
            company: "RIVeR Lab at Northeastern University",
            title: "Research Assistant",
            location: "Boston, MA",
            startDate: "Summer 2022",
            endDate: "Fall 2022",
            accomplishments: [
                "Integrated 5 Machine Learning Models for remote sensing of human vitals into a ROS network",
                "Created scheduling module to cycle tasks and move robot to an optimal position relative to a specific person"
            ]
        },
        {
            company: "SEDS - NASA Mars Ice Challenge",
            title: "Digital Core Lead",
            location: "Boston, MA",
            startDate: "Fall 2020",
            endDate: "Fall 2021",
            accomplishments: [
                "Oversaw development of a \"digital core\" that utilized spatial temporal ML models to identify different soil types during a drill sequence"
            ]
        }
    ];

    // Projects data
    const projects = [
        {
            name: "Patent Citation Network Analyzer",
            technologies: ["Python", "pandas", "Tableau", "NumPy"],
            startDate: "Summer 2024",
            endDate: "Present",
            accomplishments: [
                "Solo developed software to analyze the citation network of all US patents",
                "Developed vectorized algorithm to efficiently calculate cd5 and custom citation metrics",
                "Identified effects of search technologies on patent citation network with Tableau and citation metric results"
            ]
        },
        {
            name: "Fair Convex Optimizer",
            technologies: ["Python", "NumPy", "CVXpy", "pandas"],
            startDate: "Summer 2022",
            endDate: "Winter 2023",
            accomplishments: [
                "Built custom functionality ontop of existing CVXpy library to allow for \"diversity constraints\" and tracking of over 10 metrics measuring fairness",
                "Demonstrated proven theoretical result's exponential improvement of externality by running optimizer with US Census employment data"
            ]
        }
    ];

    // Interests
    const interests = ["Distance Running", "Algorithms", "Pathfinder", "Hiking", "Board Game Design", "Hummus", "Golfing"];

    // Contact info
    const contact = {
        name: "John Wilkins",
        location: "Boston, MA",
        email: "wilkins.jo@northeastern.edu",
        phone: "918-527-3411",
        github: "github.com/JJEW22",
        githubUrl: "https://github.com/JJEW22"
    };

    // Function to download as PDF
    function downloadPDF() {
        console.log('Download PDF button clicked'); // Debug log
        window.print();
    }
</script>

<svelte:head>
    <title>{contact.name} - CV</title>
    <meta name="description" content="CV and Resume for {contact.name}">
</svelte:head>

<div class="container">
    <nav class="breadcrumb no-print">
        <a href="/">← Back to Home</a>
    </nav>
    
    <main>
        <!-- Download PDF Button -->
        <div class="pdf-button-container no-print">
            <button class="pdf-button" on:click={downloadPDF}>
                📄 Download as PDF
            </button>
        </div>

        <!-- Header -->
        <header class="cv-header">
            <h1>{contact.name}</h1>
            <div class="contact-info">
                <span>{contact.location}</span>
                <span>•</span>
                <a href="mailto:{contact.email}">{contact.email}</a>
                <span>•</span>
                <span>{contact.phone}</span>
                <span>•</span>
                <a href={contact.githubUrl} target="_blank">{contact.github}</a>
            </div>
        </header>

        <!-- Education -->
        <section class="cv-section">
            <h2>Education</h2>
            {#each education as edu}
                <div class="entry">
                    <div class="entry-header">
                        <div class="entry-title">
                            <strong>{edu.institution}</strong>
                            {#if edu.school}
                                - {edu.school}
                            {/if}
                        </div>
                        <div class="entry-location">{edu.location}</div>
                    </div>
                    <div class="entry-details">
                        {#each edu.degrees as degree}
                            <div class="degree-info">
                                <div>
                                    <strong>{degree.degree}</strong>
                                    {#if degree.minor}
                                        with a {degree.minor}
                                    {/if}
                                    {#if degree.gpa}
                                        <span class="gpa">GPA: {degree.gpa}</span>
                                    {/if}
                                </div>
                                <div class="date">
                                    {#if degree.startDate}
                                        {degree.startDate} – {degree.endDate}
                                    {:else}
                                        {degree.endDate}
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                    {#if edu.courses && edu.courses.length > 0}
                        <div class="subsection">
                            <strong>Relevant courses:</strong> {edu.courses.join(' | ')}
                        </div>
                    {/if}
                    {#if edu.activities && edu.activities.length > 0}
                        <div class="subsection">
                            <strong>Activities:</strong> {edu.activities.join(' | ')}
                        </div>
                    {/if}
                </div>
            {/each}
        </section>

        <!-- Technical Skills -->
        <section class="cv-section">
            <h2>Technical Skills</h2>
            <div class="skills-grid">
                {#if skills.certifications && skills.certifications.length > 0}
                    <div class="skill-category">
                        <strong>Certifications:</strong> {skills.certifications.join(', ')}
                    </div>
                {/if}
                <div class="skill-category">
                    <strong>Languages:</strong>
                    <div class="skill-list">
                        <span class="skill-label">Proficient:</span> {skills.languages.proficient.join(', ')}
                        <br>
                        <span class="skill-label">Familiar:</span> {skills.languages.familiar.join(', ')}
                    </div>
                </div>
                <div class="skill-category">
                    <strong>Technologies:</strong> {skills.technologies.join(', ')}
                </div>
            </div>
        </section>

        <!-- Experience -->
        <section class="cv-section">
            <h2>Experience</h2>
            {#each experience as exp}
                <div class="entry">
                    <div class="entry-header">
                        <div class="entry-title">
                            <strong>{exp.company}</strong> - {exp.title}
                        </div>
                        <div class="entry-meta">
                            <span class="entry-location">{exp.location}</span>
                            <span class="entry-date">{exp.startDate} - {exp.endDate}</span>
                        </div>
                    </div>
                    <ul class="accomplishments">
                        {#each exp.accomplishments as accomplishment}
                            <li>{accomplishment}</li>
                        {/each}
                    </ul>
                </div>
            {/each}
        </section>

        <!-- Projects -->
        <section class="cv-section">
            <h2>Projects</h2>
            {#each projects as project}
                <div class="entry">
                    <div class="entry-header">
                        <div class="entry-title">
                            <strong>{project.name}</strong>
                            <span class="tech-tags">({project.technologies.join(', ')})</span>
                        </div>
                        <div class="entry-date">{project.startDate} - {project.endDate}</div>
                    </div>
                    <ul class="accomplishments">
                        {#each project.accomplishments as accomplishment}
                            <li>{accomplishment}</li>
                        {/each}
                    </ul>
                </div>
            {/each}
        </section>

        <!-- Interests -->
        <section class="cv-section">
            <h2>Interests</h2>
            <div class="interests">
                {interests.join(' | ')}
            </div>
        </section>
    </main>
</div>

<style>
    .container {
        max-width: 900px;
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
    
    /* Header */
    .cv-header {
        text-align: center;
        margin-bottom: 3rem;
        padding-bottom: 2rem;
        border-bottom: 2px solid #e5e7eb;
    }
    
    .cv-header h1 {
        font-size: 2.5rem;
        margin-bottom: 0.75rem;
        color: #1a1a1a;
    }
    
    .contact-info {
        font-size: 0.95rem;
        color: #4b5563;
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    
    .contact-info a {
        color: #0066cc;
        text-decoration: none;
    }
    
    .contact-info a:hover {
        text-decoration: underline;
    }
    
    /* Sections */
    .cv-section {
        margin-bottom: 2.5rem;
    }
    
    .cv-section h2 {
        font-size: 1.5rem;
        color: #1a1a1a;
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #0066cc;
    }
    
    /* Entry styles */
    .entry {
        margin-bottom: 2rem;
    }
    
    .entry:last-child {
        margin-bottom: 0;
    }
    
    .entry-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.5rem;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    
    .entry-title {
        flex: 1;
        min-width: 250px;
    }
    
    .entry-meta {
        display: flex;
        gap: 1rem;
        align-items: center;
        color: #4b5563;
        font-size: 0.9rem;
    }
    
    .entry-location {
        color: #4b5563;
        font-size: 0.9rem;
    }
    
    .entry-date {
        color: #6b7280;
        font-size: 0.9rem;
        white-space: nowrap;
    }
    
    .entry-details {
        margin-bottom: 0.75rem;
    }
    
    .degree-info {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.5rem;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    
    .gpa {
        color: #059669;
        font-weight: 600;
        margin-left: 1rem;
    }
    
    .subsection {
        margin-top: 0.5rem;
        color: #4b5563;
        font-size: 0.95rem;
    }
    
    /* Skills */
    .skills-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .skill-category {
        line-height: 1.6;
    }
    
    .skill-list {
        margin-top: 0.25rem;
    }
    
    .skill-label {
        font-style: italic;
        color: #6b7280;
    }
    
    /* Accomplishments */
    .accomplishments {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .accomplishments li {
        margin-bottom: 0.5rem;
        line-height: 1.5;
        color: #374151;
    }
    
    .accomplishments li:last-child {
        margin-bottom: 0;
    }
    
    /* Tech tags */
    .tech-tags {
        color: #6b7280;
        font-weight: normal;
        font-size: 0.9rem;
        font-style: italic;
    }
    
    /* Interests */
    .interests {
        color: #4b5563;
        line-height: 1.8;
        font-size: 1rem;
    }
    
    /* Mobile responsive */
    @media (max-width: 768px) {
        .container {
            padding: 1rem;
        }
        
        main {
            padding: 1.5rem;
        }
        
        .cv-header h1 {
            font-size: 2rem;
        }
        
        .contact-info {
            font-size: 0.85rem;
        }
        
        .entry-header {
            flex-direction: column;
        }
        
        .entry-meta {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
        }
        
        .degree-info {
            flex-direction: column;
            align-items: flex-start;
        }
        
        .gpa {
            margin-left: 0;
        }
    }

    /* PDF Download Button */
    .pdf-button-container {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 2rem;
    }

    .pdf-button {
        padding: 0.75rem 1.5rem;
        background: #0066cc;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .pdf-button:hover {
        background: #0052a3;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 102, 204, 0.3);
    }

    /* Print styles for PDF */
    @media print {
        /* Hide elements that shouldn't appear in PDF */
        .no-print {
            display: none !important;
        }

        /* Remove page margins and backgrounds */
        body {
            margin: 0;
            padding: 0;
        }

        .container {
            max-width: 100%;
            padding: 0;
            margin: 0;
        }

        main {
            box-shadow: none;
            border-radius: 0;
            padding: 0.5in;
            margin: 0;
        }

        /* Adjust header for PDF */
        .cv-header {
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
        }

        .cv-header h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }

        .contact-info {
            font-size: 0.85rem;
        }

        /* Adjust section spacing for PDF */
        .cv-section {
            margin-bottom: 1.5rem;
            page-break-inside: avoid;
        }

        .cv-section h2 {
            font-size: 1.25rem;
            margin-bottom: 1rem;
            padding-bottom: 0.25rem;
        }

        /* Adjust entry spacing */
        .entry {
            margin-bottom: 1.25rem;
            page-break-inside: avoid;
        }

        .entry-header {
            margin-bottom: 0.25rem;
        }

        /* Smaller fonts for PDF */
        .accomplishments {
            font-size: 0.9rem;
        }

        .accomplishments li {
            margin-bottom: 0.25rem;
            line-height: 1.4;
        }

        /* Make links appear as regular text */
        a {
            color: inherit;
            text-decoration: none;
        }

        /* Prevent page breaks inside important elements */
        .degree-info,
        .skill-category,
        .accomplishments li {
            page-break-inside: avoid;
        }
    }
</style>