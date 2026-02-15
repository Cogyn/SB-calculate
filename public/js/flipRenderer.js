/**
 * Flip table renderer - renders filtered and sorted flips into the DOM.
 * Supports bazaar, AH (bin/auction/both), AH craft, and craft flip types
 * with dynamic table headers and pet-level badges.
 */
const FlipRenderer = (() => {
  let bazaarFlips = [];
  let ahFlips = [];
  let craftFlips = [];
  let ahCraftFlips = [];
  let lastUpdate = 0;
  let bazaarDataReceived = false;
  let ahDataReceived = false;
  let craftDataReceived = false;
  let ahCraftDataReceived = false;

  function setBazaarData(flips, updateTimestamp) {
    bazaarFlips = flips || [];
    lastUpdate = updateTimestamp || lastUpdate;
    bazaarDataReceived = true;
  }

  function setAhData(flips, updateTimestamp) {
    ahFlips = flips || [];
    lastUpdate = updateTimestamp || lastUpdate;
    ahDataReceived = true;
  }

  function setCraftData(flips, updateTimestamp) {
    craftFlips = flips || [];
    lastUpdate = updateTimestamp || lastUpdate;
    craftDataReceived = true;
  }

  function setAhCraftData(flips, updateTimestamp) {
    ahCraftFlips = flips || [];
    lastUpdate = updateTimestamp || lastUpdate;
    ahCraftDataReceived = true;
  }

  // Keep backward compat
  function setData(flips, updateTimestamp) {
    setBazaarData(flips, updateTimestamp);
  }

  // --- Table header definitions ---
  const BAZAAR_COLUMNS = [
    { key: 'rank', label: '#' },
    { key: 'item', label: 'Item' },
    { key: 'type', label: 'Typ' },
    { key: 'buy', label: 'Kauf' },
    { key: 'sell', label: 'Verkauf' },
    { key: 'profit', label: 'Profit' },
    { key: 'percent', label: '%' },
    { key: 'volume', label: 'Volume/Tag' },
    { key: 'profitHr', label: 'Profit/hr' },
  ];

  const AH_COLUMNS = [
    { key: 'rank', label: '#' },
    { key: 'item', label: 'Item' },
    { key: 'flipType', label: 'Typ' },
    { key: 'tier', label: 'Tier' },
    { key: 'buy', label: 'Kauf' },
    { key: 'lbin', label: 'Lowest BIN' },
    { key: 'profit', label: 'Net Profit' },
    { key: 'percent', label: '%' },
    { key: 'score', label: 'Score' },
    { key: 'sales', label: 'Sales/Tag' },
    { key: 'fees', label: 'Fees' },
    { key: 'timeCol', label: 'Zeit' },
  ];

  const CRAFT_COLUMNS = [
    { key: 'rank', label: '#' },
    { key: 'item', label: 'Item' },
    { key: 'cost', label: 'Craft Cost' },
    { key: 'sell', label: 'Verkauf' },
    { key: 'profit', label: 'Profit' },
    { key: 'percent', label: '%' },
    { key: 'volume', label: 'Volume/Tag' },
    { key: 'ingredients', label: 'Zutaten' },
  ];

  const AHCRAFT_COLUMNS = [
    { key: 'rank', label: '#' },
    { key: 'item', label: 'Item' },
    { key: 'cost', label: 'Craft Cost' },
    { key: 'sell', label: 'Sell (LBIN)' },
    { key: 'profit', label: 'Profit' },
    { key: 'percent', label: '%' },
    { key: 'ingredients', label: 'Zutaten (Quelle)' },
  ];

  /**
   * Update the table header based on active tab.
   */
  function updateTableHeader(activeTab) {
    const thead = document.querySelector('.flip-table thead tr');
    if (!thead) return;

    let columns;
    if (activeTab === 'ah') {
      columns = AH_COLUMNS;
    } else if (activeTab === 'craft') {
      columns = CRAFT_COLUMNS;
    } else if (activeTab === 'ahcraft') {
      columns = AHCRAFT_COLUMNS;
    } else {
      columns = BAZAAR_COLUMNS;
    }

    thead.innerHTML = columns.map(col => `<th>${col.label}</th>`).join('');
  }

  /**
   * Get column count for empty row colspan.
   */
  function getColSpan(activeTab) {
    if (activeTab === 'ah') return AH_COLUMNS.length;
    if (activeTab === 'craft') return CRAFT_COLUMNS.length;
    if (activeTab === 'ahcraft') return AHCRAFT_COLUMNS.length;
    return BAZAAR_COLUMNS.length;
  }

  // --- Tier color mapping ---
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

  // --- Bazaar filtering & sorting ---

  function getFilteredBazaarFlips(activeTab, searchQuery) {
    const taxRate = Settings.getTaxRate();
    const sortBy = Settings.getSortBy();
    const resultCount = Settings.getResultCount();

    let flips = bazaarFlips;

    // Filter by tab type ('order' tab shows both order and instant flips)
    if (activeTab === 'order') {
      flips = flips.filter(f => f.type === 'order' || f.type === 'instant');
    } else {
      flips = flips.filter(f => f.type === activeTab);
    }

    // Apply per-category filter (only when advanced mode is on and values > 0)
    if (Settings.getAdvancedMode()) {
      const catFilters = Settings.getCategorySettings(activeTab);
      flips = flips.filter(f => {
        const profit = recalcProfit(f, taxRate);
        const profitPct = f.investment > 0 ? (profit / f.investment) * 100 : 0;
        if (catFilters.minProfit > 0 && profit < catFilters.minProfit) return false;
        if (catFilters.minProfitPercent > 0 && profitPct < catFilters.minProfitPercent) return false;
        if (catFilters.minVolume > 0 && f.dailyVolume < catFilters.minVolume) return false;
        if (catFilters.maxInvestment > 0 && f.investment > catFilters.maxInvestment) return false;
        return true;
      });
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      flips = flips.filter(f =>
        f.displayName.toLowerCase().includes(q) ||
        f.productId.toLowerCase().includes(q)
      );
    }

    // Recalculate profit with client tax rate and sort
    flips = flips.map(f => ({
      ...f,
      _profit: recalcProfit(f, taxRate),
      _profitPercent: recalcProfitPercent(f, taxRate),
      _profitPerHour: recalcProfitPerHour(f, taxRate),
    }));

    // Sort
    if (sortBy === 'profit') {
      flips.sort((a, b) => b._profit - a._profit);
    } else if (sortBy === 'profitPercent') {
      flips.sort((a, b) => b._profitPercent - a._profitPercent);
    } else {
      flips.sort((a, b) => {
        const ephA = b._profitPerHour > 0 ? b._profitPerHour : b._profit * 0.001;
        const ephB = a._profitPerHour > 0 ? a._profitPerHour : a._profit * 0.001;
        return ephA - ephB;
      });
    }

    // Limit results
    if (resultCount > 0) {
      flips = flips.slice(0, resultCount);
    }

    return flips;
  }

  // --- AH filtering ---

  function getFilteredAhFlips(searchQuery) {
    const catFilters = Settings.getCategorySettings('ah');
    const sortBy = Settings.getSortBy();
    const resultCount = Settings.getResultCount();

    let flips = ahFlips;

    // Apply AH filters (only when advanced mode is on and values > 0)
    if (Settings.getAdvancedMode()) {
      flips = flips.filter(f => {
        if (catFilters.minProfit > 0 && f.netProfit < catFilters.minProfit) return false;
        if (catFilters.minProfitPercent > 0 && f.profitPercent < catFilters.minProfitPercent) return false;
        if (catFilters.maxInvestment > 0 && f.buyPrice > catFilters.maxInvestment) return false;
        return true;
      });
    }

    // Search filter (supports pet level search like "lv100" or "griffin legendary")
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      flips = flips.filter(f => {
        if (f.itemName.toLowerCase().includes(q)) return true;
        if (f.itemId.toLowerCase().includes(q)) return true;
        // Pet search: "lv100", "pet lv100", etc.
        if (f.petInfo) {
          const petStr = `pet lv${f.petInfo.level} ${f.petInfo.type} ${f.petInfo.tier}`.toLowerCase();
          if (petStr.includes(q)) return true;
        }
        return false;
      });
    }

    // Sort
    if (sortBy === 'profitPercent') {
      flips.sort((a, b) => b.profitPercent - a.profitPercent);
    } else if (sortBy === 'sellability') {
      flips.sort((a, b) => {
        const sa = (a.sellabilityScore || 0);
        const sb = (b.sellabilityScore || 0);
        return sb - sa;
      });
    } else {
      // Default: sort by netProfit
      flips.sort((a, b) => b.netProfit - a.netProfit);
    }

    // Limit results
    if (resultCount > 0) {
      flips = flips.slice(0, resultCount);
    }

    return flips;
  }

  // --- Craft filtering ---

  function getFilteredCraftFlips(searchQuery) {
    const catFilters = Settings.getCategorySettings('craft');
    const sortBy = Settings.getSortBy();
    const resultCount = Settings.getResultCount();

    let flips = craftFlips;

    if (Settings.getAdvancedMode()) {
      flips = flips.filter(f => {
        if (catFilters.minProfit > 0 && f.profit < catFilters.minProfit) return false;
        if (catFilters.minProfitPercent > 0 && f.profitPercent < catFilters.minProfitPercent) return false;
        return true;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      flips = flips.filter(f =>
        f.displayName.toLowerCase().includes(q) ||
        f.itemId.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'profitPercent') {
      flips.sort((a, b) => b.profitPercent - a.profitPercent);
    } else {
      flips.sort((a, b) => b.profit - a.profit);
    }

    if (resultCount > 0) {
      flips = flips.slice(0, resultCount);
    }

    return flips;
  }

  // --- AH Craft filtering ---

  function getFilteredAhCraftFlips(searchQuery) {
    const catFilters = Settings.getCategorySettings('ahcraft');
    const sortBy = Settings.getSortBy();
    const resultCount = Settings.getResultCount();

    let flips = ahCraftFlips;

    if (Settings.getAdvancedMode()) {
      flips = flips.filter(f => {
        if (catFilters.minProfit > 0 && f.profit < catFilters.minProfit) return false;
        if (catFilters.minProfitPercent > 0 && f.profitPercent < catFilters.minProfitPercent) return false;
        return true;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      flips = flips.filter(f =>
        f.displayName.toLowerCase().includes(q) ||
        f.itemId.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'profitPercent') {
      flips.sort((a, b) => b.profitPercent - a.profitPercent);
    } else {
      flips.sort((a, b) => b.profit - a.profit);
    }

    if (resultCount > 0) {
      flips = flips.slice(0, resultCount);
    }

    return flips;
  }

  // --- Recalculation helpers ---

  function recalcProfit(flip, taxRate) {
    if (flip.type === 'npc') {
      return flip.sellPrice - flip.buyPrice;
    }
    const afterTax = flip.sellPrice * (1.0 - taxRate / 100.0);
    return afterTax - flip.buyPrice;
  }

  function recalcProfitPercent(flip, taxRate) {
    const profit = recalcProfit(flip, taxRate);
    if (flip.investment <= 0) return 0;
    return (profit / flip.investment) * 100;
  }

  function recalcProfitPerHour(flip, taxRate) {
    const profit = recalcProfit(flip, taxRate);
    if (flip.dailyVolume <= 0 || flip.investment <= 0) return 0;
    const unitsPerHour = flip.dailyVolume / 24.0;
    return profit * unitsPerHour;
  }

  function isManipulated(flip) {
    return flip._profitPercent > 50
      && flip.dailyVolume < 5000
      && (flip.sellOrders + flip.buyOrders) < 50;
  }

  function volumeLevel(dailyVolume) {
    if (dailyVolume >= 50000) return 'volume-high';
    if (dailyVolume >= 10000) return 'volume-mid';
    return 'volume-low';
  }

  /**
   * Format item name with pet level badge if applicable.
   */
  function formatItemName(name, petInfo) {
    let display = escapeHtml(name);
    if (petInfo && petInfo.level) {
      display = `<span class="pet-level">Lv${petInfo.level}</span> ${display}`;
    }
    return display;
  }

  // --- Render functions ---

  /**
   * Main render dispatcher. Delegates to the correct renderer based on tab.
   */
  function render(activeTab, searchQuery) {
    updateTableHeader(activeTab);

    let renderedFlips;
    if (activeTab === 'ah') {
      renderedFlips = getFilteredAhFlips(searchQuery);
      renderAh(searchQuery);
    } else if (activeTab === 'craft') {
      renderedFlips = getFilteredCraftFlips(searchQuery);
      renderCraft(searchQuery);
    } else if (activeTab === 'ahcraft') {
      renderedFlips = getFilteredAhCraftFlips(searchQuery);
      renderAhCraft(searchQuery);
    } else {
      renderedFlips = getFilteredBazaarFlips(activeTab, searchQuery);
      renderBazaar(activeTab, searchQuery);
    }

    updateSummary(activeTab, renderedFlips);
  }

  /**
   * Render bazaar flips (order, instant, npc, all).
   */
  function renderBazaar(activeTab, searchQuery) {
    const tbody = document.getElementById('flip-table-body');
    if (!tbody) return;

    const flips = getFilteredBazaarFlips(activeTab, searchQuery);

    if (flips.length === 0) {
      const msg = !bazaarDataReceived
        ? '<span class="loading-pulse">Lade Daten...</span>'
        : 'Keine Flips gefunden.';
      tbody.innerHTML = `<tr><td colspan="${getColSpan(activeTab)}" class="loading-msg">${msg}</td></tr>`;
      return;
    }

    let html = '';
    flips.forEach((flip, i) => {
      const profitClass = flip._profit >= 0 ? 'profit-positive' : 'profit-negative';
      const typeClass = 'type-' + flip.type;
      const typeName = flip.type === 'order' ? 'Order' : flip.type === 'instant' ? 'Instant' : 'NPC';
      const volLevel = volumeLevel(flip.dailyVolume);
      const manipulated = isManipulated(flip);

      html += `<tr>
        <td class="col-rank">${i + 1}</td>
        <td class="col-item" data-product="${escapeHtml(flip.productId)}" data-copy="/bz ${escapeHtml(flip.productId)}" title="Klick: /bz ${escapeHtml(flip.productId)} kopieren">
          ${escapeHtml(flip.displayName)}${manipulated ? '<span class="manipulation-warning" title="Moegliche Manipulation: hoher Profit, niedriges Volume">&#9888;</span>' : ''}
          <span class="copy-hint">/bz ${escapeHtml(flip.productId)}</span>
        </td>
        <td class="col-type ${typeClass}">${typeName}</td>
        <td>${NumberFormat.short(flip.buyPrice)}</td>
        <td>${NumberFormat.short(flip.sellPrice)}</td>
        <td class="col-profit ${profitClass}">${NumberFormat.short(flip._profit)}</td>
        <td class="col-percent ${profitClass}">${NumberFormat.percent(flip._profitPercent)}</td>
        <td><span class="volume-bar ${volLevel}"></span>${NumberFormat.short(flip.dailyVolume)}</td>
        <td class="${profitClass}">${NumberFormat.short(flip._profitPerHour)}/hr</td>
      </tr>`;
    });

    tbody.innerHTML = html;
    attachCopyHandlers(tbody);
  }

  /**
   * Render AH flips with type column (BIN/Auction) and pet-level badges.
   */
  function renderAh(searchQuery) {
    const tbody = document.getElementById('flip-table-body');
    if (!tbody) return;

    const flips = getFilteredAhFlips(searchQuery);

    if (flips.length === 0) {
      const msg = !ahDataReceived
        ? '<span class="loading-pulse">Lade AH Daten...</span>'
        : 'Keine AH Flips gefunden.';
      tbody.innerHTML = `<tr><td colspan="${getColSpan('ah')}" class="loading-msg">${msg}</td></tr>`;
      return;
    }

    let html = '';
    flips.forEach((flip, i) => {
      const profitClass = flip.netProfit >= 0 ? 'profit-positive' : 'profit-negative';
      const tierClass = TIER_CLASSES[flip.tier] || 'tier-common';
      const totalFees = flip.listingFee + flip.claimTax;

      // Flip type display
      const flipTypeLabel = flip.flipType === 'auction' ? 'Auction' : 'BIN';
      const flipTypeClass = flip.flipType === 'auction' ? 'type-auction' : 'type-bin';

      // Time column: Age for BIN, Remaining for Auction
      let timeStr;
      if (flip.flipType === 'auction' && flip.remainingMinutes !== undefined) {
        if (flip.remainingMinutes < 60) {
          timeStr = flip.remainingMinutes + 'm verbl.';
        } else {
          timeStr = Math.floor(flip.remainingMinutes / 60) + 'h ' + (flip.remainingMinutes % 60) + 'm verbl.';
        }
      } else {
        if (flip.ageMinutes < 60) {
          timeStr = flip.ageMinutes + 'm';
        } else {
          timeStr = Math.floor(flip.ageMinutes / 60) + 'h ' + (flip.ageMinutes % 60) + 'm';
        }
      }

      // Buy column label varies
      const buyLabel = flip.flipType === 'auction' ? flip.buyPrice : flip.buyPrice;

      // Score display
      const scoreVal = flip.sellabilityScore != null ? Math.round(flip.sellabilityScore * 100) : 0;
      const confLabel = flip.confidenceLabel || 'VERY_LOW';
      const scoreClass = confLabel === 'HIGH' ? 'score-high' : confLabel === 'MEDIUM' ? 'score-mid' : 'score-low';
      const salesDisplay = flip.dailySales != null ? flip.dailySales : 0;

      html += `<tr>
        <td class="col-rank">${i + 1}</td>
        <td class="col-item col-item-clickable" data-flip-index="${i}" title="Klick: Details anzeigen">
          ${formatItemName(flip.itemName, flip.petInfo)}
          <span class="copy-hint">Details anzeigen</span>
        </td>
        <td class="col-type ${flipTypeClass}">${flipTypeLabel}</td>
        <td class="col-tier ${tierClass}">${flip.tier}</td>
        <td>${NumberFormat.short(buyLabel)}</td>
        <td>${NumberFormat.short(flip.lowestBin)}</td>
        <td class="col-profit ${profitClass}">${NumberFormat.short(flip.netProfit)}</td>
        <td class="col-percent ${profitClass}">${NumberFormat.percent(flip.profitPercent)}</td>
        <td class="col-score ${scoreClass}">${scoreVal}</td>
        <td class="col-sales">${salesDisplay}</td>
        <td class="col-fees">${NumberFormat.short(totalFees)}</td>
        <td class="col-age">${timeStr}</td>
      </tr>`;
    });

    currentAhFlips = flips;
    tbody.innerHTML = html;
    attachCopyHandlers(tbody, flips);
  }

  /**
   * Render Craft flips.
   */
  function renderCraft(searchQuery) {
    const tbody = document.getElementById('flip-table-body');
    if (!tbody) return;

    const flips = getFilteredCraftFlips(searchQuery);

    if (flips.length === 0) {
      const msg = !craftDataReceived
        ? '<span class="loading-pulse">Lade Craft Daten...</span>'
        : 'Keine Craft Flips gefunden.';
      tbody.innerHTML = `<tr><td colspan="${getColSpan('craft')}" class="loading-msg">${msg}</td></tr>`;
      return;
    }

    let html = '';
    flips.forEach((flip, i) => {
      const profitClass = flip.profit >= 0 ? 'profit-positive' : 'profit-negative';
      const volLevel = volumeLevel(flip.dailyVolume);

      let ingredientStr = '';
      if (flip.ingredients && flip.ingredients.length > 0) {
        ingredientStr = flip.ingredients.map(ing =>
          `${ing.amount}x ${escapeHtml(ing.name)}`
        ).join(', ');
      }

      html += `<tr>
        <td class="col-rank">${i + 1}</td>
        <td class="col-item" data-copy="/bz ${escapeHtml(flip.itemId)}" title="Klick: /bz ${escapeHtml(flip.itemId)} kopieren">
          ${escapeHtml(flip.displayName)}${flip.resultCount > 1 ? ' x' + flip.resultCount : ''}
          <span class="copy-hint">/bz ${escapeHtml(flip.itemId)}</span>
        </td>
        <td>${NumberFormat.short(flip.craftCost)}</td>
        <td>${NumberFormat.short(flip.sellPrice)}</td>
        <td class="col-profit ${profitClass}">${NumberFormat.short(flip.profit)}</td>
        <td class="col-percent ${profitClass}">${NumberFormat.percent(flip.profitPercent)}</td>
        <td><span class="volume-bar ${volLevel}"></span>${NumberFormat.short(flip.dailyVolume)}</td>
        <td class="col-ingredients" title="${escapeHtml(ingredientStr)}">${escapeHtml(ingredientStr)}</td>
      </tr>`;
    });

    tbody.innerHTML = html;
    attachCopyHandlers(tbody);
  }

  /**
   * Render AH Craft flips with ingredient sources (BZ/AH).
   */
  function renderAhCraft(searchQuery) {
    const tbody = document.getElementById('flip-table-body');
    if (!tbody) return;

    const flips = getFilteredAhCraftFlips(searchQuery);

    if (flips.length === 0) {
      const msg = !ahCraftDataReceived
        ? '<span class="loading-pulse">Lade AH Craft Daten...</span>'
        : 'Keine AH Craft Flips gefunden.';
      tbody.innerHTML = `<tr><td colspan="${getColSpan('ahcraft')}" class="loading-msg">${msg}</td></tr>`;
      return;
    }

    let html = '';
    flips.forEach((flip, i) => {
      const profitClass = flip.profit >= 0 ? 'profit-positive' : 'profit-negative';

      let ingredientStr = '';
      if (flip.ingredients && flip.ingredients.length > 0) {
        ingredientStr = flip.ingredients.map(ing => {
          const src = ing.source === 'ah' ? 'AH' : 'BZ';
          return `${ing.amount}x ${escapeHtml(ing.name)} [${src}]`;
        }).join(', ');
      }

      html += `<tr>
        <td class="col-rank">${i + 1}</td>
        <td class="col-item" title="${escapeHtml(flip.itemId)}">
          ${escapeHtml(flip.displayName)}${flip.resultCount > 1 ? ' x' + flip.resultCount : ''}
        </td>
        <td>${NumberFormat.short(flip.craftCost)}</td>
        <td>${NumberFormat.short(flip.sellPrice)}</td>
        <td class="col-profit ${profitClass}">${NumberFormat.short(flip.profit)}</td>
        <td class="col-percent ${profitClass}">${NumberFormat.percent(flip.profitPercent)}</td>
        <td class="col-ingredients" title="${escapeHtml(ingredientStr)}">${escapeHtml(ingredientStr)}</td>
      </tr>`;
    });

    tbody.innerHTML = html;
    attachCopyHandlers(tbody);
  }

  /**
   * Attach click-to-copy handlers on all .col-item cells.
   * For AH flips, clicking opens the detail modal instead.
   */
  function attachCopyHandlers(tbody, flipData) {
    tbody.querySelectorAll('.col-item').forEach(td => {
      if (flipData && td.dataset.flipIndex !== undefined) {
        // AH item: open detail modal
        td.addEventListener('click', () => {
          const idx = parseInt(td.dataset.flipIndex, 10);
          if (flipData[idx]) showItemDetailModal(flipData[idx]);
        });
      } else {
        td.addEventListener('click', () => {
          const text = td.dataset.copy || '';
          if (!text) return;
          navigator.clipboard.writeText(text).then(() => {
            showCopyToast(text);
          }).catch(() => {});
        });
      }
    });
  }

  // --- Item Detail Modal ---

  /** Currently displayed flips for referencing by index */
  let currentAhFlips = [];

  function showItemDetailModal(flip) {
    // Remove any existing modal
    closeItemDetailModal();

    const overlay = document.createElement('div');
    overlay.className = 'item-detail-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeItemDetailModal();
    });

    const tierClass = TIER_CLASSES[flip.tier] || 'tier-common';

    let html = `<div class="item-detail-modal">
      <div class="detail-header">
        <div class="detail-title">
          <span class="${tierClass} detail-item-name">${formatItemName(flip.itemName, flip.petInfo)}</span>
          <span class="detail-tier-badge ${tierClass}">${escapeHtml(flip.tier)}</span>
        </div>
        <button class="detail-close">&times;</button>
      </div>
      <div class="detail-body">`;

    // --- Enchantments Section ---
    if (flip.upgradeBreakdown && flip.upgradeBreakdown.enchantmentDetails && flip.upgradeBreakdown.enchantmentDetails.length > 0) {
      html += `<div class="detail-section">
        <h4>Enchantments</h4>
        <table class="detail-enchant-table">
          <thead><tr><th>Enchantment</th><th>Level</th><th>Bazaar Preis</th></tr></thead>
          <tbody>`;
      for (const ench of flip.upgradeBreakdown.enchantmentDetails) {
        const priceStr = ench.price > 0 ? NumberFormat.short(ench.price) : '-';
        html += `<tr>
          <td>${escapeHtml(ench.name.replace(/_/g, ' '))}</td>
          <td>${ench.level}</td>
          <td>${priceStr}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
    }

    // --- Upgrades Section ---
    if (flip.upgrades || flip.upgradeBreakdown) {
      html += `<div class="detail-section"><h4>Upgrades</h4><div class="detail-upgrade-list">`;

      const ups = flip.upgrades || {};
      const bd = flip.upgradeBreakdown || {};

      if (bd.hotPotatoDetails) {
        const hpd = bd.hotPotatoDetails;
        html += `<div class="detail-upgrade-row">
          <span>Hot Potato Books</span>
          <span>${hpd.normalCount}x HPB${hpd.fumingCount > 0 ? ' + ' + hpd.fumingCount + 'x Fuming' : ''}</span>
          <span>${NumberFormat.short(hpd.totalValue)}</span>
        </div>`;
      }

      html += `<div class="detail-upgrade-row">
        <span>Recombobulator</span>
        <span>${ups.recombobulated ? 'Ja' : 'Nein'}</span>
        <span>${bd.recombobulatorPrice > 0 ? NumberFormat.short(bd.recombobulatorPrice) : '-'}</span>
      </div>`;

      if (ups.artOfWar > 0) {
        html += `<div class="detail-upgrade-row">
          <span>Art of War</span>
          <span>Ja</span>
          <span>${bd.artOfWarPrice > 0 ? NumberFormat.short(bd.artOfWarPrice) : '-'}</span>
        </div>`;
      }

      if (ups.stars > 0) {
        let starPriceStr = '-';
        if (bd.starDetails && bd.starDetails.totalEssenceCost > 0) {
          starPriceStr = NumberFormat.short(bd.starDetails.totalEssenceCost);
        }
        html += `<div class="detail-upgrade-row">
          <span>Stars</span>
          <span>${ups.stars}${bd.starDetails ? ' (' + bd.starDetails.essenceAmount + ' ' + (bd.starDetails.essenceType || '') + ')' : ''}</span>
          <span>${starPriceStr}</span>
        </div>`;
        // Show master star items if present
        if (bd.starDetails && bd.starDetails.masterStarCosts) {
          for (const ms of bd.starDetails.masterStarCosts) {
            if (ms.price > 0) {
              html += `<div class="detail-upgrade-row" style="padding-left:20px;">
                <span style="font-size:12px;">Master Star ${ms.star - 5}</span>
                <span style="font-size:12px;">${escapeHtml(ms.itemId)}</span>
                <span>${NumberFormat.short(ms.price)}</span>
              </div>`;
            }
          }
        }
      }

      if (ups.reforge) {
        let reforgePriceStr = '-';
        let reforgeDesc = escapeHtml(ups.reforge);
        if (bd.reforgeDetails) {
          if (bd.reforgeDetails.totalCost > 0) {
            reforgePriceStr = NumberFormat.short(bd.reforgeDetails.totalCost);
          }
          if (bd.reforgeDetails.stoneName) {
            reforgeDesc += ' (' + escapeHtml(bd.reforgeDetails.stoneName) + ')';
          }
        }
        html += `<div class="detail-upgrade-row">
          <span>Reforge</span>
          <span>${reforgeDesc}</span>
          <span>${reforgePriceStr}</span>
        </div>`;
      }

      if (ups.woodSingularity > 0) {
        html += `<div class="detail-upgrade-row">
          <span>Wood Singularity</span>
          <span>Ja</span>
          <span>${bd.woodSingularityPrice > 0 ? NumberFormat.short(bd.woodSingularityPrice) : '-'}</span>
        </div>`;
      }

      if (ups.manaDisintegrator > 0) {
        html += `<div class="detail-upgrade-row">
          <span>Mana Disintegrator</span>
          <span>${ups.manaDisintegrator}x</span>
          <span>${bd.manaDisintegratorPrice > 0 ? NumberFormat.short(bd.manaDisintegratorPrice) : '-'}</span>
        </div>`;
      }

      if (ups.tunedTransmission > 0) {
        html += `<div class="detail-upgrade-row">
          <span>Tuned Transmission</span>
          <span>${ups.tunedTransmission}x</span>
          <span>${bd.tunedTransmissionPrice > 0 ? NumberFormat.short(bd.tunedTransmissionPrice) : '-'}</span>
        </div>`;
      }

      html += `</div></div>`;
    }

    // --- Price Analysis Section ---
    html += `<div class="detail-section"><h4>Preisanalyse</h4><div class="detail-price-list">`;

    const basePrice = flip.upgradeInfo ? flip.upgradeInfo.basePrice : flip.lowestBin;
    const upgradeValue = flip.upgradeInfo ? flip.upgradeInfo.upgradeValue : 0;
    const estimatedValue = flip.upgradeInfo ? flip.upgradeInfo.estimatedTrueValue : flip.lowestBin;

    html += `<div class="detail-price-row">
      <span>Base LBIN</span><span>${NumberFormat.short(basePrice)}</span>
    </div>`;
    if (upgradeValue > 0) {
      html += `<div class="detail-price-row">
        <span>Upgrade-Wert</span><span class="profit-positive">+${NumberFormat.short(upgradeValue)}</span>
      </div>
      <div class="detail-price-row detail-price-total">
        <span>Geschaetzter Wert</span><span>${NumberFormat.short(estimatedValue)}</span>
      </div>`;
    }
    html += `<div class="detail-price-row">
      <span>Listenpreis</span><span>${NumberFormat.short(flip.buyPrice)}</span>
    </div>
    <div class="detail-price-row detail-price-profit">
      <span>Net Profit</span><span class="${flip.netProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${NumberFormat.short(flip.netProfit)} (${NumberFormat.percent(flip.profitPercent)})</span>
    </div>`;

    html += `</div></div>`;

    // --- Pet Info Section ---
    if (flip.petInfo) {
      html += `<div class="detail-section"><h4>Pet Info</h4><div class="detail-upgrade-list">`;
      html += `<div class="detail-upgrade-row"><span>Typ</span><span>${escapeHtml(flip.petInfo.type)}</span><span></span></div>`;
      html += `<div class="detail-upgrade-row"><span>Tier</span><span class="${TIER_CLASSES[flip.petInfo.tier] || ''}">${escapeHtml(flip.petInfo.tier)}</span><span></span></div>`;
      html += `<div class="detail-upgrade-row"><span>Level</span><span>${flip.petInfo.level}</span><span></span></div>`;
      if (flip.petInfo.heldItem) {
        html += `<div class="detail-upgrade-row"><span>Held Item</span><span>${escapeHtml(flip.petInfo.heldItem)}</span><span></span></div>`;
      }
      html += `</div></div>`;
    }

    html += `</div>`; // close detail-body

    // --- Footer ---
    html += `<div class="detail-footer">
      <button class="detail-btn detail-btn-copy" data-copy="/viewauction ${escapeHtml(flip.uuid)}">Kopieren: /viewauction</button>
      <button class="detail-btn detail-btn-search" data-item-id="${escapeHtml(flip.itemId)}" data-item-name="${escapeHtml(flip.itemName)}">Alle Angebote suchen</button>
    </div>`;

    html += `</div>`; // close modal

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // Event listeners
    overlay.querySelector('.detail-close').addEventListener('click', closeItemDetailModal);

    overlay.querySelector('.detail-btn-copy').addEventListener('click', (e) => {
      const text = e.target.dataset.copy;
      navigator.clipboard.writeText(text).then(() => showCopyToast(text)).catch(() => {});
    });

    overlay.querySelector('.detail-btn-search').addEventListener('click', (e) => {
      const itemId = e.target.dataset.itemId;
      closeItemDetailModal();
      // Trigger AH search tab with this item
      if (typeof AhSearch !== 'undefined' && AhSearch.searchByItemId) {
        AhSearch.searchByItemId(itemId);
      }
    });

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeItemDetailModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function closeItemDetailModal() {
    const existing = document.querySelector('.item-detail-overlay');
    if (existing) existing.remove();
  }

  // --- Flip Summary Banner ---

  function updateSummary(activeTab, flips) {
    const summary = document.getElementById('flip-summary');
    if (!summary) return;

    if (!flips || flips.length === 0) {
      summary.style.display = 'none';
      return;
    }

    summary.style.display = 'flex';

    let profits;
    if (activeTab === 'ah') {
      profits = flips.map(f => f.netProfit || 0);
    } else if (activeTab === 'craft' || activeTab === 'ahcraft') {
      profits = flips.map(f => f.profit || 0);
    } else {
      profits = flips.map(f => f._profit || 0);
    }

    const count = profits.length;
    const total = profits.reduce((a, b) => a + b, 0);
    const avg = count > 0 ? total / count : 0;
    const best = Math.max(...profits);

    document.getElementById('summary-count').textContent = count;
    document.getElementById('summary-avg-profit').textContent = NumberFormat.short(avg);
    document.getElementById('summary-best').textContent = NumberFormat.short(best);
    document.getElementById('summary-total').textContent = NumberFormat.short(total);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showCopyToast(text) {
    let toast = document.querySelector('.copy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'copy-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = 'Kopiert: ' + text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
  }

  return {
    setData,
    setBazaarData,
    setAhData,
    setCraftData,
    setAhCraftData,
    render,
    getFilteredBazaarFlips,
    getFilteredAhFlips,
    getFilteredCraftFlips,
    getFilteredAhCraftFlips,
    showItemDetailModal,
    closeItemDetailModal,
  };
})();
