/**
 * Upgrade value calculator.
 * Estimates the value of upgraded items (enchantments, HPBs, recombobulator, etc.)
 * and finds underpriced auctions where listed price < estimated value.
 */
const dataStore = require('../api/dataStore');
const {
  calculateAhFlipProfit,
  calculateProfitPercent,
} = require('./profitCalculator');
const { calculateStarCost } = require('../utils/essenceCosts');
const { calculateReforgeCost } = require('../utils/reforgeCosts');

/**
 * Calculate effective price for an enchantment book.
 *
 * Compares buy-order price of the target level book vs cost of buying
 * tier-1 books via buy orders and combining them.
 *
 * For high-tier books with little/no insta-sell volume, the buy-order price
 * is unreliable (nobody fills it). In that case, the tier-1 combine cost
 * is more accurate. Uses a volume + competition weighted formula to blend.
 *
 * @param {string} enchName - Enchantment name (uppercase)
 * @param {number} level - Target enchantment level
 * @param {Map} products - All bazaar products
 * @returns {{ effectivePrice: number, method: string, directPrice: number, combinePrice: number }}
 */
function calculateEffectiveEnchantPrice(enchName, level, products) {
  const directId = `ENCHANTMENT_${enchName}_${level}`;
  const directProduct = products.get(directId);
  const directPrice = (directProduct && directProduct.sellPrice > 0) ? directProduct.sellPrice : 0;
  const directSellVolume = directProduct ? (directProduct.sellMovingWeek || 0) : 0;
  const directBuyOrders = directProduct ? (directProduct.buyOrders || 0) : 0;

  // For level 1 books, just return direct price (nothing to combine from)
  if (level <= 1) {
    return { effectivePrice: directPrice, method: 'direct', directPrice, combinePrice: 0 };
  }

  // Calculate tier-1 combine cost: 2^(level-1) tier-1 books
  const tier1Id = `ENCHANTMENT_${enchName}_1`;
  const tier1Product = products.get(tier1Id);
  const tier1Price = (tier1Product && tier1Product.sellPrice > 0) ? tier1Product.sellPrice : 0;
  const tier1Count = Math.pow(2, level - 1);
  const combinePrice = tier1Price > 0 ? tier1Price * tier1Count : 0;

  // If we can't get either price, return whatever we have
  if (directPrice <= 0 && combinePrice <= 0) {
    return { effectivePrice: 0, method: 'none', directPrice: 0, combinePrice: 0 };
  }
  if (directPrice <= 0) {
    return { effectivePrice: combinePrice, method: 'combine', directPrice: 0, combinePrice };
  }
  if (combinePrice <= 0) {
    return { effectivePrice: directPrice, method: 'direct', directPrice, combinePrice: 0 };
  }

  // If tier-1 combining is cheaper or equal, use it (always achievable)
  if (combinePrice <= directPrice) {
    return { effectivePrice: combinePrice, method: 'combine', directPrice, combinePrice };
  }

  // Direct is cheaper but may be unreliable for low-volume books.
  // Compute reliability based on actual insta-sell volume and competition.

  // Daily insta-sell volume (how many books get sold per day)
  const dailySellVolume = directSellVolume / 7;

  // Competition factor: your chance of being the one whose order gets filled.
  // With N competing buy orders, your expected share is ~1/N.
  const competingOrders = Math.max(1, directBuyOrders);
  const fillShare = 1 / competingOrders;

  // Expected daily fills for YOUR order specifically
  const expectedDailyFills = dailySellVolume * fillShare;

  // Reliability score: sigmoid-like mapping
  // 0 fills/day → 0, 0.5 → 0.33, 1 → 0.5, 3 → 0.75, 10+ → ~0.91
  const reliability = expectedDailyFills > 0
    ? expectedDailyFills / (expectedDailyFills + 1)
    : 0;

  // Blend between direct and combine price
  const effectivePrice = directPrice * reliability + combinePrice * (1 - reliability);

  return {
    effectivePrice: Math.round(effectivePrice),
    method: reliability >= 0.5 ? 'direct' : 'combine',
    directPrice,
    combinePrice,
  };
}

