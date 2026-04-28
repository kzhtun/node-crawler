const path = require('path');
const fs = require('fs-extra');
const { createWriteStream } = require('fs');
const winston = require('winston');
const Papa = require('papaparse');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console()
  ]
});

class DataOrganizer {
  constructor(dataDir = 'ruwac_data') {
    this.dataDir = path.join(process.cwd(), dataDir);
  }

  async loadAllProducts() {
    const allProducts = [];

    // Walk through category directories
    const categoryDirs = await fs.readdir(this.dataDir);

    for (const category of categoryDirs) {
      const categoryPath = path.join(this.dataDir, category);
      const stat = await fs.stat(categoryPath);

      if (!stat.isDirectory()) continue;

      // Walk through subcategories
      const subcategoryDirs = await fs.readdir(categoryPath);

      for (const subcategory of subcategoryDirs) {
        const subcategoryPath = path.join(categoryPath, subcategory);
        const subStat = await fs.stat(subcategoryPath);

        if (!subStat.isDirectory()) continue;

        // Walk through product folders
        const productDirs = await fs.readdir(subcategoryPath);

        for (const productDir of productDirs) {
          const productPath = path.join(subcategoryPath, productDir);
          const productStat = await fs.stat(productPath);

          if (!productStat.isDirectory()) continue;

          // Load ProductInformation.json
          const infoFile = path.join(productPath, 'ProductInformation.json');
          if (await fs.pathExists(infoFile)) {
            try {
              const product = await fs.readJSON(infoFile);
              allProducts.push(product);
            } catch (error) {
              logger.warn(`Failed to read ${infoFile}: ${error.message}`);
            }
          }
        }
      }
    }

    return allProducts;
  }

  async exportToCSV(outputFile = 'products_export.csv') {
    const products = await this.loadAllProducts();

    if (products.length === 0) {
      logger.warn('No products found to export');
      return;
    }

    // Flatten product data for CSV
    const rows = [];
    for (const product of products) {
      const row = {
        'Title': product.title || '',
        'Category': product.category || '',
        'Subcategory': product.subcategory || '',
        'URL': product.categoryPageUrl || '',
        'Detail URL': product.detailPageUrl || '',
        'Description': (product.description || '').substring(0, 100),
        'Image Count': (product.categoryImages || []).length + (product.detailInfo?.detailImages?.length || 0),
        'Feature Count': (product.features || []).length,
        'Spec Count': Object.keys(product.detailInfo?.technicalSpecs || {}).length
      };

      // Add first 5 specs as columns
      const specs = product.detailInfo?.technicalSpecs || {};
      const specEntries = Object.entries(specs).slice(0, 5);
      specEntries.forEach((spec, i) => {
        row[`Spec_${i + 1}_Key`] = spec[0];
        row[`Spec_${i + 1}_Value`] = String(spec[1]).substring(0, 50);
      });

      rows.push(row);
    }

    // Write CSV
    if (rows.length > 0) {
      // Get all unique keys
      const allKeys = new Set();
      rows.forEach(row => {
        Object.keys(row).forEach(key => allKeys.add(key));
      });
      const keys = Array.from(allKeys);

      // Convert to CSV string
      const csv = Papa.unparse({
        fields: keys,
        data: rows.map(row => keys.map(key => row[key] ?? ''))
      });

      await fs.writeFile(outputFile, csv);
      logger.info(`✓ Exported ${rows.length} products to ${outputFile}`);
    }
  }

  async generateStatistics(outputFile = 'statistics.json') {
    const products = await this.loadAllProducts();

    const stats = {
      totalProducts: products.length,
      byCategory: {},
      totalImages: 0,
      totalSpecs: 0,
      categoriesDetail: {}
    };

    for (const product of products) {
      const category = product.category || 'Unknown';

      // Count by category
      if (!stats.byCategory[category]) {
        stats.byCategory[category] = 0;
      }
      stats.byCategory[category]++;

      // Count images and specs
      const categoryImagesCount = (product.categoryImages || []).length;
      const detailImagesCount = (product.detailInfo?.detailImages || []).length;
      const totalImagesCount = categoryImagesCount + detailImagesCount;
      stats.totalImages += totalImagesCount;

      const specsCount = Object.keys(product.detailInfo?.technicalSpecs || {}).length;
      stats.totalSpecs += specsCount;

      // Category details
      if (!stats.categoriesDetail[category]) {
        stats.categoriesDetail[category] = {
          count: 0,
          avgImages: 0,
          avgSpecs: 0,
          products: []
        };
      }

      stats.categoriesDetail[category].count++;
      stats.categoriesDetail[category].products.push(product.title || 'Unknown');
    }

    // Calculate averages
    for (const category of Object.keys(stats.categoriesDetail)) {
      const categoryProducts = products.filter(p => p.category === category);
      const count = categoryProducts.length;

      const totalImages = categoryProducts.reduce((sum, p) => {
        return sum + (p.categoryImages || []).length + (p.detailInfo?.detailImages || []).length;
      }, 0);

      const totalSpecs = categoryProducts.reduce((sum, p) => {
        return sum + Object.keys(p.detailInfo?.technicalSpecs || {}).length;
      }, 0);

      stats.categoriesDetail[category].avgImages = count > 0 ? Math.round((totalImages / count) * 100) / 100 : 0;
      stats.categoriesDetail[category].avgSpecs = count > 0 ? Math.round((totalSpecs / count) * 100) / 100 : 0;
    }

    await fs.writeJSON(outputFile, stats, { spaces: 2 });

    logger.info(`✓ Statistics saved to ${outputFile}`);
    logger.info(`  Total products: ${stats.totalProducts}`);
    logger.info(`  Total images: ${stats.totalImages}`);
    logger.info(`  By category: ${JSON.stringify(stats.byCategory)}`);
  }

