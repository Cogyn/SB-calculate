/**
 * Dungeon & Crimson star essence costs.
 *
 * Fetches per-item essence costs from the NEU (NotEnoughUpdates) repository
 * at startup. This gives accurate per-item costs instead of generic estimates.
 *
 * Falls back to hardcoded approximate costs for common items if fetch fails.
 *
 * Source: https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO
 */
const dataStore = require('../api/dataStore');

const NEU_ESSENCE_URL = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/essencecosts.json';

// Bazaar IDs for essence types
const ESSENCE_IDS = {
  WITHER: 'ESSENCE_WITHER',
  DRAGON: 'ESSENCE_DRAGON',
  SPIDER: 'ESSENCE_SPIDER',
  UNDEAD: 'ESSENCE_UNDEAD',
  DIAMOND: 'ESSENCE_DIAMOND',
  GOLD: 'ESSENCE_GOLD',
  ICE: 'ESSENCE_ICE',
  CRIMSON: 'ESSENCE_CRIMSON',
};

// Master star bazaar/AH item IDs (stars 6-10)
const MASTER_STAR_ITEMS = {
  6: 'FIRST_MASTER_STAR',
  7: 'SECOND_MASTER_STAR',
  8: 'THIRD_MASTER_STAR',
  9: 'FOURTH_MASTER_STAR',
  10: 'FIFTH_MASTER_STAR',
};

// Master star essence costs (same for all items)
const MASTER_STAR_ESSENCE = { 6: 50, 7: 100, 8: 200, 9: 400, 10: 800 };

/**
 * @type {Map<string, { type: string, costs: number[] }>}
 * Keyed by item ID. costs[1..N] = essence amount for that star.
 */
const essenceCostData = new Map();
let dataLoaded = false;

/**
 * Fetch essence cost data from the NEU repository.
 * Called once at startup.
 */
async function fetchEssenceCosts() {
  try {
    const response = await fetch(NEU_ESSENCE_URL);
    const data = await response.json();

    let count = 0;
    for (const [itemId, info] of Object.entries(data)) {
      if (!info || !info.type) continue;

      const essenceType = info.type.toUpperCase();
      const costs = [];

      // Stars are stored as keys "1", "2", "3", etc.
      for (let s = 1; s <= 15; s++) {
        const cost = info[String(s)];
        if (cost !== undefined && typeof cost === 'number') {
          costs[s] = cost;
        } else {
          break;
        }
      }

      if (costs.length > 1) {
        essenceCostData.set(itemId, { type: essenceType, costs });
        count++;
      }
    }

    dataLoaded = true;
    console.log(`[EssenceCosts] Loaded costs for ${count} items from NEU repo`);
  } catch (err) {
    console.error('[EssenceCosts] Failed to fetch NEU data:', err.message);
    dataStore.addError('essenceCosts', err.message);
    // Fall back to hardcoded data
    loadFallbackData();
  }
}

/**
 * Fallback: hardcode the most popular/expensive items.
 */
