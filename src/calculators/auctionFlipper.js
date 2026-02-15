/**
 * Auction House flip calculator.
 * Groups BIN auctions by item ID and finds underpriced listings
 * by comparing the cheapest against the second-cheapest BIN.
 * The LBIN from lb.tricked.dev is used as a reference price cap.
 *
 * Supports modes: 'bin' (BIN flips), 'auction' (normal auction flips), 'both'.
 */
const dataStore = require('../api/dataStore');
const {
  calculateAhFlipProfit,
  calculateAhListingFee,
  calculateAhClaimTax,
  calculateProfitPercent,
} = require('./profitCalculator');
const { calculateUpgradeValue } = require('./upgradeCalculator');
const { isBlacklisted } = require('../utils/itemBlacklist');
const { calculateSellabilityScore, getConfidenceLabel } = require('./sellabilityScorer');
const { getNpcBuyPrice } = require('../utils/npcBuyPrices');

/**
 * Calculate profitable AH flips.
 * @param {'bin'|'auction'|'both'} mode - Which auction types to analyze
 */
function calculateAhFlips(mode = 'bin') {
  const results = [];

  if (mode === 'bin' || mode === 'both') {
    results.push(...calculateBinFlips());
  }

  if (mode === 'auction' || mode === 'both') {
    results.push(...calculateAuctionFlips());
  }

  // Attach sellability scores
  for (const flip of results) {
    flip.sellabilityScore = calculateSellabilityScore(flip);
    flip.confidenceLabel = getConfidenceLabel(flip.sellabilityScore);
    flip.dailySales = dataStore.getDailySales(flip.itemId);
    flip.activeListings = dataStore.getActiveListingCount(flip.itemId);
  }

  // Sort by sellability-weighted profit
  results.sort((a, b) => {
    const scoreA = a.netProfit * (0.3 + 0.7 * a.sellabilityScore);
    const scoreB = b.netProfit * (0.3 + 0.7 * b.sellabilityScore);
    return scoreB - scoreA;
  });
  return results;
}

/**
 * Calculate the craft cost for a specific item if a recipe exists.
 * Uses the cheapest source for each ingredient (NPC, Bazaar, AH LBIN).
 * Returns 0 if no recipe exists or ingredients can't be sourced.
 */
function getItemCraftCost(itemId) {
  const recipes = dataStore.getRecipes();
  const products = dataStore.getAllProducts();
  const lowestBins = dataStore.getLowestBins();

  const recipe = recipes.get(itemId);
  if (!recipe) return 0;

  let totalCost = 0;

  for (const [materialId, amount] of Object.entries(recipe.ingredients)) {
    let bestPrice = Infinity;

    const npcPrice = getNpcBuyPrice(materialId);
    if (npcPrice > 0 && npcPrice < bestPrice) bestPrice = npcPrice;

    const bazaarMaterial = products.get(materialId);
    if (bazaarMaterial && bazaarMaterial.sellPrice > 0 && bazaarMaterial.sellPrice < bestPrice) {
      bestPrice = bazaarMaterial.sellPrice;
    }

    const lbinPrice = lowestBins.get(materialId);
    if (lbinPrice && lbinPrice > 0 && lbinPrice < bestPrice) {
      bestPrice = lbinPrice;
    }

    if (!isFinite(bestPrice)) return 0; // can't source this ingredient

    totalCost += bestPrice * amount;
  }

  // Adjust for result count (recipe might produce multiple items)
  const resultCount = recipe.resultCount || 1;
  return totalCost / resultCount;
}

/**
 * BIN flip strategy (ping tool): compare cheapest BIN vs second-cheapest BIN only.
 * Uses smart price calculation:
 *   1. Start with second-cheapest BIN as sell reference
 *   2. Cap at external LBIN (conservative market-wide data)
 *   3. Cap at craft cost (item can't be worth more than its craft cost)
 *   4. Factor in upgrade values (upgraded items are worth base + upgrade value)
 *
 * Only uses BIN auctions - normal auctions are excluded.
 */