/**
 * Calculate the total value of upgrades applied to an item.
 * @param {object} upgrades - { enchantments, hotPotatoCount, recombobulated, artOfWar, stars, reforge }
 * @param {string} [itemId] - Item ID (needed for star cost calculation)
 * @param {string} [tier] - Item rarity (needed for reforge cost calculation)
 * @returns {{ totalValue: number, breakdown: object, ... }}
 */
function calculateUpgradeValue(upgrades, itemId, tier) {
  const products = dataStore.getAllProducts();
  let totalValue = 0;
  const breakdown = {};

  // Enchantments: smart pricing with tier-1 combine comparison
  const enchantmentDetails = [];
  if (upgrades.enchantments) {
    let enchantValue = 0;
    for (const [enchName, level] of Object.entries(upgrades.enchantments)) {
      const bazaarId = `ENCHANTMENT_${enchName.toUpperCase()}_${level}`;
      const result = calculateEffectiveEnchantPrice(enchName.toUpperCase(), level, products);
      enchantmentDetails.push({
        name: enchName,
        level,
        bazaarId,
        price: result.effectivePrice,
        method: result.method,
        directPrice: result.directPrice,
        combinePrice: result.combinePrice,
      });
      enchantValue += result.effectivePrice;
    }
    if (enchantValue > 0) {
      breakdown.enchantments = enchantValue;
      totalValue += enchantValue;
    }
  }

  // Hot Potato Books: 1-10 = HOT_POTATO_BOOK, 11-15 = FUMING_POTATO_BOOK
  let hotPotatoDetails = null;
  if (upgrades.hotPotatoCount > 0) {
    const hpbProduct = products.get('HOT_POTATO_BOOK');
    const fumingProduct = products.get('FUMING_POTATO_BOOK');
    const hpbPrice = hpbProduct?.sellPrice || 0;
    const fumingPrice = fumingProduct?.sellPrice || 0;

    const normalCount = Math.min(upgrades.hotPotatoCount, 10);
    const fumingCount = Math.max(0, upgrades.hotPotatoCount - 10);

    const hpbValue = normalCount * hpbPrice + fumingCount * fumingPrice;
    hotPotatoDetails = { normalCount, fumingCount, normalPrice: hpbPrice, fumingPrice, totalValue: hpbValue };
    if (hpbValue > 0) {
      breakdown.hotPotato = hpbValue;
      totalValue += hpbValue;
    }
  }

  // Recombobulator
  let recombobulatorPrice = 0;
  if (upgrades.recombobulated) {
    const recombProduct = products.get('RECOMBOBULATOR_3000');
    if (recombProduct && recombProduct.sellPrice > 0) {
      recombobulatorPrice = recombProduct.sellPrice;
      breakdown.recombobulator = recombProduct.sellPrice;
      totalValue += recombProduct.sellPrice;
    }
  }

  // Art of War
  let artOfWarPrice = 0;
  if (upgrades.artOfWar > 0) {
    const aowProduct = products.get('THE_ART_OF_WAR');
    if (aowProduct && aowProduct.sellPrice > 0) {
      artOfWarPrice = aowProduct.sellPrice;
      breakdown.artOfWar = aowProduct.sellPrice;
      totalValue += aowProduct.sellPrice;
    }
  }

  // Stars (essence costs)
  let starDetails = null;
  if (upgrades.stars > 0 && itemId) {
    const starResult = calculateStarCost(itemId, upgrades.stars);
    if (starResult && starResult.totalEssenceCost > 0) {
      starDetails = starResult;
      breakdown.stars = starResult.totalEssenceCost;
      totalValue += starResult.totalEssenceCost;
    }
  }

  // Wood Singularity
  let woodSingularityPrice = 0;
  if (upgrades.woodSingularity > 0) {
    const wsProduct = products.get('WOOD_SINGULARITY');
    if (wsProduct && wsProduct.sellPrice > 0) {
      woodSingularityPrice = wsProduct.sellPrice;
      breakdown.woodSingularity = wsProduct.sellPrice;
      totalValue += wsProduct.sellPrice;
    }
  }

  // Mana Disintegrator
  let manaDisintegratorPrice = 0;
  if (upgrades.manaDisintegrator > 0) {
    const mdProduct = products.get('MANA_DISINTEGRATOR');
    if (mdProduct && mdProduct.sellPrice > 0) {
      manaDisintegratorPrice = mdProduct.sellPrice * upgrades.manaDisintegrator;
      breakdown.manaDisintegrator = manaDisintegratorPrice;
      totalValue += manaDisintegratorPrice;
    }
  }

  // Tuned Transmission
  let tunedTransmissionPrice = 0;
  if (upgrades.tunedTransmission > 0) {
    const ttProduct = products.get('TRANSMISSION_TUNER');
    if (ttProduct && ttProduct.sellPrice > 0) {
      tunedTransmissionPrice = ttProduct.sellPrice * upgrades.tunedTransmission;
      breakdown.tunedTransmission = tunedTransmissionPrice;
      totalValue += tunedTransmissionPrice;
    }
  }

  // Reforge (stone + apply cost)
  let reforgeDetails = null;
  if (upgrades.reforge) {
    const reforgeResult = calculateReforgeCost(upgrades.reforge, tier || 'LEGENDARY');
    if (reforgeResult && reforgeResult.totalCost > 0) {
      reforgeDetails = reforgeResult;
      breakdown.reforge = reforgeResult.totalCost;
      totalValue += reforgeResult.totalCost;
    }
  }

  return {
    totalValue,
    breakdown,
    enchantmentDetails,
    hotPotatoDetails,
    recombobulatorPrice,
    artOfWarPrice,
    woodSingularityPrice,
    manaDisintegratorPrice,
    tunedTransmissionPrice,
    starDetails,
    reforgeDetails,
  };
}

