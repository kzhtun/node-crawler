const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs-extra");
const { URL } = require("url");
const winston = require("winston");
const { Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, HeadingLevel, BorderStyle } = require("docx");

// Configure logging
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} - ${level.toUpperCase()} - ${message}`)
  ),
  transports: [new winston.transports.File({ filename: "scraper.log" }), new winston.transports.Console()],
});

// Utility function to sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Utility function to get random delay between min and max
const getRandomDelay = (min = 500, max = 1000) => Math.random() * (max - min) + min;

class RuwacScraper {
  constructor(baseUrl = "https://www.ruwac.asia", outputDir = "ruwac_data") {
    this.baseUrl = baseUrl;
    this.outputDir = path.join(process.cwd(), outputDir);
    this.failedUrls = [];

    // Create output directory
    fs.ensureDirSync(this.outputDir);

    // Setup axios instance with retry strategy
    this.session = axios.create({
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    // Add retry interceptor
    this.session.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        config.retryCount = config.retryCount || 0;

        // Retry on specific status codes
        const retryStatusCodes = [429, 500, 502, 503, 504];
        if (retryStatusCodes.includes(error.response?.status) && config.retryCount < 3) {
          config.retryCount++;
          const delay = Math.pow(2, config.retryCount - 1) * 1000;
          await sleep(delay);
          return this.session(config);
        }

        throw error;
      }
    );
  }

  async getPage(url) {
    try {
      const response = await this.session.get(url);
      return response;
    } catch (error) {
      logger.error(`Failed to fetch ${url}: ${error.message}`);
      this.failedUrls.push(url);
      return null;
    }
  }

  sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9 \-_]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  async downloadImage(imgUrl, productFolder) {
    try {
      if (!imgUrl) return null;

      // Make absolute URL
      imgUrl = new URL(imgUrl, this.baseUrl).toString();

      // Create images folder
      const imagesDir = path.join(productFolder, "images");
      await fs.ensureDir(imagesDir);

      // Get image filename
      const parsedUrl = new URL(imgUrl);
      let filename = path.basename(parsedUrl.pathname);

      if (!filename || filename === "") {
        const files = await fs.readdir(imagesDir);
        filename = `image_${files.length}.jpg`;
      }

      const filepath = path.join(imagesDir, filename);

      // Skip if already downloaded
      if (await fs.pathExists(filepath)) {
        return filename;
      }

      // Download image
      const response = await this.session.get(imgUrl, { responseType: "arraybuffer" });
      await fs.writeFile(filepath, response.data);

      logger.debug(`  ✓ Downloaded image: ${filename}`);
      return filename;
    } catch (error) {
      logger.debug(`Failed to download image ${imgUrl}: ${error.message}`);
      return null;
    }
  }

  

  async scrapeDetailPage(detailUrl, productFolder) {
    const detailInfo = {
      detailPageUrl: detailUrl,
      pageTitle: null,
      fullDescription: null,
      technicalSpecs: {},
      features: [],
      applications: [],
      detailImages: [],
    };

    const response = await this.getPage(detailUrl);
    if (!response) return detailInfo;

    const $ = cheerio.load(response.data);

    // Extract page title
    const titleElem = $("h1, .product-name").first();
    if (titleElem.length > 0) {
      detailInfo.pageTitle = titleElem.text().trim();
    }

    // Extract description from product-header or product-description
    let description = null;

    // Try product header first
    const productHeader = $(".product-header.row");
    if (productHeader.length > 0) {
      const headerText = productHeader.text().trim();
      // Extract description lines (usually after title)
      const lines = headerText.split(/\n|\//).filter((l) => l.trim().length > 0);
      // Look for meaningful description (longer than title, contains keywords)
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.length > 20 &&
          !trimmed.includes(detailInfo.pageTitle) &&
          (trimmed.includes("protection") || trimmed.includes("Variety") || trimmed.includes("independent") || trimmed.length > 50)
        ) {
          description = trimmed;
          break;
        }
      }
    }

    // Fallback: try product-description div
    if (!description) {
      const descDiv = $(".product-description");
      if (descDiv.length > 0) {
        description = descDiv.text().trim();
      }
    }

    detailInfo.fullDescription = description;

    // Extract technical specifications from product-property divs
    $(".product-property").each((i, elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();
      // Format is usually "Label: Value" or "Label\nValue"
      const parts = text.split(/:\s*|\n\s*/);
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join(" ").trim();
        if (key && value && value.length > 0) {
          detailInfo.technicalSpecs[key] = value;
        }
      }
    });

    // Extract features from special-property divs
    $(".special-property").each((i, elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();
      // Remove leading numbers and clean up
      const feature = text.replace(/^\d+\s*/, "").trim();
      if (feature && feature.length > 5) {
        detailInfo.features.push(feature);
      }
    });

    // Extract applications from dropdown menus
    const navigationItems = [
      "blog",
      "brochure",
      "film",
      "clip",
      "about",
      "news",
      "contact",
      "cookie",
      "necessary",
      "marketing",
      "statistics",
      "security",
      "how to",
      "machine registration",
      "application examples",
      "fairs",
      "events",
      "did you know",
    ];
    const applicationsSet = new Set();

    $(".dropdown-menu").each((i, elem) => {
      const $elem = $(elem);
      const headerText = $elem.find("strong, h4, h5, .dropdown-toggle").first().text().toLowerCase();

      // Check if this is an applications dropdown
      if (headerText.includes("application") || headerText.includes("example")) {
        $elem
          .find("li")
          .slice(0, 15)
          .each((idx, li) => {
            const liText = $(li).text().trim();
            const lowerText = liText.toLowerCase();

            // Filter out unwanted content
            if (
              liText &&
              liText.length > 3 &&
              liText.length < 150 &&
              !lowerText.includes("globe") &&
              !lowerText.includes("mailto") &&
              !lowerText.match(/^[a-z]{2}\s*\(/) &&
              !lowerText.match(/^\s*\n/) &&
              !navigationItems.some((item) => lowerText.includes(item))
            ) {
              applicationsSet.add(liText);
            }
          });
      }
    });

    // Fallback: look for application lists anywhere else
    if (applicationsSet.size === 0) {
      $("ul, ol").each((i, list) => {
        const $list = $(list);
        const parentClass = $list.parent().attr("class") || "";
        const parentText = $list.closest("section, div").text().toLowerCase();

        if (parentClass.includes("application") || parentClass.includes("example") || parentText.includes("application") || parentText.includes("example")) {
          $list
            .find("li")
            .slice(0, 10)
            .each((idx, li) => {
              const liText = $(li).text().trim();
              const lowerText = liText.toLowerCase();
              if (liText && liText.length > 3 && liText.length < 150 && !navigationItems.some((item) => lowerText.includes(item))) {
                applicationsSet.add(liText);
              }
            });
        }
      });
    }

    detailInfo.applications = Array.from(applicationsSet);

    // Extract images from detail page (excluding decorative ones)
    for (const img of $("img").toArray()) {
      const $img = $(img);
      let imgSrc = $img.attr("src") || $img.attr("data-src");
      const alt = ($img.attr("alt") || "").toLowerCase();

      if (imgSrc && !["logo", "icon", "menu", "avatar", "globe", "flag"].some((x) => imgSrc.toLowerCase().includes(x) || alt.includes(x))) {
        const imgName = await this.downloadImage(imgSrc, productFolder);
        if (imgName) {
          detailInfo.detailImages.push(imgName);
        }
      }
    }

    return detailInfo;
  }

  async extractProductsFromCategory($, category, subcategory, categoryUrl) {
    const products = [];

    // Look for product containers
    let productContainers = $("div, article")
      .get()
      .filter((el) => {
        const $el = $(el);
        const className = $el.attr("class") || "";
        return ["product", "model", "card", "item", "tile"].some((kw) => className.toLowerCase().includes(kw));
      });

    // Fallback: look for any div with image and heading
    if (productContainers.length === 0) {
      productContainers = $("div")
        .get()
        .filter((el) => {
          const $el = $(el);
          return $el.find("img").length > 0 && ($el.find("h2").length > 0 || $el.find("h3").length > 0 || $el.find("h4").length > 0);
        });
    }

    const productMaxCount = Math.min(productContainers.length, 3);

    // Process products (limit to 30 per page)
    for (let i = 0; i < productMaxCount; i++) {
      try {
        const container = productContainers[i];
        const $container = $(container);

        const product = {
          title: null,
          modelName: null,
          category,
          subcategory,
          categoryPageUrl: categoryUrl,
          detailPageUrl: null,
          description: null,
          features: [],
          categoryImages: [],
          detailInfo: {},
        };

        // Extract title/model name
        let titleFound = false;
        for (const heading of $container.find("h2, h3, h4, h5").toArray()) {
          const titleText = $(heading).text().trim();
          if (titleText && titleText.length > 2) {
            product.title = titleText;
            product.modelName = titleText;
            titleFound = true;
            break;
          }
        }

        if (!titleFound) continue;

        // Create product-specific folder
        const productFolderName = this.sanitizeFilename(product.title);
        const productFolder = path.join(this.outputDir, category, subcategory, productFolderName);
        await fs.ensureDir(productFolder);

        // Extract images from category page
        for (const img of $container.find("img").toArray()) {
          const $img = $(img);
          let imgSrc = $img.attr("src") || $img.attr("data-src");
          const imgAlt = $img.attr("alt") || "";

          if (imgSrc && !["logo", "icon", "menu"].some((x) => imgSrc.toLowerCase().includes(x))) {
            const imgName = await this.downloadImage(imgSrc, productFolder);
            if (imgName) {
              product.categoryImages.push(imgName);
            }
          }
        }

        // Extract features/description from category page
        $container.find("ul li").each((idx, li) => {
          const feature = $(li).text().trim();
          if (feature && feature.length > 2) {
            product.features.push(feature);
          }
        });

        $container.find("p").each((idx, p) => {
          const text = $(p).text().trim();
          if (text && text.length > 10 && !product.description) {
            product.description = text;
          }
        });

        // Find "Learn More" or info link
        let detailUrl = null;
        for (const link of $container.find("a").toArray()) {
          const $link = $(link);
          const href = $link.attr("href");
          const linkText = $link.text().toLowerCase();
          if (["learn", "info", "details", "more", "read"].some((x) => linkText.includes(x))) {
            detailUrl = new URL(href, this.baseUrl).toString();
            product.detailPageUrl = detailUrl;
            logger.debug(`  Found detail link: ${detailUrl}`);
            break;
          }
        }

        // Scrape detail page if we found a link
        if (detailUrl) {
          logger.debug(`  Scraping detail page for ${product.title}...`);
          product.detailInfo = await this.scrapeDetailPage(detailUrl, productFolder);
          await sleep(500);
        }

        // Save product information
        const productInfoFile = path.join(productFolder, "ProductInformation.json");
        await fs.writeJSON(productInfoFile, product, { spaces: 2 });
        await this.generateProductDocx(product, productFolder);

        const totalImages = product.categoryImages.length + (product.detailInfo.detailImages?.length || 0);
        logger.info(`✓ ${product.title} - ${totalImages} images`);
        products.push(product);
      } catch (error) {
        logger.debug(`Error extracting product: ${error.message}`);
        continue;
      }
    }

    return products;
  }

  async scrapeCategory(url, categoryName, subcategoryName = null) {
    if (!subcategoryName) {
      subcategoryName = categoryName;
    }

    logger.info(`\n📁 ${categoryName} > ${subcategoryName}`);
    const response = await this.getPage(url);

    if (!response) {
      return [];
    }

    const $ = cheerio.load(response.data);
    const products = await this.extractProductsFromCategory($, categoryName, subcategoryName, url);
    logger.info(`  Found ${products.length} products in this category`);

    return products;
  }

  async run() {
    logger.info("\n" + "=".repeat(70));
    logger.info("🚀 Starting Ruwac Website Scraper (with Detail Pages)");
    logger.info("=".repeat(70));

    const categories = {
        "Industrial Vacuum Cleaners": {
        "Overview": "https://www.ruwac.asia/industrial-vacuum-cleaner/overview-of-models",
        "Single-Phase Drive": "https://www.ruwac.asia/industrial-vacuum-cleaner/single-phase-drive",
        "Three-Phase Drive": "https://www.ruwac.asia/industrial-vacuum-cleaner/three-phase-drive",
        "Three-Phase Direct": "https://www.ruwac.asia/industrial-vacuum-cleaner/three-phase-drive-direct",
        "Compressed Air Drive": "https://www.ruwac.asia/industrial-vacuum-cleaner/compressed-air-drive",
        "Wet Vacuums": "https://www.ruwac.asia/industrial-vacuum-cleaner/wet-vacuums",
        "Chip Separator": "https://www.ruwac.asia/industrial-vacuum-cleaner/chip-separator",
        "Wet Separator": "https://www.ruwac.asia/industrial-vacuum-cleaner/wet-separator",
        "Pre-Separator": "https://www.ruwac.asia/industrial-vacuum-cleaner/pre-separator",
        "Battery Vacuum": "https://www.ruwac.asia/industrial-vacuum-cleaner/industry-battery-vacuum-cleaner",
        "Disposal Systems": "https://www.ruwac.asia/industrial-vacuum-cleaner/disposal-systems",
      },
      "Dust Extractor": {
        Main: "https://www.ruwac.asia/dust-extractor",
      },
      Accessories: {
        Main: "https://www.ruwac.asia/accessories",
      },
    };

    let totalProducts = 0;
    for (const [categoryName, subcategories] of Object.entries(categories)) {
      logger.info(`\n${"=".repeat(70)}`);
      logger.info(`Category: ${categoryName}`);
      logger.info("=".repeat(70));

      for (const [subcategoryName, url] of Object.entries(subcategories)) {
        const products = await this.scrapeCategory(url, categoryName, subcategoryName);
        totalProducts += products.length;
        await sleep(2000); // Be respectful to server
      }
    }

    this.generateReport(totalProducts);

    logger.info("\n" + "=".repeat(70));
    logger.info(`✅ Scraping completed! Total products: ${totalProducts}`);
    logger.info("=".repeat(70) + "\n");
  }

  async generateProductDocx(product, productFolder) {
    const toParas = (text) => {
      if (!text) return [new Paragraph({ text: "" })];
      return String(text)
        .split("\n")
        .map((line) => new Paragraph({ text: line }));
    };

    const cell = (content) =>
      new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        children: Array.isArray(content) ? content : toParas(content),
      });

    const headerCell = (text) =>
      new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
      });

    const row = (sn, fieldName, data, remarks = "") =>
      new TableRow({ children: [cell(String(sn)), cell(fieldName), cell(data), cell(remarks)] });

    const productTitle = product.detailInfo?.pageTitle || product.title || "";
    const description = product.detailInfo?.fullDescription || product.description || "";
    const specs = product.detailInfo?.technicalSpecs || {};
    const specsText = Object.entries(specs)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const features = [...(product.features || []), ...(product.detailInfo?.features || [])];
    const featuresText = features.join("\n");
    const fullDetailDesc = [description, specsText, featuresText].filter(Boolean).join("\n\n");
    const categoryText = [product.category, product.subcategory].filter(Boolean).join(" / ");
    const detailUrl = product.detailInfo?.detailPageUrl || product.categoryPageUrl || "";
    const applications = (product.detailInfo?.applications || []).join("\n");

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell("S/N"), headerCell("Boutir field name"), headerCell("Data from supplier"), headerCell("Remarks")],
        }),
        row("*", "URL of product info", detailUrl, "(Supplier) Ruwac"),
        row(1, "Product title", productTitle),
        row(2, "Product Description", description),
        row(3, "Product Categories", categoryText),
        row(4, "Supplier", "Ruwac"),
        row(5, "Product option", ""),
        row(6, "Volume price", ""),
        row(7, "Pre-order - Enable", ""),
        row(8, "Sales period", ""),
        row(9, "Google SEO settings", ""),
        row(10, "Sync to GMC", ""),
        row(11, "Product Listing status", ""),
        row(12, "Publish status", ""),
        row(13, "Exclude the product from campaigns or promo code", ""),
        row(14, "Product heritage (hashtag)", ""),
        row(15, "Related products (0 to 8)", ""),
        row(16, "Product detailed description", fullDetailDesc),
        row(17, "Applications", applications),
        row(18, "Technical Specifications", specsText),
        row(19, "Merchant remarks", ""),
      ],
    });

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun({ text: productTitle, bold: true })],
            }),
            table,
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const docxFile = path.join(productFolder, "ProductInformation.docx");
    await fs.writeFile(docxFile, buffer);
    logger.info(`  ✓ Generated DOCX: ProductInformation.docx`);
  }

  generateReport(totalProducts) {
    const report = {
      timestamp: new Date().toISOString(),
      totalProducts,
      structure: "Category/Subcategory/ProductName/ProductInformation.json",
      details: "Each product includes category page data + detail page data",
    };

    const reportFile = path.join(this.outputDir, "scraping_report.json");
    fs.writeJSONSync(reportFile, report, { spaces: 2 });

    logger.info("\n📊 SCRAPING SUMMARY");
    logger.info("-".repeat(70));
    logger.info(`Total products scraped: ${totalProducts}`);
    logger.info(`Output directory: ${this.outputDir}`);
    logger.info("Folder structure:");
    logger.info("  ruwac_data/");
    logger.info("  ├── Category/");
    logger.info("  │   ├── Subcategory/");
    logger.info("  │   │   ├── Product Name/");
    logger.info("  │   │   │   ├── images/");
    logger.info("  │   │   │   └── ProductInformation.json");
    logger.info("  │   │   └── ...");
    if (this.failedUrls.length > 0) {
      logger.warn(`Failed URLs: ${this.failedUrls.length}`);
    }
    logger.info("-".repeat(70));
  }
}

// Main execution
if (require.main === module) {
  const scraper = new RuwacScraper("https://www.ruwac.asia", "ruwac_data");
  scraper.run().catch((error) => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = RuwacScraper;
