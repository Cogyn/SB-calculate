/**
 * Auction Ended Tracker.
 * Polls /v2/skyblock/auctions_ended every 60s to build rolling 24h sales volume.
 * Persists data to data/salesVolume.json for server restarts.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dataStore = require('./dataStore');

const ENDED_URL = 'https://api.hypixel.net/v2/skyblock/auctions_ended';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PERSISTENCE_FILE = path.join(DATA_DIR, 'salesVolume.json');
const MAX_DEDUP_SIZE = 10000;

/**
 * Extract item ID from item_bytes NBT (same technique as auctionClient).
 * Lightweight version - only extracts the ID string.
 */
function extractItemIdFromNbt(itemBytesBase64) {
  if (!itemBytesBase64) return null;
  try {
    const compressed = Buffer.from(itemBytesBase64, 'base64');
    const data = zlib.gunzipSync(compressed);

    const extraAttrStr = Buffer.from('ExtraAttributes');
    const extraAttrPos = data.indexOf(extraAttrStr);
    if (extraAttrPos === -1) return null;

    const searchStart = extraAttrPos + extraAttrStr.length;
    const region = data.subarray(searchStart, Math.min(data.length, searchStart + 4096));

    // Extract TAG_String named "id"
    const nameBytes = Buffer.from('id', 'utf8');
    const pattern = Buffer.alloc(3 + nameBytes.length);
    pattern[0] = 0x08;
    pattern.writeUInt16BE(nameBytes.length, 1);
    nameBytes.copy(pattern, 3);

    const offset = region.indexOf(pattern);
    if (offset === -1) return null;

    const valuePos = offset + pattern.length;
    if (valuePos + 2 > region.length) return null;

    const strLen = region.readUInt16BE(valuePos);
    const strStart = valuePos + 2;
    if (strStart + strLen > region.length || strLen <= 0 || strLen > 32767) return null;

    return region.toString('utf8', strStart, strStart + strLen);
  } catch {
    return null;
  }
}

/**
 * Get the current hour bucket index (0-23).
 */
function getCurrentBucketHour() {
  return new Date().getUTCHours();
}

/**
 * Record a sale for an item ID.
 */
function recordSale(itemId) {
  const currentHour = getCurrentBucketHour();
  let entry = dataStore.auctionSalesVolume.get(itemId);

  if (!entry) {
    entry = {
      dailySales: 0,
      hourlyBuckets: new Array(24).fill(0),
      currentBucketHour: currentHour,
    };
    dataStore.auctionSalesVolume.set(itemId, entry);
  }

  // If hour changed, rotate bucket
  if (entry.currentBucketHour !== currentHour) {
    // Clear the new bucket (it contains old data from 24h ago)
    entry.hourlyBuckets[currentHour] = 0;
    entry.currentBucketHour = currentHour;
  }

  entry.hourlyBuckets[currentHour]++;
  entry.dailySales = entry.hourlyBuckets.reduce((a, b) => a + b, 0);
}

/**
 * Fetch ended auctions and track sales.
 */
async function fetchEndedAuctions() {
  try {
    const response = await fetch(ENDED_URL);
    const data = await response.json();

    if (!data.success || !data.auctions) {
      console.error('[AuctionEnded] API returned success=false or no auctions');
      return;
    }

    let newSales = 0;

    for (const auction of data.auctions) {
      // Only count auctions that were actually bought (have a buyer)
      if (!auction.buyer) continue;

      const auctionId = auction.auction_id;
      if (!auctionId) continue;

      // Dedup
      if (dataStore.recentEndedAuctionIds.has(auctionId)) continue;
      dataStore.recentEndedAuctionIds.add(auctionId);

      // Extract item ID from NBT
      const itemId = extractItemIdFromNbt(auction.item_bytes);
      if (!itemId) continue;

      recordSale(itemId);
      newSales++;
    }

    // Limit dedup set size
    if (dataStore.recentEndedAuctionIds.size > MAX_DEDUP_SIZE) {
      const arr = [...dataStore.recentEndedAuctionIds];
      dataStore.recentEndedAuctionIds.clear();
      for (let i = arr.length - (MAX_DEDUP_SIZE / 2); i < arr.length; i++) {
        dataStore.recentEndedAuctionIds.add(arr[i]);
      }
    }

    if (newSales > 0) {
      console.log(`[AuctionEnded] Tracked ${newSales} new sales`);
    }
  } catch (err) {
    console.error('[AuctionEnded] Fetch error:', err.message);
  }
}

/**
 * Save sales volume data to disk for persistence.
 */
function saveSalesVolume() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const data = {};
    for (const [itemId, entry] of dataStore.auctionSalesVolume) {
      data[itemId] = {
        dailySales: entry.dailySales,
        hourlyBuckets: entry.hourlyBuckets,
        currentBucketHour: entry.currentBucketHour,
      };
    }

    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.error('[AuctionEnded] Failed to save sales volume:', err.message);
  }
}

/**
 * Load sales volume data from disk.
 */
function loadSalesVolume() {
  try {
    if (!fs.existsSync(PERSISTENCE_FILE)) return;

    const raw = fs.readFileSync(PERSISTENCE_FILE, 'utf8');
    const data = JSON.parse(raw);

    for (const [itemId, entry] of Object.entries(data)) {
      dataStore.auctionSalesVolume.set(itemId, {
        dailySales: entry.dailySales || 0,
        hourlyBuckets: entry.hourlyBuckets || new Array(24).fill(0),
        currentBucketHour: entry.currentBucketHour || 0,
      });
    }

    console.log(`[AuctionEnded] Loaded sales volume for ${dataStore.auctionSalesVolume.size} items`);
  } catch (err) {
    console.error('[AuctionEnded] Failed to load sales volume:', err.message);
  }
}

module.exports = { fetchEndedAuctions, saveSalesVolume, loadSalesVolume };
