const pptxgen = require("pptxgenjs");

// Palette: dark "data dashboard" theme matching the prototype
const BG_DARK = "12141C";
const PANEL = "1B1F2C";
const BORDER = "2A2F40";
const TEXT = "E8EAF0";
const MUTED = "9AA1B4";
const ACCENT = "6C8CFF";   // electric blue
const POS = "3ECF8E";      // green
const NEG = "FF6B6B";      // coral
const NEU = "F5C451";      // gold
const PURPLE = "B98CFF";

function newDeck() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
  return pres;
}

function bgSlide(pres) {
  const s = pres.addSlide();
  s.background = { color: BG_DARK };
  return s;
}

function titleBar(s, kicker, title) {
  s.addText(kicker.toUpperCase(), { x: 0.6, y: 0.35, w: 12, h: 0.35, fontFace: "Calibri", fontSize: 12, color: ACCENT, bold: true, charSpacing: 2, margin: 0 });
  s.addText(title, { x: 0.6, y: 0.68, w: 12.1, h: 0.7, fontFace: "Cambria", fontSize: 28, color: TEXT, bold: true, margin: 0 });
}

function footer(s, pres, pageNum) {
  s.addText("Gaming Community Pulse — Prototype", { x: 0.6, y: 7.15, w: 6, h: 0.3, fontFace: "Calibri", fontSize: 9, color: MUTED, margin: 0 });
  s.addText(String(pageNum), { x: 12.4, y: 7.15, w: 0.4, h: 0.3, fontFace: "Calibri", fontSize: 9, color: MUTED, align: "right", margin: 0 });
}

function card(s, x, y, w, h, opts = {}) {
  s.addShape("roundRect", {
    x, y, w, h,
    rectRadius: 0.08,
    fill: { color: opts.fill || PANEL },
    line: { color: opts.line || BORDER, width: 1 },
    shadow: opts.shadow === false ? undefined : { type: "outer", color: "000000", opacity: 0.35, blur: 8, offset: 3, angle: 90 },
  });
}

const pres = newDeck();

// ---------------------------------------------------------------------
// Slide 1: Title
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: BG_DARK }, line: { type: "none" } });
  // decorative circles motif
  s.addShape("ellipse", { x: 10.3, y: -1.5, w: 5, h: 5, fill: { color: ACCENT, transparency: 88 }, line: { type: "none" } });
  s.addShape("ellipse", { x: 11.5, y: 4.2, w: 3.4, h: 3.4, fill: { color: PURPLE, transparency: 88 }, line: { type: "none" } });

  s.addText("GAMING COMMUNITY PULSE", { x: 0.8, y: 2.5, w: 11, h: 0.5, fontFace: "Calibri", fontSize: 14, color: ACCENT, bold: true, charSpacing: 3, margin: 0 });
  s.addText("A Lightweight Social Listening Prototype for Gaming Marketing", {
    x: 0.8, y: 2.95, w: 11.5, h: 1.3, fontFace: "Cambria", fontSize: 34, color: TEXT, bold: true, margin: 0,
  });
  s.addText("PUBG · Once Human · Marvel Rivals · Where Winds Meet · World of Warcraft", {
    x: 0.8, y: 4.15, w: 11, h: 0.5, fontFace: "Calibri", fontSize: 15, color: MUTED, margin: 0,
  });
  s.addText("Reddit  ·  Discord  ·  YouTube        Placement prototype — 30 July 2026", {
    x: 0.8, y: 6.4, w: 11, h: 0.4, fontFace: "Calibri", fontSize: 12, color: MUTED, margin: 0,
  });
}

// ---------------------------------------------------------------------
// Slide 2: Scope & approach
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Scope & Approach", "Five games, three platforms, one lightweight pipeline");

  const items = [
    ["Deliberately mixed portfolio", "A battle royale (PUBG), survival/gacha hybrid (Once Human), live-service hero shooter (Marvel Rivals), a newly-launched open-world RPG (Where Winds Meet), and a 20-year subscription MMO (World of Warcraft) — chosen to stress-test the tool against very different community moods."],
    ["Three platforms, one view", "Reddit threads, Discord chat, and YouTube comments unified into a single dataset with consistent sentiment, theme, and engagement scoring."],
    ["507 records, 8-week window", "55 real YouTube comments captured live, plus 452 illustrative Reddit/Discord records modeled on realistic public discourse (see Methodology doc for why, and how this becomes live)."],
    ["Built for non-technical users", "A single dashboard page — filters, charts, and plain-language tables. No querying, no code required."],
  ];

  const colW = 5.85, gap = 0.4, x0 = 0.6, y0 = 1.75, rowH = 2.35;
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = x0 + col * (colW + gap);
    const y = y0 + row * (rowH + 0.3);
    card(s, x, y, colW, rowH);
    s.addShape("ellipse", { x: x + 0.3, y: y + 0.3, w: 0.5, h: 0.5, fill: { color: ACCENT }, line: { type: "none" } });
    s.addText(String(i + 1), { x: x + 0.3, y: y + 0.3, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 16, bold: true, color: BG_DARK, margin: 0 });
    s.addText(it[0], { x: x + 0.95, y: y + 0.28, w: colW - 1.2, h: 0.5, fontFace: "Calibri", fontSize: 15, bold: true, color: TEXT, margin: 0 });
    s.addText(it[1], { x: x + 0.3, y: y + 0.9, w: colW - 0.6, h: rowH - 1.1, fontFace: "Calibri", fontSize: 11.5, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.15 });
  });
  footer(s, pres, 2);
}

