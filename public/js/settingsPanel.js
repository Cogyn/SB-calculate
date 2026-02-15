/**
 * Settings panel - manages filter settings with localStorage persistence.
 * Each tab (order, npc, ah, ahcraft, craft) has its own settings.
 * Also manages notification settings.
 */
const Settings = (() => {
  const STORAGE_KEY = 'skyflip_settings';

  // Default settings per category (all filters OFF by default)
  const DEFAULTS = {
    taxRate: 1.25,
    advancedMode: false,
    order: {
      minProfit: 0,
      minProfitPercent: 0,
      minVolume: 0,
      maxInvestment: 0,
    },
    npc: {
      minProfit: 0,
      minProfitPercent: 0,
      minVolume: 0,
      maxInvestment: 0,
    },
    ah: {
      minProfit: 0,
      minProfitPercent: 0,
      maxInvestment: 0,
    },
    ahcraft: {
      minProfit: 0,
      minProfitPercent: 0,
    },
    craft: {
      minProfit: 0,
      minProfitPercent: 0,
    },
    sortBy: 'profitPerHour',
    resultCount: 25,
    notifications: {
      enabled: false,
      minProfit: 500000,
      minPercent: 20,
      dismissSeconds: 10,
      soundEnabled: true,
      minSellability: 30,
      requireSalesVolume: true,
    },
  };

  // Step sizes for increment/decrement
  const STEPS = {
    minProfit: 10000,
    minProfitPercent: 0.5,
    minVolume: 1000,
    maxInvestment: 1000000,
  };

  let settings = null;

  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.advancedMode === undefined) {
          settings = structuredClone(DEFAULTS);
        } else {
          settings = deepMerge(structuredClone(DEFAULTS), parsed);
        }
      } else {
        settings = structuredClone(DEFAULTS);
      }
    } catch {
      settings = structuredClone(DEFAULTS);
    }
    save();
    return settings;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage full or unavailable
    }
  }

  function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  function get() {
    if (!settings) load();
    return settings;
  }

  function getTaxRate() {
    return get().taxRate;
  }

  function toggleTaxRate() {
    const s = get();
    s.taxRate = s.taxRate === 1.25 ? 1.125 : 1.25;
    save();
    return s.taxRate;
  }

  function getCategorySettings(category) {
    const s = get();
    return s[category] || s.order;
  }

  function setCategoryValue(category, key, value) {
    const s = get();
    if (!s[category]) s[category] = structuredClone(DEFAULTS[category] || DEFAULTS.order);
    s[category][key] = value;
    save();
  }

  function increment(category, key) {
    const s = get();
    const step = STEPS[key] || 1;
    const current = s[category]?.[key] ?? (DEFAULTS[category]?.[key] ?? 0);
    setCategoryValue(category, key, current + step);
  }

  function decrement(category, key) {
    const s = get();
    const step = STEPS[key] || 1;
    const current = s[category]?.[key] ?? (DEFAULTS[category]?.[key] ?? 0);
    const newVal = current - step;
    setCategoryValue(category, key, Math.max(0, newVal));
  }

  function getSortBy() {
    return get().sortBy || 'profitPerHour';
  }

  function setSortBy(value) {
    get().sortBy = value;
    save();
  }

  function getResultCount() {
    return get().resultCount || 10;
  }

  function setResultCount(value) {
    get().resultCount = value;
    save();
  }

  function getAdvancedMode() {
    return get().advancedMode || false;
  }

  function toggleAdvancedMode() {
    const s = get();
    s.advancedMode = !s.advancedMode;
    save();
    return s.advancedMode;
  }

  function reset() {
    settings = structuredClone(DEFAULTS);
    save();
  }

  /**
   * Get the effective filter settings for the current active tab.
   * For the "all" tab, uses the loosest (most permissive) settings across bazaar categories.
   */
  function getActiveFilters(activeTab) {
    if (activeTab === 'settings') {
      const cats = ['order', 'npc'];
      return {
        minProfit: Math.min(...cats.map(c => getCategorySettings(c).minProfit)),
        minProfitPercent: Math.min(...cats.map(c => getCategorySettings(c).minProfitPercent)),
        minVolume: Math.min(...cats.map(c => getCategorySettings(c).minVolume)),
        maxInvestment: Math.max(...cats.map(c => getCategorySettings(c).maxInvestment)),
      };
    }
    return getCategorySettings(activeTab);
  }

  // --- Notification settings helpers ---
  function getNotificationSettings() {
    return get().notifications || DEFAULTS.notifications;
  }

  function setNotificationValue(key, value) {
    const s = get();
    if (!s.notifications) s.notifications = structuredClone(DEFAULTS.notifications);
    s.notifications[key] = value;
    save();
  }

  return {
    load,
    save,
    get,
    getTaxRate,
    toggleTaxRate,
    getAdvancedMode,
    toggleAdvancedMode,
    getCategorySettings,
    setCategoryValue,
    increment,
    decrement,
    getSortBy,
    setSortBy,
    getResultCount,
    setResultCount,
    getActiveFilters,
    getNotificationSettings,
    setNotificationValue,
    reset,
    DEFAULTS,
    STEPS,
  };
})();
