/**
 * NPC buy prices - what you PAY an NPC to buy items FROM them.
 * These are NOT in the Hypixel API and must be maintained manually.
 *
 * Used to filter out false flips: if an item is sold by an NPC for X coins,
 * any bazaar/AH "flip" where buy price >= X is not a real opportunity since
 * anyone can just buy it from the NPC.
 *
 * Sources: Hypixel SkyBlock wiki, in-game NPC shops.
 * Last updated: 2025-02
 */

const NPC_BUY_PRICES = new Map([
  // ---- Builder (Hub) ----
  ['COBBLESTONE', 3],
  ['OAK_LOG', 5],   // also DARK_OAK_LOG etc
  ['BIRCH_LOG', 5],
  ['SPRUCE_LOG', 5],
  ['JUNGLE_LOG', 5],
  ['ACACIA_LOG', 5],
  ['DARK_OAK_LOG', 5],
  ['OAK_PLANKS', 2],
  ['GLASS', 3],
  ['SAND', 2],
  ['GRAVEL', 5],
  ['STONE', 3.5],
  ['DIRT', 1],

  // ---- Farm Merchant ----
  ['WHEAT', 1],
  ['WHEAT_SEEDS', 1],
  ['CARROT', 1],
  ['POTATO', 1],
  ['MELON', 0.5],
  ['PUMPKIN', 4],
  ['SUGAR_CANE', 2],
  ['CACTUS', 1],
  ['NETHER_WART', 4],
  ['COCOA_BEANS', 3],
  ['MUSHROOM', 4],  // RED_MUSHROOM / BROWN_MUSHROOM
  ['RED_MUSHROOM', 4],
  ['BROWN_MUSHROOM', 4],

  // ---- Mine Merchant ----
  ['COAL', 4],
  ['IRON_INGOT', 5],
  ['GOLD_INGOT', 6],
  ['DIAMOND', 8],
  ['EMERALD', 6],
  ['LAPIS_LAZULI', 2],
  ['REDSTONE', 3],

  // ---- Fish Merchant ----
  ['RAW_FISH', 20],
  ['RAW_SALMON', 30],
  ['CLOWNFISH', 100],
  ['PUFFERFISH', 40],
  ['PRISMARINE_SHARD', 8],
  ['PRISMARINE_CRYSTALS', 8],
  ['SPONGE', 200],
  ['LILY_PAD', 1],
  ['INK_SACK', 4],

  // ---- Lumber Merchant (Park) ----
  ['BONE', 8],
  ['STRING', 3],
  ['SLIME_BALL', 5],
  ['ROTTEN_FLESH', 2],
  ['SPIDER_EYE', 3],
  ['GUNPOWDER', 4],
  ['ENDER_PEARL', 7],

  // ---- Blacksmith ----
  ['IRON_SWORD', 36],
  ['IRON_HELMET', 180],
  ['IRON_CHESTPLATE', 288],
  ['IRON_LEGGINGS', 252],
  ['IRON_BOOTS', 144],
  ['DIAMOND_SWORD', 100],
  ['DIAMOND_HELMET', 500],
  ['DIAMOND_CHESTPLATE', 800],
  ['DIAMOND_LEGGINGS', 700],
  ['DIAMOND_BOOTS', 400],

  // ---- Alchemist ----
  ['NETHER_WART', 4],
  ['BLAZE_ROD', 9],
  ['GHAST_TEAR', 200],
  ['MAGMA_CREAM', 20],
  ['GLOWSTONE_DUST', 4],
  ['FERMENTED_SPIDER_EYE', 40],
  ['GLASS_BOTTLE', 3],

  // ---- Wool Weaver ----
  ['WHITE_WOOL', 2],

  // ---- Adventurer (Hub) ----
  ['ROTTEN_FLESH', 2],
  ['BONE', 8],
  ['ARROW', 3],
  ['BOW', 36],

  // ---- Pet items (various) ----
  ['WATER_BUCKET', 50],
  ['SNOWBALL', 1],

  // ---- Bazaar-relevant NPC items ----
  ['HAY_BALE', 9],
  ['JACK_O_LANTERN', 9],
  ['PACKED_ICE', 9],

  // ---- Dyes / Misc ----
  ['DANDELION', 1],
  ['POPPY', 1],

  // ---- Elizabeth (Bits Shop) - approximate coin value of bits items ----
  // These are special: bought with bits, not coins. Excluded from NPC price check.

  // ---- Jerry (Jerry's Workshop) ----
  ['SNOW_BLOCK', 2],
  ['ICE', 1],

  // ---- Lumber Merchant items ----
  ['FEATHER', 3],
  ['LEATHER', 3],
  ['RAW_CHICKEN', 4],
  ['MUTTON', 5],
  ['RAW_PORKCHOP', 5],
  ['RAW_RABBIT', 5],
  ['RAW_BEEF', 4],

  // ---- Adventurer NPCs (Crimson Isle etc.) ----
  ['MAGMA_CREAM', 20],
  ['BLAZE_ROD', 9],
  ['NETHER_BRICK', 1],
  ['QUARTZ', 4],
  ['NETHERRACK', 1],
  ['SOUL_SAND', 3],
  ['NETHER_STALK', 4],   // Alias for NETHER_WART in some contexts
  ['GLOWSTONE', 16],     // 4 glowstone dust

  // ---- Enchanted items NOT sold by NPC ----
  // (enchanted versions are NOT available from NPC, only base mats)

  // ---- High-value NPC items ----
  // Note: BOOSTER_COOKIE is NOT included - Elizabeth sells it for Bits, not coins.
  // Including it as 4M would create false bazaar flips.

  // ---- Composter items ----
  ['COMPOST', 2000],  // From the composter NPC
]);

/**
 * Get the NPC buy price for an item (what you pay to buy FROM the NPC).
 * Returns -1 if the item is not sold by any NPC.
 */
function getNpcBuyPrice(itemId) {
  return NPC_BUY_PRICES.get(itemId) ?? -1;
}

/**
 * Check if an item can be purchased from an NPC.
 */
function isNpcBuyable(itemId) {
  return NPC_BUY_PRICES.has(itemId);
}

/**
 * Get all NPC buy prices.
 */
function getAllNpcBuyPrices() {
  return NPC_BUY_PRICES;
}

module.exports = { getNpcBuyPrice, isNpcBuyable, getAllNpcBuyPrices, NPC_BUY_PRICES };
