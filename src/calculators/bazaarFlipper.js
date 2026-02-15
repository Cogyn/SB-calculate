/**
 * Bazaar flip calculator.
 * Direct 1:1 port of BazaarFlipper.java
 *
 * Calculates three types of flips:
 * - ORDER_FLIP:   Buy via buy order, sell via sell offer
 * - INSTANT_FLIP: Instant buy/sell spread
 * - NPC_FLIP:     Buy from bazaar, sell to NPC
 *
 * NPC buy price filter: If an item is sold by an NPC at price X,
 * we cap the sell price at X (since no one would pay more than the NPC price).
 */
const dataStore = require('../api/dataStore');
const { getNpcBuyPrice } = require('../utils/npcBuyPrices');
const {
  calculateBazaarOrderProfit,
  calculateBazaarInstantProfit,
  calculateProfitPercent,
  estimateProfitPerHour,
} = require('./profitCalculator');

// Default tax rate (server sends raw prices; tax can also be applied client-side)
const DEFAULT_TAX_RATE = 1.25;

/**
 * Calculate all flips from current bazaar data.
 * Port of BazaarFlipper.java:22-87
 */
function calculateFlips() {
  const products = dataStore.getAllProducts();
  if (products.size === 0) return [];

  const allFlips = [];
  const taxRate = DEFAULT_TAX_RATE;

  for (const product of products.values()) {
    if (product.dailyVolume <= 0) continue;

    // Check if this item can be bought from an NPC at a fixed price.
    // If so, the effective sell price can never exceed the NPC buy price
    // because anyone can undercut by just buying from the NPC.
    const npcBuy = getNpcBuyPrice(product.productId);

    // Order Flip: Buy Order -> Sell Offer
    // Port of BazaarFlipper.java:33-49
    if (product.topBuyOrderPrice > 0 && product.topSellOrderPrice > 0) {
      const buyAt = product.topBuyOrderPrice + 0.1;
      let sellAt = product.topSellOrderPrice - 0.1;

      // Cap sell price at NPC buy price: if an NPC sells for X, the bazaar
      // price will always converge back to X, so the flip is illusory.
      if (npcBuy > 0 && sellAt > npcBuy) {
        sellAt = npcBuy;
      }

      const profit = calculateBazaarOrderProfit(buyAt, sellAt, taxRate);

      if (profit > 0) {
        allFlips.push({
          productId: product.productId,
          displayName: dataStore.getItemName(product.productId),
          type: 'order',
          buyPrice: buyAt,
          sellPrice: sellAt,
          profit,
          profitPercent: calculateProfitPercent(profit, buyAt),
          dailyVolume: Math.floor(product.dailyVolume),
          estimatedProfitPerHour: estimateProfitPerHour(profit, product.dailyVolume, buyAt),
          investment: buyAt,
          sellOrders: product.sellOrders,
          buyOrders: product.buyOrders,
          npcBuyPrice: npcBuy > 0 ? npcBuy : undefined,
        });
      }
    }

    // Instant Flip: Instant Buy (topSellOrderPrice) -> Instant Sell (topBuyOrderPrice)
    // Uses top-of-book prices for accurate instant flip pricing
    if (product.topSellOrderPrice > 0 && product.topBuyOrderPrice > 0) {
      let instantBuyPrice = product.topSellOrderPrice;
      const instantSellPrice = product.topBuyOrderPrice;

      // If NPC sells this item cheaper than the bazaar instant-buy price,
      // you should buy from NPC instead. Cap buy price at NPC price.
      if (npcBuy > 0 && instantBuyPrice > npcBuy) {
        instantBuyPrice = npcBuy;
      }

      const profit = calculateBazaarInstantProfit(instantBuyPrice, instantSellPrice, taxRate);

      if (profit > 0) {
        allFlips.push({
          productId: product.productId,
          displayName: dataStore.getItemName(product.productId),
          type: 'instant',
          buyPrice: instantBuyPrice,
          sellPrice: instantSellPrice,
          profit,
          profitPercent: calculateProfitPercent(profit, instantBuyPrice),
          dailyVolume: Math.floor(product.dailyVolume),
          estimatedProfitPerHour: estimateProfitPerHour(profit, product.dailyVolume, instantBuyPrice),
          investment: instantBuyPrice,
          sellOrders: product.sellOrders,
          buyOrders: product.buyOrders,
          npcBuyPrice: npcBuy > 0 ? npcBuy : undefined,
        });
      }
    }

    // NPC Flip: Instant-buy from Bazaar -> Sell to NPC
    // Uses topSellOrderPrice (instant buy = lowest sell offer)
    let npcFlipBuyPrice = product.topSellOrderPrice > 0 ? product.topSellOrderPrice : product.sellPrice;

    // If NPC sells this item too, buy from NPC if cheaper
    if (npcBuy > 0 && npcFlipBuyPrice > npcBuy) {
      npcFlipBuyPrice = npcBuy;
    }

    if (product.npcSellPrice > 0 && npcFlipBuyPrice > 0) {
      const profit = product.npcSellPrice - npcFlipBuyPrice;

      if (profit > 0) {
        allFlips.push({
          productId: product.productId,
          displayName: dataStore.getItemName(product.productId),
          type: 'npc',
          buyPrice: npcFlipBuyPrice,
          sellPrice: product.npcSellPrice,
          profit,
          profitPercent: calculateProfitPercent(profit, npcFlipBuyPrice),
          dailyVolume: Math.floor(product.dailyVolume),
          estimatedProfitPerHour: estimateProfitPerHour(profit, product.dailyVolume, npcFlipBuyPrice),
          investment: npcFlipBuyPrice,
          sellOrders: product.sellOrders,
          buyOrders: product.buyOrders,
          npcBuyPrice: npcBuy > 0 ? npcBuy : undefined,
        });
      }
    }
  }

  // Sort by estimated profit per hour descending
  // Port of FlipFilter.java:43-46
  allFlips.sort((a, b) => {
    const ephA = a.estimatedProfitPerHour > 0 ? a.estimatedProfitPerHour : a.profit * 0.001;
    const ephB = b.estimatedProfitPerHour > 0 ? b.estimatedProfitPerHour : b.profit * 0.001;
    return ephB - ephA;
  });

  return allFlips;
}

module.exports = { calculateFlips };
