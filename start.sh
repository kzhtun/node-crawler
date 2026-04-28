#!/bin/bash

# Ruwac Crawler - Quick Start Guide
# ====================================

echo "🚀 Ruwac Website Crawler - Quick Start"
echo "======================================"
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 14 or higher."
    exit 1
fi

echo "✓ Node version: $(node --version)"
echo ""

# Navigate to script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Install dependencies
echo "📦 Installing dependencies..."
npm install --quiet

if [ $? -eq 0 ]; then
    echo "✓ Dependencies installed"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🌐 Starting Ruwac scraper..."
echo "This will scrape product data and download images."
echo "Progress will be shown below:"
echo ""

# Run the scraper
node scraper.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Scraping completed successfully!"
    echo ""
    echo "📊 Organizing data..."
    node organize-data.js

    echo ""
    echo "📁 Files created:"
    echo "  - ruwac_data/          (downloaded products and images)"
    echo "  - scraper.log          (detailed scraping log)"
    echo "  - scraping_report.json (execution report)"
    echo "  - statistics.json      (data statistics)"
    echo "  - products_export.csv  (CSV export)"
    echo "  - index.html           (HTML catalog)"
    echo ""
    echo "🎉 All done! Open index.html to view the catalog."
else
    echo "❌ Scraping failed. Check scraper.log for details."
    exit 1
fi
