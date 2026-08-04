const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
} = require("docx");
const fs = require("fs");

const PAGE = { size: { width: 12240, height: 15840 } };

function h1(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } }); }
function h2(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } }); }
function p(text) { return new Paragraph({ children: [new TextRun({ text })], spacing: { after: 140 } }); }
function bullet(text) { return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 70 } }); }
function note(text) { return new Paragraph({ children: [new TextRun({ text, italics: true, color: "666666", size: 20 })], spacing: { after: 160 } }); }

const doc = new Document({
  sections: [{
    properties: { page: PAGE },
    children: [
      new Paragraph({ text: "Gaming Community Pulse", heading: HeadingLevel.TITLE, spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: "Recommendations for Marketing Use", bold: true, size: 26 })], spacing: { after: 200 } }),

      h1("1. Where this tool is most useful inside a gaming marketing agency"),

      h2("Content planning"),
      p("The recurring-questions and top-themes views are the most directly actionable output for content teams. In this prototype, Once Human's community repeatedly asked whether console players get day-one parity with PC, and Where Winds Meet's community repeatedly asked for build and reputation-grinding guidance — both are ready-made prompts for an FAQ post, a pinned dev response, or a creator-briefed guide video. Running this weekly turns \"what should we make content about\" into a data-backed shortlist instead of a guess."),

      h2("Campaign research"),
      p("Before a launch, season, or crossover, this kind of tool can benchmark the baseline sentiment and volume of a community, then measure the actual lift once the campaign lands — e.g. comparing PUBG's crossover-hype spike in this prototype against its cheat-fatigue baseline shows a crossover can meaningfully lift sentiment even in an otherwise neutral community. It's also useful pre-campaign: World of Warcraft's expansion scepticism in this dataset is a signal to address directly in messaging (\"here's what's actually new\") rather than lean on nostalgia alone."),

      h2("Community monitoring / early warning"),
      p("Theme-level sentiment tracked weekly can flag a brewing problem — a balance patch, a monetization change, or a technical issue — before it becomes a PR story. Marvel Rivals' netcode complaints and Once Human's bug reports in this prototype are both exactly the kind of theme a live version of this tool would flag early, giving a studio or publisher time to respond publicly before frustration compounds."),

      h2("Competitive / portfolio comparison"),
      p("Running the same five metrics (sentiment, engagement, themes, spikes, platform tone) across every title in a portfolio, or against competitor titles, gives account teams a consistent way to say \"here's how our client's community compares to the market\" in pitches and quarterly reviews, without commissioning a bespoke study each time."),

      h1("2. Where AI and data-driven approaches genuinely help"),
      bullet("Surfacing patterns across thousands of small posts that no single person could read end-to-end — theme clustering and spike detection scale in a way manual monitoring doesn't."),
      bullet("Giving a fast, directional read (\"this community leans positive/negative, here's why\") to support a pitch or a go/no-go decision quickly."),
      bullet("Turning unstructured chatter into a structured, searchable, shareable artifact (a dashboard) rather than a pile of screenshots."),
      bullet("Flagging recurring questions and complaints that are genuinely repetitive and therefore safe to automate detection of."),

      h1("3. Where the limits are"),
      bullet("Sentiment models (including this prototype's simple lexicon, and more sophisticated ones) struggle with sarcasm, in-joke community language, and mixed-sentiment posts — a human should sanity-check anything sentiment-driven before it goes into a client-facing deck."),
      bullet("Small samples create noise: a handful of viral posts can swing a theme's average sentiment sharply, as seen in this prototype's theme-level scores. Any live version needs enough volume, or confidence intervals, before numbers are presented as fact."),
      bullet("AI-driven monitoring tells you what people are saying and roughly how they feel, not why in any deep sense, and it can't replace judgement calls about brand voice, timing, or tone in a response."),
      bullet("Automated tools are only as good as platform access allows: this prototype's Reddit/Discord gap is a real-world constraint (API approval, ToS, server permissions) that any production rollout has to plan around, not just a limitation of this specific build."),
      bullet("Data-driven signals should inform, not replace, direct community management — a spike in complaints still needs a human to decide the right response."),

      h1("4. Practical next steps beyond this placement"),
      bullet("Secure official API access for Reddit and, where relevant, a Discord bot permissioned by RS or the client's community team, to replace the synthetic data with a live feed (see Methodology & Limitations for specifics)."),
      bullet("Add scheduled, automatic re-collection (e.g. daily) so the dashboard shows real trends over time instead of a single snapshot — this is a natural fit for a lightweight scheduled job rather than a manual re-run."),
      bullet("Expand YouTube coverage from one video per game to a rolling set (recent uploads + top creator content), and pull full comment threads via the official API instead of a capped browser sample."),
      bullet("Upgrade sentiment scoring to a proper NLP model once there's API/internet access in the production environment, and validate it against a small hand-labelled sample from each community to check accuracy before trusting it in client reporting."),
      bullet("Add simple alerting (e.g. a notification when a theme's negative share crosses a threshold in a week) so community monitoring becomes proactive rather than something someone has to remember to check."),
      bullet("Pilot the dashboard with one real account team on one real title for a few weeks, and use their feedback on what's missing (probably: creator/influencer tracking, competitor comparison view, and export-to-slide for client decks) to prioritise the next build phase."),

      note("This document, the findings summary, the methodology & limitations document, and the interactive dashboard together form the full prototype deliverable for this placement."),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("recommendations.docx", buf);
  console.log("wrote recommendations.docx", buf.length, "bytes");
});
