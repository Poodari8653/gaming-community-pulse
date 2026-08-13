// ---------------------------------------------------------------------------
// Derived analysis: spike detection, theme aggregation, risk scoring, recurring
// question clustering, and day-over-day deltas.
//
// This is the layer that turns "here are the numbers" into "here is what
// changed and what needs attention" — Questionary §8. Previously the report
// described spike detection and recurring questions, but no code computed
// either: spikes were hardcoded into the synthetic data generator, and
// "recurring questions" was `text.endsWith("?")`. Both are implemented here.
// ---------------------------------------------------------------------------

const { engagementIndex, engagementBand } = require("./engagement");

// --------------------------------------------------------------------------
// Time bucketing
// --------------------------------------------------------------------------

function isoWeekStart(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function dayKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

/** Buckets records into a time series with volume and mean sentiment per bucket. */
function buildSeries(records, granularity = "day") {
  const keyFn = granularity === "week" ? isoWeekStart : dayKey;
  const buckets = new Map();

  for (const r of records) {
    const k = keyFn(r.timestamp);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, { key: k, count: 0, sentSum: 0, engSum: 0 });
    const b = buckets.get(k);
    b.count += 1;
    b.sentSum += r.sentiment_score;
    b.engSum += r.engagement_index;
  }

  return Array.from(buckets.values())
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => ({
      key: b.key,
      count: b.count,
      avg_sentiment: Math.round(b.sentSum / b.count),
      avg_engagement: Math.round((b.engSum / b.count) * 10) / 10,
    }));
}

// --------------------------------------------------------------------------
// Spike detection
// --------------------------------------------------------------------------

/**
 * Flags buckets whose volume is a genuine outlier against the trailing
 * baseline, rather than eyeballing a line chart.
 *
 * For each point, compute the mean and standard deviation of the preceding
 * `window` points. A point is a spike when it is at least `minZ` standard
 * deviations above that baseline AND at least 1.5× the baseline mean — the
 * second condition stops a very flat, low-volume stretch from making a
 * one-record bump look dramatic.
 */
function detectSpikes(series, { window = 6, minZ = 2, minCount = 3 } = {}) {
  const spikes = [];

  for (let i = 1; i < series.length; i++) {
    const prior = series.slice(Math.max(0, i - window), i);
    if (prior.length < 2) continue;

    const counts = prior.map((p) => p.count);
    const mean = counts.reduce((a, c) => a + c, 0) / counts.length;
    const variance = counts.reduce((a, c) => a + (c - mean) ** 2, 0) / counts.length;
    const sd = Math.sqrt(variance);
    const point = series[i];

    if (point.count < minCount) continue;
    if (sd === 0) {
      if (point.count >= mean * 2 && point.count >= minCount) {
        spikes.push({ ...point, baseline: Math.round(mean * 10) / 10, z: null, multiple: mean ? Math.round((point.count / mean) * 10) / 10 : null });
      }
      continue;
    }

    const z = (point.count - mean) / sd;
    if (z >= minZ && point.count >= mean * 1.5) {
      spikes.push({
        ...point,
        baseline: Math.round(mean * 10) / 10,
        z: Math.round(z * 10) / 10,
        multiple: Math.round((point.count / mean) * 10) / 10,
      });
    }
  }

  return spikes;
}

// --------------------------------------------------------------------------
// Themes
// --------------------------------------------------------------------------

/**
 * Theme-level aggregates. Unlike the previous build, live records carry themes
 * (assigned by the semantic layer), so this reflects real conversation rather
 * than only the static sample.
 */