function loadFallbackData() {
  const fallback = {
    // Wither essence - Necron armor
    POWER_WITHER_HELMET: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    POWER_WITHER_CHESTPLATE: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    POWER_WITHER_LEGGINGS: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    POWER_WITHER_BOOTS: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    // Storm armor
    WISE_WITHER_HELMET: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    WISE_WITHER_CHESTPLATE: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    WISE_WITHER_LEGGINGS: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    WISE_WITHER_BOOTS: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    // Goldor armor
    TANK_WITHER_HELMET: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    TANK_WITHER_CHESTPLATE: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    TANK_WITHER_LEGGINGS: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    TANK_WITHER_BOOTS: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    // Maxor armor
    SPEED_WITHER_HELMET: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    SPEED_WITHER_CHESTPLATE: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    SPEED_WITHER_LEGGINGS: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    SPEED_WITHER_BOOTS: { type: 'WITHER', costs: [, 50, 100, 150, 250, 500] },
    // Wither blades
    HYPERION: { type: 'WITHER', costs: [, 150, 300, 500, 900, 1500] },
    ASTRAEA: { type: 'WITHER', costs: [, 150, 300, 500, 900, 1500] },
    SCYLLA: { type: 'WITHER', costs: [, 150, 300, 500, 900, 1500] },
    VALKYRIE: { type: 'WITHER', costs: [, 150, 300, 500, 900, 1500] },
    // Other wither weapons
    DARK_CLAYMORE: { type: 'WITHER', costs: [, 150, 300, 500, 900, 1500] },
    GIANTS_SWORD: { type: 'WITHER', costs: [, 100, 200, 350, 600, 1000] },
    TERMINATOR: { type: 'WITHER', costs: [, 100, 200, 350, 600, 1000] },
    JUJU_SHORTBOW: { type: 'WITHER', costs: [, 50, 100, 200, 350, 600] },
    LIVID_DAGGER: { type: 'WITHER', costs: [, 20, 40, 80, 160, 320] },
    SHADOW_FURY: { type: 'WITHER', costs: [, 50, 100, 200, 350, 600] },
    // Shadow Assassin
    SHADOW_ASSASSIN_HELMET: { type: 'WITHER', costs: [, 20, 50, 100, 200, 300] },
    SHADOW_ASSASSIN_CHESTPLATE: { type: 'WITHER', costs: [, 20, 50, 100, 200, 300] },
    SHADOW_ASSASSIN_LEGGINGS: { type: 'WITHER', costs: [, 20, 50, 100, 200, 300] },
    SHADOW_ASSASSIN_BOOTS: { type: 'WITHER', costs: [, 20, 50, 100, 200, 300] },
    // Adaptive
    ADAPTIVE_HELMET: { type: 'WITHER', costs: [, 20, 50, 100, 200, 300] },
    ADAPTIVE_CHESTPLATE: { type: 'WITHER', costs: [, 20, 50, 100, 200, 300] },
    ADAPTIVE_LEGGINGS: { type: 'WITHER', costs: [, 20, 50, 100, 200, 300] },
    ADAPTIVE_BOOTS: { type: 'WITHER', costs: [, 20, 50, 100, 200, 300] },
    // Crimson essence - Terror armor (10 stars)
    TERROR_HELMET: { type: 'CRIMSON', costs: [, 50, 125, 250, 500, 750, 1000, 1500, 2000, 2500, 3000] },
    TERROR_CHESTPLATE: { type: 'CRIMSON', costs: [, 50, 125, 250, 500, 750, 1000, 1500, 2000, 2500, 3000] },
    TERROR_LEGGINGS: { type: 'CRIMSON', costs: [, 50, 125, 250, 500, 750, 1000, 1500, 2000, 2500, 3000] },
    TERROR_BOOTS: { type: 'CRIMSON', costs: [, 50, 125, 250, 500, 750, 1000, 1500, 2000, 2500, 3000] },
    // Aurora armor (10 stars)
    AURORA_HELMET: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    AURORA_CHESTPLATE: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    AURORA_LEGGINGS: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    AURORA_BOOTS: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    // Fervor armor (10 stars)
    FERVOR_HELMET: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    FERVOR_CHESTPLATE: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    FERVOR_LEGGINGS: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    FERVOR_BOOTS: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    // Hollow armor (10 stars)
    HOLLOW_HELMET: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    HOLLOW_CHESTPLATE: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    HOLLOW_LEGGINGS: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    HOLLOW_BOOTS: { type: 'CRIMSON', costs: [, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90] },
    // Dragon essence armor
    SUPERIOR_DRAGON_HELMET: { type: 'DRAGON', costs: [, 70, 110, 150, 190, 230] },
    SUPERIOR_DRAGON_CHESTPLATE: { type: 'DRAGON', costs: [, 70, 110, 150, 190, 230] },
    SUPERIOR_DRAGON_LEGGINGS: { type: 'DRAGON', costs: [, 70, 110, 150, 190, 230] },
    SUPERIOR_DRAGON_BOOTS: { type: 'DRAGON', costs: [, 70, 110, 150, 190, 230] },
    ASPECT_OF_THE_DRAGON: { type: 'DRAGON', costs: [, 50, 100, 200, 300, 400] },
  };

  for (const [id, data] of Object.entries(fallback)) {
    essenceCostData.set(id, data);
  }
  dataLoaded = true;
  console.log(`[EssenceCosts] Using fallback data (${Object.keys(fallback).length} items)`);
}

