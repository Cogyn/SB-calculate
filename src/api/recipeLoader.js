/**
 * Recipe loader - fetches craft recipes from NEU GitHub repo.
 * Port of ItemsApi.java recipe logic.
 * Caches to data/recipes.json with 7-day TTL.
 */
const fs = require('fs');
const path = require('path');
const dataStore = require('./dataStore');

const NEU_REPO_URL = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items/';
const CACHE_FILE = path.join(__dirname, '../../data/recipes.json');
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Hardcoded list of craftable items to fetch recipes for.
 * Port of ItemsApi.java:140-198
 */
const CRAFTABLE_ITEMS = [
  // Enchanted materials (tier 1)
  'ENCHANTED_DIAMOND', 'ENCHANTED_GOLD', 'ENCHANTED_IRON',
  'ENCHANTED_COAL', 'ENCHANTED_LAPIS_LAZULI', 'ENCHANTED_REDSTONE',
  'ENCHANTED_EMERALD', 'ENCHANTED_QUARTZ', 'ENCHANTED_OBSIDIAN',
  'ENCHANTED_GLOWSTONE', 'ENCHANTED_FLINT', 'ENCHANTED_COBBLESTONE',
  'ENCHANTED_OAK_LOG', 'ENCHANTED_SPRUCE_LOG', 'ENCHANTED_BIRCH_LOG',
  'ENCHANTED_DARK_OAK_LOG', 'ENCHANTED_ACACIA_LOG', 'ENCHANTED_JUNGLE_LOG',
  'ENCHANTED_RAW_BEEF', 'ENCHANTED_PORK', 'ENCHANTED_RAW_CHICKEN',
  'ENCHANTED_RAW_SALMON', 'ENCHANTED_CLOWNFISH', 'ENCHANTED_PUFFERFISH',
  'ENCHANTED_RAW_FISH', 'ENCHANTED_SUGAR', 'ENCHANTED_SUGAR_CANE',
  'ENCHANTED_CACTUS_GREEN', 'ENCHANTED_CACTUS',
  'ENCHANTED_CARROT', 'ENCHANTED_GOLDEN_CARROT',
  'ENCHANTED_POTATO', 'ENCHANTED_BAKED_POTATO',
  'ENCHANTED_PUMPKIN', 'ENCHANTED_MELON',
  'ENCHANTED_COCOA', 'ENCHANTED_COOKIE',
  'ENCHANTED_STRING', 'ENCHANTED_LEATHER',
  'ENCHANTED_BONE', 'ENCHANTED_ROTTEN_FLESH',
  'ENCHANTED_GUNPOWDER', 'ENCHANTED_ENDER_PEARL',
  'ENCHANTED_SLIME_BALL', 'ENCHANTED_SLIME_BLOCK',
  'ENCHANTED_BLAZE_ROD', 'ENCHANTED_BLAZE_POWDER',
  'ENCHANTED_GHAST_TEAR', 'ENCHANTED_SPIDER_EYE',
  'ENCHANTED_FERMENTED_SPIDER_EYE',
  // Enchanted materials (tier 2 / blocks)
  'ENCHANTED_DIAMOND_BLOCK', 'ENCHANTED_GOLD_BLOCK',
  'ENCHANTED_IRON_BLOCK', 'ENCHANTED_LAPIS_LAZULI_BLOCK',
  'ENCHANTED_REDSTONE_BLOCK', 'ENCHANTED_EMERALD_BLOCK',
  'ENCHANTED_COAL_BLOCK', 'ENCHANTED_QUARTZ_BLOCK',
  'ENCHANTED_GLOWSTONE_BLOCK', 'ENCHANTED_REDSTONE_LAMP',
  'ENCHANTED_HAY_BALE', 'ENCHANTED_NETHER_STALK',
  'ENCHANTED_MUTTON', 'ENCHANTED_COOKED_MUTTON',
  // Utility items
  'COMPACTOR', 'SUPER_COMPACTOR_3000', 'DWARVEN_SUPER_COMPACTOR',
  'BUDGET_HOPPER', 'ENCHANTED_HOPPER',
  'GRAND_EXP_BOTTLE', 'TITANIC_EXP_BOTTLE',
  // Additional commonly profitable crafts
  'ENCHANTED_EYE_OF_ENDER', 'ENCHANTED_MAGMA_CREAM',
  'ENCHANTED_GLISTERING_MELON', 'ENCHANTED_GOLDEN_APPLE',
  'ENCHANTED_SNOW_BLOCK', 'ENCHANTED_ICE', 'ENCHANTED_PACKED_ICE',
  'ENCHANTED_CLAY_BALL', 'ENCHANTED_SPONGE',
  'ENCHANTED_PRISMARINE_SHARD', 'ENCHANTED_PRISMARINE_CRYSTALS',
  'ENCHANTED_INK_SACK', 'ENCHANTED_LILY_PAD',
  'ENCHANTED_SEEDS', 'ENCHANTED_BROWN_MUSHROOM', 'ENCHANTED_RED_MUSHROOM',
  'ENCHANTED_RABBIT_HIDE', 'ENCHANTED_RABBIT_FOOT',
  'ENCHANTED_RAW_RABBIT', 'ENCHANTED_RABBIT',
  'ENCHANTED_FEATHER', 'ENCHANTED_EGG',
  'ENCHANTED_CAKE', 'ENCHANTED_BOOKSHELF',
  'POLISHED_PUMPKIN', 'ENCHANTED_JACK_O_LANTERN',
  'REVENANT_VISCERA', 'TARANTULA_SILK', 'WOLF_TOOTH',
  'ENCHANTED_MITHRIL', 'ENCHANTED_TITANIUM',
  'ENCHANTED_HARD_STONE',
  // Minion materials
  'ENCHANTED_CHARCOAL', 'ENCHANTED_CHARCOAL_BLOCK',
  'ENCHANTED_LAVA_BUCKET',
  // High-value crafts
  'CATALYST', 'HYPER_CATALYST',
  'GRIFFIN_FEATHER', 'ANCIENT_CLAW',
  'SUMMONING_EYE',
];

