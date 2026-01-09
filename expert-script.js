const df = Intl.DateTimeFormat("en-u-ca-iso8601");

const githubMinDate = "2013-07-01";

document.addEventListener('DOMContentLoaded', () => {
  const expertsList = document.getElementById('experts-list');
  const loading = document.getElementById('loading');
  const searchInput = document.getElementById('expert-search');
  const sinceSelector = document.getElementById('since-selector');

  const now = new Date();
  let cursor = new Date(githubMinDate);
  while (cursor < now) {
    const option = document.createElement("option");
    option.value = cursor;
    option.textContent = `${cursor.getFullYear()} Q${cursor.getMonth() === 0 ? "1" : "3"}`;
    sinceSelector.append(option);
    cursor.setMonth(cursor.getMonth() + 6);
  }

  let allExpertsData = { experts: [], minDate: new Date() };
  const urlParams = new URLSearchParams(window.location.search);
  const groupIdFilter = urlParams.get('group');
  const hashFilter = urlParams.get('hash');
  const since = new Date(urlParams.get('since') ?? 0);

    Promise.all([
        fetch('invited-expert-roles.json').then(r => r.json()),
        fetch('pr-contributors.json').then(r => r.json()),
        fetch('hr-reviewers.json').then(r => r.json())
    ]).then(([rolesData, prsData, reviewsData]) => {
        allExpertsData = processData(rolesData, prsData, reviewsData);

        if (hashFilter) {
	  allExpertsData.experts = allExpertsData.experts.filter(ie => ie.href === `https://api.w3.org/users/${hashFilter}`);
	  showFilterNotice(`Showing single expert view`, searchInput);
	}

        if (since) {
	  allExpertsData.minDate = new Date(Math.max(since, allExpertsData.minDate));
	}
        // Apply group/hash filter if present
        if (groupIdFilter) {
            allExpertsData.experts = allExpertsData.experts.filter(expert =>
                expert.groups.some(g => g.id == groupIdFilter)
            );
	  // Try to find group name from first expert
          const g = allExpertsData.experts?.[0].groups.find(g => g.id == groupIdFilter);
          const groupName = g ? g.name : `ID ${groupIdFilter}`;
	  const filterLabel = allExpertsData.experts.length ? `Showing ${allExpertsData.experts.length} experts for group: ${groupName}` : `No experts found for group ID ${groupIdFilter}`;
	  showFilterNotice(filterLabel, searchInput);
        }

        renderExperts(allExpertsData);
        loading.style.display = 'none';
    }).catch(err => {
        console.error("Error loading data", err);
        loading.textContent = "Error loading data.";
    });

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allExpertsData.experts.filter(ex => ex.name.toLowerCase().includes(term));
        renderExperts({ experts: filtered, minDate: allExpertsData.minDate });
    });

    sinceSelector.addEventListener('change', (e) => {
        const date = new Date(e.target.value) || githubMinDate;
        const inscope = i => i.date >= date;
        const filtered = allExpertsData.experts.map(ex => Object.assign({}, ex, {prCount: ex.prs.filter(inscope).length, issueCount: ex.issues.filter(inscope).length}));
        renderExperts({ experts: filtered, minDate: date });
    });


    function processData(rolesData, prsData, reviewsData) {
        const expertsMap = new Map();
        const groupNames = new Map();

        // Pass 1: Invited Experts Roles
        rolesData.forEach(group => {
            groupNames.set(group.id, group.name);
            if (group.ies) {
                group.ies.forEach(ie => {
                    if (!expertsMap.has(ie.href)) {
                        expertsMap.set(ie.href, {
                            name: ie.name,
                            href: ie.href,
                            github: ie.github || null,
 			    affiliations: ie.affiliations,
                            groups: [],
                            chairs: [],
                            specs: [],
                            prs: [],
                            issues: [],
                            prCount: 0,
                            issueCount: 0,
                            reviews: []
                        });
                    }
                    const expert = expertsMap.get(ie.href);

                    // Update github if found in this group entry and not previously set
                    if (ie.github && !expert.github) {
                        expert.github = ie.github;
                    }

                    // Add group participation
                    if (!expert.groups.find(g => g.id === group.id)) {
                        expert.groups.push({ name: group.name, id: group.id });
                    }

                    // Check Chair
                    if (ie.roles && ie.roles.chair) {
                        expert.chairs.push({ name: group.name, id: group.id });
                    }

                    // Check Editors (specs)
                    if (ie.roles && ie.roles.editors && Array.isArray(ie.roles.editors)) {
                        ie.roles.editors.forEach(ed => {
                            // Try to get a meaningful name
                            const specName = ed.title || ed.shortname || "Unknown Spec";
                            expert.specs.push({ name: specName, shortname: ed.shortname });
                        });
                    }
                });
            }
        });

        // Build GitHub -> Expert map (needed for PRs/Issues and Reviews)
        const githubMap = new Map();
        for (const expert of expertsMap.values()) {
            if (expert.github) {
                githubMap.set(expert.github.toLowerCase(), expert);
            }
        }

        // Pass 2: PR & Issue Contributors
        prsData.forEach(groupPrData => {
            if (groupPrData.contributors) {
                Object.entries(groupPrData.contributors).forEach(([repoName, repoData]) => {
                    // Process Issues
                    if (repoData.issues) {
                        Object.entries(repoData.issues).forEach(([handle, issuesList]) => {
                            const expert = githubMap.get(handle.toLowerCase());
                            if (expert) {
                                issuesList.forEach(issue => {
                                    expert.issues.push({
                                        repo: repoName,
                                        date: new Date(issue.created_at),
                                        num: issue.num,
                                        url: issue.url
                                    });
                                });
                            }
                        });
                    }

                    // Process PRs
                    if (repoData.prs) {
                        Object.entries(repoData.prs).forEach(([handle, prsList]) => {
                            const expert = githubMap.get(handle.toLowerCase());
                            if (expert) {
                                prsList.forEach(pr => {
                                    expert.prs.push({
                                        repo: repoName,
                                        date: new Date(pr.created_at),
                                        num: pr.num,
                                        url: pr.url
                                    });
                                });
                            }
                        });
                    }
                });
            }
        });

        // Pass 3: HR Reviews
        reviewsData.forEach(r => {
            if ([160680, 32113, 83907].includes(r.id) && r.reviewers) {
                const groupName = groupNames.get(r.id) || `Group ${r.id}`;
                Object.entries(r.reviewers).forEach(([handle, reviewsList]) => {
                    const expert = githubMap.get(handle.toLowerCase());
                    if (expert) {
                        expert.reviews.push({
                            groupName: groupName,
                            groupId: r.id,
                            count: reviewsList.length
                        });
                    }
                });
            }
        });

        // Post-process: sort Activity and calculate stats
        let minDate = new Date();
        for (const expert of expertsMap.values()) {
            expert.prs.sort((a, b) => a.date - b.date);
            expert.issues.sort((a, b) => a.date - b.date);
            
            expert.prCount = expert.prs.length;
            expert.issueCount = expert.issues.length;

            // Check min date across PRs and Issues
            if (expert.prs.length > 0 && expert.prs[0].date < minDate) {
                minDate = expert.prs[0].date;
            }
            if (expert.issues.length > 0 && expert.issues[0].date < minDate) {
                minDate = expert.issues[0].date;
            }
            
            // Deduplicate lists
            const uniqueSpecs = new Map();
            expert.specs.forEach(s => uniqueSpecs.set(s.name, s));
            expert.specs = Array.from(uniqueSpecs.values());
        }

        // Return sorted by Activity count desc (PRs + Issues)
        const experts = Array.from(expertsMap.values()).sort((a, b) => (b.prCount + b.issueCount) - (a.prCount + a.issueCount));
        return { experts, minDate };
    }

    function renderExperts({ experts, minDate }) {
        expertsList.innerHTML = '';
        
        // Generate timeline keys (YYYY-MM)
        const allMonths = [];
        const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        const end = new Date(); // now
        let cur = new Date(start);
        while (cur <= end) {
            allMonths.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
            cur.setMonth(cur.getMonth() + 1);
        }

        experts.forEach(expert => {
            const card = document.createElement('div');
            card.className = 'card';

	  const affiliationsHtml = expert.affiliations.length ? expert.affiliations.map(a => `<a href='affiliations.html?id=${a.href.split('/').pop()}'>${a.name}</a>`).join(', ') : "N/A";

            // Groups as links
            let groupsHtml = expert.groups.map(g => 
                `<a href="?group=${g.id}" class="badge badge-group">${g.name}</a>`
            ).join('');

            let chairsHtml = expert.chairs.map(g => `<span class="badge badge-chair">${g.name}</span>`).join('');
            let specsHtml = expert.specs.map(s => {
                if (s.shortname) {
                    return `<a href="https://www.w3.org/TR/${s.shortname}" target="_blank" class="badge badge-spec">${s.name}</a>`;
                } else {
                    return `<span class="badge badge-spec">${s.name}</span>`;
                }
            }).join('');

            // Reviews
            let reviewsHtml = '';
            if (expert.reviews.length > 0) {
                reviewsHtml = expert.reviews.map(r => 
                    `<span class="badge badge-review">${r.groupName} (${r.count})</span>`
                ).join('');
            }

            // Stats
            let activityHtml = '';
            let repoHtml = '';
            const totalActivity = expert.prCount + expert.issueCount;

            if (totalActivity > 0) {
                // Determine range
                const dates = [...expert.prs.map(p => p.date), ...expert.issues.map(i => i.date)].sort((a,b) => a-b);
                const first = df.format(dates[0]);
                const last = df.format(dates[dates.length - 1]);
                
                // Repo breakdown
                const repoCounts = {};
                expert.prs.forEach(pr => {
                    if (!repoCounts[pr.repo]) repoCounts[pr.repo] = { prs: 0, issues: 0 };
                    repoCounts[pr.repo].prs++;
                });
                expert.issues.forEach(is => {
                    if (!repoCounts[is.repo]) repoCounts[is.repo] = { prs: 0, issues: 0 };
                    repoCounts[is.repo].issues++;
                });

                const sortedRepos = Object.entries(repoCounts).sort((a, b) => (b[1].prs + b[1].issues) - (a[1].prs + a[1].issues));
                
                repoHtml = sortedRepos.map(([repo, counts]) => {
                    // Link: default to PRs if only PRs, Issues if only Issues, or PRs if both?
                    // Let's create two links if both exist? Or one badge with two counts?
                    // "repo (5 PR, 2 Iss)"
                    let label = repo;
                    if (counts.prs > 0) label += ` ${counts.prs} PRs`;
                    if (counts.issues > 0) label += ` ${counts.issues} Issues`;
                    
                    const ghUrl = expert.github 
                        ? `https://github.com/${repo}/pulls?q=is%3Apr+author%3A${expert.github}`
                        : `https://github.com/${repo}/pulls`;
                        
                    // Ideal: Click goes to PRs, maybe a separate icon for issues?
                    // For simplicity, link to PRs.
                    return `<a href="${ghUrl}" target="_blank" class="badge bade-pr">${label}</a>`;
                }).join('');

                activityHtml = `
                    <dt>GitHub activity (since ${df.format(minDate)}): ${totalActivity} (PRs: ${expert.prCount} | Issues: ${expert.issueCount})</dt>
                        <dd>First: ${first} | Last: ${last}</dd>
                        <dd>
                        ${renderActivityChart(expert.prs, expert.issues, allMonths)}
                    </dd>
                `;
            } else {
                activityHtml = `
                    <dt>GitHub activity (since ${df.format(minDate)}): None</dt>`;
            }

            const githubDisplay = expert.github ? ` <a href='https://github.com/${expert.github}' class=github target=_blank>(@${expert.github})↗️</a>` : '';

            card.innerHTML = `
                <h2>
                    <a ${!hashFilter ? `href='experts.html?hash=${expert.href.split('/').pop()}'` : ''} target="_blank">${expert.name}</a>${githubDisplay}
                </h2>
                <dl>
                ${expert.chairs.length ? `<dt>Chairs:</dt><dd>${chairsHtml}</dd>` : ''}
                <dt>Affiliation:</dt><dd>${affiliationsHtml}</dd>
                <dt>Participates in:</dt><dd>${groupsHtml}</ddd>
                ${expert.specs.length ? `<dt>Edits Specs:</dt><dd>${specsHtml}</dd>` : ''}
                ${expert.reviews.length ? `<dt>Horizontal Reviews:</dt><dd>${reviewsHtml}</dd>` : ''}
                ${repoHtml ? `<dt>Repos:</dt><dd>${repoHtml}</dd>` : ''}
                ${activityHtml}
                </dl>
            `;
            expertsList.appendChild(card);
        });
    }

    function renderActivityChart(prs, issues, allMonths) {
        // Group by Year-Month
        const buckets = {};
        prs.forEach(pr => {
            const k = `${pr.date.getFullYear()}-${String(pr.date.getMonth() + 1).padStart(2, '0')}`;
            buckets[k] = (buckets[k] || 0) + 1;
        });
        issues.forEach(i => {
            const k = `${i.date.getFullYear()}-${String(i.date.getMonth() + 1).padStart(2, '0')}`;
            buckets[k] = (buckets[k] || 0) + 1;
        });
        
        // Calculate max for scaling
        const max = (prs.length + issues.length) > 0 ? Math.max(...Object.values(buckets)) : 1;
        
        let html = '<ol class="pr-chart-container">';
        allMonths.forEach(m => {
            const count = buckets[m] || 0;
            const height = count > 0 ? Math.max(2, (count / max) * 40) : 0; 
            
            const style = count > 0 
                ? `height:${height}px;` 
                : `height:1px; background-color: #eee;`;
            
            const title = count > 0 ? `title="${m}: ${count} Activity"` : `title="${m}"`;

            html += `<li class="pr-bar" style="${style}" ${title}></li>`;
        });
        html += '</ol>';
        return html;
    }
});