/**
 * Get the essence type for an item.
 * Uses NEU data first, falls back to prefix matching.
 * @param {string} itemId
 * @returns {string|null}
 */
function getEssenceType(itemId) {
  if (!itemId) return null;
  const entry = essenceCostData.get(itemId);
  if (entry) return entry.type;
  return null;
}

/**
 * Calculate the total essence cost for a given number of stars on an item.
 * Uses per-item data from NEU repository for accurate costs.
 *
 * @param {string} itemId - The item's ID
 * @param {number} stars - Number of stars (1-15)
 * @returns {{ totalEssenceCost: number, essenceType: string|null, essenceBazaarId: string|null, essenceAmount: number, essencePricePerUnit: number, masterStarCosts: Array, perStarBreakdown: Array }|null}
 */
function calculateStarCost(itemId, stars) {
  if (!stars || stars <= 0) return null;

  const entry = essenceCostData.get(itemId);
  if (!entry) return null;

  const essenceType = entry.type;
  const essenceBazaarId = ESSENCE_IDS[essenceType];
  if (!essenceBazaarId) return null;

  const products = dataStore.getAllProducts();
  const essenceProduct = products.get(essenceBazaarId);
  const essencePricePerUnit = (essenceProduct && essenceProduct.sellPrice > 0) ? essenceProduct.sellPrice : 0;

  if (essencePricePerUnit <= 0) return null;

  const itemCosts = entry.costs;
  const maxStar = Math.min(stars, itemCosts.length - 1);

  let totalEssenceAmount = 0;
  let totalCoinCost = 0;
  const masterStarCosts = [];
  const perStarBreakdown = [];

  for (let s = 1; s <= maxStar; s++) {
    const essenceNeeded = itemCosts[s] || 0;
    const essenceCost = essenceNeeded * essencePricePerUnit;
    totalEssenceAmount += essenceNeeded;
    totalCoinCost += essenceCost;

    let masterStarItem = null;
    let masterStarCost = 0;

    // For dungeon items, stars 6-10 also require master star items
    // (Crimson items don't use master stars, they go up to 10-15 natively)
    if (essenceType !== 'CRIMSON' && s >= 6 && s <= 10) {
      const masterStarItemId = MASTER_STAR_ITEMS[s];
      if (masterStarItemId) {
        const lbin = dataStore.getLowestBin(masterStarItemId);
        if (lbin > 0) {
          masterStarCost = lbin;
          totalCoinCost += masterStarCost;
        }
        masterStarItem = masterStarItemId;
        masterStarCosts.push({ star: s, itemId: masterStarItemId, price: masterStarCost });
      }
    }

    perStarBreakdown.push({
      star: s,
      essenceAmount: essenceNeeded,
      essenceCost,
      masterStarItem,
      masterStarCost,
    });
  }

  return {
    totalEssenceCost: totalCoinCost,
    essenceType,
    essenceBazaarId,
    essenceAmount: totalEssenceAmount,
    essencePricePerUnit,
    masterStarCosts,
    perStarBreakdown,
  };
}

module.exports = { calculateStarCost, getEssenceType, fetchEssenceCosts, ESSENCE_IDS };
