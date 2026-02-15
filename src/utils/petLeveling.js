/**
 * Pet XP table and level calculation for Hypixel SkyBlock.
 * Cumulative XP required per level for each rarity tier.
 * Common-Legendary: 100 levels, Mythic: 200 levels.
 */

// Per-level XP requirements (not cumulative) - levels 1 through 100
const PET_LEVEL_XP = [
  0, 100, 110, 120, 130, 145, 160, 175, 190, 210,
  230, 250, 275, 300, 330, 360, 400, 440, 490, 540,
  600, 660, 730, 800, 880, 960, 1050, 1150, 1260, 1380,
  1510, 1650, 1800, 1960, 2130, 2310, 2500, 2700, 2920, 3160,
  3420, 3700, 4000, 4350, 4750, 5200, 5700, 6300, 7000, 7800,
  8700, 9700, 10800, 12000, 13300, 14700, 16200, 17800, 19500, 21300,
  23200, 25200, 27400, 29800, 32400, 35200, 38200, 41400, 44800, 48400,
  52200, 56200, 60400, 64800, 69400, 74200, 79200, 84500, 90000, 95800,
  101800, 108100, 114700, 121600, 128800, 136300, 144100, 152200, 160600, 169300,
  178300, 187600, 197300, 207400, 217800, 228600, 239800, 251400, 263400, 275800,
];

// Additional XP per level for levels 101-200 (mythic pets only)
const PET_LEVEL_XP_MYTHIC = [
  // Levels 101-200
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
  5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555, 5555,
];

// Rarity offset: how many levels to skip at the start
const RARITY_OFFSET = {
  COMMON: 0,
  UNCOMMON: 6,
  RARE: 11,
  EPIC: 16,
  LEGENDARY: 20,
  MYTHIC: 20,
};

/**
 * Calculate pet level from total XP and rarity tier.
 * @param {number} exp - Total pet XP
 * @param {string} tier - Pet rarity (COMMON, UNCOMMON, RARE, EPIC, LEGENDARY, MYTHIC)
 * @returns {number} Pet level (1-100 for non-mythic, 1-200 for mythic)
 */
function petExpToLevel(exp, tier) {
  const offset = RARITY_OFFSET[tier] || 0;
  const maxLevel = tier === 'MYTHIC' ? 200 : 100;

  let remainingXp = exp;
  let level = 1;

  // Levels using the standard table (offset to 100)
  for (let i = offset; i < PET_LEVEL_XP.length; i++) {
    const required = PET_LEVEL_XP[i];
    if (remainingXp < required) break;
    remainingXp -= required;
    level++;
    if (level >= maxLevel) return maxLevel;
  }

  // Mythic extra levels (101-200)
  if (tier === 'MYTHIC' && level >= 100) {
    for (let i = 0; i < PET_LEVEL_XP_MYTHIC.length; i++) {
      const required = PET_LEVEL_XP_MYTHIC[i];
      if (remainingXp < required) break;
      remainingXp -= required;
      level++;
      if (level >= maxLevel) return maxLevel;
    }
  }

  return Math.min(level, maxLevel);
}

module.exports = { petExpToLevel, RARITY_OFFSET };
