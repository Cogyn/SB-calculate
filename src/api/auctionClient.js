/**
 * Auction House API client.
 * Loads all auction pages in parallel (max 5 concurrent).
 * Extracts SkyBlock item IDs and extra data (pets, enchantments, upgrades)
 * from NBT data (item_bytes).
 */
const zlib = require('zlib');
const dataStore = require('./dataStore');
const { petExpToLevel } = require('../utils/petLeveling');

const AUCTIONS_URL = 'https://api.hypixel.net/v2/skyblock/auctions?page=';
const MAX_CONCURRENT = 5;

/**
 * Fetch all active auctions from the Hypixel API.
 */
async function fetchAllAuctions() {
  try {
    const firstRes = await fetch(AUCTIONS_URL + '0');
    const firstPage = await firstRes.json();

    if (!firstPage.success) {
      console.error('[Auctions] API returned success=false');
      return;
    }

    const totalPages = firstPage.totalPages || 1;
    console.log(`[Auctions] Loading ${totalPages} pages...`);

    const allAuctions = [];

    parseAuctionPage(firstPage, allAuctions);

    if (totalPages > 1) {
      const pages = [];
      for (let i = 1; i < totalPages; i++) {
        pages.push(i);
      }

      for (let i = 0; i < pages.length; i += MAX_CONCURRENT) {
        const batch = pages.slice(i, i + MAX_CONCURRENT);
        const results = await Promise.allSettled(
          batch.map(page => fetchPage(page))
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            parseAuctionPage(result.value, allAuctions);
          }
        }
      }
    }

    dataStore.updateAuctionItems(allAuctions);
    dataStore.auctionReady = true;
    console.log(`[Auctions] Loaded ${allAuctions.length} auctions from ${totalPages} pages`);
  } catch (err) {
    console.error('[Auctions] Fetch error:', err.message);
    dataStore.addError('auctions', err.message);
  }
}

/**
 * Fetch a single auction page.
 */
async function fetchPage(pageNum) {
  try {
    const res = await fetch(AUCTIONS_URL + pageNum);
    return await res.json();
  } catch (err) {
    console.error(`[Auctions] Failed to load page ${pageNum}:`, err.message);
    return null;
  }
}

/**
 * Parse auctions from a page response and push to target array.
 */
function parseAuctionPage(pageObj, target) {
  const auctions = pageObj.auctions;
  if (!auctions || !Array.isArray(auctions)) return;

  const now = Date.now();

  for (const auc of auctions) {
    try {
      const end = auc.end || 0;
      if (end > 0 && end < now) continue;

      const item = {
        uuid: auc.uuid || '',
        auctioneer: auc.auctioneer || '',
        start: auc.start || 0,
        end: end,
        itemName: auc.item_name || '',
        extra: auc.extra || '',
        category: auc.category || '',
        tier: auc.tier || '',
        startingBid: auc.starting_bid || 0,
        highestBid: auc.highest_bid_amount || 0,
        bin: !!auc.bin,
        claimed: auc.claimed || false,
      };

      item.price = item.bin ? item.startingBid : Math.max(item.startingBid, item.highestBid);

      // Extract all NBT data (item ID, pet info, enchantments, upgrades)
      const extraData = extractExtraDataFromNbt(auc.item_bytes);

      if (extraData) {
        item.itemId = extraData.itemId || deriveItemIdFallback(item);

        // Pet support: override itemId with PET_TYPE_TIER
        if (extraData.petInfo && extraData.petInfo.type && extraData.petInfo.tier) {
          item.petInfo = extraData.petInfo;
          item.itemId = `PET_${extraData.petInfo.type}_${extraData.petInfo.tier}`;
        }

        // Upgrade data for upgrade calculator
        if (extraData.enchantments || extraData.hotPotatoCount > 0 ||
            extraData.recombobulated || extraData.artOfWar > 0 || extraData.stars > 0 ||
            extraData.reforge || extraData.woodSingularity > 0 ||
            extraData.manaDisintegrator > 0 || extraData.tunedTransmission > 0) {
          item.upgrades = {
            enchantments: extraData.enchantments || null,
            hotPotatoCount: extraData.hotPotatoCount || 0,
            stars: extraData.stars || 0,
            reforge: extraData.reforge || null,
            recombobulated: !!extraData.recombobulated,
            artOfWar: extraData.artOfWar || 0,
            woodSingularity: extraData.woodSingularity || 0,
            manaDisintegrator: extraData.manaDisintegrator || 0,
            tunedTransmission: extraData.tunedTransmission || 0,
          };
        }
      } else {
        item.itemId = deriveItemIdFallback(item);
      }

      item.ageMinutes = item.start > 0 ? Math.floor((now - item.start) / 60000) : 0;

      target.push(item);
    } catch (e) {
      // Skip malformed auction entries
    }
  }
}

// ---- NBT Extraction Helpers ----

/**
 * Find a TAG_String (0x08) with the given name in a binary region and read its value.
 * @param {Buffer} region - binary data to scan
 * @param {string} tagName - name of the tag to find
 * @returns {string|null}
 */
function extractStringTag(region, tagName) {
  const nameBytes = Buffer.from(tagName, 'utf8');
  // Pattern: 0x08 (TAG_String) + name length (2 bytes BE) + name bytes
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
}

/**
 * Find a TAG_Int (0x03) with the given name in a binary region and read its value.
 * @param {Buffer} region - binary data to scan
 * @param {string} tagName - name of the tag to find
 * @returns {number|null}
 */