/**
 * Calculate upgrade flip opportunities.
 * Finds BIN auctions where listed price < base item + upgrade value.
 */
function calculateUpgradeFlips() {
  const binIndex = dataStore.getAuctionBinIndex();
  const lowestBins = dataStore.getLowestBins();

  if (!binIndex || binIndex.size === 0) return [];

  const allFlips = [];
  const margin = 0.05; // 5% safety margin

  for (const [itemId, itemAuctions] of binIndex) {
    if (!itemId || itemId === 'PET') continue;

    for (const auction of itemAuctions) {
      // Only analyze BIN auctions with price > 100K
      if (auction.price <= 100000) continue;

      // Must have upgrade data from NBT extraction
      const upgrades = auction.upgrades;
      if (!upgrades) continue;

      // Count total upgrades to see if item is actually upgraded
      const hasUpgrades = (
        (upgrades.enchantments && Object.keys(upgrades.enchantments).length > 0) ||
        (upgrades.hotPotatoCount > 0) ||
        upgrades.recombobulated ||
        (upgrades.artOfWar > 0) ||
        (upgrades.stars > 0) ||
        upgrades.reforge ||
        (upgrades.woodSingularity > 0) ||
        (upgrades.manaDisintegrator > 0) ||
        (upgrades.tunedTransmission > 0)
      );
      if (!hasUpgrades) continue;

      // Base price = LBIN of the base item (without upgrades)
      const basePrice = lowestBins.get(itemId);
      if (!basePrice || basePrice <= 0) continue;

      // Calculate upgrade value
      const { totalValue, breakdown } = calculateUpgradeValue(upgrades, itemId, auction.tier);
      if (totalValue <= 0) continue;

      const estimatedValue = basePrice + totalValue;
      const listedPrice = auction.price;

      // Only a flip if listed well below estimated value
      if (listedPrice >= estimatedValue * (1 - margin)) continue;

      const profit = calculateAhFlipProfit(listedPrice, estimatedValue);
      if (profit <= 0) continue;

      const profitPercent = calculateProfitPercent(profit, listedPrice);

      // Check for cheaper alternatives with similar upgrades
      const alternatives = findCheaperAlternatives(itemId, upgrades, listedPrice, binIndex);

      allFlips.push({
        uuid: auction.uuid,
        itemId,
        itemName: auction.itemName || dataStore.getItemName(itemId),
        tier: auction.tier || 'COMMON',
        listedPrice,
        basePrice,
        upgradeValue: totalValue,
        estimatedValue,
        profit,
        profitPercent,
        breakdown,
        upgrades: {
          enchantCount: upgrades.enchantments ? Object.keys(upgrades.enchantments).length : 0,
          hotPotatoCount: upgrades.hotPotatoCount || 0,
          recombobulated: !!upgrades.recombobulated,
          artOfWar: upgrades.artOfWar || 0,
          stars: upgrades.stars || 0,
          woodSingularity: upgrades.woodSingularity || 0,
          manaDisintegrator: upgrades.manaDisintegrator || 0,
          tunedTransmission: upgrades.tunedTransmission || 0,
        },
        cheaperAlternative: alternatives.length > 0 ? alternatives[0] : null,
        flipType: 'upgrade',
        petInfo: auction.petInfo || null,
      });
    }
  }

  allFlips.sort((a, b) => b.profit - a.profit);
  return allFlips;
}

