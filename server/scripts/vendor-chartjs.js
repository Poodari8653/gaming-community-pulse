#!/usr/bin/env node
// Copies Chart.js out of node_modules into public/vendor so the dashboard has
// no runtime CDN dependency. RS's technical team deploys this internally, and
// an egress-restricted network would otherwise leave every chart blank with no
// visible error. Run after `npm install` (or `npm run vendor`).

const fs = require("fs");
const path = require("path");

// chart.js may be installed under server/node_modules (a `cd server && npm
// install`, as Render does) or under the repository root's node_modules (a root
// install, as Vercel does when the service root is "./"). Check both rather
// than assuming one layout.
const CANDIDATES = [
  path.join(__dirname, "..", "node_modules", "chart.js", "dist", "chart.umd.min.js"),
  path.join(__dirname, "..", "..", "node_modules", "chart.js", "dist", "chart.umd.min.js"),
];

const destDir = path.join(__dirname, "..", "public", "vendor");
const dest = path.join(destDir, "chart.umd.min.js");

const src = CANDIDATES.find((p) => fs.existsSync(p));

if (!src) {
  // Not fatal: the vendored copy is committed to the repository precisely so the
  // dashboard still renders when this step cannot run. Only complain if the
  // committed copy is missing too.
  if (fs.existsSync(dest)) {
    console.log("chart.js not in node_modules; using the committed copy at server/public/vendor/.");
    process.exit(0);
  }
  console.error("chart.js not found in node_modules and no committed copy at server/public/vendor/ — run `npm install` first.");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Vendored Chart.js → ${path.relative(process.cwd(), dest)} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
