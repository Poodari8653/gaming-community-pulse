const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType,
} = require("docx");
const fs = require("fs");

const PAGE = { size: { width: 12240, height: 15840 } };

function h1(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } }); }
function h2(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } }); }
function p(text) { return new Paragraph({ children: [new TextRun({ text })], spacing: { after: 140 } }); }
function bullet(text) { return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 70 } }); }
function note(text) { return new Paragraph({ children: [new TextRun({ text, italics: true, color: "666666", size: 20 })], spacing: { after: 160 } }); }

function cell(text, { width, bold = false, shade = null } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
  });
}

function sourceTable() {
  const w = [1800, 2400, 2400, 2900];
  const header = new TableRow({ tableHeader: true, children: [
    cell("Platform", { width: w[0], bold: true, shade: "1F2937" }),
    cell("Data type used here", { width: w[1], bold: true, shade: "1F2937" }),
    cell("Collection method", { width: w[2], bold: true, shade: "1F2937" }),
    cell("Why", { width: w[3], bold: true, shade: "1F2937" }),
  ]});
  const rows = [
    ["YouTube", "Real, live public data", "Browser capture of public video comment sections (5 official trailers/announcements, one per game), 30 Jul 2026", "YouTube pages were reachable; no login or private data involved"],
    ["Reddit", "Illustrative synthetic data", "Reddit.com was unreachable from this environment's web tools (blocked for compliance reasons); no workaround was attempted", "Demonstrates the analysis pipeline; flagged clearly as sample data throughout"],
    ["Discord", "Illustrative synthetic data", "No Discord server access was available for this prototype (would require a bot added by a server owner)", "Same as above"],
  ];
  const body = rows.map(r => new TableRow({ children: r.map((v,i)=>cell(v,{width:w[i]})) }));
  return new Table({ width: { size: 9500, type: WidthType.DXA }, columnWidths: w, rows: [header, ...body] });
}

