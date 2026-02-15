/**
 * API routes for flip data.
 */
const express = require('express');
const { calculateFlips } = require('../calculators/bazaarFlipper');
const { calculateAhFlips } = require('../calculators/auctionFlipper');
const { calculateCraftFlips } = require('../calculators/craftCalculator');
const { calculateAhCraftFlips } = require('../calculators/ahCraftCalculator');
const { calculateUpgradeValue } = require('../calculators/upgradeCalculator');
const dataStore = require('../api/dataStore');

const router = express.Router();

/**
 * GET /api/flips - All bazaar flips (order + instant + npc)
 * Optional query param: ?type=order|instant|npc
 */
router.get('/flips', (req, res) => {
  let flips = calculateFlips();
  const typeFilter = req.query.type;

  if (typeFilter && ['order', 'instant', 'npc'].includes(typeFilter)) {
    flips = flips.filter(f => f.type === typeFilter);
  }

  res.json({
    success: true,
    lastUpdate: dataStore.getLastUpdate(),
    dataReady: dataStore.isReady(),
    flips,
  });
});

/**
 * GET /api/flips/order - Only order flips
 */
router.get('/flips/order', (req, res) => {
  const flips = calculateFlips().filter(f => f.type === 'order');
  res.json({
    success: true,
    lastUpdate: dataStore.getLastUpdate(),
    flips,
  });
});

/**
 * GET /api/flips/instant - Only instant flips
 */
router.get('/flips/instant', (req, res) => {
  const flips = calculateFlips().filter(f => f.type === 'instant');
  res.json({
    success: true,
    lastUpdate: dataStore.getLastUpdate(),
    flips,
  });
});

/**
 * GET /api/flips/npc - Only NPC flips
 */
router.get('/flips/npc', (req, res) => {
  const flips = calculateFlips().filter(f => f.type === 'npc');
  res.json({
    success: true,
    lastUpdate: dataStore.getLastUpdate(),
    flips,
  });
});

/**
 * GET /api/flips/ah - Auction House flips
 * Optional query param: ?mode=bin|auction|both (default: bin)
 */
router.get('/flips/ah', (req, res) => {
  const mode = req.query.mode || 'bin';
  const validModes = ['bin', 'auction', 'both'];
  const flips = calculateAhFlips(validModes.includes(mode) ? mode : 'bin');
  res.json({
    success: true,
    lastUpdate: dataStore.lastAuctionUpdate,
    dataReady: dataStore.auctionReady,
    flips,
  });
});

/**
 * GET /api/flips/craft - Craft flips
 */
router.get('/flips/craft', (req, res) => {
  const flips = calculateCraftFlips();
  res.json({
    success: true,
    lastUpdate: dataStore.getLastUpdate(),
    flips,
  });
});

/**
 * GET /api/flips/ah-craft - AH Craft flips (Multi-LBIN)
 */
router.get('/flips/ah-craft', (req, res) => {
  const flips = calculateAhCraftFlips();
  res.json({
    success: true,
    lastUpdate: dataStore.lastAuctionUpdate,
    flips,
  });
});

/**
 * GET /api/status - Server status info
 */
router.get('/status', (req, res) => {
  const bazaarFlips = calculateFlips();
  res.json({
    success: true,
    lastUpdate: dataStore.getLastUpdate(),
    lastAuctionUpdate: dataStore.lastAuctionUpdate,
    productCount: dataStore.getProductCount(),
    auctionCount: dataStore.getAuctionCount(),
    lowestBinCount: dataStore.getLowestBinCount(),
    recipeCount: dataStore.getRecipeCount(),
    bazaarFlipCount: bazaarFlips.length,
    itemsLoaded: dataStore.itemsLoaded,
    recipesLoaded: dataStore.recipesLoaded,
    dataReady: dataStore.isReady(),
    auctionReady: dataStore.auctionReady,
    errors: dataStore.getErrors(),
  });
});

/**
 * GET /api/auctions/search - Search auctions with filters
 */