function calculateBinFlips() {
  const binIndex = dataStore.getAuctionBinIndex();
  const lowestBins = dataStore.getLowestBins();

  if (!binIndex || binIndex.size === 0) return [];

  const allFlips = [];

  for (const [itemId, itemAuctions] of binIndex) {
    if (!itemId || itemId === 'PET') continue;
    if (itemAuctions.length < 2) continue;

    // Already sorted by price ascending from the index
    const cheapest = itemAuctions[0];
    const secondCheapest = itemAuctions[1];

    // Blacklist check
    if (isBlacklisted(itemId, cheapest.tier || 'COMMON', cheapest.upgrades)) continue;

    const buyPrice = cheapest.price;

    // --- Smart sell reference calculation ---

    // Start with second cheapest BIN (direct market comparison, BIN-only)
    let sellRef = secondCheapest.price;

    // Cap at external LBIN (conservative, accounts for broader market data)
    const lbin = lowestBins.get(itemId);
    if (lbin && lbin > 0 && lbin < sellRef) {
      sellRef = lbin;
    }

    // Cap at craft cost: if item is craftable, nobody would pay more than craft cost
    const craftCost = getItemCraftCost(itemId);
    if (craftCost > 0 && craftCost < sellRef) {
      sellRef = craftCost;
    }

    // Upgrade value analysis for smart pricing
    let upgradeInfo = null;
    let upgradeBreakdown = null;
    if (cheapest.upgrades) {
      const upgradeResult = calculateUpgradeValue(cheapest.upgrades, itemId, cheapest.tier);
      const { totalValue, breakdown, enchantmentDetails, hotPotatoDetails, recombobulatorPrice, artOfWarPrice, woodSingularityPrice, manaDisintegratorPrice, tunedTransmissionPrice, starDetails, reforgeDetails } = upgradeResult;
      upgradeBreakdown = { enchantmentDetails, hotPotatoDetails, recombobulatorPrice, artOfWarPrice, woodSingularityPrice, manaDisintegratorPrice, tunedTransmissionPrice, starDetails, reforgeDetails };
      if (totalValue > 0) {
        const basePrice = lbin || sellRef;
        const estimatedTrueValue = basePrice + totalValue;
        upgradeInfo = {
          hasUpgrades: true,
          upgradeValue: totalValue,
          basePrice,
          estimatedTrueValue,
        };

        // If item has upgrades, the true value is higher than the base LBIN.
        // Use estimated true value as sell ref if higher, but never exceed
        // the second cheapest BIN (market reality check).
        if (estimatedTrueValue > sellRef && estimatedTrueValue <= secondCheapest.price) {
          sellRef = estimatedTrueValue;
        }
      }
    }

    if (buyPrice >= sellRef) continue;

    const netProfit = calculateAhFlipProfit(buyPrice, sellRef);
    if (netProfit <= 0) continue;

    const profitPercent = calculateProfitPercent(netProfit, buyPrice);
    const listingFee = calculateAhListingFee(sellRef);
    const claimTax = calculateAhClaimTax(sellRef);

    allFlips.push({
      uuid: cheapest.uuid,
      itemId,
      itemName: cheapest.itemName || dataStore.getItemName(itemId),
      tier: cheapest.tier || 'COMMON',
      category: cheapest.category || '',
      buyPrice,
      lowestBin: sellRef,
      grossProfit: sellRef - buyPrice,
      listingFee,
      claimTax,
      netProfit,
      profitPercent,
      ageMinutes: cheapest.ageMinutes || 0,
      auctioneer: cheapest.auctioneer || '',
      flipType: 'bin',
      petInfo: cheapest.petInfo || null,
      upgrades: cheapest.upgrades || null,
      upgradeBreakdown: upgradeBreakdown || null,
      upgradeInfo,
      craftCost: craftCost > 0 ? craftCost : null,
    });
  }

  return allFlips;
}

/**
 * Auction flip strategy: compare current bid of normal auctions vs LBIN.
 * Flip = LBIN - current bid - AH fees.
 */
function calculateAuctionFlips() {
  const normalIndex = dataStore.getAuctionNormalIndex();
  const lowestBins = dataStore.getLowestBins();

  if (!normalIndex || normalIndex.size === 0) return [];

  const allFlips = [];

  for (const [itemId, itemAuctions] of normalIndex) {
    if (!itemId || itemId === 'PET') continue;

    const lbin = lowestBins.get(itemId);
    if (!lbin || lbin <= 0) continue;

    for (const auction of itemAuctions) {
      // Blacklist check
      if (isBlacklisted(itemId, auction.tier || 'COMMON', auction.upgrades)) continue;

      const currentBid = auction.price; // highestBid or startingBid
      if (currentBid <= 0) continue;
      if (currentBid >= lbin) continue;

      const netProfit = calculateAhFlipProfit(currentBid, lbin);
      if (netProfit <= 0) continue;

      const profitPercent = calculateProfitPercent(netProfit, currentBid);
      const listingFee = calculateAhListingFee(lbin);
      const claimTax = calculateAhClaimTax(lbin);

      // Calculate time remaining
      const remaining = auction.end > 0 ? Math.max(0, Math.floor((auction.end - Date.now()) / 60000)) : 0;

      // Upgrade analysis
      let upgradeInfo = null;
      let upgradeBreakdownAuction = null;
      if (auction.upgrades) {
        const upgradeResult = calculateUpgradeValue(auction.upgrades, itemId, auction.tier);
        const { totalValue, enchantmentDetails, hotPotatoDetails, recombobulatorPrice, artOfWarPrice, woodSingularityPrice, manaDisintegratorPrice, tunedTransmissionPrice, starDetails, reforgeDetails } = upgradeResult;
        upgradeBreakdownAuction = { enchantmentDetails, hotPotatoDetails, recombobulatorPrice, artOfWarPrice, woodSingularityPrice, manaDisintegratorPrice, tunedTransmissionPrice, starDetails, reforgeDetails };
        if (totalValue > 0) {
          upgradeInfo = {
            hasUpgrades: true,
            upgradeValue: totalValue,
            basePrice: lowestBins.get(itemId) || 0,
            estimatedTrueValue: (lowestBins.get(itemId) || 0) + totalValue,
          };
        }
      }

      allFlips.push({
        uuid: auction.uuid,
        itemId,
        itemName: auction.itemName || dataStore.getItemName(itemId),
        tier: auction.tier || 'COMMON',
        category: auction.category || '',
        buyPrice: currentBid,
        lowestBin: lbin,
        grossProfit: lbin - currentBid,
        listingFee,
        claimTax,
        netProfit,
        profitPercent,
        ageMinutes: auction.ageMinutes || 0,
        remainingMinutes: remaining,
        auctioneer: auction.auctioneer || '',
        flipType: 'auction',
        petInfo: auction.petInfo || null,
        upgrades: auction.upgrades || null,
        upgradeBreakdown: upgradeBreakdownAuction || null,
        upgradeInfo,
      });
    }
  }

  return allFlips;
}

module.exports = { calculateAhFlips };
