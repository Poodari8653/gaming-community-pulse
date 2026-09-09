// ---------------------------------------------------------------------------
// Semantic analysis layer — Claude-powered sentiment, theme and signal
// extraction. This is the direct answer to Questionary §1: sentiment that
// reads MEANING rather than matching keywords.
//
// What it does per record, in one pass:
//   • sentiment on a -100..+100 scale, with a confidence
//   • sarcasm / irony detection ("This game is amazing" said bitterly scores
//     negative, which is exactly the case a lexicon cannot resolve)
//   • theme assignment from a controlled vocabulary, so themes aggregate
//     across platforms instead of being free text
//   • is_question — a genuine question the community is asking, not just any
//     string that happens to end in "?"
//   • is_risk — flags a brewing community problem worth a marketing response
//
// Design notes:
//   • Batched (40 records per call) to keep latency and cost sane on a
//     several-hundred-record refresh.
//   • Cached by content hash, so repeated dashboard refreshes re-score only
//     genuinely new comments.
//   • Degrades to the gaming-tuned lexicon in lib/sentiment.js when
//     ANTHROPIC_API_KEY is absent or the API errors. The dashboard reports
//     which engine actually ran, so nobody mistakes fallback output for
//     semantic scoring.
// ---------------------------------------------------------------------------

const crypto = require("crypto");
const { analyzeSentiment, sentimentLabel } = require("./sentiment");

let Anthropic = null;
try {
  Anthropic = require("@anthropic-ai/sdk");
} catch (_) {
  // SDK not installed — fallback path only.
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const BATCH_SIZE = 40;
const MAX_CONCURRENT_BATCHES = 4;
const MAX_TEXT_CHARS = 600; // long Reddit posts get truncated for scoring

// Controlled theme vocabulary. Themes must aggregate across five games and
// four platforms to be useful in a chart, so the model picks from this list
// rather than inventing labels. "other" is deliberately available so it isn't
// forced into a bad fit.
const THEMES = [
  "monetization",
  "bugs & technical issues",
  "cheating & fair play",
  "matchmaking & netcode",
  "game balance",
  "new content & updates",
  "character & roster",
  "story & world",
  "graphics & performance",
  "grind & progression",
  "community & social",
  "onboarding & new players",
  "platform & availability",
  "esports & competitive",
  "nostalgia",
  "praise",
  "other",
];

const RECORD_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The id of the record being scored" },
          sentiment: {
            type: "integer",
            description:
              "Sentiment from -100 (extremely negative) to +100 (extremely positive). Judge the author's actual attitude toward the game, accounting for sarcasm, irony, negation and gaming slang (e.g. 'insane', 'sick', 'cracked', 'goated' are praise).",
          },
          confidence: {
            type: "number",
            description: "0.0-1.0 confidence in the sentiment reading. Lower it for ambiguous, very short, mixed or non-English text.",
          },
          sarcasm: { type: "boolean", description: "True if the literal wording differs from the intended meaning." },
          theme: { type: "string", enum: THEMES },
          is_question: {
            type: "boolean",
            description: "True only if the author is genuinely asking the community or developer something answerable.",
          },
          is_risk: {
            type: "boolean",
            description:
              "True if this signals a brewing community problem a marketing or community team should know about today (refund/uninstall talk, review-bombing, accusations of bad faith, widespread outage, monetization backlash).",
          },
          language: {
            type: "string",
            description: "ISO 639-1 code of the language the text is written in, e.g. 'en', 'zh', 'ru', 'pt'. Use 'en' if unsure.",
          },
        },
        required: ["id", "sentiment", "confidence", "sarcasm", "theme", "is_question", "is_risk", "language"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You score public gaming-community messages for a marketing intelligence dashboard used by a games marketing agency.

Score the author's genuine attitude toward the game or its publisher, not the surface wording.

Gaming vocabulary you must read correctly:
- "insane", "sick", "filthy", "nuts", "cracked", "goated", "fire", "clean", "disgusting" used about gameplay are PRAISE.
- "broken" is negative when it means bugs, but positive-leaning when it means a character is overpowered and the author is enjoying it.
- "dead game", "copium", "L update", "cash grab", "p2w", "content drought" are strongly negative.
- "W", "big W", "peak", "cooked" (as in "they cooked") are positive; "cooked" meaning ruined is negative.

Judge sarcasm by context. "Great, another battle pass" is negative. "This game is amazing" following a list of complaints is negative.

Non-English text: score it on its meaning, set the language code, and lower confidence slightly.

Set is_risk sparingly — only for things a community manager would want escalated the same day.

Return one result object per input record, matching ids exactly.`;

// Content-hash cache: the same comment scored once per process lifetime.
const cache = new Map();
let stats = { apiCalls: 0, cached: 0, scored: 0, fallback: 0, errors: [] };

function hashText(text) {
  return crypto.createHash("sha1").update(text || "").digest("hex");
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY && Anthropic);
}
function detectTheme(text) {
  const t = (text || "").toLowerCase();

  if (/(bug|glitch|crash|broken|error|lag|fps|performance|server|disconnect)/.test(t)) {
    return "Technical";
  }

  if (/(skin|battle pass|price|expensive|microtransaction|monetization|pay to win|p2w)/.test(t)) {
    return "Monetization";
  }

  if (/(weapon|gun|character|hero|class|balance|buff|nerf|overpowered|op\b|weak)/.test(t)) {
    return "Balance";
  }

  if (/(update|patch|season|event|map|mode|content|feature)/.test(t)) {
    return "Content";
  }

  if (/(cheat|hacker|toxic|abuse|ban|report|community)/.test(t)) {
    return "Community";
  }

  return "";
}

function lexiconResult(text) {
  const r = analyzeSentiment(text);
  return {
    score: r.score,
    label: r.label,
    confidence: r.confidence,
    sarcasm: false,
    theme: detectTheme(text),
    is_question: (text || "").trim().endsWith("?"),
    is_risk: false,
    language: "",
    method: "lexicon",
  };
}

async function scoreBatch(client, batch) {
  const payload = batch.map((r, i) => ({
    id: i,
    platform: r.platform,
    game: r.game,
    text: (r.text || "").slice(0, MAX_TEXT_CHARS),
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "low", // bulk classification — depth here buys nothing
      format: { type: "json_schema", schema: RECORD_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Score these ${payload.length} messages.\n\n${JSON.stringify(payload, null, 1)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Model declined to score this batch (${response.stop_details?.category || "unspecified"})`);
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in model response");

  const parsed = JSON.parse(textBlock.text);
  const byId = new Map((parsed.results || []).map((r) => [r.id, r]));

  return batch.map((rec, i) => {
    const got = byId.get(i);
    if (!got) return lexiconResult(rec.text);
    const score = Math.max(-100, Math.min(100, Math.round(got.sentiment)));
    return {
      score,
      label: sentimentLabel(score),
      confidence: Math.max(0, Math.min(1, Number(got.confidence) || 0.5)),
      sarcasm: Boolean(got.sarcasm),
      theme: THEMES.includes(got.theme) ? got.theme : "other",
      is_question: Boolean(got.is_question),
      is_risk: Boolean(got.is_risk),
      language: (got.language || "").slice(0, 5),
      method: "claude",
    };
  });
}