/**
 * Find cheaper alternative auctions for the same item with similar or better upgrades.
 */
function findCheaperAlternatives(itemId, targetUpgrades, targetPrice, binIndex) {
  const auctions = binIndex.get(itemId);
  if (!auctions) return [];

  const alternatives = [];
  const targetUpgradeLevel = getUpgradeLevel(targetUpgrades);
  const tier = auctions[0]?.tier || 'LEGENDARY';

  for (const auction of auctions) {
    if (auction.price >= targetPrice) continue;
    if (!auction.upgrades) continue;

    const auctionUpgradeLevel = getUpgradeLevel(auction.upgrades);

    if (auctionUpgradeLevel >= targetUpgradeLevel * 0.8) {
      const missingUpgradeCost = calculateMissingUpgradeCost(auction.upgrades, targetUpgrades, itemId, auction.tier || tier);
      const totalCostViaAlternative = auction.price + missingUpgradeCost;

      if (totalCostViaAlternative < targetPrice) {
        alternatives.push({
          uuid: auction.uuid,
          price: auction.price,
          upgradeLevel: auctionUpgradeLevel,
          totalCost: totalCostViaAlternative,
          savings: targetPrice - totalCostViaAlternative,
        });
      }
    }
  }

  alternatives.sort((a, b) => a.totalCost - b.totalCost);
  return alternatives;
}

/**
 * Get a numeric "upgrade level" score for comparison.
 */
function getUpgradeLevel(upgrades) {
  let level = 0;
  if (upgrades.enchantments) {
    level += Object.values(upgrades.enchantments).reduce((a, b) => a + b, 0);
  }
  level += (upgrades.hotPotatoCount || 0);
  level += (upgrades.stars || 0) * 5;
  if (upgrades.recombobulated) level += 10;
  if (upgrades.artOfWar > 0) level += 5;
  if (upgrades.woodSingularity > 0) level += 5;
  level += (upgrades.manaDisintegrator || 0) * 2;
  level += (upgrades.tunedTransmission || 0) * 2;
  return level;
}

/**
 * Estimate the cost of upgrades present in target but missing from source.
 * @param {object} sourceUpgrades - Upgrades on the source item
 * @param {object} targetUpgrades - Upgrades on the target item
 * @param {string} [itemId] - Item ID (for star cost calculation)
 * @param {string} [tier] - Item rarity (for reforge cost calculation)
 */