// ---------------------------------------------------------------------
// Slide 3: Cross-game snapshot (table-like cards) + sentiment chart
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Cross-Game Snapshot", "Where sentiment sits today");

  const data = [
    { game: "PUBG", sentiment: -0.003, color: NEU },
    { game: "Once Human", sentiment: -0.025, color: NEU },
    { game: "Marvel Rivals", sentiment: 0.099, color: POS },
    { game: "Where Winds Meet", sentiment: 0.185, color: POS },
    { game: "World of Warcraft", sentiment: -0.093, color: NEG },
  ];

  s.addChart(pres.ChartType.bar, [{
    name: "Average sentiment",
    labels: data.map(d => d.game),
    values: data.map(d => d.sentiment),
  }], {
    x: 0.6, y: 1.7, w: 7.6, h: 5.1,
    barDir: "bar",
    showTitle: true, title: "Average sentiment score (-1 to +1)", titleColor: TEXT, titleFontSize: 13,
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: TEXT, dataLabelFontSize: 11,
    dataLabelFormatCode: "0.00;-0.00",
    chartColors: data.map(d => d.color),
    catAxisLabelColor: MUTED, catAxisLabelFontSize: 11, catAxisLabelPos: "low",
    valAxisLabelColor: MUTED, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "0.0",
    valGridLine: { color: BORDER, size: 1 },
    catGridLine: { style: "none" },
    showLegend: false,
    plotArea: { fill: { color: PANEL } },
    chartArea: { fill: { color: BG_DARK } },
    valAxisMinVal: -0.3, valAxisMaxVal: 0.3, valAxisMajorUnit: 0.1,
  });

  // Right column: quick reads
  const reads = [
    ["Most positive", "Where Winds Meet (+0.185)", POS],
    ["Most negative", "World of Warcraft (−0.093)", NEG],
    ["Highest engagement", "PUBG (11,024 total score)", ACCENT],
    ["Biggest single theme", "Marvel Rivals netcode complaints (22 mentions, −0.67)", NEG],
  ];
  let ry = 1.75;
  reads.forEach(r => {
    card(s, 8.5, ry, 4.2, 1.1);
    s.addText(r[0].toUpperCase(), { x: 8.75, y: ry + 0.12, w: 3.7, h: 0.3, fontFace: "Calibri", fontSize: 10, color: MUTED, bold: true, charSpacing: 1, margin: 0 });
    s.addText(r[1], { x: 8.75, y: ry + 0.42, w: 3.7, h: 0.6, fontFace: "Calibri", fontSize: 13.5, color: r[2], bold: true, margin: 0 });
    ry += 1.28;
  });

  footer(s, pres, 3);
}

// ---------------------------------------------------------------------
// Slide 4: Engagement comparison chart
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Engagement", "Total engagement score by game (upvotes, likes, reactions)");

  const eng = [
    { game: "PUBG", value: 11024 },
    { game: "Once Human", value: 9222 },
    { game: "Marvel Rivals", value: 9731 },
    { game: "Where Winds Meet", value: 9308 },
    { game: "World of Warcraft", value: 7635 },
  ];

  s.addChart(pres.ChartType.bar, [{
    name: "Total engagement",
    labels: eng.map(d => d.game),
    values: eng.map(d => d.value),
  }], {
    x: 0.6, y: 1.7, w: 12.1, h: 4.6,
    barDir: "col",
    showTitle: false,
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: TEXT, dataLabelFontSize: 11,
    chartColors: [ACCENT],
    catAxisLabelColor: MUTED, catAxisLabelFontSize: 12,
    valAxisLabelColor: MUTED, valAxisLabelFontSize: 10,
    valGridLine: { color: BORDER, size: 1 },
    catGridLine: { style: "none" },
    showLegend: false,
    plotArea: { fill: { color: PANEL } },
    chartArea: { fill: { color: BG_DARK } },
  });
  s.addText("Discussion volume clusters tightly around studio-driven moments — trailers, patches, and launch dates — rather than organic drift, which is good news for campaign timing.", {
    x: 0.6, y: 6.5, w: 12.1, h: 0.6, fontFace: "Calibri", fontSize: 12.5, color: MUTED, margin: 0,
  });
  footer(s, pres, 4);
}