const doc = new Document({
  sections: [{
    properties: { page: PAGE },
    children: [
      new Paragraph({ text: "Gaming Community Pulse", heading: HeadingLevel.TITLE, spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: "Methodology, Scope & Limitations", bold: true, size: 26 })], spacing: { after: 200 } }),

      h1("1. Scope"),
      p("This prototype monitors public discussion of five titles: PUBG, Once Human, Marvel Rivals, Where Winds Meet, and World of Warcraft. These span a deliberate mix of community types: a long-running battle royale (PUBG), a survival/gacha hybrid approaching console launch (Once Human), a live-service hero shooter (Marvel Rivals), a newly-launched open-world action RPG (Where Winds Meet), and a 20-year-old subscription MMORPG facing expansion fatigue (World of Warcraft). That spread was chosen so the prototype could be tested against very different community dynamics rather than five similar shooters."),
      p("Platforms covered: Reddit (per-game subreddits), Discord (per-game community servers), and YouTube (official trailer/announcement videos and their public comment sections). Discussion types covered: official announcement reactions, patch/balance feedback, monetization discussion, bug/technical complaints, community questions, and general praise/nostalgia. The prototype does not cover private servers, DMs, paywalled content, or anything requiring login."),

      h1("2. Data collection methods, by platform"),
      sourceTable(),
      new Paragraph({ text: "", spacing: { after: 120 } }),
      h2("YouTube (real data)"),
      p("Comments were captured live via a browser automation tool from five public, official trailer/announcement videos (one per game), on 30 July 2026. This used only publicly visible page content — no login, no private data, and no rate-limit-evading techniques. Sample size was capped deliberately (7-17 comments per video, 55 total) to keep this a proof-of-concept rather than a full scrape; a production version would use the official YouTube Data API with an API key, which supports pulling full comment threads, view/like counts, and pagination within documented quota limits."),
      h2("Reddit (synthetic data)"),
      p("Reddit's website could not be reached from this environment's web tools, which returned it as blocked for compliance reasons. No attempt was made to route around that restriction (e.g. via alternate scraping tools), in line with the platform-access policy this prototype operates under and with Reddit's own increasingly strict position on automated data collection. Instead, 452 Reddit + Discord records were generated as clearly-labelled synthetic data, modeled on realistic, publicly-documented discourse patterns for each game (patch cycles, monetization debates, launch hype, etc.) drawn from general knowledge of how these communities discuss these topics. This is a placeholder for a real feed, not a substitute for one."),
      h2("Discord (synthetic data)"),
      p("Discord servers are private-by-default; reading messages legitimately requires a bot invited by a server owner/admin with appropriate permissions, or a moderator's manual export. Neither was available for this prototype, so Discord is represented with the same synthetic approach as Reddit."),

      h1("3. Dataset"),
      p("The combined master dataset holds 507 records: 55 real YouTube comments and 452 synthetic Reddit/Discord posts, comments, and messages, spanning an 8-week window (3 June - 30 July 2026) for the synthetic portion. Each record carries: platform, game, source (subreddit/server/video), author handle, timestamp, text, an engagement score (upvotes/likes/reactions), a theme tag (synthetic records only), and a computed sentiment score and label. The raw YouTube captures and the synthetic dataset are stored separately (data/raw and data/processed) so the provenance of every row is traceable."),

      h1("4. Analysis approach"),
      h2("Sentiment scoring"),
      p("Sentiment was scored with a small, transparent lexicon-based model built for this prototype (roughly 60 positive/negative gaming-relevant terms and phrases, e.g. \"unplayable\", \"addictive\", \"grindy\", \"stunning\"), rather than a hosted ML model, because this environment had no internet access to install one. Each record is scored from -1 (very negative) to +1 (very positive) and labelled positive/neutral/negative using a +/-0.15 threshold. This is a reasonable stand-in for directional analysis but is less accurate than a trained sentiment classifier, particularly on sarcasm, slang, and mixed-sentiment sentences."),
      h2("Themes, engagement, and spikes"),
      p("For the synthetic dataset, each record was generated against one of 6 realistic discussion themes per game (e.g. \"monetization\", \"bug/cheating complaints\", \"new character hype\"), which lets the dashboard aggregate theme-level sentiment and volume directly. Engagement is the sum of upvotes/likes/reactions per record. Weekly spikes are detected by bucketing records into ISO weeks and comparing volume; each game's synthetic data includes a deliberate volume cluster around a plausible real event (a patch, launch date, or content reveal) to demonstrate what a real spike would look like in the dashboard."),

      h1("5. Limitations"),
      bullet("Reddit and Discord data (452 of 507 records, ~89%) is illustrative sample data, not live data. Absolute counts, exact sentiment percentages, and specific usernames should not be treated as real; the value of this prototype is in demonstrating the pipeline and the kinds of patterns a live feed would surface, not in the current numbers themselves."),
      bullet("YouTube coverage is a thin slice: one video per game, 7-17 comments each, default sort order only (not exhaustive of all comments, and not randomly sampled)."),
      bullet("The sentiment scorer is lexicon-based and will misjudge sarcasm, negation in unusual phrasing, and non-English text (one real comment in the sample was in Russian and scored as neutral by default)."),
      bullet("No true cross-post deduplication, bot/spam filtering, or influencer-account weighting has been applied — a production tool should add all three."),
      bullet("Time zone and \"posted X ago\" relative timestamps from YouTube were converted to approximate absolute dates; they are accurate to the week, not the hour."),
      bullet("This prototype has no live refresh; it is a static snapshot as of 30 July 2026. A production version would need scheduled re-collection and a database rather than embedded JSON."),

      h1("6. Ethical & compliance approach"),
      p("Only publicly accessible content was used or is represented in this prototype; no private messages, DMs, paywalled content, or login-gated data were accessed. No client-confidential, internal campaign, or commercial performance data was used. The YouTube capture used only a standard browser viewing public pages, with no bot detection bypass, no scraping at volume, and no attempt to access anything requiring authentication. Personally identifying information beyond public usernames was not collected or retained."),

      h1("7. How to move from prototype to production"),
      bullet("Reddit: apply for official Reddit API access (a developer account and app credentials), which supports authorised, rate-limited pulls from public subreddits under Reddit's terms of use."),
      bullet("Discord: work with RS's own community team (or the relevant game's official server, where RS/the client has a relationship) to add a read-only bot with explicit permission, rather than scraping."),
      bullet("YouTube: switch from browser capture to the official YouTube Data API for reliable, quota-managed, paginated comment and engagement data."),
      bullet("Sentiment: replace the lexicon scorer with a hosted sentiment/NLP model (or a lightweight fine-tuned classifier) once there's internet/API access, especially to handle sarcasm and non-English content."),
      bullet("Add scheduled re-collection (daily/weekly) and persist to a small database so the dashboard shows genuine trends over time rather than a single snapshot."),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("methodology_and_limitations.docx", buf);
  console.log("wrote methodology_and_limitations.docx", buf.length, "bytes");
});
