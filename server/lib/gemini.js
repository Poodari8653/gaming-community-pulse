// ---------------------------------------------------------------------------
// Gemini-powered "Top discussions" clustering — a second, independent AI pass
// over live data, alongside (not replacing) the Claude-based sentiment
// pipeline in lib/nlp.js. Given a game's live records — from whichever
// platforms are actually pulling live data right now (YouTube, Reddit,
// Discord, Twitch) — it groups them into a handful of sub-topics the
// community is actually discussing right now — "Developer Responsiveness and
// Player Outrage", "Character Skins and Rarity", "Game Balance and Patches",
// that kind of thing — rather than the fixed 17-item theme vocabulary Claude
// assigns per record, and backs each sub-topic with real, attributed quotes.
//
// LIVE PLATFORMS ONLY, WHICHEVER THOSE ARE. This module doesn't hardcode a
// platform. The caller (server.js) decides what "live" means by only ever
// passing the raw output of the platform collectors — never sample rows —
// so whichever of the four platforms have credentials configured this
// refresh is whichever platforms actually get clustered. Add a fifth
// platform wrapper later and it's included automatically, with no change
// needed here.
//
// GROUNDING, NOT GENERATION. Gemini never writes the quote text or the URL
// itself. It is shown a numbered list of real records (id, platform, text,
// score — no URL) and asked only to (a) name the sub-topics present and
// (b) say which record ids best represent each one. The actual quote text,
// link and source are then read back out of our own collected data by that
// id, never out of the model's response. This matters specifically for this
// feature: an LLM asked to "quote the community" will happily fabricate a
// plausible-looking comment and link, and a fabricated link in a marketing
// dashboard is a much worse failure than an imperfect cluster label.
//
// This talks to Google's Gemini Interactions API directly over fetch — no
// SDK dependency, matching how every other platform wrapper in this codebase
// (youtube.js, reddit.js, discord.js, twitch.js) is a bare-fetch client
// rather than a vendored SDK.
// ---------------------------------------------------------------------------

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

const MAX_RECORDS_PER_CALL = 60; // keeps the prompt (and the bill) bounded
const MAX_TEXT_CHARS = 300; // per record sent to the model, and per quote shown
const MIN_RECORDS_TO_CLUSTER = 6; // below this, clustering is noise, not signal
const MAX_CLUSTERS = 5;
const MAX_QUOTES_PER_CLUSTER = 4;