function calculateMissingUpgradeCost(sourceUpgrades, targetUpgrades, itemId, tier) {
  const products = dataStore.getAllProducts();
  let cost = 0;

  if (targetUpgrades.enchantments) {
    const sourceEnch = sourceUpgrades.enchantments || {};
    for (const [enchName, level] of Object.entries(targetUpgrades.enchantments)) {
      if (!sourceEnch[enchName] || sourceEnch[enchName] < level) {
        const result = calculateEffectiveEnchantPrice(enchName.toUpperCase(), level, products);
        cost += result.effectivePrice;
      }
    }
  }

  const sourceHpb = sourceUpgrades.hotPotatoCount || 0;
  const targetHpb = targetUpgrades.hotPotatoCount || 0;
  if (targetHpb > sourceHpb) {
    const hpbProduct = products.get('HOT_POTATO_BOOK');
    const fumingProduct = products.get('FUMING_POTATO_BOOK');
    const hpbPrice = hpbProduct?.sellPrice || 0;
    const fumingPrice = fumingProduct?.sellPrice || 0;
    for (let i = sourceHpb + 1; i <= targetHpb; i++) {
      cost += i <= 10 ? hpbPrice : fumingPrice;
    }
  }

  if (targetUpgrades.recombobulated && !sourceUpgrades.recombobulated) {
    const recombProduct = products.get('RECOMBOBULATOR_3000');
    if (recombProduct) cost += recombProduct.sellPrice || 0;
  }

  if ((targetUpgrades.artOfWar || 0) > (sourceUpgrades.artOfWar || 0)) {
    const aowProduct = products.get('THE_ART_OF_WAR');
    if (aowProduct) cost += aowProduct.sellPrice || 0;
  }

  // Star cost difference: if target has more stars, compute incremental essence cost
  const sourceStars = sourceUpgrades.stars || 0;
  const targetStars = targetUpgrades.stars || 0;
  if (targetStars > sourceStars && itemId) {
    // Calculate cost for all stars up to target, subtract cost for stars up to source
    const targetStarCost = calculateStarCost(itemId, targetStars);
    const sourceStarCost = sourceStars > 0 ? calculateStarCost(itemId, sourceStars) : null;
    const targetCostVal = targetStarCost ? targetStarCost.totalEssenceCost : 0;
    const sourceCostVal = sourceStarCost ? sourceStarCost.totalEssenceCost : 0;
    cost += Math.max(0, targetCostVal - sourceCostVal);
  }

  // Reforge cost difference: if target has a reforge the source doesn't, compute cost
  if (targetUpgrades.reforge && targetUpgrades.reforge !== sourceUpgrades.reforge) {
    const reforgeCost = calculateReforgeCost(targetUpgrades.reforge, tier || 'LEGENDARY');
    if (reforgeCost) cost += reforgeCost.totalCost;
  }

  // Wood Singularity difference
  if ((targetUpgrades.woodSingularity || 0) > (sourceUpgrades.woodSingularity || 0)) {
    const wsProduct = products.get('WOOD_SINGULARITY');
    if (wsProduct) cost += wsProduct.sellPrice || 0;
  }

  // Mana Disintegrator difference
  const sourceMd = sourceUpgrades.manaDisintegrator || 0;
  const targetMd = targetUpgrades.manaDisintegrator || 0;
  if (targetMd > sourceMd) {
    const mdProduct = products.get('MANA_DISINTEGRATOR');
    if (mdProduct && mdProduct.sellPrice > 0) {
      cost += mdProduct.sellPrice * (targetMd - sourceMd);
    }
  }

  // Tuned Transmission difference
  const sourceTt = sourceUpgrades.tunedTransmission || 0;
  const targetTt = targetUpgrades.tunedTransmission || 0;
  if (targetTt > sourceTt) {
    const ttProduct = products.get('TRANSMISSION_TUNER');
    if (ttProduct && ttProduct.sellPrice > 0) {
      cost += ttProduct.sellPrice * (targetTt - sourceTt);
    }
  }

  return cost;
}

module.exports = { calculateUpgradeFlips, calculateUpgradeValue };
