// ---------------------------------------------------------------------------
// Engagement Index — the answer to Questionary §2.
//
// THE PROBLEM WITH THE OLD METRIC
// The previous build summed each record's native engagement count into one
// number: YouTube likes + Reddit upvotes + Discord reactions + Twitch clip
// views, all added together untransformed. Those are different units measuring
// different intents at wildly different scales — a Twitch clip routinely gets
// five figures of passive views while a Discord message gets single-digit
// reactions. Summing them makes "total engagement" a proxy for "how much
// Twitch data we happened to fetch". It is not comparable across games and
// should not have been presented as if it were.
//
// THE FORMULA
// Every record gets an Engagement Index from 0 to 100, in three steps.
//
//   1. WEIGHTED RAW SIGNAL — combine a platform's native metrics, weighting
//      each by how much author effort it represents. A reply costs more than
//      a like; a like costs more than a passive view.
//
//        raw = Σ (metric_i × weight_i)
//
//   2. LOG COMPRESSION — engagement is heavy-tailed: one viral post can be
//      1000× the median. A linear scale lets a single outlier dominate a whole
//      game's average, so the raw signal is compressed logarithmically.
//
//   3. PER-PLATFORM NORMALISATION — divide by that platform's own viral
//      ceiling, so 100 means "as viral as this platform gets" rather than
//      "large number". This is what makes cross-platform comparison valid.
//
//        index = 100 × clamp( ln(1 + raw) / ln(1 + ceiling_platform), 0, 1 )
//
// WHAT A SCORE MEANS IN PRACTICE
//   0–20   Background chatter. Normal for the median post on any platform.
//   20–40  Modest traction — noticed by the immediate community.
//   40–60  Solid. Outperforming typical posts in its community.
//   60–80  High. Broke out beyond the core audience.
//   80–100 Exceptional. Platform-level viral; treat as a signal in its own right.
//
// AGGREGATION
// A game's headline figure is the MEAN index of its records, not the sum — a
// sum rewards whichever game we happened to collect more rows for. Total
// volume is still reported separately as `record_count`, because "how much is
// being said" and "how hard it lands" are genuinely different questions and
// a marketer needs both.
//
// The ceilings below are calibration constants, chosen as the order of
// magnitude at which a post is unambiguously viral on that platform. They are
// stated here rather than buried so they can be argued with and re-tuned
// against RS's own benchmarks.
// ---------------------------------------------------------------------------

const PLATFORM_MODELS = {
  YouTube: {
    // A comment's likes, plus replies weighted 3× — replying is a far stronger
    // signal of investment than tapping like.
    weights: { score: 1, replies: 3 },
    ceiling: 5000,
    unit: "likes + 3×replies",
    rationale: "5,000 weighted likes is the point at which a comment on an official trailer is a top-of-thread, screenshotted comment.",
  },
  Reddit: {
    // Upvotes plus comments weighted 5× — a comment is a much rarer act than
    // an upvote and marks a thread that generated genuine discussion.
    weights: { score: 1, replies: 5 },
    ceiling: 20000,
    unit: "upvotes + 5×comments",
    rationale: "20,000 weighted upvotes is front-page-of-the-subreddit territory for a large gaming community.",
  },
  Discord: {
    // Reactions are rare and high-effort relative to a like, but the way to
    // reflect that is the LOW CEILING, not a multiplier on top of it. An
    // earlier version did both — weighting reactions 10× against a ceiling of
    // 400 — which double-counted the correction and scored a single reaction
    // at 40 ("solid"). One reaction is background noise; the curve now says so.
    weights: { score: 1, replies: 2 },
    ceiling: 40,
    unit: "reactions + 2×replies",
    rationale: "40 reactions on one message is exceptional in a busy channel. The low ceiling — rather than a multiplier — is what puts that on the same footing as a viral YouTube comment.",
  },
  Twitch: {
    // Clip views only, with a high ceiling — a view is passive and cheap, so
    // it takes far more of them to mean the same thing.
    weights: { score: 1, replies: 0 },
    ceiling: 500000,
    unit: "clip views",
    rationale: "500,000 views is a clip that escaped the category and circulated on other platforms.",
  },
};