function aggregateThemes(records, { minCount = 2 } = {}) {
  const agg = new Map();

  for (const r of records) {
    if (!r.theme) continue;
    if (!agg.has(r.theme)) {
      agg.set(r.theme, { theme: r.theme, count: 0, sentSum: 0, engSum: 0, negative: 0, positive: 0, examples: [] });
    }
    const t = agg.get(r.theme);
    t.count += 1;
    t.sentSum += r.sentiment_score;
    t.engSum += r.engagement_index;
    if (r.sentiment_label === "negative") t.negative += 1;
    if (r.sentiment_label === "positive") t.positive += 1;
    if (t.examples.length < 3) t.examples.push({ text: r.text.slice(0, 180), platform: r.platform, game: r.game });
  }

  return Array.from(agg.values())
    .filter((t) => t.count >= minCount)
    .map((t) => ({
      theme: t.theme,
      count: t.count,
      avg_sentiment: Math.round(t.sentSum / t.count),
      avg_engagement: Math.round((t.engSum / t.count) * 10) / 10,
      negative_share: Math.round((t.negative / t.count) * 100),
      positive_share: Math.round((t.positive / t.count) * 100),
      examples: t.examples,
    }))
    .sort((a, b) => b.count - a.count);
}

// --------------------------------------------------------------------------
// Risk detection
// --------------------------------------------------------------------------

/**
 * Surfaces the things a community or marketing lead would want escalated.
 *
 * Two independent sources:
 *   1. Record-level flags from the semantic layer (refund/uninstall talk,
 *      review-bombing, accusations of bad faith).
 *   2. Theme-level thresholds — a theme with meaningful volume whose negative
 *      share crosses 55% and whose mean sentiment is clearly negative.
 *
 * Each risk carries a severity so the dashboard can rank rather than dump.
 */
function detectRisks(records, themes, { minThemeCount = 4, negShareThreshold = 55 } = {}) {
  const risks = [];

  // 1. theme-level
  for (const t of themes) {
    if (t.count < minThemeCount) continue;
    if (t.negative_share < negShareThreshold || t.avg_sentiment > -10) continue;

    const severity = Math.min(
      100,
      Math.round(t.negative_share * 0.6 + Math.abs(t.avg_sentiment) * 0.3 + Math.min(t.count, 40) * 0.25)
    );
    risks.push({
      type: "theme",
      label: t.theme,
      severity,
      detail: `${t.count} mentions, ${t.negative_share}% negative, mean sentiment ${t.avg_sentiment > 0 ? "+" : ""}${t.avg_sentiment}`,
      games: Array.from(new Set(records.filter((r) => r.theme === t.theme).map((r) => r.game))),
      examples: t.examples,
    });
  }

  // 2. record-level flags, grouped by game so the panel doesn't list 40 rows
  const flagged = records.filter((r) => r.is_risk);
  const byGame = new Map();
  for (const r of flagged) {
    if (!byGame.has(r.game)) byGame.set(r.game, []);
    byGame.get(r.game).push(r);
  }
  for (const [game, rows] of byGame) {
    const topRows = [...rows].sort((a, b) => b.engagement_index - a.engagement_index).slice(0, 3);
    const severity = Math.min(100, Math.round(30 + rows.length * 6 + topRows[0].engagement_index * 0.4));
    risks.push({
      type: "flagged",
      label: `${rows.length} escalation-worthy post${rows.length === 1 ? "" : "s"} — ${game}`,
      severity,
      detail: `Flagged by semantic analysis as signalling a brewing community problem.`,
      games: [game],
      examples: topRows.map((r) => ({ text: r.text.slice(0, 180), platform: r.platform, game: r.game })),
    });
  }

  return risks.sort((a, b) => b.severity - a.severity);
}

// --------------------------------------------------------------------------
// Recurring questions
// --------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to", "of",
  "and", "or", "but", "in", "on", "at", "for", "with", "about", "as", "by", "from",
  "it", "its", "this", "that", "these", "those", "i", "you", "we", "they", "he",
  "she", "my", "your", "our", "their", "do", "does", "did", "can", "could", "would",
  "should", "will", "get", "got", "any", "anyone", "someone", "how", "what", "why",
  "when", "where", "which", "who", "there", "here", "just", "still", "even", "also",
  "so", "if", "not", "no", "yes", "have", "has", "had", "am", "im", "ive", "dont",
]);

