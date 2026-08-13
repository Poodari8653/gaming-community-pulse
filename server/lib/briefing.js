// ---------------------------------------------------------------------------
// AI-generated daily briefing — the answer to Questionary §6 and §7.
//
// The brief is the first thing on the dashboard, because the client's test is
// "someone should open this each morning and understand what is happening
// across the gaming community within a few minutes, without manually
// interpreting a large number of charts". A chart wall fails that test; a
// short written brief with the charts underneath as evidence passes it.
//
// LENGTH — the client asked what word count is appropriate.
// The narrative is targeted at 150-200 words, and here is the reasoning:
//   • 150-200 words reads in roughly 45-60 seconds, which is the realistic
//     attention budget for a daily operational check before standup.
//   • It is long enough for a headline judgement plus three or four supporting
//     points with specifics (numbers, game names, theme names), and short
//     enough that nothing can hide in it.
//   • Below ~120 words the brief loses the specifics and becomes horoscope
//     text ("sentiment is mixed"), which is worse than no brief.
//   • Above ~250 words people skim, and skimming a narrative is strictly worse
//     than reading a bulleted list — so everything beyond the narrative is
//     structured as scannable bullets instead of more prose.
// The narrative therefore carries the judgement; `watch_today`, `risks` and
// `opportunities` carry the detail, each one sentence.
//
// FALLBACK
// When ANTHROPIC_API_KEY is absent the brief is composed deterministically
// from the same computed figures. It is blunter and has no interpretation, but
// the panel is never empty and never silently pretends an AI wrote it — the
// `generated_by` field says which path produced it.
// ---------------------------------------------------------------------------

