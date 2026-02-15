/**
 * Sellability scorer.
 * Calculates a 0-1 score indicating how likely a flip is to actually sell.
 * Uses daily sales volume, competition, price position, and tier demand.
 */
const dataStore = require('../api/dataStore');

// Tier demand weights (higher = more demand)
const TIER_DEMAND = {
  MYTHIC: 0.9,
  LEGENDARY: 1.0,
  EPIC: 0.8,
  RARE: 0.6,
  UNCOMMON: 0.3,
  COMMON: 0.2,
  DIVINE: 0.7,
  SPECIAL: 0.5,
  VERY_SPECIAL: 0.5,
  SUPREME: 0.8,
};

/**
 * Calculate sellability score (0-1) for an AH flip.
 * @param {object} flip - Flip object with itemId, tier, buyPrice, lowestBin, netProfit
 * @returns {number} Score between 0 and 1
 */
function calculateSellabilityScore(flip) {
  const itemId = flip.itemId;

  // Factor 1: Daily Sales Volume (50% weight)
  const dailySales = dataStore.getDailySales(itemId);
  // sigmoid-like: 0 sales -> 0, 5 -> 0.5, 20+ -> ~1.0
  const volumeScore = dailySales > 0
    ? Math.min(1.0, dailySales / 20)
    : 0;

  // Factor 2: Competition - active listing count (20% weight)
  // Fewer listings = easier to sell
  const activeListings = dataStore.getActiveListingCount(itemId);
  let competitionScore;
  if (activeListings <= 1) {
    competitionScore = 1.0;
  } else if (activeListings <= 5) {
    competitionScore = 0.8;
  } else if (activeListings <= 15) {
    competitionScore = 0.5;
  } else if (activeListings <= 50) {
    competitionScore = 0.3;
  } else {
    competitionScore = 0.1;
  }

  // Factor 3: Price position - how far below LBIN (15% weight)
  // Greater discount from market = faster sale
  const discountPercent = (flip.lowestBin > 0 && flip.buyPrice > 0)
    ? ((flip.lowestBin - flip.buyPrice) / flip.lowestBin) * 100
    : (flip.profitPercent || 0);
  const pricePositionScore = Math.min(1.0, discountPercent / 30);

  // Factor 4: Tier demand (15% weight)
  const tier = flip.tier || 'COMMON';
  const tierScore = TIER_DEMAND[tier] || 0.2;

  // Weighted sum
  const score =
    volumeScore * 0.50 +
    competitionScore * 0.20 +
    pricePositionScore * 0.15 +
    tierScore * 0.15;

  return Math.max(0, Math.min(1, score));
}

/**
 * Get a human-readable confidence label from score.
 * @param {number} score - 0 to 1
 * @returns {'HIGH'|'MEDIUM'|'LOW'|'VERY_LOW'}
 */
function getConfidenceLabel(score) {
  if (score >= 0.7) return 'HIGH';
  if (score >= 0.4) return 'MEDIUM';
  if (score >= 0.2) return 'LOW';
  return 'VERY_LOW';
}

module.exports = { calculateSellabilityScore, getConfidenceLabel };