// ---------------------------------------------------------------------
// Slide 5: Game-by-game highlights (small cards grid)
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "What Drove the Conversation", "One headline per game");

  const rows = [
    ["PUBG", "Cheat fatigue vs. crossover hype", "Bug/cheating complaints are the loudest negative (17 mentions, −0.41); the Spider-Man crossover is the biggest positive spike.", NEG],
    ["Once Human", "Loved for base-building, hurt by monetization", "Base building is the single highest-engagement post in the dataset (881 score); gacha pricing is the most negative theme (−0.54).", NEU],
    ["Marvel Rivals", "Adored roster, resented netcode", "Praise scores +0.74 — the best of any theme in the study — but netcode complaints are the largest single theme (22 mentions, −0.67).", POS],
    ["Where Winds Meet", "Most positive community in the study", "Open-world praise is the single highest theme score anywhere (+0.725); only 22% negative sentiment, the lowest of any game.", POS],
    ["World of Warcraft", "Sceptical of the expansion, not the game", "Expansion messaging and class balance drive negativity (−0.093 avg); story writing still scores +0.578 — the problem is the pitch, not the product.", NEG],
  ];

  let y = 1.7;
  const rh = 1.0;
  rows.forEach(r => {
    card(s, 0.6, y, 12.1, rh - 0.15);
    s.addShape("roundRect", { x: 0.85, y: y + 0.18, w: 0.12, h: rh - 0.5, rectRadius: 0.06, fill: { color: r[3] }, line: { type: "none" } });
    s.addText(r[0], { x: 1.2, y: y + 0.1, w: 2.4, h: rh - 0.3, fontFace: "Calibri", fontSize: 14, bold: true, color: TEXT, valign: "middle", margin: 0 });
    s.addText(r[1], { x: 3.7, y: y + 0.1, w: 3.4, h: rh - 0.3, fontFace: "Calibri", fontSize: 12, bold: true, color: r[3], valign: "middle", margin: 0 });
    s.addText(r[2], { x: 7.25, y: y + 0.08, w: 5.3, h: rh - 0.25, fontFace: "Calibri", fontSize: 10.5, color: MUTED, valign: "middle", margin: 0, lineSpacingMultiple: 1.05 });
    y += rh;
  });
  footer(s, pres, 5);
}

// ---------------------------------------------------------------------
// Slide 6: Recurring questions -> content ideas
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "From Chatter to Content Calendar", "Recurring questions worth answering");

  const qs = [
    ["Once Human", "\"Does console get the same seasonal content as PC?\"", "→ Pinned FAQ / dev post ahead of the Aug 25 launch"],
    ["Where Winds Meet", "\"Best early build for a sword-focused playstyle?\"", "→ Creator-partnered starter guide"],
    ["World of Warcraft", "\"Anyone else grinding the new PvP season rewards?\"", "→ Lightweight community engagement hook (clip roundup, leaderboard shoutout)"],
  ];

  let y = 1.85;
  qs.forEach((q) => {
    card(s, 0.6, y, 12.1, 1.55);
    s.addText(q[0].toUpperCase(), { x: 0.95, y: y + 0.18, w: 3, h: 0.35, fontFace: "Calibri", fontSize: 11, bold: true, color: ACCENT, charSpacing: 1, margin: 0 });
    s.addText(q[1], { x: 0.95, y: y + 0.5, w: 11.4, h: 0.5, fontFace: "Cambria", fontSize: 16, italic: true, color: TEXT, margin: 0 });
    s.addText(q[2], { x: 0.95, y: y + 1.05, w: 11.4, h: 0.4, fontFace: "Calibri", fontSize: 12, color: POS, bold: true, margin: 0 });
    y += 1.75;
  });
  footer(s, pres, 6);
}

