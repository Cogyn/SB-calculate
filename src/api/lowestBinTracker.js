/**
 * Lowest BIN price tracker.
 * Fetches from lb.tricked.dev/lowestbins (Moulberry replacement).
 * Falls back to calculating from auction data.
 *
 * Uses a weighted moving average (recent prices weighted higher)
 * to smooth noise while reacting quickly to real price changes.
 */
const dataStore = require('./dataStore');

const LBIN_URL = 'https://lb.tricked.dev/lowestbins';
const HISTORY_SIZE = 2;

// Weights: [oldest, newest] - latest price counts for 70%
const WEIGHTS = [0.3, 0.7];

/** @type {Map<string, number[]>} itemId -> recent price history */
const recentBins = new Map();

/**
 * Compute a weighted average from price history.
 * More recent prices are weighted higher.
 */
function weightedAvg(history) {
  if (history.length === 1) return history[0];

  // Use the last HISTORY_SIZE entries with proper weights
  const len = history.length;
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < len; i++) {
    const w = WEIGHTS[i] || WEIGHTS[WEIGHTS.length - 1];
    sum += history[i] * w;
    weightSum += w;
  }
  return sum / weightSum;
}

/**
 * Fetch lowest BIN prices from lb.tricked.dev.
 * Simple JSON response: { "ITEM_ID": price, ... }
 */
async function fetchLowestBins() {
  try {
    const response = await fetch(LBIN_URL);
    const data = await response.json();

    const bins = new Map();
    for (const [itemId, price] of Object.entries(data)) {
      if (typeof price === 'number' && price > 0) {
        let history = recentBins.get(itemId);
        if (!history) {
          history = [];
          recentBins.set(itemId, history);
        }

        // If price changed by more than 20%, reset history to react instantly
        // This catches market crashes or spikes without averaging delay
        if (history.length > 0) {
          const last = history[history.length - 1];
          const changePercent = Math.abs(price - last) / last;
          if (changePercent > 0.20) {
            history.length = 0;
          }
        }

        history.push(price);
        if (history.length > HISTORY_SIZE) {
          history.shift();
        }

        bins.set(itemId, weightedAvg(history));
      }
    }

    dataStore.updateLowestBins(bins);
    console.log(`[LowestBins] Updated ${bins.size} lowest BIN prices`);
  } catch (err) {
    console.error('[LowestBins] Fetch error:', err.message);
    dataStore.addError('lowestBins', err.message);
    // Fallback: calculate from auction data
    calculateFromAuctions();
  }
}

/**
 * Fallback: calculate lowest BINs from loaded auction items.
 */
function calculateFromAuctions() {
  const auctions = dataStore.getAuctionItems();
  if (!auctions || auctions.length === 0) return;

  const newBins = new Map();

  for (const auction of auctions) {
    if (!auction.bin || !auction.itemId) continue;
    const price = auction.startingBid;
    if (price <= 0) continue;

    const current = newBins.get(auction.itemId);
    if (current === undefined || price < current) {
      newBins.set(auction.itemId, price);
    }
  }

  const result = new Map();
  for (const [id, price] of newBins) {
    let history = recentBins.get(id);
    if (!history) {
      history = [];
      recentBins.set(id, history);
    }

    if (history.length > 0) {
      const last = history[history.length - 1];
      const changePercent = Math.abs(price - last) / last;
      if (changePercent > 0.20) {
        history.length = 0;
      }
    }

    history.push(price);
    if (history.length > HISTORY_SIZE) {
      history.shift();
    }

    result.set(id, weightedAvg(history));
  }

  if (result.size > 0) {
    dataStore.updateLowestBins(result);
    console.log(`[LowestBins] Calculated ${result.size} from auction data (fallback)`);
  }
}

module.exports = { fetchLowestBins, calculateFromAuctions };