/**
 * Load recipes. Try cache first, then fetch from NEU repo.
 */
async function loadRecipes() {
  const recipes = new Map();

  // Try loading from cache
  if (loadFromCache(recipes)) {
    dataStore.updateRecipes(recipes);
    console.log(`[Recipes] Loaded ${recipes.size} recipes from cache`);
    return;
  }

  // Fetch from NEU repo
  await fetchFromNeu(recipes);

  if (recipes.size > 0) {
    dataStore.updateRecipes(recipes);
    saveToCache(recipes);
  }
}

/**
 * Load recipes from local cache file.
 * Returns true if cache is valid and loaded successfully.
 */
function loadFromCache(recipes) {
  try {
    if (!fs.existsSync(CACHE_FILE)) return false;

    const stat = fs.statSync(CACHE_FILE);
    if (Date.now() - stat.mtimeMs > CACHE_MAX_AGE_MS) {
      console.log('[Recipes] Cache is older than 7 days, refreshing');
      return false;
    }

    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    for (const [itemId, recipeData] of Object.entries(data)) {
      if (recipeData.ingredients && Object.keys(recipeData.ingredients).length > 0) {
        recipes.set(itemId, {
          resultItemId: itemId,
          resultName: recipeData.name || itemId,
          resultCount: recipeData.count || 1,
          ingredients: recipeData.ingredients,
        });
      }
    }
    return recipes.size > 0;
  } catch (err) {
    console.error('[Recipes] Failed to load cache:', err.message);
    return false;
  }
}

/**
 * Save recipes to local cache file.
 */
function saveToCache(recipes) {
  try {
    const data = {};
    for (const [itemId, recipe] of recipes) {
      data[itemId] = {
        name: recipe.resultName,
        count: recipe.resultCount,
        ingredients: recipe.ingredients,
      };
    }

    // Ensure data directory exists
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    console.log(`[Recipes] Saved ${recipes.size} recipes to cache`);
  } catch (err) {
    console.error('[Recipes] Failed to save cache:', err.message);
  }
}

/**
 * Fetch recipes from NEU GitHub repo.
 * Port of ItemsApi.java:139-245
 */
async function fetchFromNeu(recipes) {
  let loaded = 0;
  const slots = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

  // Fetch in batches of 10 to avoid overwhelming the server
  for (let i = 0; i < CRAFTABLE_ITEMS.length; i += 10) {
    const batch = CRAFTABLE_ITEMS.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (itemId) => {
        const res = await fetch(NEU_REPO_URL + itemId + '.json');
        if (!res.ok) return null;
        const obj = await res.json();
        return { itemId, obj };
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { itemId, obj } = result.value;

      try {
        if (!obj.recipe) continue;

        const recipe = obj.recipe;
        const ingredients = {};

        // Parse recipe slots (A1-A3, B1-B3, C1-C3)
        for (const slot of slots) {
          const value = recipe[slot];
          if (!value || value === '') continue;

          const parts = value.split(':');
          const ingredientId = parts[0];
          const amount = parts.length > 1 ? parseInt(parts[1], 10) : 1;

          if (ingredientId) {
            ingredients[ingredientId] = (ingredients[ingredientId] || 0) + amount;
          }
        }

        if (Object.keys(ingredients).length > 0) {
          // Clean display name (remove color codes)
          let name = itemId;
          if (obj.displayname) {
            name = obj.displayname.replace(/\u00A7[0-9a-fk-or]/g, '');
          }

          recipes.set(itemId, {
            resultItemId: itemId,
            resultName: name,
            resultCount: recipe.count ? parseInt(recipe.count, 10) : 1,
            ingredients,
          });
          loaded++;
        }
      } catch (e) {
        // Skip items we can't parse
      }
    }
  }

  console.log(`[Recipes] Fetched ${loaded} recipes from NEU repo`);
}

module.exports = { loadRecipes };