/** Runs `worker` over `items` with a bounded number in flight at once. */
async function pooled(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Scores every record in `records` (each needs `text`, `platform`, `game`).
 * Returns an array of analyses positionally aligned with the input.
 */
async function analyzeRecords(records) {
  stats = { apiCalls: 0, cached: 0, scored: 0, fallback: 0, errors: [] };
  if (!records.length) return [];

  const results = new Array(records.length);
  const pending = [];

  for (let i = 0; i < records.length; i++) {
    const key = hashText(records[i].text);
    if (cache.has(key)) {
      results[i] = cache.get(key);
      stats.cached += 1;
    } else {
      pending.push({ index: i, key, record: records[i] });
    }
  }

  if (!pending.length) return results;

  if (!isConfigured()) {
    for (const p of pending) {
      const r = lexiconResult(p.record.text);
      results[p.index] = r;
      cache.set(p.key, r);
      stats.fallback += 1;
    }
    return results;
  }

  const client = new Anthropic();
  const batches = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    batches.push(pending.slice(i, i + BATCH_SIZE));
  }

  await pooled(batches, MAX_CONCURRENT_BATCHES, async (batch) => {
    try {
      const scored = await scoreBatch(client, batch.map((b) => b.record));
      stats.apiCalls += 1;
      batch.forEach((b, i) => {
        results[b.index] = scored[i];
        cache.set(b.key, scored[i]);
        stats.scored += 1;
      });
    } catch (err) {
      // One bad batch degrades to lexicon for those records only — it never
      // takes down the refresh.
      stats.errors.push(err.message);
      batch.forEach((b) => {
        const r = lexiconResult(b.record.text);
        results[b.index] = r;
        cache.set(b.key, r);
        stats.fallback += 1;
      });
    }
  });

  return results;
}

function getStats() {
  // The reported engine must reflect what actually scored the records, not
  // merely whether a key is present. A configured run whose batches all errored
  // is a lexicon run, and the dashboard banner would otherwise name the model
  // while every record had silently fallen back.
  let engine;
  if (!isConfigured()) {
    engine = "lexicon";
  } else if (stats.scored === 0 && stats.fallback > 0) {
    engine = "lexicon (semantic scoring configured but every batch failed)";
  } else if (stats.fallback > 0) {
    engine = "claude (partial — some batches fell back to the lexicon)";
  } else {
    engine = "claude";
  }

  return {
    ...stats,
    engine,
    semantic_configured: isConfigured(),
    model: isConfigured() ? MODEL : null,
    cacheSize: cache.size,
  };
}

module.exports = { analyzeRecords, getStats, isConfigured, THEMES, MODEL };