const CLUSTER_SCHEMA = {
  type: "object",
  properties: {
    clusters: {
      type: "array",
      description: "3-5 genuinely distinct sub-topics present in this data, most-discussed first.",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short topic label in the community's own terms, e.g. 'Developer Responsiveness and Player Outrage'.",
          },
          summary: {
            type: "string",
            description: "One to two plain-English sentences on what's being discussed and the general tone.",
          },
          quote_ids: {
            type: "array",
            description: "2-4 ids from the supplied records that best represent this sub-topic. Must be ids that were actually given to you — never invent an id.",
            items: { type: "integer" },
          },
        },
        required: ["title", "summary", "quote_ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["clusters"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You analyse public gaming-community discussion about a video game for a marketing intelligence dashboard. The records you're given may come from more than one platform — YouTube comments, Reddit posts and comments, Discord messages, Twitch clip titles — mixed together; each record tells you which.

Group the supplied records into 3-5 genuinely distinct sub-topics the community is discussing right now, regardless of which platform each record came from. Do not use a fixed category list — name the actual topics present in this data, in terms the community itself would recognise (e.g. "Developer Responsiveness", "Character Skins and Rarity", "Game Balance and Patches"). Order sub-topics by how much discussion volume they represent, most-discussed first.

For each sub-topic, write a short plain-English summary of what's being said and the general tone, then choose 2-4 record ids — from the ids given to you — whose text best represents it. Prefer ids that are genuinely representative, and where useful, pick ids that span more than one platform or reflect a real range of views rather than several near-identical takes from the same source.

Note: Twitch records are clip titles written by the streamer or clipper as promotion, not player commentary — read them as framing, not as community sentiment, and don't let them dominate a cluster meant to represent what players themselves are saying.

Only ever use ids that were given to you in the input. Never write out the quote text yourself — you are selecting existing records, not quoting from memory.`;

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callGemini(recordsPayload) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      model: MODEL,
      system_instruction: SYSTEM_PROMPT,
      input: `Cluster these ${recordsPayload.length} records into sub-topics.\n\n${JSON.stringify(recordsPayload, null, 1)}`,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: CLUSTER_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  const data = await res.json();
  if (data.status && data.status !== "completed") {
    throw new Error(`Gemini interaction did not complete (status: ${data.status})`);
  }

  const modelStep = (data.steps || []).find((s) => s.type === "model_output");
  const textBlock = modelStep && (modelStep.content || []).find((c) => c.type === "text");
  if (!textBlock || !textBlock.text) throw new Error("No text content in Gemini response");

  return JSON.parse(textBlock.text);
}

/**
 * Clusters one game's live records — potentially spanning several
 * platforms — into discussion sub-topics. `rows` need text, score, url,
 * source and platform. Returns a stable shape whether or not clustering
 * actually ran, so the dashboard can render an honest "why not" instead of
 * an empty gap.
 */
async function summariseDiscussion(game, rows) {
  if (!isConfigured()) {
    return { game, available: false, clusters: [], reason: "GEMINI_API_KEY is not configured." };
  }
  const pool = rows || [];
  if (pool.length < MIN_RECORDS_TO_CLUSTER) {
    return {
      game,
      available: false,
      clusters: [],
      reason: `Not enough live discussion volume to cluster (${pool.length} record${pool.length === 1 ? "" : "s"} across configured platforms, need ${MIN_RECORDS_TO_CLUSTER}+).`,
    };
  }

  // Feature the highest-engagement records first — the same "sort by top"
  // view a human moderator would actually skim. Note the engagement figure
  // being sorted on isn't the same metric across platforms (Reddit upvotes,
  // YouTube likes, Discord reactions, Twitch view count) — good enough to
  // rank within a mixed pool for "which records to feature", not intended as
  // a cross-platform comparison in itself (that's what Engagement Index,
  // computed elsewhere, is actually for).
  const ranked = [...pool].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, MAX_RECORDS_PER_CALL);
  const byId = new Map(ranked.map((r, i) => [i, r]));
  const payload = ranked.map((r, i) => ({
    id: i,
    platform: r.platform,
    text: (r.text || "").slice(0, MAX_TEXT_CHARS),
    score: r.score || 0,
  }));

  try {
    const parsed = await callGemini(payload);
    const clusters = (parsed.clusters || [])
      .slice(0, MAX_CLUSTERS)
      .map((c) => {
        const quotes = (c.quote_ids || [])
          .map((id) => byId.get(id))
          .filter(Boolean)
          .slice(0, MAX_QUOTES_PER_CLUSTER)
          .map((r) => ({
            text: (r.text || "").slice(0, MAX_TEXT_CHARS),
            url: r.url,
            source: r.source,
            platform: r.platform,
            score: r.score || 0,
          }));
        return { title: c.title, summary: c.summary, quotes };
      })
      // A cluster whose quote_ids didn't resolve to any real record is
      // dropped rather than shown with no evidence behind it.
      .filter((c) => c.quotes.length > 0);

    const platforms = [...new Set(ranked.map((r) => r.platform))].sort();
    return { game, available: true, clusters, generated_by: MODEL, record_count: ranked.length, platforms };
  } catch (err) {
    return { game, available: false, clusters: [], reason: `Gemini clustering failed: ${err.message}` };
  }
}

/**
 * Runs summariseDiscussion for every game present in `liveRows`, in
 * parallel. `liveRows` should be the combined, pre-enrichment output of
 * whichever platform collectors ran this refresh — collectYouTube().rows,
 * collectReddit().rows, collectDiscord().rows, collectTwitch().rows — never
 * sample/illustrative rows. Whichever platforms are actually configured and
 * returning live data is exactly what shows up here; nothing is hardcoded.
 */
async function generateDiscussionSummaries(liveRows) {
  const byGame = new Map();
  for (const r of liveRows || []) {
    if (!byGame.has(r.game)) byGame.set(r.game, []);
    byGame.get(r.game).push(r);
  }
  const games = [...byGame.keys()];
  return Promise.all(games.map((g) => summariseDiscussion(g, byGame.get(g))));
}

module.exports = { generateDiscussionSummaries, isConfigured, MODEL, MIN_RECORDS_TO_CLUSTER };