function extractIntTag(region, tagName) {
  const nameBytes = Buffer.from(tagName, 'utf8');
  // Pattern: 0x03 (TAG_Int) + name length (2 bytes BE) + name bytes
  const pattern = Buffer.alloc(3 + nameBytes.length);
  pattern[0] = 0x03;
  pattern.writeUInt16BE(nameBytes.length, 1);
  nameBytes.copy(pattern, 3);

  const offset = region.indexOf(pattern);
  if (offset === -1) return null;

  const valuePos = offset + pattern.length;
  if (valuePos + 4 > region.length) return null;

  return region.readInt32BE(valuePos);
}

/**
 * Extract enchantments from the NBT "enchantments" compound tag.
 * Searches for TAG_Compound (0x0A) named "enchantments", then reads inner TAG_Int entries.
 * @param {Buffer} region - binary data to scan
 * @returns {object|null} - { sharpness: 7, critical: 7, ... } or null
 */
function extractEnchantments(region) {
  const nameBytes = Buffer.from('enchantments', 'utf8');
  // Pattern: 0x0A (TAG_Compound) + name length (2 bytes BE) + "enchantments"
  const pattern = Buffer.alloc(3 + nameBytes.length);
  pattern[0] = 0x0A;
  pattern.writeUInt16BE(nameBytes.length, 1);
  nameBytes.copy(pattern, 3);

  const offset = region.indexOf(pattern);
  if (offset === -1) return null;

  const enchantments = {};
  let pos = offset + pattern.length;
  const maxPos = Math.min(region.length, pos + 2048); // scan up to 2KB ahead

  while (pos < maxPos) {
    const tagType = region[pos];

    if (tagType === 0x00) {
      // TAG_End - end of compound
      break;
    }

    if (tagType === 0x03) {
      // TAG_Int - this is an enchantment entry
      if (pos + 3 > maxPos) break;
      const nameLen = region.readUInt16BE(pos + 1);
      if (pos + 3 + nameLen + 4 > maxPos) break;

      const enchName = region.toString('utf8', pos + 3, pos + 3 + nameLen);
      const enchLevel = region.readInt32BE(pos + 3 + nameLen);

      if (enchName && enchLevel > 0) {
        enchantments[enchName.toLowerCase()] = enchLevel;
      }

      pos = pos + 3 + nameLen + 4;
    } else {
      // Unknown tag type inside enchantments compound - break
      break;
    }
  }

  return Object.keys(enchantments).length > 0 ? enchantments : null;
}

/**
 * Extract all extra data from auction item_bytes NBT.
 * Single decompress, multiple tag extractions.
 * @param {string} itemBytesBase64
 * @returns {object|null}
 */
function extractExtraDataFromNbt(itemBytesBase64) {
  if (!itemBytesBase64) return null;

  try {
    const compressed = Buffer.from(itemBytesBase64, 'base64');
    const data = zlib.gunzipSync(compressed);

    // Find ExtraAttributes region
    const extraAttrStr = Buffer.from('ExtraAttributes');
    const extraAttrPos = data.indexOf(extraAttrStr);
    if (extraAttrPos === -1) return null;

    // Work with the region after ExtraAttributes
    const searchStart = extraAttrPos + extraAttrStr.length;
    const region = data.subarray(searchStart, Math.min(data.length, searchStart + 8192));

    // Extract item ID
    const itemId = extractStringTag(region, 'id');

    // Extract pet info
    let petInfo = null;
    const petInfoStr = extractStringTag(region, 'petInfo');
    if (petInfoStr) {
      try {
        const parsed = JSON.parse(petInfoStr);
        if (parsed.type && parsed.tier) {
          const level = parsed.exp != null
            ? petExpToLevel(parsed.exp, parsed.tier)
            : 1;
          petInfo = {
            type: parsed.type,
            tier: parsed.tier,
            level,
            exp: parsed.exp || 0,
            heldItem: parsed.heldItem || null,
          };
        }
      } catch {
        // Invalid pet JSON
      }
    }

    // Extract upgrade-related tags
    const enchantments = extractEnchantments(region);
    const hotPotatoCount = extractIntTag(region, 'hot_potato_count');
    const stars = extractIntTag(region, 'dungeon_item_level');
    const reforge = extractStringTag(region, 'modifier');
    const rarityUpgrades = extractIntTag(region, 'rarity_upgrades');
    const artOfWar = extractIntTag(region, 'art_of_war_count');
    const woodSingularity = extractIntTag(region, 'wood_singularity_count');
    const manaDisintegrator = extractIntTag(region, 'mana_disintegrator_count');
    const tuned = extractIntTag(region, 'tuned_transmission');

    return {
      itemId,
      petInfo,
      enchantments,
      hotPotatoCount: hotPotatoCount || 0,
      stars: stars || 0,
      reforge: reforge || null,
      recombobulated: (rarityUpgrades || 0) > 0,
      artOfWar: artOfWar || 0,
      woodSingularity: woodSingularity || 0,
      manaDisintegrator: manaDisintegrator || 0,
      tunedTransmission: tuned || 0,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Fallback: derive item ID from extra field (unreliable, but better than nothing).
 */
function deriveItemIdFallback(item) {
  const extra = item.extra;
  if (extra) {
    const cleaned = extra
      .replace(/\u00A7[0-9a-fk-or]/g, '')
      .replace(/\u2726/g, '')
      .trim()
      .toUpperCase()
      .replace(/ /g, '_')
      .replace(/'/g, '')
      .replace(/-/g, '_');
    if (cleaned) return cleaned;
  }

  const name = (item.itemName || '')
    .replace(/\u00A7[0-9a-fk-or]/g, '')
    .trim();
  return name.toUpperCase().replace(/ /g, '_').replace(/'/g, '').replace(/-/g, '_');
}

module.exports = { fetchAllAuctions };
