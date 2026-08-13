#!/usr/bin/env node
// Copies Chart.js out of node_modules into public/vendor so the dashboard has
// no runtime CDN dependency. RS's technical team deploys this internally, and
// an egress-restricted network would otherwise leave every chart blank with no
// visible error. Run after `npm install` (or `npm run vendor`).

const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "chart.js", "dist", "chart.umd.min.js");
const destDir = path.join(__dirname, "..", "public", "vendor");
const dest = path.join(destDir, "chart.umd.min.js");

if (!fs.existsSync(src)) {
  console.error("chart.js not found in node_modules — run `npm install` first.");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Vendored Chart.js → ${path.relative(process.cwd(), dest)} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
