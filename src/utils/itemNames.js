/**
 * Utility for converting product IDs to readable names.
 * Falls back to replacing underscores with spaces and title-casing.
 */
const dataStore = require('../api/dataStore');

function getDisplayName(productId) {
  // First check if we have a name from the Items API
  const stored = dataStore.getItemName(productId);
  if (stored && stored !== productId.replace(/_/g, ' ')) {
    return stored;
  }

  // Fallback: title-case the ID
  return productId
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { getDisplayName };
