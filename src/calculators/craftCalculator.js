/**
 * Craft flip calculator.
 * Calculates profit from crafting items using Bazaar/AH ingredients.
 * Port of CraftCalculator.java
 */
const dataStore = require('../api/dataStore');
const { getNpcBuyPrice } = require('../utils/npcBuyPrices');
const {
  calculateProfitPercent,
  estimateProfitPerHour,
} = require('./profitCalculator');

// Default bazaar tax rate
const DEFAULT_TAX_RATE = 1.25;

/**
 * Calculate all profitable craft flips.
 * For each recipe: compute ingredient costs, determine sell price,
 * calculate profit after tax.
 * Port of CraftCalculator.java:21-121
 */
function calculateCraftFlips() {
  const recipes = dataStore.getRecipes();
  const products = dataStore.getAllProducts();
  const lowestBins = dataStore.getLowestBins();

  if (recipes.size === 0 || products.size === 0) return [];

  const taxRate = DEFAULT_TAX_RATE;
  const craftFlips = [];

  for (const [itemId, recipe] of recipes) {
    let totalCost = 0;
    let canCalculate = true;
    const ingredientDetails = [];

    for (const [materialId, amount] of Object.entries(recipe.ingredients)) {
      // Check all sources: NPC, Bazaar, AH LBIN - take the cheapest
      let bestPrice = Infinity;
      let bestSource = null;

      // NPC price
      const npcPrice = getNpcBuyPrice(materialId);
      if (npcPrice > 0) {
        bestPrice = npcPrice;
        bestSource = 'npc';
      }

      // Bazaar price
      const bazaarMaterial = products.get(materialId);
      if (bazaarMaterial && bazaarMaterial.sellPrice > 0 && bazaarMaterial.sellPrice < bestPrice) {
        bestPrice = bazaarMaterial.sellPrice;
        bestSource = 'bazaar';
      }

      // AH LBIN price
      const lbinPrice = lowestBins.get(materialId);
      if (lbinPrice && lbinPrice > 0 && lbinPrice < bestPrice) {
        bestPrice = lbinPrice;
        bestSource = 'ah';
      }

      if (bestSource) {
        const cost = bestPrice * amount;
        totalCost += cost;
        ingredientDetails.push({
          itemId: materialId,
          name: dataStore.getItemName(materialId),
          amount,
          unitPrice: bestPrice,
          totalPrice: cost,
          source: bestSource,
        });
      } else {
        canCalculate = false;
        break;
      }
    }

    if (!canCalculate) continue;

    // Only show items that ARE in the Bazaar
    const resultId = recipe.resultItemId;
    const resultProduct = products.get(resultId);
    if (!resultProduct || resultProduct.buyPrice <= 0) {
      continue; // Not a BZ item, skip - ahCraftCalculator handles AH-only items
    }

    // Sell via bazaar buy order (instant sell)
    let sellPrice = resultProduct.topBuyOrderPrice > 0
      ? resultProduct.topBuyOrderPrice
      : resultProduct.buyPrice;

    if (sellPrice <= 0) continue;

    sellPrice *= (recipe.resultCount || 1);

    const afterTax = sellPrice * (1.0 - taxRate / 100.0);
    const profit = afterTax - totalCost;
    const profitPct = calculateProfitPercent(profit, totalCost);

    // Calculate volume-based metrics if bazaar product exists
    let dailyVolume = 0;
    let profitPerHour = 0;
    if (resultProduct) {
      dailyVolume = resultProduct.dailyVolume || 0;
      profitPerHour = estimateProfitPerHour(profit, dailyVolume, totalCost);
    }

    craftFlips.push({
      itemId: resultId,
      displayName: recipe.resultName || dataStore.getItemName(resultId),
      type: 'craft',
      craftCost: totalCost,
      sellPrice,
      profit,
      profitPercent: profitPct,
      dailyVolume: Math.floor(dailyVolume),
      estimatedProfitPerHour: profitPerHour,
      investment: totalCost,
      resultCount: recipe.resultCount || 1,
      ingredients: ingredientDetails,
    });
  }

  // Sort by profit descending
  craftFlips.sort((a, b) => b.profit - a.profit);

  return craftFlips;
}

module.exports = { calculateCraftFlips };
