/**
 * Item blacklist module.
 * Filters worthless items from AH flip results using:
 * A) Explicit blacklist of known trash items
 * B) Base-value threshold heuristic
 * C) Tier + expensive upgrades heuristic
 * D) User-configurable blacklist from data/blacklist.json
 */
const fs = require('fs');
const path = require('path');
const dataStore = require('../api/dataStore');

const USER_BLACKLIST_FILE = path.join(__dirname, '..', '..', 'data', 'blacklist.json');

// A) Explicit blacklist - items nobody buys upgraded
const BLACKLISTED_ITEMS = new Set([
  // Vanilla Weapons
  'WOOD_SWORD', 'STONE_SWORD', 'IRON_SWORD', 'GOLD_SWORD', 'DIAMOND_SWORD',
  'WOOD_AXE', 'STONE_AXE', 'IRON_AXE', 'GOLD_AXE', 'DIAMOND_AXE',
  'BOW',
  // Vanilla Armor
  'LEATHER_HELMET', 'LEATHER_CHESTPLATE', 'LEATHER_LEGGINGS', 'LEATHER_BOOTS',
  'CHAINMAIL_HELMET', 'CHAINMAIL_CHESTPLATE', 'CHAINMAIL_LEGGINGS', 'CHAINMAIL_BOOTS',
  'IRON_HELMET', 'IRON_CHESTPLATE', 'IRON_LEGGINGS', 'IRON_BOOTS',
  'GOLD_HELMET', 'GOLD_CHESTPLATE', 'GOLD_LEGGINGS', 'GOLD_BOOTS',
  'DIAMOND_HELMET', 'DIAMOND_CHESTPLATE', 'DIAMOND_LEGGINGS', 'DIAMOND_BOOTS',
  // Early SkyBlock Weapons
  'UNDEAD_SWORD', 'SPIDER_SWORD', 'SILVER_FANG', 'ROGUE_SWORD',
  'CLEAVER', 'ASPECT_OF_THE_JERRY',
  // Early SkyBlock Armor
  'FARM_SUIT_HELMET', 'FARM_SUIT_CHESTPLATE', 'FARM_SUIT_LEGGINGS', 'FARM_SUIT_BOOTS',
  'MINER_OUTFIT_HELMET', 'MINER_OUTFIT_CHESTPLATE', 'MINER_OUTFIT_LEGGINGS', 'MINER_OUTFIT_BOOTS',
  'LAPIS_ARMOR_HELMET', 'LAPIS_ARMOR_CHESTPLATE', 'LAPIS_ARMOR_LEGGINGS', 'LAPIS_ARMOR_BOOTS',
  'HARDENED_DIAMOND_HELMET', 'HARDENED_DIAMOND_CHESTPLATE', 'HARDENED_DIAMOND_LEGGINGS', 'HARDENED_DIAMOND_BOOTS',
  'GOLEM_ARMOR_HELMET', 'GOLEM_ARMOR_CHESTPLATE', 'GOLEM_ARMOR_LEGGINGS', 'GOLEM_ARMOR_BOOTS',
  'GROWTH_HELMET', 'GROWTH_CHESTPLATE', 'GROWTH_LEGGINGS', 'GROWTH_BOOTS',
  'PROTECTOR_HELMET', 'PROTECTOR_CHESTPLATE', 'PROTECTOR_LEGGINGS', 'PROTECTOR_BOOTS',
  // Vanilla Tools
  'WOOD_PICKAXE', 'STONE_PICKAXE', 'IRON_PICKAXE', 'GOLD_PICKAXE', 'DIAMOND_PICKAXE',
  'WOOD_SHOVEL', 'STONE_SHOVEL', 'IRON_SHOVEL', 'GOLD_SHOVEL', 'DIAMOND_SHOVEL',
  'FISHING_ROD',
  // Trash mob drops
  'ROTTEN_HELMET', 'ROTTEN_CHESTPLATE', 'ROTTEN_LEGGINGS', 'ROTTEN_BOOTS',
  'ZOMBIE_SOLDIER_HELMET', 'ZOMBIE_SOLDIER_CHESTPLATE', 'ZOMBIE_SOLDIER_LEGGINGS', 'ZOMBIE_SOLDIER_BOOTS',
  'SKELETON_SOLDIER_HELMET', 'SKELETON_SOLDIER_CHESTPLATE', 'SKELETON_SOLDIER_LEGGINGS', 'SKELETON_SOLDIER_BOOTS',
]);

