#!/usr/bin/env node

/**
 * Setup and run the Ruwac crawler
 */
const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

function installDependencies() {
  console.log('Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✓ Dependencies installed!');
  } catch (error) {
    console.error('❌ Failed to install dependencies');
    process.exit(1);
  }
}

function runScraper() {
  console.log('\n' + '='.repeat(50));
  console.log('Starting Ruwac Website Scraper');
  console.log('='.repeat(50) + '\n');

  try {
    // Import and run the scraper
    const RuwacScraper = require('./scraper.js');
    const scraper = new RuwacScraper('https://www.ruwac.asia', 'ruwac_data');
    scraper.run().catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
  } catch (error) {
    console.error(`Failed to run scraper: ${error.message}`);
    process.exit(1);
  }
}

function main() {
  // Change to script directory
  const scriptDir = path.dirname(path.resolve(__filename));
  process.chdir(scriptDir);

  // Check if dependencies are already installed
  if (!fs.existsSync('node_modules')) {
    installDependencies();
  }

  // Run scraper
  runScraper();
}

if (require.main === module) {
  main();
}

module.exports = { installDependencies, runScraper };