// ---------------------------------------------------------------------
// Slide 7: Where AI helps vs. limits
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Where AI Helps — and Where It Doesn't", "Set expectations before scaling this up");

  card(s, 0.6, 1.75, 5.9, 5.1, { fill: "17231E" });
  s.addText("WHERE IT HELPS", { x: 0.95, y: 2.0, w: 5.2, h: 0.4, fontFace: "Calibri", fontSize: 13, bold: true, color: POS, charSpacing: 1, margin: 0 });
  [
    "Surfacing patterns across thousands of posts no one could read end to end",
    "Fast directional reads to support a pitch or go/no-go decision",
    "Turning chatter into a structured, shareable dashboard",
    "Flagging genuinely repetitive questions and complaints",
  ].forEach((t, i) => {
    s.addText(t, { x: 0.95, y: 2.55 + i * 1.0, w: 5.2, h: 0.9, fontFace: "Calibri", fontSize: 13, color: TEXT, bullet: { code: "2713" }, margin: 0, valign: "top" });
  });

  card(s, 6.8, 1.75, 5.9, 5.1, { fill: "231819" });
  s.addText("WHERE IT DOESN'T", { x: 7.15, y: 2.0, w: 5.2, h: 0.4, fontFace: "Calibri", fontSize: 13, bold: true, color: NEG, charSpacing: 1, margin: 0 });
  [
    "Sarcasm, in-jokes, and mixed sentiment still trip up sentiment models",
    "Small samples create noisy, swingy averages — needs volume or confidence intervals",
    "Tells you what and roughly how strongly, rarely why in any deep sense",
    "Can't replace judgement on brand voice, timing, or response tone",
  ].forEach((t, i) => {
    s.addText(t, { x: 7.15, y: 2.55 + i * 1.0, w: 5.2, h: 0.9, fontFace: "Calibri", fontSize: 13, color: TEXT, bullet: { code: "2717" }, margin: 0, valign: "top" });
  });

  footer(s, pres, 7);
}

// ---------------------------------------------------------------------
// Slide 8: Recommendations
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Recommendations", "How RS could use this");

  const recs = [
    ["Content planning", "Turn recurring questions into a weekly content shortlist instead of guesswork."],
    ["Campaign research", "Benchmark sentiment before a launch/season, then measure the real lift after."],
    ["Community monitoring", "Flag rising theme-level negativity early, before it becomes a PR story."],
    ["Portfolio comparison", "Use one consistent scorecard across every title in a pitch or QBR."],
  ];
  const colW = 2.85, gap = 0.25, x0 = 0.6, y0 = 1.85;
  recs.forEach((r, i) => {
    const x = x0 + i * (colW + gap);
    card(s, x, y0, colW, 3.2);
    s.addShape("roundRect", { x: x + 0.25, y: y0 + 0.28, w: 0.55, h: 0.55, rectRadius: 0.28, fill: { color: ACCENT }, line: { type: "none" } });
    s.addText(String(i + 1), { x: x + 0.25, y: y0 + 0.28, w: 0.55, h: 0.55, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 18, bold: true, color: BG_DARK, margin: 0 });
    s.addText(r[0], { x: x + 0.25, y: y0 + 1.0, w: colW - 0.5, h: 0.7, fontFace: "Calibri", fontSize: 15, bold: true, color: TEXT, margin: 0 });
    s.addText(r[1], { x: x + 0.25, y: y0 + 1.7, w: colW - 0.5, h: 1.4, fontFace: "Calibri", fontSize: 11.5, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.15 });
  });

  card(s, 0.6, 5.35, 12.1, 1.5, { fill: "1A2033" });
  s.addText("NEXT STEPS BEYOND THIS PLACEMENT", { x: 0.95, y: 5.55, w: 11.4, h: 0.35, fontFace: "Calibri", fontSize: 11.5, bold: true, color: ACCENT, charSpacing: 1, margin: 0 });
  s.addText("Secure Reddit API + permissioned Discord bot access  →  add scheduled re-collection  →  upgrade sentiment to a hosted NLP model  →  pilot with one account team on one title.", {
    x: 0.95, y: 5.95, w: 11.4, h: 0.75, fontFace: "Calibri", fontSize: 13, color: TEXT, margin: 0,
  });

  footer(s, pres, 8);
}

// ---------------------------------------------------------------------
// Slide 9: Closing / data note
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  s.addShape("ellipse", { x: -1.5, y: -1.5, w: 5, h: 5, fill: { color: ACCENT, transparency: 90 }, line: { type: "none" } });
  s.addText("Thank you", { x: 0.8, y: 2.5, w: 11, h: 1, fontFace: "Cambria", fontSize: 34, bold: true, color: TEXT, margin: 0 });
  s.addText("Full detail in three companion documents: Findings Summary, Methodology & Limitations, and Recommendations — plus the live interactive dashboard (dashboard.html).", {
    x: 0.8, y: 3.5, w: 10.5, h: 0.8, fontFace: "Calibri", fontSize: 14, color: MUTED, margin: 0,
  });
  s.addText("YouTube data: real, captured live 30 July 2026.  Reddit & Discord data: illustrative synthetic sample, clearly labelled throughout.", {
    x: 0.8, y: 6.6, w: 11, h: 0.4, fontFace: "Calibri", fontSize: 11, color: MUTED, italic: true, margin: 0,
  });
}

pres.writeFile({ fileName: "summary_deck.pptx" }).then(() => console.log("wrote summary_deck.pptx"));