router.get('/auctions/search', (req, res) => {
  const { itemId, query, tier, minPrice, maxPrice, bin, recomb, minStars, enchant, sort, page, limit } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  let results = [];

  if (itemId) {
    // Exact match: use indexes for efficiency
    const binAuctions = dataStore.getAuctionBinIndex().get(itemId) || [];
    const normalAuctions = dataStore.getAuctionNormalIndex().get(itemId) || [];
    results = [...binAuctions, ...normalAuctions];
  } else {
    // Full scan
    results = dataStore.getAuctionItems();
  }

  // Text query filter
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(a =>
      (a.itemName && a.itemName.toLowerCase().includes(q)) ||
      (a.itemId && a.itemId.toLowerCase().includes(q))
    );
  }

  // Tier filter
  if (tier) {
    results = results.filter(a => a.tier === tier.toUpperCase());
  }

  // Price range
  if (minPrice) {
    const min = parseFloat(minPrice);
    if (!isNaN(min)) results = results.filter(a => a.price >= min);
  }
  if (maxPrice) {
    const max = parseFloat(maxPrice);
    if (!isNaN(max)) results = results.filter(a => a.price <= max);
  }

  // BIN filter
  if (bin === 'true') {
    results = results.filter(a => a.bin);
  } else if (bin === 'false') {
    results = results.filter(a => !a.bin);
  }

  // Recombobulator filter
  if (recomb === 'true') {
    results = results.filter(a => a.upgrades && a.upgrades.recombobulated);
  }

  // Minimum stars
  if (minStars) {
    const ms = parseInt(minStars, 10);
    if (!isNaN(ms)) results = results.filter(a => a.upgrades && (a.upgrades.stars || 0) >= ms);
  }

  // Enchantment filter
  if (enchant) {
    const enchLower = enchant.toLowerCase();
    results = results.filter(a =>
      a.upgrades && a.upgrades.enchantments &&
      Object.keys(a.upgrades.enchantments).some(e => e.toLowerCase().includes(enchLower))
    );
  }

  // Sort
  const sortMode = sort || 'price_asc';
  if (sortMode === 'price_desc') {
    results.sort((a, b) => b.price - a.price);
  } else if (sortMode === 'ending_soon') {
    results.sort((a, b) => (a.end || Infinity) - (b.end || Infinity));
  } else {
    results.sort((a, b) => a.price - b.price);
  }

  const totalResults = results.length;
  const startIdx = (pageNum - 1) * limitNum;
  const paged = results.slice(startIdx, startIdx + limitNum);

  // Map to response format with upgrade breakdowns
  const lowestBins = dataStore.getLowestBins();
  const auctions = paged.map(a => {
    const item = {
      uuid: a.uuid,
      itemId: a.itemId,
      itemName: a.itemName || dataStore.getItemName(a.itemId),
      tier: a.tier || 'COMMON',
      price: a.price,
      bin: a.bin,
      upgrades: a.upgrades || null,
      petInfo: a.petInfo || null,
      ageMinutes: a.ageMinutes || 0,
      lbin: lowestBins.get(a.itemId) || -1,
      end: a.end || 0,
      upgradeBreakdown: null,
    };

    // Compute upgrade breakdown if upgrades exist
    if (a.upgrades) {
      const result = calculateUpgradeValue(a.upgrades, a.itemId, a.tier);
      item.upgradeBreakdown = {
        enchantmentDetails: result.enchantmentDetails,
        hotPotatoDetails: result.hotPotatoDetails,
        recombobulatorPrice: result.recombobulatorPrice,
        artOfWarPrice: result.artOfWarPrice,
        woodSingularityPrice: result.woodSingularityPrice,
        manaDisintegratorPrice: result.manaDisintegratorPrice,
        tunedTransmissionPrice: result.tunedTransmissionPrice,
        starDetails: result.starDetails,
        reforgeDetails: result.reforgeDetails,
      };
      item.upgradeValue = result.totalValue;
    }

    return item;
  });

  res.json({
    success: true,
    totalResults,
    page: pageNum,
    limit: limitNum,
    auctions,
  });
});

/**
 * GET /api/items/search - Search item names for autocomplete
 */
router.get('/items/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 2) {
    return res.json({ success: true, items: [] });
  }

  const items = [];
  for (const [itemId, name] of dataStore.itemNames) {
    if (items.length >= 20) break;
    if (name.toLowerCase().includes(q) || itemId.toLowerCase().includes(q)) {
      items.push({ itemId, name });
    }
  }

  res.json({ success: true, items });
});

module.exports = router;
