/**
 * AH Craft flip calculator with Multi-LBIN pricing.
 * Sums the N cheapest BIN auctions for each ingredient rather than
 * multiplying the single cheapest price by count.
 */
const dataStore = require('../api/dataStore');
const { getNpcBuyPrice } = require('../utils/npcBuyPrices');
const {
  calculateAhFlipProfit,
  calculateProfitPercent,
} = require('./profitCalculator');

/**
 * Get the total cost to buy `count` of an item from the cheapest BIN auctions.
 * Sums individual prices rather than using cheapest * count.
 * @param {string} itemId
 * @param {number} count
 * @param {Map} binIndex - pre-built BIN auction index
 * @returns {{ totalCost: number, auctions: string[] } | null}
 */
function getMultiLbinCost(itemId, count, binIndex) {
  const auctions = binIndex.get(itemId);
  if (!auctions || auctions.length < count) return null;

  let totalCost = 0;
  const usedUuids = [];

  for (let i = 0; i < count; i++) {
    totalCost += auctions[i].price;
    usedUuids.push(auctions[i].uuid);
  }

  return { totalCost, auctions: usedUuids };
}

/**
 * Calculate AH craft flips using Multi-LBIN ingredient pricing.
 * For each recipe:
 *   - Per ingredient: compare bazaar price vs Multi-LBIN (take cheaper)
 *   - Sell price: LBIN of result item (AH sale)
 *   - Profit = sellPrice - AH fees - totalCost
 */
function calculateAhCraftFlips() {
  const recipes = dataStore.getRecipes();
  const products = dataStore.getAllProducts();
  const binIndex = dataStore.getAuctionBinIndex();
  const lowestBins = dataStore.getLowestBins();

  if (!recipes || recipes.size === 0) return [];
  if (!binIndex || binIndex.size === 0) return [];

  const craftFlips = [];

  for (const [itemId, recipe] of recipes) {
    let totalCost = 0;
    let canCalculate = true;
    const ingredientDetails = [];

    for (const [materialId, amount] of Object.entries(recipe.ingredients)) {
      // Option 1: NPC price
      let npcCost = Infinity;
      const npcPrice = getNpcBuyPrice(materialId);
      if (npcPrice > 0) {
        npcCost = npcPrice * amount;
      }

      // Option 2: Bazaar price
      let bazaarCost = Infinity;
      const bazaarMaterial = products.get(materialId);
      if (bazaarMaterial && bazaarMaterial.sellPrice > 0) {
        bazaarCost = bazaarMaterial.sellPrice * amount;
      }

      // Option 3: Multi-LBIN cost (sum of N cheapest AH auctions)
      let ahCost = Infinity;
      const multiLbin = getMultiLbinCost(materialId, amount, binIndex);
      if (multiLbin) {
        ahCost = multiLbin.totalCost;
      }

      // Take the cheapest source
      const cheapest = Math.min(npcCost, bazaarCost, ahCost);
      if (!isFinite(cheapest)) {
        canCalculate = false;
        break;
      }

      let source, unitPrice;
      if (cheapest === npcCost) {
        source = 'npc';
        unitPrice = npcPrice;
      } else if (cheapest === bazaarCost) {
        source = 'bazaar';
        unitPrice = bazaarMaterial.sellPrice;
      } else {
        source = 'ah';
        unitPrice = ahCost / amount;
      }

      totalCost += cheapest;
      ingredientDetails.push({
        itemId: materialId,
        name: dataStore.getItemName(materialId),
        amount,
        unitPrice,
        totalPrice: cheapest,
        source,
      });
    }

    if (!canCalculate) continue;

    // Only show items that are NOT in the Bazaar (AH-exclusive)
    const resultId = recipe.resultItemId;
    const resultProduct = products.get(resultId);
    if (resultProduct && (resultProduct.buyPrice > 0 || resultProduct.sellPrice > 0)) {
      continue; // This is a BZ item, skip - craftCalculator handles it
    }

    const resultCount = recipe.resultCount || 1;
    let sellPrice = 0;

    const lbin = lowestBins.get(resultId);
    if (lbin && lbin > 0) {
      sellPrice = lbin * resultCount;
    }

    if (sellPrice <= 0) continue;

    // Profit after AH fees (listing + claim tax)
    const profit = calculateAhFlipProfit(totalCost, sellPrice);
    if (profit <= 0) continue;

    const profitPercent = calculateProfitPercent(profit, totalCost);

    craftFlips.push({
      itemId: resultId,
      displayName: recipe.resultName || dataStore.getItemName(resultId),
      type: 'ahcraft',
      craftCost: totalCost,
      sellPrice,
      profit,
      profitPercent,
      investment: totalCost,
      resultCount,
      ingredients: ingredientDetails,
    });
  }

  craftFlips.sort((a, b) => b.profit - a.profit);
  return craftFlips;
}

module.exports = { calculateAhCraftFlips, getMultiLbinCost };
