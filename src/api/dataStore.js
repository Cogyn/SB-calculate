/**
 * In-memory cache for bazaar products, NPC prices, item names,
 * auction items, lowest BIN prices, and craft recipes.
 */
class DataStore {
  constructor() {
    /** @type {Map<string, object>} productId -> BazaarProduct data */
    this.products = new Map();
    /** @type {Map<string, number>} productId -> NPC sell price */
    this.npcPrices = new Map();
    /** @type {Map<string, string>} productId -> readable item name */
    this.itemNames = new Map();
    /** @type {number} timestamp of last bazaar update */
    this.lastUpdate = 0;
    /** @type {boolean} whether items API has been loaded */
    this.itemsLoaded = false;

    /** @type {Array<object>} all active auction items */
    this.auctionItems = [];
    /** @type {Map<string, Array>} itemId -> sorted BIN auctions (ascending by price) */
    this.auctionBinIndex = new Map();
    /** @type {Map<string, Array>} itemId -> sorted normal auctions (ascending by price) */
    this.auctionNormalIndex = new Map();
    /** @type {Map<string, number>} itemId -> lowest BIN price */
    this.lowestBins = new Map();
    /** @type {Map<string, object>} itemId -> CraftRecipe data */
    this.recipes = new Map();
    /** @type {number} timestamp of last auction update */
    this.lastAuctionUpdate = 0;
    /** @type {boolean} whether recipes have been loaded */
    this.recipesLoaded = false;

    /** @type {Map<string, { dailySales: number, hourlyBuckets: number[], currentBucketHour: number }>} */
    this.auctionSalesVolume = new Map();
    /** @type {Set<string>} dedup for ended auctions */
    this.recentEndedAuctionIds = new Set();

    /** @type {Array<{source: string, message: string, timestamp: number}>} */
    this.errors = [];
    /** @type {boolean} whether bazaar data has been successfully fetched at least once */
    this.bazaarReady = false;
    /** @type {boolean} whether auction data has been successfully fetched at least once */
    this.auctionReady = false;
  }

  updateProducts(productsMap) {
    this.products = productsMap;
    this.lastUpdate = Date.now();
  }

  getProduct(productId) {
    return this.products.get(productId);
  }

  getAllProducts() {
    return this.products;
  }

  setNpcPrice(productId, price) {
    this.npcPrices.set(productId, price);
  }

  getNpcPrice(productId) {
    return this.npcPrices.get(productId) || -1;
  }

  setItemName(productId, name) {
    this.itemNames.set(productId, name);
  }

  getItemName(productId) {
    return this.itemNames.get(productId) || productId.replace(/_/g, ' ');
  }

  getProductCount() {
    return this.products.size;
  }

  getLastUpdate() {
    return this.lastUpdate;
  }

  // --- Auction Items ---

  updateAuctionItems(items) {
    this.auctionItems = items;

    // Build BIN and normal auction indexes for fast lookup
    this.auctionBinIndex = new Map();
    this.auctionNormalIndex = new Map();

    for (const item of items) {
      if (!item.itemId || item.price <= 0) continue;
      const target = item.bin ? this.auctionBinIndex : this.auctionNormalIndex;
      if (!target.has(item.itemId)) target.set(item.itemId, []);
      target.get(item.itemId).push(item);
    }

    // Sort each group by price ascending (once at ingest time)
    for (const [, g] of this.auctionBinIndex) g.sort((a, b) => a.price - b.price);
    for (const [, g] of this.auctionNormalIndex) g.sort((a, b) => a.price - b.price);

    this.lastAuctionUpdate = Date.now();
  }

  getAuctionItems() {
    return this.auctionItems;
  }

  getAuctionBinIndex() {
    return this.auctionBinIndex;
  }

  getAuctionNormalIndex() {
    return this.auctionNormalIndex;
  }

  getAuctionCount() {
    return this.auctionItems.length;
  }

  // --- Lowest BINs ---

  updateLowestBins(binsMap) {
    this.lowestBins = binsMap;
  }

  getLowestBins() {
    return this.lowestBins;
  }

  getLowestBin(itemId) {
    return this.lowestBins.get(itemId) || -1;
  }

  getLowestBinCount() {
    return this.lowestBins.size;
  }

  // --- Recipes ---

  updateRecipes(recipesMap) {
    this.recipes = recipesMap;
    this.recipesLoaded = true;
  }

  getRecipes() {
    return this.recipes;
  }

  getRecipe(itemId) {
    return this.recipes.get(itemId);
  }

  getRecipeCount() {
    return this.recipes.size;
  }

  // --- Sales Volume ---

  getDailySales(itemId) {
    const entry = this.auctionSalesVolume.get(itemId);
    return entry ? entry.dailySales : 0;
  }

  getActiveListingCount(itemId) {
    const binListings = this.auctionBinIndex.get(itemId);
    return binListings ? binListings.length : 0;
  }

  // --- Error Tracking ---

  addError(source, message) {
    this.errors.push({ source, message, timestamp: Date.now() });
    // Keep only last 50 errors
    if (this.errors.length > 50) this.errors.shift();
  }

  getErrors() {
    return this.errors;
  }

  isReady() {
    return this.bazaarReady && this.products.size > 0;
  }
}

module.exports = new DataStore();
