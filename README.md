# Ruwac Website Scraper (Node.js)

A Node.js web scraper for downloading product details and images from https://www.ruwac.asia

## Features

- ✅ Scrapes all product categories (Industrial Vacuum Cleaners, Dust Extractors, Accessories)
- ✅ Downloads product images organized by category
- ✅ Extracts product details, specifications, and descriptions
- ✅ Generates JSON reports with all collected data
- ✅ Handles errors gracefully with logging
- ✅ Respectful rate limiting to avoid server overload
- ✅ Data processing utilities (CSV export, statistics, HTML catalog)

## Installation

### Prerequisites
- Node.js 14.0.0 or higher
- npm (comes with Node.js)

### Quick Setup

```bash
# Clone or navigate to the project directory
cd node-crawler

# Install dependencies
npm install
```

## Quick Start

### Option 1: Automated Setup (Recommended)
```bash
npm start
```
or
```bash
node run.js
```

### Option 2: Manual Execution
```bash
node scraper.js
```

### Option 3: Test Single Category
```bash
npm test
```
or
```bash
node test-scraper.js
```

### Option 4: Process Data
```bash
npm run organize
```
or
```bash
node organize-data.js
```

## Output Structure

The scraper creates a `ruwac_data` folder with the following structure:

```
ruwac_data/
├── Industrial Vacuum Cleaners/
│   ├── Overview/
│   │   ├── R01 A/
│   │   │   ├── images/
│   │   │   │   ├── image1.webp
│   │   │   │   ├── image2.png
│   │   │   │   └── ...
│   │   │   └── ProductInformation.json
│   │   ├── R18/
│   │   └── ...
│   ├── Single-Phase Drive/
│   ├── Three-Phase Drive/
│   └── ... (11 categories total)
├── Dust Extractor/
│   └── Main/
├── Accessories/
│   └── Main/
└── scraping_report.json
```

## Data Format

Each `ProductInformation.json` file contains:

```json
{
  "title": "R01 A",
  "modelName": "R01 A",
  "category": "Industrial Vacuum Cleaners",
  "subcategory": "Overview",
  "categoryPageUrl": "https://www.ruwac.asia/...",
  "detailPageUrl": "https://www.ruwac.asia/...",
  "description": "Product description...",
  "features": [
    "Feature 1",
    "Feature 2",
    ...
  ],
  "categoryImages": [
    "image1.webp",
    "image2.png",
    ...
  ],
  "detailInfo": {
    "pageTitle": "...",
    "fullDescription": "...",
    "technicalSpecs": {
      "Air Volume": "100 m³/h",
      "Power": "1.5 kW",
      ...
    },
    "features": [...],
    "applications": [...],
    "detailImages": [...]
  }
}
```

## Generated Files

After running the scraper and data organizer, you'll have:

- **scraper.log** - Detailed scraping progress and errors
- **scraping_report.json** - Summary of scraping execution
- **statistics.json** - Product counts, images, specs by category
- **products_export.csv** - Flattened product data for spreadsheet analysis
- **index.html** - Browsable HTML catalog of all products

## Logging

Logs are saved to `scraper.log` for debugging and tracking progress. The scraper also outputs to console during execution.

## Customization

### Change Output Directory
Edit line in `scraper.js`:
```javascript
const scraper = new RuwacScraper('https://www.ruwac.asia', 'your_folder_name');
```

### Change Number of Products Per Category
Edit line in `scraper.js` (currently set to 30):
```javascript
for (let i = 0; i < Math.min(productContainers.length, 30); i++) {
```

### Add More Categories
Edit the `categories` object in `scraper.js` run() method to include additional URLs.

## Requirements

- Node.js 14.0+
- Internet connection
- ~500MB disk space (depending on number of images)

## Dependencies

- **axios** - HTTP client with built-in retry support
- **cheerio** - HTML parsing library (similar to BeautifulSoup)
- **winston** - Logging framework
- **fs-extra** - Enhanced file system operations
- **papaparse** - CSV parsing and generation

## Notes

- The scraper respects the website with 0.5-1 second delays between requests
- 2-second delays between category pages
- User-Agent header included to identify the crawler
- Failed requests are logged and listed in the report
- Images are automatically named and organized by category
- All data is saved in JSON format for easy processing

## Troubleshooting

**Q: Scripts are failing to run**
```bash
# Make sure you're in the correct directory
cd /path/to/node-crawler

# Check Node.js is installed
node --version

# Run with explicit node
node scraper.js
```

**Q: Dependencies not installing**
```bash
# Clear npm cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Q: Network errors during scraping**
- Check your internet connection
- The scraper has built-in retry logic (3 attempts with exponential backoff)
- Check `scraper.log` for detailed error messages
- Try again later if the website is temporarily unavailable

**Q: Out of memory errors**
- The scraper processes products sequentially
- On systems with limited RAM, you may need to limit products per category
- Edit the limit in `extractProductsFromCategory()` method

## Legal Notice

This tool is for educational purposes. Ensure you have the right to scrape the website and respect their Terms of Service and robots.txt. Always check:
- Website's robots.txt file
- Terms of Service
- Rate limiting and server load

## Comparison with Python Version

This Node.js implementation maintains feature parity with the Python version:

| Feature | Python | Node.js |
|---------|--------|---------|
| Web scraping | ✅ | ✅ |
| Image download | ✅ | ✅ |
| Detail page parsing | ✅ | ✅ |
| Retry logic | ✅ | ✅ |
| Rate limiting | ✅ | ✅ |
| JSON export | ✅ | ✅ |
| CSV export | ✅ | ✅ |
| HTML catalog | ✅ | ✅ |
| Statistics | ✅ | ✅ |

## File Structure

```
node-crawler/
├── package.json           # Project metadata and dependencies
├── scraper.js             # Main RuwacScraper class
├── run.js                 # Entry point with dependency installation
├── test-scraper.js        # Quick test script
├── organize-data.js       # Data processing utilities
├── README.md              # This file
├── .gitignore             # Git ignore patterns
├── start.sh               # Bash wrapper (optional)
└── ruwac_data/            # Generated output (after running scraper)
    ├── Industrial Vacuum Cleaners/
    ├── Dust Extractor/
    ├── Accessories/
    └── scraping_report.json
```

## Author

Created for INFO121 AiPower project

## License

MIT
