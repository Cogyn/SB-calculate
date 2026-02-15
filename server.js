const express = require('express');
const path = require('path');
const fs = require('fs');
const flipRoutes = require('./src/routes/flipRoutes');
const hypixelClient = require('./src/api/hypixelClient');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data/ directory exists for recipe cache
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', flipRoutes);

// Start server
app.listen(PORT, async () => {
  console.log(`[SkyFlip] Server running on http://localhost:${PORT}`);

  // Start fetching Hypixel data
  await hypixelClient.startPolling(30000);
});