let Anthropic = null;
try {
  Anthropic = require("@anthropic-ai/sdk");
} catch (_) {
  /* fallback path only */
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const TARGET_WORDS = { min: 150, max: 200 };

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One sentence, max 100 characters, stating the single most important thing about today. Specific — name the game or theme.",
    },
    narrative: {
      type: "string",
      description: "150-200 words of plain-English briefing for a marketing team. Lead with the judgement, then the evidence. Cite specific games, themes and numbers from the data. No preamble, no 'in summary', no hedging filler.",
    },
    watch_today: {
      type: "array",
      description: "2-4 things the marketing team should pay attention to today. One sentence each, each naming a game or theme.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          game: { type: "string" },
        },
        required: ["title", "detail", "game"],
        additionalProperties: false,
      },
    },
    risks: {
      type: "array",
      description: "Community risks that could become a PR or retention problem. Empty array if there genuinely are none — do not invent one.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          game: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title", "detail", "game", "severity"],
        additionalProperties: false,
      },
    },
    opportunities: {
      type: "array",
      description: "Discussions that could inspire content or campaign ideas, each tied to something actually observed in the data.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          game: { type: "string" },
        },
        required: ["title", "detail", "game"],
        additionalProperties: false,
      },
    },
    changes_vs_previous: {
      type: "array",
      description: "Notable movements against the previous snapshot. Empty array when no earlier snapshot exists — never fabricate a comparison.",
      items: { type: "string" },
    },
  },
  required: ["headline", "narrative", "watch_today", "risks", "opportunities", "changes_vs_previous"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You write the daily community briefing for the marketing team at Ruisheng Holdings, a games marketing agency working between Chinese and Western markets.

Your reader is a marketing manager, not an analyst. They have about a minute. They need to know what happened, what it means, and what to do about it.

Rules:
- Lead with the judgement, then the evidence. Never open with "This report covers..." or "In summary".
- Be specific. Name games, name themes, cite the actual numbers you were given. "Sentiment is mixed" is a wasted sentence.
- Sentiment is on a -100 to +100 scale. Engagement Index is 0-100, normalised per platform.
- Only claim something changed if you were given delta data. If deltas are unavailable, say the comparison is not available yet rather than inventing movement.
- Distinguish real collected data from the labelled illustrative sample. If a finding rests mainly on sample data, say so in the narrative.
- Do not invent risks to fill the section. An empty risks array is a valid, honest answer.
- Write British English. No emoji. No exclamation marks.
- The narrative must be 150-200 words.`;

function summarise(payload) {
  // A compact view of the analysis for the model — enough to reason over,
  // small enough to keep the call cheap.
  return {
    date: payload.date,
    data_sources: payload.data_sources,
    overall: payload.overall,
    games: payload.games_summary,
    platforms: payload.platform_summary,
    regions: payload.region_summary,
    top_themes: (payload.themes || []).slice(0, 10),
    risks: (payload.risks || []).slice(0, 6),
    spikes: (payload.spikes || []).slice(0, 6),
    recurring_questions: (payload.recurring_questions || []).slice(0, 6),
    top_posts: (payload.top_posts || []).slice(0, 8).map((p) => ({
      text: p.text.slice(0, 200),
      platform: p.platform,
      game: p.game,
      sentiment: p.sentiment_score,
      engagement: p.engagement_index,
    })),
    deltas: payload.deltas,
    sample_data_share_pct: payload.provenance ? payload.provenance.sample_share_pct : null,
  };
}

/** Deterministic brief, used when no API key is configured or the call fails. */
function fallbackBrief(payload, reason) {
  const games = payload.games_summary || [];
  const best = [...games].sort((a, b) => b.avg_sentiment - a.avg_sentiment)[0];
  const worst = [...games].sort((a, b) => a.avg_sentiment - b.avg_sentiment)[0];
  const topTheme = (payload.themes || [])[0];
  const risks = payload.risks || [];

  const parts = [];
  parts.push(
    `Across ${payload.overall.record_count} records from ${(payload.platform_summary || []).length} platforms, mean sentiment is ${payload.overall.avg_sentiment > 0 ? "+" : ""}${payload.overall.avg_sentiment} on a -100 to +100 scale, with a mean Engagement Index of ${payload.overall.avg_engagement}.`
  );
  if (best && worst && best.game !== worst.game) {
    parts.push(
      `${best.game} is the most positively discussed title (${best.avg_sentiment > 0 ? "+" : ""}${best.avg_sentiment}); ${worst.game} is the most negative (${worst.avg_sentiment > 0 ? "+" : ""}${worst.avg_sentiment}).`
    );
  }
  if (topTheme) {
    parts.push(
      `The largest single theme is "${topTheme.theme}" with ${topTheme.count} mentions at ${topTheme.avg_sentiment > 0 ? "+" : ""}${topTheme.avg_sentiment} mean sentiment (${topTheme.negative_share}% negative).`
    );
  }
  if (risks.length) {
    parts.push(`${risks.length} risk signal${risks.length === 1 ? "" : "s"} detected, the most severe being ${risks[0].label}.`);
  } else {
    parts.push("No theme crossed the risk threshold in this window.");
  }
  if (payload.deltas && payload.deltas.available) {
    const d = payload.deltas.overall;
    parts.push(
      `Against ${payload.deltas.compared_to}, overall sentiment moved ${d.sentiment_delta >= 0 ? "+" : ""}${d.sentiment_delta} points on ${d.volume_delta >= 0 ? "+" : ""}${d.volume_delta} records.`
    );
  } else {
    parts.push("Day-over-day comparison is not available yet — it appears once a second daily snapshot exists.");
  }

  return {
    headline: best ? `${best.game} leads on sentiment; ${worst ? worst.game : "no title"} trails` : "Daily community snapshot",
    narrative: parts.join(" "),
    watch_today: (payload.themes || []).slice(0, 3).map((t) => ({
      title: t.theme,
      detail: `${t.count} mentions at ${t.avg_sentiment > 0 ? "+" : ""}${t.avg_sentiment} mean sentiment, ${t.negative_share}% negative.`,
      game: (t.examples[0] && t.examples[0].game) || "All",
    })),
    risks: risks.slice(0, 3).map((r) => ({
      title: r.label,
      detail: r.detail,
      game: r.games[0] || "All",
      severity: r.severity >= 70 ? "high" : r.severity >= 45 ? "medium" : "low",
    })),
    opportunities: (payload.recurring_questions || []).slice(0, 3).map((q) => ({
      title: "Recurring question",
      detail: `Asked ${q.asked}× — "${q.question.slice(0, 120)}"`,
      game: q.games[0] || "All",
    })),
    changes_vs_previous:
      payload.deltas && payload.deltas.available
        ? (payload.deltas.games || [])
            .filter((g) => g.sentiment_delta !== null && Math.abs(g.sentiment_delta) >= 5)
            .map((g) => `${g.game}: sentiment ${g.sentiment_delta >= 0 ? "+" : ""}${g.sentiment_delta}, volume ${g.volume_delta >= 0 ? "+" : ""}${g.volume_delta}`)
        : [],
    generated_by: "rule-based fallback",
    fallback_reason: reason,
    word_count_guidance: TARGET_WORDS,
  };
}

/** Produces the daily brief for a completed analysis payload. */
async function generateBriefing(payload) {
  if (!process.env.ANTHROPIC_API_KEY || !Anthropic) {
    return fallbackBrief(payload, "ANTHROPIC_API_KEY is not configured — showing a computed summary instead of an AI-written brief.");
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "high", // this is the quality-sensitive output on the whole page
        format: { type: "json_schema", schema: BRIEF_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content:
            `Today is ${payload.date}. Write the daily community briefing from this analysis.\n\n` +
            JSON.stringify(summarise(payload), null, 1),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return fallbackBrief(payload, `Model declined to write the brief (${response.stop_details?.category || "unspecified"}).`);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return fallbackBrief(payload, "No text block in model response.");

    const brief = JSON.parse(textBlock.text);
    return {
      ...brief,
      generated_by: MODEL,
      word_count: (brief.narrative || "").trim().split(/\s+/).length,
      word_count_guidance: TARGET_WORDS,
    };
  } catch (err) {
    return fallbackBrief(payload, `Briefing generation failed: ${err.message}`);
  }
}

module.exports = { generateBriefing, TARGET_WORDS };
