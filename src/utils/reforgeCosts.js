/**
 * Reforge stone costs and apply costs.
 * Maps reforge modifier names to their reforge stone bazaar/AH item ID
 * and defines apply costs per item rarity.
 *
 * Sources: Hypixel SkyBlock Wiki - Reforge Stones page
 */
const dataStore = require('../api/dataStore');

/**
 * Map of reforge modifier name (as found in NBT "modifier" tag) to the reforge stone item ID.
 * Only stone-based reforges are listed here.
 *
 * Verified against: https://hypixel-skyblock.fandom.com/wiki/Reforge_Stones
 */
const REFORGE_STONES = new Map([
  // ---- Sword / Melee Weapon reforges ----
  ['withered', 'WITHER_BLOOD'],
  ['fabled', 'DRAGON_CLAW'],
  ['gilded', 'MIDAS_JEWEL'],
  ['warped', 'WARPED_STONE'],
  ['jerry', 'JERRY_STONE'],
  ['dirty', 'DIRT_BOTTLE'],
  ['suspicious', 'SUSPICIOUS_VIAL'],

  // ---- Armor reforges ----
  ['ancient', 'PRECURSOR_GEAR'],
  ['renowned', 'DRAGON_HORN'],
  ['necrotic', 'NECROMANCER_BROOCH'],
  ['loving', 'RED_SCARF'],
  ['submerged', 'DEEP_SEA_ORB'],
  ['giant', 'GIANT_TOOTH'],
  ['spiked', 'DRAGON_SCALE'],
  ['perfect', 'DIAMOND_ATOM'],
  ['reinforced', 'RARE_DIAMOND'],
  ['cubic', 'MOLTEN_CUBE'],
  ['undead', 'PREMIUM_FLESH'],
  ['jaded', 'JADERALD'],
  ['empowered', 'SADAN_BROOCH'],
  ['bustling', 'SKYMART_BROCHURE'],
  ['mossy', 'OVERGROWN_GRASS'],
  ['groovy', 'MANGROVE_GEM'],
  ['hyper', 'END_STONE_GEODE'],
  ['ridiculous', 'RED_NOSE'],
  ['candied', 'CANDY_CORN'],

  // ---- Bow reforges ----
  ['headstrong', 'SALMON_OPAL'],
  ['precise', 'OPTICAL_LENS'],
  ['spiritual', 'SPIRIT_STONE'],

  // ---- Accessory reforges ----
  ['bizarre', 'ECCENTRIC_PAINTING'],
  ['silky', 'LUXURIOUS_SPOOL'],
  ['bloody', 'PREMIUM_FLESH'],
  ['shaded', 'DARK_ORB'],

  // ---- Equipment reforges ----
  ['rooted', 'BURROWING_SPORES'],
  ['blooming', 'FLOWERING_BOUQUET'],
  ['earthy', 'LARGE_WALNUT'],
]);

/**
 * Basic blacksmith reforges (no stone required).
 * Getting a SPECIFIC basic reforge is random, so the effective cost
 * is the reforge cost times the expected number of attempts.
 * Set to a flat 50k as an average cost estimate.
 */
const BASIC_REFORGES = new Set([
  // Sword reforges
  'epic', 'fair', 'fast', 'gentle', 'heroic', 'legendary',
  'odd', 'sharp', 'spicy',
  // Armor reforges
  'clean', 'fierce', 'heavy', 'light', 'mythic', 'pure',
  'smart', 'titanic', 'wise',
  // Bow reforges
  'awkward', 'deadly', 'fine', 'grand', 'hasty', 'neat',
  'rapid', 'rich', 'unreal',
]);

const BASIC_REFORGE_FLAT_COST = 50000; // 50k average (random reforging costs)

/**
 * Blacksmith apply costs per item rarity (in coins) for stone reforges.
 */
const REFORGE_APPLY_COSTS = {
  COMMON: 10,
  UNCOMMON: 50,
  RARE: 200,
  EPIC: 1000,
  LEGENDARY: 5000,
  MYTHIC: 25000,
  DIVINE: 50000,
  SPECIAL: 50000,
  VERY_SPECIAL: 50000,
};

/**
 * Get the best available price for an item.
 * Prefers buyPrice (insta-buy/sell offer) over sellPrice (buy order)
 * because buy orders for low-volume items may never get filled.
 * Falls back to LBIN for AH-only items.
 *
 * @param {string} itemId - Bazaar or AH item ID
 * @returns {number} Price in coins, or 0 if not found
 */
function getBestPrice(itemId) {
  const products = dataStore.getAllProducts();
  const product = products.get(itemId);

  if (product) {
    // Prefer insta-buy price (sell offer) - more reliable than buy order
    if (product.buyPrice > 0) return product.buyPrice;
    // Fall back to buy order price if sell offers are empty
    if (product.sellPrice > 0) return product.sellPrice;
  }

  // Not on bazaar or no price - check LBIN (AH items)
  const lbin = dataStore.getLowestBin(itemId);
  if (lbin > 0) return lbin;

  return 0;
}

/**
 * Calculate the total reforge cost for an item.
 * @param {string} reforgeName - The modifier name from NBT (e.g. "withered")
 * @param {string} tier - Item rarity (e.g. "LEGENDARY")
 * @returns {{ totalCost: number, stoneName: string|null, stoneItemId: string|null, stonePrice: number, applyCost: number }|null}
 */
function calculateReforgeCost(reforgeName, tier) {
  if (!reforgeName) return null;

  const reforgeKey = reforgeName.toLowerCase();

  // Check if it's a basic blacksmith reforge
  if (BASIC_REFORGES.has(reforgeKey)) {
    return {
      totalCost: BASIC_REFORGE_FLAT_COST,
      stoneName: null,
      stoneItemId: null,
      stonePrice: 0,
      applyCost: BASIC_REFORGE_FLAT_COST,
      isBasic: true,
    };
  }

  // Check if it's a stone reforge
  const stoneItemId = REFORGE_STONES.get(reforgeKey);

  if (stoneItemId) {
    const stoneName = stoneItemId.replace(/_/g, ' ');
    const stonePrice = getBestPrice(stoneItemId);
    const applyCost = REFORGE_APPLY_COSTS[tier] || REFORGE_APPLY_COSTS.LEGENDARY;

    return {
      totalCost: stonePrice + applyCost,
      stoneName,
      stoneItemId,
      stonePrice,
      applyCost,
      isBasic: false,
    };
  }

  // Unknown reforge - assume basic with flat cost
  return {
    totalCost: BASIC_REFORGE_FLAT_COST,
    stoneName: null,
    stoneItemId: null,
    stonePrice: 0,
    applyCost: BASIC_REFORGE_FLAT_COST,
    isBasic: true,
  };
}

/**
 * Check if a reforge uses a reforge stone.
 */
function isStoneReforge(reforgeName) {
  return REFORGE_STONES.has((reforgeName || '').toLowerCase());
}

module.exports = { calculateReforgeCost, isStoneReforge, REFORGE_STONES, REFORGE_APPLY_COSTS, getBestPrice };