function keyTokens(text) {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Clusters questions by topical overlap so "recurring" genuinely means the
 * community keeps asking the same thing. A single question asked once is not
 * a content opportunity; the same question asked eleven ways is.
 */
function clusterQuestions(records, { threshold = 0.4, maxClusters = 10 } = {}) {
  const questions = records.filter((r) => r.is_question && r.text && r.text.length > 12);
  const clusters = [];

  for (const q of questions) {
    const tokens = keyTokens(q.text);
    if (tokens.size < 2) continue;

    let placed = false;
    for (const c of clusters) {
      if (jaccard(tokens, c.tokens) >= threshold) {
        c.members.push(q);
        for (const t of tokens) c.tokens.add(t);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ tokens, members: [q] });
  }

  return clusters
    .map((c) => {
      const best = [...c.members].sort((a, b) => b.engagement_index - a.engagement_index)[0];
      return {
        question: best.text.slice(0, 220),
        asked: c.members.length,
        games: Array.from(new Set(c.members.map((m) => m.game))),
        platforms: Array.from(new Set(c.members.map((m) => m.platform))),
        top_engagement: best.engagement_index,
        band: engagementBand(best.engagement_index),
        url: best.url || "",
      };
    })
    .sort((a, b) => b.asked - a.asked || b.top_engagement - a.top_engagement)
    .slice(0, maxClusters);
}

// --------------------------------------------------------------------------
// Day-over-day deltas
// --------------------------------------------------------------------------

/**
 * Compares the current analysis against the previous stored snapshot.
 * Returns nulls (not zeros) when there is no prior snapshot, so the UI can
 * say "no comparison available yet" instead of implying nothing changed.
 */
function computeDeltas(current, previous) {
  if (!previous) {
    return { available: false, reason: "No earlier snapshot yet — deltas appear from the second day of collection.", games: [], overall: null };
  }

  const prevGames = new Map((previous.games_summary || []).map((g) => [g.game, g]));
  const games = (current.games_summary || []).map((g) => {
    const p = prevGames.get(g.game);
    if (!p) return { game: g.game, is_new: true, sentiment_delta: null, volume_delta: null, engagement_delta: null };
    return {
      game: g.game,
      is_new: false,
      sentiment_delta: g.avg_sentiment - p.avg_sentiment,
      volume_delta: g.record_count - p.record_count,
      volume_pct: p.record_count ? Math.round(((g.record_count - p.record_count) / p.record_count) * 100) : null,
      engagement_delta: Math.round((g.avg_engagement - p.avg_engagement) * 10) / 10,
    };
  });

  const prevThemes = new Map((previous.themes || []).map((t) => [t.theme, t]));
  const themeMoves = (current.themes || [])
    .map((t) => {
      const p = prevThemes.get(t.theme);
      if (!p) return { theme: t.theme, is_new: true, count_delta: t.count, sentiment_delta: null };
      return { theme: t.theme, is_new: false, count_delta: t.count - p.count, sentiment_delta: t.avg_sentiment - p.avg_sentiment };
    })
    .sort((a, b) => Math.abs(b.count_delta) - Math.abs(a.count_delta))
    .slice(0, 8);

  return {
    available: true,
    compared_to: previous.date,
    overall: {
      sentiment_delta: current.overall.avg_sentiment - previous.overall.avg_sentiment,
      volume_delta: current.overall.record_count - previous.overall.record_count,
      engagement_delta: Math.round((current.overall.avg_engagement - previous.overall.avg_engagement) * 10) / 10,
    },
    games,
    themes: themeMoves,
  };
}

module.exports = {
  isoWeekStart,
  dayKey,
  buildSeries,
  detectSpikes,
  aggregateThemes,
  detectRisks,
  clusterQuestions,
  computeDeltas,
  engagementIndex,
  engagementBand,
};
