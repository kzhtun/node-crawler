// Export ProductInformation.json to XLSX with template columns from products (1).xlsx
const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const XLSX = require('xlsx');

const TEMPLATE_XLSX = path.join(__dirname, 'product-full.xlsx');
const OUTPUT_XLSX = path.join(__dirname, 'ruwac_product_export.xlsx');
const SEARCH_PATTERN = path.join(__dirname, 'ruwac_data/Industrial Vacuum Cleaners/**/ProductInformation.json');

function formatDescription(data) {
  const detailInfo = data.detailInfo || {};
  let desc = '';
  // Use fullDescription, fallback to pageTitle
  if (detailInfo.fullDescription && detailInfo.fullDescription !== 'null') {
    desc += detailInfo.fullDescription + '\n\n';
  } else if (detailInfo.pageTitle) {
    desc += detailInfo.pageTitle + '\n\n';
  }

  // Technical Specs
  if (detailInfo.technicalSpecs && Object.keys(detailInfo.technicalSpecs).length) {
    desc += 'Technical Specs:\n';
    for (const [k, v] of Object.entries(detailInfo.technicalSpecs)) {
      desc += `• ${k}: ${v}\n`;
    }
    desc += '\n';
  }

  // Merge features from root and detailInfo
  let features = [];
  if (Array.isArray(data.features)) features = features.concat(data.features);
  if (Array.isArray(detailInfo.features)) features = features.concat(detailInfo.features);
  features = features.filter((v, i, a) => v && a.indexOf(v) === i); // unique, non-empty
  if (features.length) {
    desc += 'Features:\n';
    for (const f of features) {
      desc += `• ${f}\n`;
    }
    desc += '\n';
  }

  // Applications
  if (detailInfo.applications && detailInfo.applications.length) {
    desc += 'Applications:\n';
    for (const a of detailInfo.applications) {
      desc += `• ${a}\n`;
    }
    desc += '\n';
  }
  // Add Download Brochure link if available
  if (detailInfo.brochureUrl) {
    desc += `\n\n=HYPERLINK(\"${detailInfo.brochureUrl}\",\"Download Brochure\")`;
  }
  return desc.trim();
}

async function main() {
  // Read template columns
  const templateWb = XLSX.readFile(TEMPLATE_XLSX);
  const sheetName = templateWb.SheetNames[0];
  const templateWs = templateWb.Sheets[sheetName];
  const templateRows = XLSX.utils.sheet_to_json(templateWs, { header: 1 });
  const headers = templateRows[0];

  const files = glob.sync(SEARCH_PATTERN);
  const dataRows = [];

  let processed = 0;
  let skipped = 0;
  for (const file of files) {
    try {
      const data = await fs.readJson(file);
      const detailInfo = data.detailInfo || {};
      const row = headers.map(col => {
        switch (col) {
          case 'Title':
            // Use data.title, fallback to detailInfo.pageTitle, else blank
            return data.title || detailInfo.pageTitle || '';
          case 'Description':
            return formatDescription(data);
          case 'Categories':
            return [data.category, data.subcategory].filter(Boolean).join('/');
          case 'Hashtags': {
            // Title
            const title = (data.title || detailInfo.pageTitle || '').trim();
            // Categories, split by '/'
            let cats = [data.category, data.subcategory].filter(Boolean).join('/');
            let catWords = cats.split('/').map(s => s.trim()).filter(Boolean);
            // Distinct hashtags
            const allTags = [title, ...catWords].filter(Boolean);
            const distinctTags = allTags.filter((v, i, a) => a.indexOf(v) === i);
            return distinctTags.join(' | ');
          }
          case 'Enable volume price':
            return '0';
          case 'Image URLs':
            return (detailInfo.detailImages || []).join('|');
          case 'price':
          case 'Price':
            return '999';
          case 'Unlimited stock':
            return '1';
          case 'Enable Pre Order':
            return '0';
          case 'Publish Status':
            return '1';
          case 'Listing status':
            return '1';
          case 'All campaigns (except free shipping)':
            return '0';
          case 'Free shipping campaign':
            return '0';
          case 'Promo code':
            return '0';
          default:
            return '';
        }
      });
      dataRows.push(row);
      console.log(`[EXPORTED] ${file}`);
      processed++;
    } catch (err) {
      console.warn(`[SKIPPED] ${file} - ${err.message}`);
      skipped++;
    }
  }

  // Write to new workbook with template columns
  const outWb = XLSX.utils.book_new();
  const outWs = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  XLSX.utils.book_append_sheet(outWb, outWs, 'Products');
  XLSX.writeFile(outWb, OUTPUT_XLSX);
  console.log(`Exported ${processed} products to ${OUTPUT_XLSX}`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} files due to errors.`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