const DEFAULT_MODEL = { weights: { score: 1, replies: 2 }, ceiling: 10000, unit: "raw engagement", rationale: "Generic fallback for an unrecognised platform." };

/**
 * Engagement Index (0-100) for a single record.
 * `record` needs { platform, score, num_comments }.
 */
function engagementIndex(record) {
  const model = PLATFORM_MODELS[record.platform] || DEFAULT_MODEL;
  const score = Number(record.score) || 0;
  const replies = Number(record.num_comments) || 0;

  const raw = score * model.weights.score + replies * model.weights.replies;
  if (raw <= 0) return 0;

  const normalised = Math.log1p(raw) / Math.log1p(model.ceiling);
  return Math.round(Math.max(0, Math.min(1, normalised)) * 1000) / 10; // one decimal
}

/** Plain-language band for a given index — used for tooltips and the briefing. */
function engagementBand(index) {
  if (index >= 80) return "exceptional";
  if (index >= 60) return "high";
  if (index >= 40) return "solid";
  if (index >= 20) return "modest";
  return "background";
}

/**
 * Aggregate index for a set of records. Mean, not sum — see the header note.
 * Returns 0 for an empty set rather than NaN.
 */
function aggregateIndex(records) {
  if (!records.length) return 0;
  const total = records.reduce((a, r) => a + (r.engagement_index ?? engagementIndex(r)), 0);
  return Math.round((total / records.length) * 10) / 10;
}

/**
 * Machine-readable methodology, served at /api/methodology and rendered in the
 * dashboard's "How is this calculated?" panel. The client asked for the
 * formula to be explainable without reading source, so it ships as data.
 */
const METHODOLOGY = {
  name: "Engagement Index",
  range: "0-100 per record; a game's figure is the mean of its records",
  steps: [
    "Combine the platform's native metrics into one weighted raw signal, weighting each metric by the author effort it represents.",
    "Compress logarithmically so a single viral outlier cannot dominate a game's average.",
    "Divide by that platform's own viral ceiling, so 100 means 'as viral as this platform gets' rather than 'a big number'.",
  ],
  formula: "index = 100 × clamp( ln(1 + Σ metric×weight) / ln(1 + ceiling_platform), 0, 1 )",
  normalised: true,
  aggregation: "mean across records (not sum) — volume is reported separately as record_count",
  platforms: Object.entries(PLATFORM_MODELS).map(([platform, m]) => ({
    platform,
    inputs: m.unit,
    weights: m.weights,
    viral_ceiling: m.ceiling,
    why: m.rationale,
  })),
  bands: [
    { range: "0-20", label: "background", meaning: "Normal for the median post. No action implied." },
    { range: "20-40", label: "modest", meaning: "Noticed by the immediate community." },
    { range: "40-60", label: "solid", meaning: "Outperforming typical posts in its community." },
    { range: "60-80", label: "high", meaning: "Broke out beyond the core audience — worth reading." },
    { range: "80-100", label: "exceptional", meaning: "Platform-level viral. Treat as a signal in its own right." },
  ],
  limitations: [
    "Ceilings are calibration constants set from observed orders of magnitude, not from a licensed platform benchmark. They should be re-tuned against RS's own campaign data before the index is used in client reporting.",
    "The index measures reach and reaction intensity, not sentiment. A score of 90 can be 90 units of anger.",
    "Twitch clip views are passive and creator-driven; a high Twitch index reflects streamer reach as much as community feeling.",
    "Records from a platform with no live feed configured inherit the static sample's figures and are labelled as such.",
  ],
};

module.exports = { engagementIndex, engagementBand, aggregateIndex, METHODOLOGY, PLATFORM_MODELS };
