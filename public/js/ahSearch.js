/**
 * AH Search module - standalone auction house search with filters,
 * autocomplete, pagination, and detail modal integration.
 */
const AhSearch = (() => {
  let currentPage = 1;
  let totalResults = 0;
  let currentLimit = 50;
  let debounceTimer = null;

  const TIER_CLASSES = {
    COMMON: 'tier-common',
    UNCOMMON: 'tier-uncommon',
    RARE: 'tier-rare',
    EPIC: 'tier-epic',
    LEGENDARY: 'tier-legendary',
    MYTHIC: 'tier-mythic',
    DIVINE: 'tier-divine',
    SPECIAL: 'tier-special',
    VERY_SPECIAL: 'tier-special',
    SUPREME: 'tier-mythic',
  };

  function init() {
    const searchInput = document.getElementById('ah-search-input');
    const searchBtn = document.getElementById('ah-search-btn');
    const suggestions = document.getElementById('ah-search-suggestions');

    if (!searchInput) return;

    // Debounced autocomplete
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = searchInput.value.trim();
        if (q.length >= 2) {
          fetchSuggestions(q);
        } else {
          suggestions.style.display = 'none';
        }
      }, 300);
    });

    // Enter key triggers search
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        suggestions.style.display = 'none';
        currentPage = 1;
        search();
      }
    });

    // Search button
    searchBtn.addEventListener('click', () => {
      suggestions.style.display = 'none';
      currentPage = 1;
      search();
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ah-search-input-wrapper')) {
        suggestions.style.display = 'none';
      }
    });

    // Filter change triggers search (select elements)
    ['ah-search-tier', 'ah-search-bin', 'ah-search-recomb', 'ah-search-sort'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { currentPage = 1; search(); });
    });

    // Enchant text input: search on Enter key
    const enchantInput = document.getElementById('ah-search-enchant');
    if (enchantInput) {
      enchantInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { currentPage = 1; search(); }
      });
    }
  }

  async function fetchSuggestions(query) {
    const suggestions = document.getElementById('ah-search-suggestions');
    const data = await Api.searchItems(query);

    if (!data.success || data.items.length === 0) {
      suggestions.style.display = 'none';
      return;
    }

    let html = '';
    for (const item of data.items) {
      html += `<div class="suggestion-item" data-item-id="${escapeHtml(item.itemId)}" data-name="${escapeHtml(item.name)}">
        ${escapeHtml(item.name)} <span class="suggestion-id">${escapeHtml(item.itemId)}</span>
      </div>`;
    }

    suggestions.innerHTML = html;
    suggestions.style.display = 'block';

    // Click on suggestion
    suggestions.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('ah-search-input').value = el.dataset.name;
        document.getElementById('ah-search-input').dataset.selectedItemId = el.dataset.itemId;
        suggestions.style.display = 'none';
        currentPage = 1;
        search();
      });
    });
  }

  async function search() {
    const searchInput = document.getElementById('ah-search-input');
    const query = searchInput.value.trim();
    const selectedItemId = searchInput.dataset.selectedItemId;

    const params = {
      page: currentPage,
      limit: currentLimit,
    };

    // If we have a selected item ID from autocomplete, use exact match
    if (selectedItemId && query === (searchInput.dataset.lastSelectedName || '')) {
      params.itemId = selectedItemId;
    } else {
      // Clear selected item ID if user typed something different
      searchInput.dataset.selectedItemId = '';
      if (query) params.query = query;
    }

    // Collect filters
    const tier = document.getElementById('ah-search-tier').value;
    const bin = document.getElementById('ah-search-bin').value;
    const minPrice = document.getElementById('ah-search-minPrice').value.trim();
    const maxPrice = document.getElementById('ah-search-maxPrice').value.trim();
    const recomb = document.getElementById('ah-search-recomb').value;
    const minStars = document.getElementById('ah-search-minStars').value.trim();
    const enchant = document.getElementById('ah-search-enchant').value.trim();
    const sort = document.getElementById('ah-search-sort').value;

    if (tier) params.tier = tier;
    if (bin) params.bin = bin;
    if (minPrice) params.minPrice = NumberFormat.parse(minPrice);
    if (maxPrice) params.maxPrice = NumberFormat.parse(maxPrice);
    if (recomb) params.recomb = recomb;
    if (minStars) params.minStars = minStars;
    if (enchant) params.enchant = enchant;
    if (sort) params.sort = sort;

    // Show loading
    const resultsDiv = document.getElementById('ah-search-results');
    resultsDiv.innerHTML = '<p class="loading-msg loading-pulse">Suche...</p>';

    const data = await Api.searchAuctions(params);

    if (!data.success) {
      resultsDiv.innerHTML = '<p class="loading-msg">Fehler bei der Suche.</p>';
      return;
    }

    totalResults = data.totalResults;
    renderResults(data.auctions);
    renderPagination();
  }

  function renderResults(auctions) {
    const resultsDiv = document.getElementById('ah-search-results');

    if (auctions.length === 0) {
      resultsDiv.innerHTML = '<p class="loading-msg">Keine Auktionen gefunden.</p>';
      return;
    }

    let html = `<table class="flip-table ah-search-table">
      <thead><tr>
        <th>#</th>
        <th>Item</th>
        <th>Tier</th>
        <th>Preis</th>
        <th>Typ</th>
        <th>Upgrades</th>
        <th>Zeit</th>
        <th>LBIN</th>
      </tr></thead><tbody>`;

    const startIdx = (currentPage - 1) * currentLimit;

    auctions.forEach((auc, i) => {
      const tierClass = TIER_CLASSES[auc.tier] || 'tier-common';
      const typeLabel = auc.bin ? 'BIN' : 'Auktion';
      const typeClass = auc.bin ? 'type-bin' : 'type-auction';

      // Upgrades summary
      let upgradeStr = '';
      if (auc.upgrades) {
        const parts = [];
        if (auc.upgrades.enchantments) parts.push(Object.keys(auc.upgrades.enchantments).length + ' Ench');
        if (auc.upgrades.hotPotatoCount > 0) parts.push(auc.upgrades.hotPotatoCount + ' HPB');
        if (auc.upgrades.recombobulated) parts.push('Recomb');
        if (auc.upgrades.stars > 0) parts.push(auc.upgrades.stars + '\u2B50');
        if (auc.upgrades.reforge) parts.push(auc.upgrades.reforge);
        if (auc.upgrades.artOfWar > 0) parts.push('AoW');
        if (auc.upgrades.woodSingularity > 0) parts.push('WS');
        if (auc.upgrades.manaDisintegrator > 0) parts.push(auc.upgrades.manaDisintegrator + ' MD');
        if (auc.upgrades.tunedTransmission > 0) parts.push(auc.upgrades.tunedTransmission + ' TT');
        upgradeStr = parts.join(', ');
      }

      // Time
      let timeStr = '';
      if (!auc.bin && auc.end > 0) {
        const remaining = Math.max(0, Math.floor((auc.end - Date.now()) / 60000));
        if (remaining < 60) timeStr = remaining + 'm verbl.';
        else timeStr = Math.floor(remaining / 60) + 'h ' + (remaining % 60) + 'm';
      } else {
        if (auc.ageMinutes < 60) timeStr = auc.ageMinutes + 'm';
        else timeStr = Math.floor(auc.ageMinutes / 60) + 'h ' + (auc.ageMinutes % 60) + 'm';
      }

      // Pet info in name
      let displayName = escapeHtml(auc.itemName);
      if (auc.petInfo && auc.petInfo.level) {
        displayName = `<span class="pet-level">Lv${auc.petInfo.level}</span> ${displayName}`;
      }

      const lbinStr = auc.lbin > 0 ? NumberFormat.short(auc.lbin) : '-';

      html += `<tr>
        <td class="col-rank">${startIdx + i + 1}</td>
        <td class="col-item col-item-clickable" data-search-index="${i}" title="Klick: Details">
          ${displayName}
        </td>
        <td class="col-tier ${tierClass}">${escapeHtml(auc.tier)}</td>
        <td>${NumberFormat.short(auc.price)}</td>
        <td class="col-type ${typeClass}">${typeLabel}</td>
        <td class="col-upgrades">${upgradeStr || '-'}</td>
        <td class="col-age">${timeStr}</td>
        <td>${lbinStr}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    resultsDiv.innerHTML = html;

    // Click handlers for detail modal
    resultsDiv.querySelectorAll('.col-item-clickable').forEach(td => {
      td.addEventListener('click', () => {
        const idx = parseInt(td.dataset.searchIndex, 10);
        const auc = auctions[idx];
        if (auc && typeof FlipRenderer !== 'undefined') {
          const lbin = auc.lbin > 0 ? auc.lbin : auc.price;
          const upgradeValue = auc.upgradeValue || 0;
          const estimatedValue = upgradeValue > 0 ? lbin + upgradeValue : lbin;

          FlipRenderer.showItemDetailModal({
            uuid: auc.uuid,
            itemId: auc.itemId,
            itemName: auc.itemName,
            tier: auc.tier,
            buyPrice: auc.price,
            lowestBin: lbin,
            netProfit: lbin > 0 ? lbin - auc.price : 0,
            profitPercent: lbin > 0 ? ((lbin - auc.price) / auc.price) * 100 : 0,
            upgrades: auc.upgrades || null,
            upgradeBreakdown: auc.upgradeBreakdown || null,
            upgradeInfo: upgradeValue > 0 ? {
              hasUpgrades: true,
              upgradeValue,
              basePrice: lbin,
              estimatedTrueValue: estimatedValue,
            } : null,
            petInfo: auc.petInfo || null,
            flipType: auc.bin ? 'bin' : 'auction',
          });
        }
      });
    });
  }

  function renderPagination() {
    const paginationDiv = document.getElementById('ah-search-pagination');
    const totalPages = Math.ceil(totalResults / currentLimit);

    if (totalPages <= 1) {
      paginationDiv.innerHTML = totalResults > 0
        ? `<span class="pagination-info">${totalResults} Ergebnisse</span>`
        : '';
      return;
    }

    let html = `<span class="pagination-info">${totalResults} Ergebnisse - Seite ${currentPage} von ${totalPages}</span>`;
    html += `<div class="pagination-buttons">`;

    if (currentPage > 1) {
      html += `<button class="detail-btn detail-btn-search pagination-btn" data-page="${currentPage - 1}">Zurueck</button>`;
    }
    if (currentPage < totalPages) {
      html += `<button class="detail-btn detail-btn-search pagination-btn" data-page="${currentPage + 1}">Weiter</button>`;
    }

    html += `</div>`;
    paginationDiv.innerHTML = html;

    paginationDiv.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page, 10);
        search();
      });
    });
  }

  /**
   * Programmatic search by item ID (called from detail modal).
   * Switches to AH Search tab and performs search.
   */
  function searchByItemId(itemId) {
    // Switch to ahsearch tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const ahSearchTab = document.querySelector('.tab[data-tab="ahsearch"]');
    if (ahSearchTab) {
      ahSearchTab.classList.add('active');
      ahSearchTab.click();
    }

    const searchInput = document.getElementById('ah-search-input');
    if (searchInput) {
      searchInput.value = itemId.replace(/_/g, ' ');
      searchInput.dataset.selectedItemId = itemId;
      searchInput.dataset.lastSelectedName = searchInput.value;
    }

    currentPage = 1;
    search();
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init,
    search,
    searchByItemId,
  };
})();
