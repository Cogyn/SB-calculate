/**
 * Fetches Hypixel Bazaar + Items + Auctions + Lowest BIN + Recipes.
 * Port of BazaarApi.java + AuctionApi.java + ItemsApi.java
 */
const dataStore = require('./dataStore');
const { fetchAllAuctions } = require('./auctionClient');
const { fetchLowestBins } = require('./lowestBinTracker');
const { loadRecipes } = require('./recipeLoader');
const { fetchEndedAuctions, saveSalesVolume, loadSalesVolume } = require('./auctionEndedTracker');
const { loadUserBlacklist } = require('../utils/itemBlacklist');
const { fetchEssenceCosts } = require('../utils/essenceCosts');

const BAZAAR_URL = 'https://api.hypixel.net/v2/skyblock/bazaar';
const ITEMS_URL = 'https://api.hypixel.net/v2/resources/skyblock/items';

let bazaarInterval = null;
let auctionInterval = null;
let lbinInterval = null;
let endedAuctionInterval = null;
let salesPersistInterval = null;

/**
 * Fetch and parse bazaar data from Hypixel API.
 * Direct port of BazaarApi.java:16-57
 */
async function fetchBazaar() {
  try {
    const response = await fetch(BAZAAR_URL);
    const data = await response.json();

    if (!data.success) {
      console.error('Bazaar API returned success=false');
      return;
    }

    const products = new Map();

    for (const [productId, productData] of Object.entries(data.products)) {
      const qs = productData.quick_status;

      const product = {
        productId,
        sellPrice: qs.sellPrice,         // Instant-Buy price (what you pay)
        sellVolume: qs.sellVolume,
        sellMovingWeek: qs.sellMovingWeek,
        sellOrders: qs.sellOrders,
        buyPrice: qs.buyPrice,            // Instant-Sell price (what you get)
        buyVolume: qs.buyVolume,
        buyMovingWeek: qs.buyMovingWeek,
        buyOrders: qs.buyOrders,
        topBuyOrderPrice: 0,              // Highest buy order
        topSellOrderPrice: 0,             // Lowest sell order
        npcSellPrice: -1,
      };

      // Parse order book for top prices
      const sellSummary = productData.sell_summary;
      if (sellSummary && sellSummary.length > 0) {
        product.topSellOrderPrice = sellSummary[0].pricePerUnit;
      }

      const buySummary = productData.buy_summary;
      if (buySummary && buySummary.length > 0) {
        product.topBuyOrderPrice = buySummary[0].pricePerUnit;
      }

      // Attach NPC price if known
      const npcPrice = dataStore.getNpcPrice(productId);
      if (npcPrice > 0) {
        product.npcSellPrice = npcPrice;
      }

      // Daily volume = min(sellMovingWeek, buyMovingWeek) / 7
      product.dailyVolume = Math.min(qs.sellMovingWeek, qs.buyMovingWeek) / 7;

      products.set(productId, product);
    }

    dataStore.updateProducts(products);
    dataStore.bazaarReady = true;
    console.log(`[Bazaar] Updated ${products.size} products`);
  } catch (err) {
    console.error('[Bazaar] Fetch error:', err.message);
    dataStore.addError('bazaar', err.message);
  }
}

/**
 * Fetch items API for NPC sell prices and readable item names.
 */
async function fetchItems() {
  try {
    const response = await fetch(ITEMS_URL);
    const data = await response.json();

    if (!data.success || !data.items) {
      console.error('Items API returned success=false or no items');
      return;
    }

    let npcCount = 0;
    for (const item of data.items) {
      const id = item.id;
      if (!id) continue;

      // Store readable name
      if (item.name) {
        dataStore.setItemName(id, item.name);
      }

      // Store NPC sell price if available
      if (item.npc_sell_price != null && item.npc_sell_price > 0) {
        dataStore.setNpcPrice(id, item.npc_sell_price);
        npcCount++;
      }
    }

    dataStore.itemsLoaded = true;
    console.log(`[Items] Loaded ${data.items.length} items, ${npcCount} with NPC prices`);
  } catch (err) {
    console.error('[Items] Fetch error:', err.message);
    dataStore.addError('items', err.message);
  }
}

/**
 * Start polling all data sources.
 * Fetches items + recipes once on startup, then polls bazaar/auctions/LBIN.
 */
async function startPolling(bazaarIntervalMs = 30000) {
  console.log('[HypixelClient] Starting data fetch...');

  // Load persisted data and user blacklist
  loadSalesVolume();
  loadUserBlacklist();

  // Phase 1: Fetch items first (NPC prices needed before bazaar parsing)
  await fetchItems();

  // Phase 2: Load recipes (can happen in parallel with first data fetch)
  loadRecipes().catch(err => console.error('[Recipes] Load error:', err.message));

  // Phase 3: Initial data fetch (bazaar + lowest bins + auctions + ended auctions + essence costs in parallel)
  await Promise.all([
    fetchBazaar(),
    fetchLowestBins(),
    fetchAllAuctions(),
    fetchEndedAuctions(),
    fetchEssenceCosts(),
  ]);

  // Phase 4: Start polling intervals
  bazaarInterval = setInterval(fetchBazaar, bazaarIntervalMs);
  console.log(`[HypixelClient] Polling bazaar every ${bazaarIntervalMs / 1000}s`);

  auctionInterval = setInterval(fetchAllAuctions, 60000);
  console.log('[HypixelClient] Polling auctions every 60s');

  lbinInterval = setInterval(fetchLowestBins, 60000);
  console.log('[HypixelClient] Polling lowest BINs every 60s');

  endedAuctionInterval = setInterval(fetchEndedAuctions, 60000);
  console.log('[HypixelClient] Polling ended auctions every 60s');

  // Persist sales volume every 5 minutes
  salesPersistInterval = setInterval(saveSalesVolume, 300000);
}

function stopPolling() {
  if (bazaarInterval) {
    clearInterval(bazaarInterval);
    bazaarInterval = null;
  }
  if (auctionInterval) {
    clearInterval(auctionInterval);
    auctionInterval = null;
  }
  if (lbinInterval) {
    clearInterval(lbinInterval);
    lbinInterval = null;
  }
  if (endedAuctionInterval) {
    clearInterval(endedAuctionInterval);
    endedAuctionInterval = null;
  }
  if (salesPersistInterval) {
    clearInterval(salesPersistInterval);
    salesPersistInterval = null;
  }
  saveSalesVolume();
}

module.exports = { startPolling, stopPolling, fetchBazaar, fetchItems };
