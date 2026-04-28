#!/usr/bin/env node

/**
 * Test scraper - runs a quick test on one category
 */
const RuwacScraper = require('./scraper.js');

console.log('🧪 Running test scrape on one category...');
console.log('='.repeat(50));

// Create scraper with test output
const testScraper = new RuwacScraper('https://www.ruwac.asia', 'ruwac_data_test');

// Test on a single category (Accessories - should be smaller)
async function runTest() {
  try {
    // Scrape just the accessories category
    const products = await testScraper.scrapeCategory(
      'https://www.ruwac.asia/accessories',
      'Accessories (Test)',
      'Accessories (Test)'
    );

    console.log('\n✅ Test completed!');
    console.log(`   Downloaded ${products.length} products`);
    if (products.length > 0 && products[0].categoryImages) {
      console.log(`   First product has ${products[0].categoryImages.length} images`);
    }
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  runTest();
}

module.exports = { runTest };
