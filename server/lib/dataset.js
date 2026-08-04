const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { scoreSentiment, sentimentLabel } = require("./sentiment");

const SYNTHETIC_CSV = path.join(__dirname, "..", "..", "data", "processed", "synthetic_reddit_discord.csv");

let cachedSynthetic = null;

/**
 * Loads the static, illustrative Reddit + Discord sample (see
 * report/GAMING_COMMUNITY_PULSE_REPORT.md, Methodology section, for why this
 * portion is synthetic rather than live). Cached in memory after first read.
 */
function loadSyntheticRows() {
  if (cachedSynthetic) return cachedSynthetic;
  const raw = fs.readFileSync(SYNTHETIC_CSV, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true });
  cachedSynthetic = records.map((r) => {
    const sentiment_score = scoreSentiment(r.text);
    return {
      platform: r.platform,
      data_type: r.data_type, // "synthetic"
      game: r.game,
      source: r.source,
      content_type: r.content_type,
      author: r.author,
      timestamp: r.timestamp,
      text: r.text,
      theme: r.theme || "",
      score: Number(r.score || 0),
      num_comments: Number(r.num_comments || 0),
      url: r.url || "",
      sentiment_score: Math.round(sentiment_score * 1000) / 1000,
      sentiment_label: sentimentLabel(sentiment_score),
    };
  });
  return cachedSynthetic;
}

module.exports = { loadSyntheticRows };
