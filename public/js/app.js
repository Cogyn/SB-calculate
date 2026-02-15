/**
 * Main application - initialization, tab switching, polling loop.
 * Supports bazaar, AH (with sub-tabs), AH craft, craft tabs
 * with separate polling timers and notification integration.
 */
(function () {
  let activeTab = 'order';
  let ahMode = 'both'; // 'bin' | 'auction' | 'both'
  let bazaarTimer = null;
  let ahTimer = null;
  let craftTimer = null;
  let ahCraftTimer = null;
  let lastFetchTime = 0;

  // Track which tabs are bazaar-type vs special
  const BAZAAR_TABS = ['order', 'npc'];
  const AH_TAB = 'ah';
  const CRAFT_TAB = 'craft';
  const AHCRAFT_TAB = 'ahcraft';
  const AHSEARCH_TAB = 'ahsearch';

  // ---- Initialization ----
  document.addEventListener('DOMContentLoaded', () => {
    Settings.load();
    NotificationManager.init();
    initTabs();
    initAhSubTabs();
    initAdvancedMode();
    initFilterBar();
    initSettingsPanel();
    initSearch();
    AhSearch.init();
    startPolling();
  });

  // ---- Tab Switching ----
  function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        updateView();
      });
    });
  }

  // ---- AH Sub-Tabs ----
  function initAhSubTabs() {
    document.querySelectorAll('.sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ahMode = btn.dataset.ahMode;
        fetchAhData();
      });
    });
  }

  // ---- Advanced Mode ----
  function initAdvancedMode() {
    const btn = document.getElementById('advanced-mode-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isOn = Settings.toggleAdvancedMode();
      syncAdvancedModeUI(isOn);
      updateView();
    });
    syncAdvancedModeUI(Settings.getAdvancedMode());
  }

  function syncAdvancedModeUI(isOn) {
    const btn = document.getElementById('advanced-mode-toggle');
    if (btn) {
      btn.textContent = isOn ? 'Advanced: ON' : 'Advanced: OFF';
      btn.classList.toggle('active', isOn);
    }
  }

  function updateView() {
    const tableContainer = document.getElementById('flip-table-container');
    const filterBar = document.getElementById('filter-bar');
    const searchBar = document.getElementById('search-bar');
    const settingsPanel = document.getElementById('settings-panel');
    const advancedToggle = document.getElementById('advanced-mode-toggle');
    const ahSubTabs = document.getElementById('ah-sub-tabs');
    const ahSearchPanel = document.getElementById('ah-search-panel');
    const flipSummary = document.getElementById('flip-summary');

    // Show/hide AH sub-tabs
    if (ahSubTabs) {
      ahSubTabs.style.display = activeTab === AH_TAB ? 'flex' : 'none';
    }

    if (activeTab === 'settings') {
      tableContainer.style.display = 'none';
      filterBar.style.display = 'none';
      searchBar.style.display = 'none';
      settingsPanel.style.display = 'block';
      if (ahSearchPanel) ahSearchPanel.style.display = 'none';
      if (flipSummary) flipSummary.style.display = 'none';
      if (advancedToggle) advancedToggle.style.display = 'none';
      syncSettingsUI();
    } else if (activeTab === AHSEARCH_TAB) {
      tableContainer.style.display = 'none';
      filterBar.style.display = 'none';
      searchBar.style.display = 'none';
      settingsPanel.style.display = 'none';
      if (ahSearchPanel) ahSearchPanel.style.display = 'block';
      if (flipSummary) flipSummary.style.display = 'none';
      if (advancedToggle) advancedToggle.style.display = 'none';
    } else {
      tableContainer.style.display = 'block';
      searchBar.style.display = 'flex';
      settingsPanel.style.display = 'none';
      if (ahSearchPanel) ahSearchPanel.style.display = 'none';
      if (advancedToggle) advancedToggle.style.display = 'inline-block';

      // Only show filter bar when advanced mode is on
      const advancedOn = Settings.getAdvancedMode();
      filterBar.style.display = advancedOn ? 'flex' : 'none';

      if (advancedOn) {
        updateFilterBarForTab();
        syncFilterBar();
      }
      renderFlips();
    }
  }

  /**
   * Show/hide filter bar controls based on active tab.
   */
  function updateFilterBarForTab() {
    const taxGroup = document.getElementById('filter-group-tax');
    const volumeGroup = document.getElementById('filter-group-volume');
    const investGroup = document.getElementById('filter-group-investment');

    if (activeTab === AH_TAB) {
      if (taxGroup) taxGroup.style.display = 'none';
      if (volumeGroup) volumeGroup.style.display = 'none';
      if (investGroup) investGroup.style.display = 'flex';
    } else if (activeTab === CRAFT_TAB || activeTab === AHCRAFT_TAB) {
      if (taxGroup) taxGroup.style.display = 'none';
      if (volumeGroup) volumeGroup.style.display = 'none';
      if (investGroup) investGroup.style.display = 'none';
    } else {
      if (taxGroup) taxGroup.style.display = 'flex';
      if (volumeGroup) volumeGroup.style.display = 'flex';
      if (investGroup) investGroup.style.display = 'flex';
    }
  }

  // ---- Filter Bar ----
  function initFilterBar() {
    // Tax toggle
    document.getElementById('tax-toggle').addEventListener('click', () => {
      const newRate = Settings.toggleTaxRate();
      document.getElementById('tax-toggle').textContent = newRate + '%';
      document.getElementById('settings-tax-toggle').textContent = newRate + '%';
      renderFlips();
    });

    // Sort dropdown
    document.getElementById('filter-sort').addEventListener('change', (e) => {
      Settings.setSortBy(e.target.value);
      renderFlips();
    });

    // Result count dropdown
    document.getElementById('filter-count').addEventListener('change', (e) => {
      Settings.setResultCount(parseInt(e.target.value, 10));
      renderFlips();
    });

    // Number input inc/dec buttons in filter bar
    document.querySelectorAll('#filter-bar .num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const setting = btn.dataset.setting;
        const isInc = btn.classList.contains('inc');
        const category = getFilterCategory();

        if (isInc) Settings.increment(category, setting);
        else Settings.decrement(category, setting);

        syncFilterBar();
        renderFlips();
      });
    });

    // Number input direct edit in filter bar
    document.querySelectorAll('#filter-bar .number-input input').forEach(input => {
      input.addEventListener('change', () => {
        const setting = input.dataset.setting;
        const category = getFilterCategory();
        const value = NumberFormat.parse(input.value);
        if (!isNaN(value)) {
          Settings.setCategoryValue(category, setting, value);
          syncFilterBar();
          renderFlips();
        }
      });

      // Arrow key support
      input.addEventListener('keydown', (e) => {
        const setting = input.dataset.setting;
        const category = getFilterCategory();
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          Settings.increment(category, setting);
          syncFilterBar();
          renderFlips();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          Settings.decrement(category, setting);
          syncFilterBar();
          renderFlips();
        }
      });
    });

    syncFilterBar();
  }

  function getFilterCategory() {
    if (['order', 'npc'].includes(activeTab)) return activeTab;
    if (activeTab === 'ah') return 'ah';
    if (activeTab === 'ahcraft') return 'ahcraft';
    if (activeTab === 'craft') return 'craft';
    return 'order'; // default
  }

  function syncFilterBar() {
    const category = getFilterCategory();
    const catSettings = Settings.getCategorySettings(category);

    document.getElementById('tax-toggle').textContent = Settings.getTaxRate() + '%';
    document.getElementById('filter-minProfit').value = NumberFormat.toInput(catSettings.minProfit || 0);
    document.getElementById('filter-minProfitPercent').value = (catSettings.minProfitPercent || 0).toString();

    const volumeInput = document.getElementById('filter-minVolume');
    if (volumeInput) volumeInput.value = NumberFormat.toInput(catSettings.minVolume || 0);

    const investInput = document.getElementById('filter-maxInvestment');
    if (investInput) investInput.value = NumberFormat.toInput(catSettings.maxInvestment || 0);

    document.getElementById('filter-sort').value = Settings.getSortBy();
    document.getElementById('filter-count').value = Settings.getResultCount().toString();
  }

  // ---- Settings Panel ----
  function initSettingsPanel() {
    // Tax toggle in settings
    document.getElementById('settings-tax-toggle').addEventListener('click', () => {
      const newRate = Settings.toggleTaxRate();
      document.getElementById('settings-tax-toggle').textContent = newRate + '%';
      document.getElementById('tax-toggle').textContent = newRate + '%';
    });

    // Reset button
    document.getElementById('settings-reset').addEventListener('click', () => {
      Settings.reset();
      syncSettingsUI();
      syncFilterBar();
      syncNotificationSettingsUI();
    });

    // Number input buttons in settings panel
    document.querySelectorAll('#settings-panel .num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const key = btn.dataset.key;
        const isInc = btn.classList.contains('inc');

        if (isInc) Settings.increment(cat, key);
        else Settings.decrement(cat, key);

        syncSettingsUI();
      });
    });

    // Number input direct edit in settings panel
    document.querySelectorAll('#settings-panel .settings-input').forEach(input => {
      input.addEventListener('change', () => {
        const cat = input.dataset.cat;
        const key = input.dataset.key;
        const value = NumberFormat.parse(input.value);
        if (!isNaN(value)) {
          Settings.setCategoryValue(cat, key, value);
          syncSettingsUI();
        }
      });

      input.addEventListener('keydown', (e) => {
        const cat = input.dataset.cat;
        const key = input.dataset.key;
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          Settings.increment(cat, key);
          syncSettingsUI();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          Settings.decrement(cat, key);
          syncSettingsUI();
        }
      });
    });

    initNotificationSettings();
    syncSettingsUI();
  }

  function syncSettingsUI() {
    document.getElementById('settings-tax-toggle').textContent = Settings.getTaxRate() + '%';

    document.querySelectorAll('#settings-panel .settings-input').forEach(input => {
      const cat = input.dataset.cat;
      const key = input.dataset.key;
      if (!cat || !key) return;
      const catSettings = Settings.getCategorySettings(cat);
      if (key === 'minProfitPercent') {
        input.value = (catSettings[key] || 0).toString();
      } else {
        input.value = NumberFormat.toInput(catSettings[key] || 0);
      }
    });

    syncNotificationSettingsUI();
  }

  // ---- Notification Settings ----
  function initNotificationSettings() {
    const enabledToggle = document.getElementById('notif-enabled');
    const soundToggle = document.getElementById('notif-sound');
    const minProfitInput = document.getElementById('notif-minProfit');
    const minPercentInput = document.getElementById('notif-minPercent');
    const dismissInput = document.getElementById('notif-dismiss');
    const minSellabilityInput = document.getElementById('notif-minSellability');
    const requireSalesToggle = document.getElementById('notif-requireSales');

    if (enabledToggle) {
      enabledToggle.addEventListener('click', () => {
        const current = NotificationManager.isEnabled();
        NotificationManager.setEnabled(!current);
        syncNotificationSettingsUI();
      });
    }

    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        const current = NotificationManager.isSoundEnabled();
        NotificationManager.setSoundEnabled(!current);
        syncNotificationSettingsUI();
      });
    }

    if (minProfitInput) {
      minProfitInput.addEventListener('change', () => {
        const val = NumberFormat.parse(minProfitInput.value);
        if (!isNaN(val)) NotificationManager.setMinProfit(val);
        syncNotificationSettingsUI();
      });
    }

    if (minPercentInput) {
      minPercentInput.addEventListener('change', () => {
        const val = parseFloat(minPercentInput.value);
        if (!isNaN(val)) NotificationManager.setMinPercent(val);
        syncNotificationSettingsUI();
      });
    }

    if (minSellabilityInput) {
      minSellabilityInput.addEventListener('change', () => {
        const val = parseInt(minSellabilityInput.value, 10);
        if (!isNaN(val) && val >= 0 && val <= 100) NotificationManager.setMinSellability(val);
        syncNotificationSettingsUI();
      });
    }

    if (requireSalesToggle) {
      requireSalesToggle.addEventListener('click', () => {
        const current = NotificationManager.isRequireSalesVolume();
        NotificationManager.setRequireSalesVolume(!current);
        syncNotificationSettingsUI();
      });
    }

    if (dismissInput) {
      dismissInput.addEventListener('change', () => {
        const val = parseInt(dismissInput.value, 10);
        if (!isNaN(val)) NotificationManager.setDismissSeconds(val);
        syncNotificationSettingsUI();
      });
    }

    syncNotificationSettingsUI();
  }

  function syncNotificationSettingsUI() {
    const enabledToggle = document.getElementById('notif-enabled');
    const soundToggle = document.getElementById('notif-sound');
    const minProfitInput = document.getElementById('notif-minProfit');
    const minPercentInput = document.getElementById('notif-minPercent');
    const dismissInput = document.getElementById('notif-dismiss');
    const minSellabilityInput = document.getElementById('notif-minSellability');
    const requireSalesToggle = document.getElementById('notif-requireSales');

    if (enabledToggle) {
      const on = NotificationManager.isEnabled();
      enabledToggle.textContent = on ? 'AN' : 'AUS';
      enabledToggle.classList.toggle('active', on);
    }
    if (soundToggle) {
      const on = NotificationManager.isSoundEnabled();
      soundToggle.textContent = on ? 'AN' : 'AUS';
      soundToggle.classList.toggle('active', on);
    }
    if (minProfitInput) {
      minProfitInput.value = NumberFormat.toInput(NotificationManager.getMinProfit());
    }
    if (minPercentInput) {
      minPercentInput.value = NotificationManager.getMinPercent().toString();
    }
    if (minSellabilityInput) {
      minSellabilityInput.value = NotificationManager.getMinSellability().toString();
    }
    if (requireSalesToggle) {
      const on = NotificationManager.isRequireSalesVolume();
      requireSalesToggle.textContent = on ? 'AN' : 'AUS';
      requireSalesToggle.classList.toggle('active', on);
    }
    if (dismissInput) {
      dismissInput.value = NotificationManager.getDismissSeconds().toString();
    }
  }

  // ---- Search ----
  function initSearch() {
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', () => {
      renderFlips();
    });
  }

  function getSearchQuery() {
    return document.getElementById('search-input').value.trim();
  }

  // ---- Polling ----
  async function startPolling() {
    // Check server status first - wait for data to be ready
    const status = await Api.getStatus();
    if (status.productCount === 0) {
      showLoadingBanner('Server laedt Daten...');
      await waitForServerReady();
    }

    // Initial fetch for all data types
    fetchBazaarData();
    fetchAhData();
    fetchCraftData();
    fetchAhCraftData();

    // Separate poll timers
    bazaarTimer = setInterval(fetchBazaarData, 5000);
    ahTimer = setInterval(fetchAhData, 10000);
    craftTimer = setInterval(fetchCraftData, 15000);
    ahCraftTimer = setInterval(fetchAhCraftData, 15000);
  }

  function showLoadingBanner(msg) {
    const tbody = document.getElementById('flip-table-body');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-msg loading-pulse">${msg}</td></tr>`;
    }
  }

  async function waitForServerReady() {
    return new Promise((resolve) => {
      const check = async () => {
        const s = await Api.getStatus();
        if (s.productCount > 0) {
          resolve();
        } else {
          setTimeout(check, 3000);
        }
      };
      setTimeout(check, 3000);
    });
  }

  async function fetchBazaarData() {
    try {
      const data = await Api.getFlips();
      if (data.success) {
        FlipRenderer.setBazaarData(data.flips, data.lastUpdate);
        lastFetchTime = Date.now();
        updateStatus(true, data.lastUpdate, data.flips.length);
        if (BAZAAR_TABS.includes(activeTab)) {
          renderFlips();
        }
      }
    } catch (err) {
      console.error('[App] Bazaar fetch error:', err);
    }
  }

  async function fetchAhData() {
    try {
      const data = await Api.getAhFlips(ahMode);
      if (data.success) {
        FlipRenderer.setAhData(data.flips, data.lastUpdate);
        // Check notifications for BIN flips
        NotificationManager.checkFlips(data.flips);
        if (activeTab === AH_TAB) {
          renderFlips();
        }
      }
    } catch (err) {
      console.error('[App] AH fetch error:', err);
    }
  }

  async function fetchCraftData() {
    try {
      const data = await Api.getCraftFlips();
      if (data.success) {
        FlipRenderer.setCraftData(data.flips, data.lastUpdate);
        if (activeTab === CRAFT_TAB) {
          renderFlips();
        }
      }
    } catch (err) {
      console.error('[App] Craft fetch error:', err);
    }
  }

  async function fetchAhCraftData() {
    try {
      const data = await Api.getAhCraftFlips();
      if (data.success) {
        FlipRenderer.setAhCraftData(data.flips, data.lastUpdate);
        if (activeTab === AHCRAFT_TAB) {
          renderFlips();
        }
      }
    } catch (err) {
      console.error('[App] AH Craft fetch error:', err);
    }
  }

  function renderFlips() {
    FlipRenderer.render(activeTab, getSearchQuery());
  }

  // ---- Status Updates ----
  function updateStatus(online, serverUpdateTime, flipCount) {
    const dot = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const footerUpdate = document.getElementById('footer-update');
    const footerItems = document.getElementById('footer-items');

    if (online) {
      dot.className = 'status-dot online';
      text.textContent = 'Live';
    } else {
      dot.className = 'status-dot error';
      text.textContent = 'Verbindungsfehler';
    }

    if (serverUpdateTime) {
      updateFooterTimer(serverUpdateTime);
    }

    if (flipCount !== undefined) {
      footerItems.textContent = flipCount + ' Flips';
    }
  }

  function updateFooterTimer(serverUpdateTime) {
    const footerUpdate = document.getElementById('footer-update');

    // Update every second
    function tick() {
      const ago = Math.floor((Date.now() - serverUpdateTime) / 1000);
      if (ago < 60) {
        footerUpdate.textContent = `Letzte Aktualisierung: ${ago}s`;
      } else {
        footerUpdate.textContent = `Letzte Aktualisierung: ${Math.floor(ago / 60)}m ${ago % 60}s`;
      }
    }

    tick();
    // Clear any existing interval
    if (window._footerTimerInterval) clearInterval(window._footerTimerInterval);
    window._footerTimerInterval = setInterval(tick, 1000);
  }
})();
