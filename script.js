document.addEventListener('DOMContentLoaded', () => {
    const groupsList = document.getElementById('groups-list');
    const summarySection = document.getElementById('summary');
    const sortSelect = document.getElementById('sort-select');

    let allGroups = [];
    let reviewsData = [];

    // Fetch data
    Promise.all([
        fetch('invited-expert-roles.json').then(response => response.json()),
        fetch('hr-reviewers.json').then(response => response.json()),
        fetch('pr-contributors.json').then(response => response.json())
    ])
    .then(([groupsData, reviews, prsData]) => {
            allGroups = groupsData;
            reviewsData = reviews;
            processPRData(allGroups, prsData);
            renderSummary(allGroups);
            renderGroups(allGroups);
        })
        .catch(err => {
            console.error('Error loading data:', err);
            groupsList.innerHTML = '<p class="error">Error loading data. Please ensure invited-expert-roles.json, hr-reviewers.json and pr-contributors.json exist.</p>';
        });

    function processPRData(groups, prsData) {
        const prsMap = new Map(prsData.map(g => [g.id, g]));

        groups.forEach(group => {
            group.totalPRs = 0;
            group.iePRs = 0;

            const groupPrData = prsMap.get(group.id);
            if (!groupPrData || !groupPrData.contributors) return;

            // Get Set of IE GitHub handles for this group (lowercase)
            const ieHandles = new Set();
            if (group.ies) {
                group.ies.forEach(ie => {
                    if (ie.github) ieHandles.add(ie.github.toLowerCase());
                });
            }

            Object.values(groupPrData.contributors).forEach(repo => {
                if (repo.prs) {
                    Object.entries(repo.prs).forEach(([handle, prs]) => {
                        const count = prs.length;
                        group.totalPRs += count;
                        if (ieHandles.has(handle.toLowerCase())) {
                            group.iePRs += count;
                        }
                    });
                }
            });
        });
    }

    // Sort event listener
    sortSelect.addEventListener('change', (e) => {
        const sortBy = e.target.value;
        sortGroups(sortBy);
    });

    function sortGroups(criteria) {
        let sorted = [...allGroups];
        switch (criteria) {
            case 'ie-count':
                sorted.sort((a, b) => b.numberOfIE - a.numberOfIE);
                break;
            case 'ie-percentage':
                sorted.sort((a, b) => {
                    const percentA = a.numberOfParticipants ? (a.numberOfIE / a.numberOfParticipants) : 0;
                    const percentB = b.numberOfParticipants ? (b.numberOfIE / b.numberOfParticipants) : 0;
                    return percentB - percentA;
                });
                break;
            case 'ie-editors':
                sorted.sort((a, b) => b.numberOfIEEditors - a.numberOfIEEditors);
                break;
            case 'ie-chairs':
                sorted.sort((a, b) => b.numberOfIEChairs - a.numberOfIEChairs);
                break;
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }
        renderGroups(sorted);
    }

    function renderSummary(groups) {
        const totalGroups = groups.length;
        const totalWGs = groups.filter(g => g.type === 'wg').length;
        const totalIGs = groups.filter(g => g.type === 'ig').length;
        const totalParticipants = groups.reduce((sum, g) => sum + g.numberOfParticipants, 0);
        const totalInvitations = groups.reduce((sum, g) => sum + g.numberOfIE, 0);
        const distinctIEs = groups.reduce((acc, g) => {
	  for (const ie of g.ies) {
	    if (!acc[ie.href]) {
	      acc[ie.href] = structuredClone(ie);
	      acc[ie.href].groups = [];
	    }
	    acc[ie.href].groups.push(g.fullshortname);
	  }
	  return acc;
	}, {});
        const totalIEs = Object.keys(distinctIEs).length;
        const totalMultiGroupIEs = Object.values(distinctIEs).filter(i => i.groups.length > 1).length;
        const totalUnaffiliatedIEs = Object.values(distinctIEs).filter(i => i.affiliations.length === 0).length;
        const totalEditors = groups.reduce((sum, g) => sum + g.numberOfEditors, 0);
        const totalIEEditors = groups.reduce((sum, g) => sum + g.numberOfIEEditors, 0);
        const totalChairs = groups.reduce((sum, g) => sum + g.numberOfChairs, 0);
        const totalIEChairs = groups.reduce((sum, g) => sum + g.numberOfIEChairs, 0);

        const globalTotalPRs = groups.reduce((sum, g) => sum + (g.totalPRs || 0), 0);
        const globalIEPRs = groups.reduce((sum, g) => sum + (g.iePRs || 0), 0);

        let totalIEReviews = 0;
        let totalHRReviews = 0;
        
        groups.forEach(group => {
          if ([160680, 32113, 83907, 49310].includes(group.id)) {
                const grReviewData = reviewsData.find(r => r.id === group.id);
                if (grReviewData && grReviewData.reviewers) {
                    const groupIEsWithGH = group.ies.filter(ie => ie.github);
                    Object.entries(grReviewData.reviewers).forEach(([handle, reviews]) => {
                        const reviewCount = reviews.length;
                        totalHRReviews += reviewCount;
                        
                        const ie = groupIEsWithGH.find(i => i.github.toLowerCase() === handle.toLowerCase());
                        if (ie) {
                            totalIEReviews += reviewCount;
                        }
                    });
                }
            }
        });

        const iePercentage = totalParticipants ? ((totalInvitations / totalParticipants) * 100).toFixed(1) : 0;
        const unaffiliatedIEPercentage = totalIEs ? ((totalUnaffiliatedIEs / totalIEs) * 100).toFixed(1) : 0;
        const ieEditorPercentage = totalEditors ? ((totalIEEditors / totalEditors) * 100).toFixed(1) : 0;
        const ieHRPercentage = totalHRReviews ? ((totalIEReviews / totalHRReviews) * 100).toFixed(1) : 0;
        const iePRPercentage = globalTotalPRs ? ((globalIEPRs / globalTotalPRs) * 100).toFixed(1) : 0;

        summarySection.innerHTML = `
            <div class="summary-card">
                <h3>Total Groups</h3>
                <div class="value">${totalGroups}</div>
                <div class="label">${totalWGs} WGs, ${totalIGs} IGs</div>
            </div>
            <div class="summary-card">
                <h3>Invitations</h3>
                <div class="value">${totalInvitations}</div>
                <div class="label">${iePercentage}% of ${totalParticipants} group participations</div>
            </div>
            <div class="summary-card">
                <h3>Invited Experts</h3>
                <div class="value">${totalIEs}</div>
                <div class="label">${totalMultiGroupIEs} IEs participate in multiple groups</div>
            </div>
            <div class="summary-card">
                <h3>Unaffiliated Invited Experts</h3>
                <div class="value">${totalUnaffiliatedIEs}</div>
                <div class="label">${unaffiliatedIEPercentage}% of ${totalIEs} invited experts</div>
            </div>
            <div class="summary-card">
                <h3>IE Editors</h3>
                <div class="value">${totalIEEditors}</div>
                <div class="label">${ieEditorPercentage}% of ${totalEditors} editors</div>
            </div>
            <div class="summary-card">
                <h3>IE Chairs</h3>
                <div class="value">${totalIEChairs}</div>
                <div class="label">Out of ${totalChairs} chairs</div>
            </div>
            <div class="summary-card">
                <h3>IE PRs</h3>
                <div class="value">${globalIEPRs}</div>
                <div class="label">${iePRPercentage}% of ${globalTotalPRs} PRs</div>
            </div>
            <div class="summary-card">
                <h3>IE HR Reviews</h3>
                <div class="value">${totalIEReviews}</div>
                <div class="label">${ieHRPercentage}% of ${totalHRReviews} total reviews</div>
            </div>
        `;
    }

    function renderGroups(groups) {
        groupsList.innerHTML = '';
        groups.forEach(group => {
            const card = document.createElement('div');
            card.className = 'group-card';

            const iePercent = group.numberOfParticipants ? ((group.numberOfIE / group.numberOfParticipants) * 100).toFixed(1) : 0;
            const editorPercent = group.numberOfEditors ? ((group.numberOfIEEditors / group.numberOfEditors) * 100).toFixed(1) : 0;
            const prPercent = group.totalPRs ? ((group.iePRs / group.totalPRs) * 100).toFixed(1) : 0;
            
            // Create list of IE chairs if any
            let chairInfo = '';
            if (group.numberOfIEChairs > 0) {
                chairInfo = `<span class="badge active">${group.numberOfIEChairs} IE Chair(s)</span>`;
            }

             // Create list of IE editors if any
             let editorInfo = '';
             if (group.numberOfIEEditors > 0) {
                 editorInfo = `<span class="badge active">${group.numberOfIEEditors} IE Editor(s)</span>`;
             }

            // Horizontal Reviews Info
            let reviewInfo = '';
            if ([160680, 32113, 83907, 49310].includes(group.id)) {
                const grReviewData = reviewsData.find(r => r.id === group.id);
                if (grReviewData && grReviewData.reviewers) {
                    let ieReviews = [];
                    // Identify IEs in this group who have a github handle
                    const groupIEsWithGH = group.ies.filter(ie => ie.github);
                    
                    Object.entries(grReviewData.reviewers).forEach(([handle, reviews]) => {
                        const ie = groupIEsWithGH.find(i => i.github.toLowerCase() === handle.toLowerCase());
                        if (ie) {
                            ieReviews.push({ name: ie.name, count: reviews.length, handle: handle });
                        }
                    });

                    ieReviews.sort((a, b) => b.count - a.count);
                    
                    if (ieReviews.length > 0) {
                        const topReviewers = ieReviews.slice(0, 5).map(r => `${r.name} (${r.count})`).join(', ');
                        reviewInfo = `
                            <div class="stat-row" style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                                <div class="stat-label">
                                    <span><strong>${ieReviews.reduce((acc, r) => acc + r.count, 0)}</strong> Reviews by ${ieReviews.length} IEs</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-top: 5px;">
                                    Reviewers: ${topReviewers}
                                </div>
                            </div>
                        `;
                    } else {
                         reviewInfo = `
                            <div class="stat-row" style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                                <div class="stat-label">
                                    <span>No reviews by known IEs found</span>
                                </div>
                            </div>
                        `;
                    }
                }
            }

            const typeBadge = group.type === 'ig' 
                ? `<span class="badge" style="background-color: #673ab7; margin-right: 8px; vertical-align: middle;">IG</span>` 
                : `<span class="badge" style="background-color: #005A9C; margin-right: 8px; vertical-align: middle;">WG</span>`;

            card.innerHTML = `
                <div class="group-header">
                    <div style="display: flex; justify-content: space-between; align-items: start; gap: 10px;">
                        <div>
                            ${typeBadge}
                            <h2 style="margin:0; font-size: 1.2rem; color: var(--primary-color); display: inline; vertical-align: middle;">${group.name}</h2>
                        </div>
                        <a href="experts.html?group=${group.id}" style="font-size: 0.8rem; text-decoration: none; color: var(--primary-color); border: 1px solid var(--primary-color); padding: 4px 8px; border-radius: 4px; white-space: nowrap;" title="View Invited Experts">View IEs</a>
                    </div>
                </div>
                <div class="group-body">
                    <div class="stat-row">
                        <div class="stat-label">
                            <span>Participants</span>
                            <span><strong>${group.numberOfIE}</strong> IEs / ${group.numberOfParticipants}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${iePercent}%"></div>
                        </div>
                        <div class="stat-label" style="margin-top:2px; font-size: 0.8em; color:#888;">
                            ${iePercent}% Invited Experts
                        </div>
                    </div>

                    <div class="stat-row">
                        <div class="stat-label">
                            <span>Editors</span>
                            <span><strong>${group.numberOfIEEditors}</strong> IE Editors / ${group.numberOfEditors}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${editorPercent}%"></div>
                        </div>
                    </div>

                    <div class="stat-row">
                        <div class="stat-label">
                            <span>PRs</span>
                            <span><strong>${group.iePRs}</strong> IE PRs / ${group.totalPRs}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${prPercent}%"></div>
                        </div>
                    </div>

                    ${reviewInfo}

                    <div class="meta-stats">
                        <div class="meta-item">
                            ${chairInfo ? chairInfo : '<span class="badge">No IE Chairs</span>'}
                        </div>
                         <div class="meta-item">
                            ${editorInfo ? editorInfo : '<span class="badge">No IE Editors</span>'}
                        </div>
                    </div>
                </div>
            `;
            groupsList.appendChild(card);
        });
    }
});