// Wildcard prefixes for pattern matching
const BLACKLISTED_PREFIXES = [
  'FARM_SUIT_', 'MINER_OUTFIT_', 'LAPIS_ARMOR_',
  'HARDENED_DIAMOND_', 'GOLEM_ARMOR_', 'GROWTH_', 'PROTECTOR_',
  'ROTTEN_', 'ZOMBIE_SOLDIER_', 'SKELETON_SOLDIER_',
];

let userBlacklist = new Set();

/**
 * Load user-configurable blacklist from data/blacklist.json.
 */
function loadUserBlacklist() {
  try {
    if (!fs.existsSync(USER_BLACKLIST_FILE)) return;
    const raw = fs.readFileSync(USER_BLACKLIST_FILE, 'utf8');
    const items = JSON.parse(raw);
    if (Array.isArray(items)) {
      userBlacklist = new Set(items);
      console.log(`[Blacklist] Loaded ${userBlacklist.size} user-blacklisted items`);
    }
  } catch (err) {
    console.error('[Blacklist] Failed to load user blacklist:', err.message);
  }
}

/**
 * Check if an item is on the explicit or user blacklist.
 */
function isExplicitlyBlacklisted(itemId) {
  if (BLACKLISTED_ITEMS.has(itemId)) return true;
  if (userBlacklist.has(itemId)) return true;

  for (const prefix of BLACKLISTED_PREFIXES) {
    if (itemId.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * B) Base-value threshold: if clean LBIN < 50K and item has significant upgrades.
 */
function isLowBaseWithUpgrades(itemId, upgrades) {
  if (!upgrades) return false;

  const lbin = dataStore.getLowestBin(itemId);
  if (lbin <= 0 || lbin >= 50000) return false;

  const enchantCount = upgrades.enchantments ? Object.keys(upgrades.enchantments).length : 0;
  const hasSignificantUpgrades = (
    enchantCount > 2 ||
    (upgrades.hotPotatoCount || 0) > 5 ||
    upgrades.recombobulated ||
    (upgrades.artOfWar || 0) > 0
  );

  return hasSignificantUpgrades;
}

/**
 * C) Tier filter: COMMON/UNCOMMON with expensive upgrades.
 */
function isCheapTierWithExpensiveUpgrades(tier, upgrades) {
  if (!upgrades) return false;
  if (tier !== 'COMMON' && tier !== 'UNCOMMON') return false;

  const hasExpensiveUpgrades = (
    upgrades.recombobulated ||
    (upgrades.hotPotatoCount || 0) > 10 || // Fuming HPBs
    (upgrades.artOfWar || 0) > 0
  );

  return hasExpensiveUpgrades;
}

/**
 * Main blacklist check.
 * @param {string} itemId
 * @param {string} tier - COMMON, UNCOMMON, etc.
 * @param {object|null} upgrades - { enchantments, hotPotatoCount, recombobulated, artOfWar, stars }
 * @returns {boolean} true if item should be filtered out
 */
function isBlacklisted(itemId, tier, upgrades) {
  if (isExplicitlyBlacklisted(itemId)) return true;
  if (isLowBaseWithUpgrades(itemId, upgrades)) return true;
  if (isCheapTierWithExpensiveUpgrades(tier, upgrades)) return true;
  return false;
}

module.exports = { isBlacklisted, loadUserBlacklist };
