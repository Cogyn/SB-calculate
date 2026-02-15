/**
 * Profit calculation functions.
 * Direct 1:1 port of ProfitCalculator.java
 */

/**
 * Bazaar sell tax (default 1.25%)
 */
function calculateBazaarTax(sellPrice, taxRate) {
  return sellPrice * (taxRate / 100.0);
}

/**
 * Bazaar order flip profit:
 * Buy via buy order, sell via sell offer.
 * Profit = sellPrice * (1 - taxRate) - buyPrice
 *
 * Port of ProfitCalculator.java:15-18
 */
function calculateBazaarOrderProfit(buyOrderPrice, sellOfferPrice, taxRate) {
  const afterTax = sellOfferPrice * (1.0 - taxRate / 100.0);
  return afterTax - buyOrderPrice;
}

/**
 * Bazaar instant flip profit:
 * Instant buy (sellPrice) then instant sell (buyPrice).
 * Tax is applied on the sell side.
 *
 * Port of ProfitCalculator.java:25-28
 */
function calculateBazaarInstantProfit(instantBuyPrice, instantSellPrice, taxRate) {
  const afterTax = instantSellPrice * (1.0 - taxRate / 100.0);
  return afterTax - instantBuyPrice;
}

/**
 * AH listing fee based on price tiers.
 * Port of ProfitCalculator.java:31-39
 */
function calculateAhListingFee(price) {
  if (price > 100_000_000) {
    return price * 0.025;
  } else if (price > 10_000_000) {
    return price * 0.02;
  } else {
    return price * 0.01;
  }
}

/**
 * AH claim tax (1% on amount over 1M).
 * Port of ProfitCalculator.java:42-44
 */
function calculateAhClaimTax(price) {
  if (price <= 1_000_000) return 0;
  return (price - 1_000_000) * 0.01;
}

/**
 * AH total fees (listing + claim).
 * Port of ProfitCalculator.java:47-49
 */
function calculateAhTotalFees(sellPrice) {
  return calculateAhListingFee(sellPrice) + calculateAhClaimTax(sellPrice);
}

/**
 * AH flip net profit.
 * Port of ProfitCalculator.java:52-57
 */
function calculateAhFlipProfit(buyPrice, sellPrice) {
  const listingFee = calculateAhListingFee(sellPrice);
  const claimTax = calculateAhClaimTax(sellPrice);
  return sellPrice - buyPrice - listingFee - claimTax;
}

/**
 * Profit percentage.
 * Port of ProfitCalculator.java:60-63
 */
function calculateProfitPercent(profit, investment) {
  if (investment <= 0) return 0;
  return (profit / investment) * 100.0;
}

/**
 * Estimated profit per hour for bazaar flips based on volume.
 * profitPerHour = profitPerUnit * (dailyVolume / 24)
 */
function estimateProfitPerHour(profitPerUnit, dailyVolume, investment) {
  if (dailyVolume <= 0 || investment <= 0) return 0;
  const unitsPerHour = dailyVolume / 24.0;
  return profitPerUnit * unitsPerHour;
}

module.exports = {
  calculateBazaarTax,
  calculateBazaarOrderProfit,
  calculateBazaarInstantProfit,
  calculateAhListingFee,
  calculateAhClaimTax,
  calculateAhTotalFees,
  calculateAhFlipProfit,
  calculateProfitPercent,
  estimateProfitPerHour,
};