  async createIndexHTML(outputFile = 'index.html') {
    const products = await this.loadAllProducts();

    // Group by category
    const categories = {};
    for (const product of products) {
      const category = product.category || 'Unknown';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(product);
    }

    const totalImages = products.reduce((sum, p) => {
      return sum + (p.categoryImages || []).length + (p.detailInfo?.detailImages || []).length;
    }, 0);

    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ruwac Products Catalog</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 30px; text-align: center; }
        .category { background: white; margin-bottom: 30px; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .category h2 { color: #0066cc; margin-bottom: 15px; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
        .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
        .product-card { background: #fafafa; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; transition: transform 0.3s; }
        .product-card:hover { transform: translateY(-5px); box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
        .product-image { width: 100%; height: 200px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .product-image img { width: 100%; height: 100%; object-fit: cover; }
        .product-info { padding: 15px; }
        .product-title { font-weight: bold; color: #333; margin-bottom: 8px; font-size: 14px; }
        .product-url { font-size: 12px; color: #666; text-decoration: none; word-break: break-all; }
        .product-url:hover { color: #0066cc; }
        .stats { background: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; text-align: center; }
        .stats p { margin: 10px 0; font-size: 16px; }
        .stats strong { color: #0066cc; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Ruwac Products Catalog</h1>
        <div class="stats">
            <p><strong>Total Products:</strong> ${products.length}</p>
            <p><strong>Total Images:</strong> ${totalImages}</p>
            <p><strong>Categories:</strong> ${Object.keys(categories).length}</p>
        </div>
`;

    // Add categories and products
    for (const category of Object.keys(categories).sort()) {
      const categoryProducts = categories[category];
      html += `        <div class="category">
            <h2>${category} (${categoryProducts.length} products)</h2>
            <div class="products-grid">
`;

      for (const product of categoryProducts) {
        const images = product.categoryImages || [];
        let imgHtml = '';

        if (images.length > 0) {
          const imagePath = `${product.category}/${product.subcategory}/${product.modelName || product.title}/images/${images[0]}`;
          imgHtml = `<img src="${imagePath}" alt="${product.title || 'Product'}" style="max-width:100%;max-height:100%;">`;
        } else if (product.detailInfo?.detailImages?.length > 0) {
          const imagePath = `${product.category}/${product.subcategory}/${product.modelName || product.title}/images/${product.detailInfo.detailImages[0]}`;
          imgHtml = `<img src="${imagePath}" alt="${product.title || 'Product'}" style="max-width:100%;max-height:100%;">`;
        } else {
          imgHtml = '<div style="color: #999; display:flex;align-items:center;justify-content:center;height:100%;">No image</div>';
        }

        html += `                <div class="product-card">
                    <div class="product-image">${imgHtml}</div>
                    <div class="product-info">
                        <div class="product-title">${product.title || 'Unknown'}</div>
                        <a href="${product.detailPageUrl || product.categoryPageUrl || '#'}" class="product-url" target="_blank">View product</a>
                    </div>
                </div>
`;
      }

      html += `            </div>
        </div>
`;
    }

    html += `    </div>
</body>
</html>`;

    await fs.writeFile(outputFile, html);
    logger.info(`✓ HTML catalog generated: ${outputFile}`);
  }

  async renameImagesByProduct() {
    const products = await this.loadAllProducts();

    for (const product of products) {
      const category = product.category;
      const subcategory = product.subcategory;
      const productFolderName = product.title || product.modelName;

      const imagesDir = path.join(this.dataDir, category, subcategory, productFolderName, 'images');

      if (await fs.pathExists(imagesDir)) {
        const images = product.categoryImages || [];

        for (let i = 0; i < images.length; i++) {
          const oldPath = path.join(imagesDir, images[i]);
          const ext = path.extname(images[i]);
          const newName = `${productFolderName.replace(/\s+/g, '_')}_${i}${ext}`;
          const newPath = path.join(imagesDir, newName);

          if (await fs.pathExists(oldPath) && oldPath !== newPath) {
            try {
              await fs.rename(oldPath, newPath);
              logger.info(`✓ Renamed ${images[i]} to ${newName}`);
            } catch (error) {
              logger.error(`Failed to rename ${oldPath}: ${error.message}`);
            }
          }
        }
      }
    }
  }
}

async function main() {
  const organizer = new DataOrganizer('ruwac_data');

  console.log('\n' + '='.repeat(50));
  console.log('Data Organization Utilities');
  console.log('='.repeat(50));

  try {
    // Generate statistics
    console.log('\nGenerating statistics...');
    await organizer.generateStatistics();

    // Export to CSV
    console.log('Exporting to CSV...');
    await organizer.exportToCSV();

    // Create HTML catalog
    console.log('Creating HTML catalog...');
    await organizer.createIndexHTML();

    console.log('\n' + '='.repeat(50));
    console.log('✅ Done! Generated files:');
    console.log('  - statistics.json');
    console.log('  - products_export.csv');
    console.log('  - index.html');
    console.log('='.repeat(50) + '\n');
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DataOrganizer;
