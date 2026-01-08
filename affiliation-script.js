document.addEventListener('DOMContentLoaded', async () => {
  const affiliationsList = document.getElementById('affiliations-list');
  const loading = document.getElementById('loading');
  const searchInput = document.getElementById('affiliation-search');
  
  let allAffiliationsData = [];
  const urlParams = new URLSearchParams(window.location.search);
  const idFilter = urlParams.get('id');

  try {
    const rolesData = await fetch('invited-expert-roles.json').then(r => r.json());
    allAffiliationsData = processData(rolesData);

    if (idFilter) {
      allAffiliationsData = allAffiliationsData.filter(aff => aff.href === `https://api.w3.org/affiliations/${idFilter}`);
      showFilterNotice(`Showing single affiliation view`, searchInput);
    }

    renderAffiliations(allAffiliationsData);
    loading.style.display = 'none';
  } catch (err) {
    console.error("Error loading data", err);
    loading.textContent = "Error loading data.";
  };

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allAffiliationsData.filter(aff => aff.name.toLowerCase().includes(term));
    renderAffiliations(filtered);
  });

  function processData(rolesData) {
    const affiliationsMap = new Map();
    const groupNames = new Map();

    rolesData.forEach(group => {
      groupNames.set(group.id, group.name);
      if (group.ies) {
        group.ies.forEach(ie => {
	  ie.affiliations.forEach(aff => {
	    if (!affiliationsMap.has(aff.href)) {
	      affiliationsMap.set(aff.href, {
		name: aff.name,
		href: aff.href,
		homepage: aff.homepage,
		ies: [],
		groups: []
	      });
	    }
	    const affiliation = affiliationsMap.get(aff.href);
	    if (!affiliation.groups.find(g => g.fullshortname === group.fullshortname)) {
	      affiliation.groups.push({id: group.id, fullshortname: group.fullshortname, name: group.name});
	    }
	    if (!affiliation.ies.find(iie => iie.href === ie.href)) {
	      affiliation.ies.push(ie);
	    }
	  });
	});
      }
    });

    return Array.from(affiliationsMap.values()).sort((a, b) => b.ies.length - a.ies.length || a.name.localeCompare(b.name));
  }

  function renderAffiliations(affiliations) {
    document.getElementById('count').textContent = `Showing ${affiliations.length} affiliations of Invited Experts`;
    affiliationsList.innerHTML = '';

    affiliations.forEach(aff => {
      const card = document.createElement('div');
      card.className = 'card';

      const iesHtml = aff.ies.length ? aff.ies.map(ie => `<a href='experts.html?hash=${ie.href.split('/').pop()}'>${ie.name}</a>`).join(', ') : "None";

      // Groups as links
      let groupsHtml = aff.groups.map(g => 
        `<a href="experts.html?group=${g.id}" class="badge badge-group">${g.name}</a>`
      ).join('');

      card.innerHTML = `
                <h2>
                    ${aff.homepage ? `<a href="${aff.homepage}" target="_blank">` : ''}${aff.name}${aff.homepage ? '</a>' : ''}
                </h2>
                <dl>
                <dt>Affiliated Invited Experts:</dt><dd>${iesHtml}</dd>
                <dt>IEs Participate in:</dt><dd>${groupsHtml}</dd>
                </dl>
            `;
            affiliationsList.appendChild(card);
        });
    }
});
