// ---------------------------------------------------------------------------
// Summary deck generator — version 2.
//
// This deck deliberately carries NO current figures. Sentiment averages,
// engagement figures, record counts and theme counts all come from a live run
// and change on every refresh, so putting them on a slide would date the deck
// the moment it was built. The v1 deck did exactly that and every number in it
// is now wrong: it quoted sentiment on a -1..+1 scale that no longer exists, a
// "total engagement" metric that has been replaced, and described Reddit and
// Discord as synthetic when both are now live integrations.
//
// What appears here instead is structural: what the tool measures, how each
// metric is defined, and what the honest limits are. Those are true of the code
// rather than of a particular refresh. Every claim tracks
// report/CLIENT_ANSWERS.md and report/GAMING_COMMUNITY_PULSE_REPORT.md.
//
// Run with: npm run build:deck   →   slides/summary_deck.pptx
// ---------------------------------------------------------------------------

const path = require("path");
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

const TINT_BLUE = "1A2033";
const TINT_GREEN = "17231E";
const TINT_RED = "231819";

// Shared vertical rhythm for the question slides
const QUOTE_Y = 1.5;
const BODY_Y = 2.48;
const WHERE_Y = 6.72;

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
  s.addText("Gaming Community Pulse v2 — prepared for Ruisheng Holdings", { x: 0.6, y: 7.15, w: 7, h: 0.3, fontFace: "Calibri", fontSize: 9, color: MUTED, margin: 0 });
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

/** Small uppercase eyebrow label used inside cards. */
function eyebrow(s, x, y, w, label, color) {
  s.addText(label.toUpperCase(), { x, y, w, h: 0.3, fontFace: "Calibri", fontSize: 10, bold: true, color: color || MUTED, charSpacing: 1, margin: 0 });
}

/** Bulleted body copy. Short lines only — this is read at a distance. */
function bullets(s, x, y, w, h, items, opts = {}) {
  const size = opts.fontSize || 12;
  s.addText(
    items.map((t) => ({
      text: typeof t === "string" ? t : t.text,
      options: {
        bullet: { code: opts.code || "2022", indent: 14 },
        breakLine: true,
        paraSpaceAfter: opts.spaceAfter === undefined ? 7 : opts.spaceAfter,
        color: typeof t === "string" ? (opts.color || TEXT) : t.color,
        bold: typeof t === "string" ? false : Boolean(t.bold),
      },
    })),
    { x, y, w, h, fontFace: "Calibri", fontSize: size, color: opts.color || TEXT, margin: 0, valign: "top", lineSpacingMultiple: opts.lineSpacing || 1.1 }
  );
}

/** The client's own words, verbatim fragments, at the top of a question slide. */
function askedStrip(s, quote, y, h) {
  const yy = y === undefined ? QUOTE_Y : y;
  const hh = h === undefined ? 0.82 : h;
  card(s, 0.6, yy, 12.1, hh, { fill: TINT_BLUE });
  s.addShape("roundRect", { x: 0.75, y: yy + 0.16, w: 0.1, h: hh - 0.32, rectRadius: 0.05, fill: { color: ACCENT }, line: { type: "none" } });
  s.addText(quote, { x: 1.02, y: yy + 0.1, w: 11.5, h: hh - 0.2, fontFace: "Cambria", fontSize: 12.5, italic: true, color: TEXT, valign: "middle", margin: 0, lineSpacingMultiple: 1.05 });
}

/** One compact line naming the code that implements the answer. */
function whereLine(s, paths, y) {
  const yy = y === undefined ? WHERE_Y : y;
  s.addText("WHERE IT LIVES", { x: 0.6, y: yy, w: 1.65, h: 0.32, fontFace: "Calibri", fontSize: 9.5, bold: true, color: MUTED, charSpacing: 1, margin: 0, valign: "middle" });
  s.addText(paths, { x: 2.25, y: yy, w: 10.45, h: 0.32, fontFace: "Consolas", fontSize: 11, color: ACCENT, margin: 0, valign: "middle" });
}

/**
 * Lightweight table drawn from the same primitives as everything else, so it
 * sits in the deck's visual language rather than PowerPoint's default one.
 * `colFracs` are fractions of the inner width and should sum to 1.
 */
function dataTable(s, x, y, w, colFracs, header, rows, opts = {}) {
  const rowH = opts.rowH || 0.44;
  const headH = 0.32;
  const pad = 0.28;
  const h = 0.16 + headH + rows.length * rowH + 0.16;
  card(s, x, y, w, h);

  const innerW = w - pad * 2;
  const xs = [];
  let acc = 0;
  colFracs.forEach((f) => { xs.push(x + pad + acc * innerW); acc += f; });

  header.forEach((label, i) => {
    s.addText(String(label).toUpperCase(), { x: xs[i], y: y + 0.14, w: colFracs[i] * innerW - 0.12, h: headH, fontFace: "Calibri", fontSize: 9.5, bold: true, color: MUTED, charSpacing: 1, margin: 0 });
  });

  rows.forEach((row, ri) => {
    const ry = y + 0.16 + headH + ri * rowH;
    s.addShape("rect", { x: x + pad, y: ry - 0.02, w: innerW, h: 0.01, fill: { color: BORDER }, line: { type: "none" } });
    row.forEach((cell, ci) => {
      const value = typeof cell === "string" ? cell : cell.text;
      const color = typeof cell === "string" ? (ci === 0 ? TEXT : MUTED) : cell.color;
      s.addText(value, {
        x: xs[ci], y: ry, w: colFracs[ci] * innerW - 0.12, h: rowH,
        fontFace: typeof cell === "object" && cell.mono ? "Consolas" : "Calibri",
        fontSize: opts.fontSize || 11,
        color, bold: ci === 0 && opts.boldFirst !== false,
        valign: "middle", margin: 0,
      });
    });
  });

  return h;
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

  s.addText("GAMING COMMUNITY PULSE  ·  VERSION 2", { x: 0.8, y: 2.35, w: 11, h: 0.5, fontFace: "Calibri", fontSize: 14, color: ACCENT, bold: true, charSpacing: 3, margin: 0 });
  s.addText("A social listening prototype, rebuilt around your nine questions", {
    x: 0.8, y: 2.8, w: 11.3, h: 1.4, fontFace: "Cambria", fontSize: 34, color: TEXT, bold: true, margin: 0,
  });
  s.addText("PUBG · Once Human · Marvel Rivals · Where Winds Meet · World of Warcraft", {
    x: 0.8, y: 4.25, w: 11, h: 0.4, fontFace: "Calibri", fontSize: 15, color: MUTED, margin: 0,
  });
  s.addText("YouTube · Reddit · Discord · Twitch — all four collected through official APIs", {
    x: 0.8, y: 4.68, w: 11, h: 0.4, fontFace: "Calibri", fontSize: 15, color: MUTED, margin: 0,
  });

  s.addText("Prepared for Ruisheng Holdings Limited  ·  Attn: Jen So", {
    x: 0.8, y: 6.25, w: 11, h: 0.35, fontFace: "Calibri", fontSize: 13, color: TEXT, margin: 0,
  });
  s.addText("August 2026  ·  No current figures appear in this deck — they come from a live run and move on every refresh", {
    x: 0.8, y: 6.62, w: 11.6, h: 0.35, fontFace: "Calibri", fontSize: 11, color: MUTED, italic: true, margin: 0,
  });
}

// ---------------------------------------------------------------------
// Slide 2: The brief, and what the tool does
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "The Brief", "One test, set by you, that the tool has to pass");

  card(s, 0.6, 1.55, 12.1, 1.15, { fill: TINT_BLUE });
  s.addText("“Someone should be able to open the dashboard each morning and understand what is happening across the gaming community within a few minutes.”", {
    x: 0.95, y: 1.68, w: 11.4, h: 0.9, fontFace: "Cambria", fontSize: 17, italic: true, color: TEXT, valign: "middle", margin: 0,
  });

  const steps = [
    ["Collect", "Public posts, comments and clips from YouTube, Reddit, Discord and Twitch. Official APIs, credentials, no scraping.", ACCENT],
    ["Score", "One pass per record: sentiment, sarcasm, theme, whether it is a genuine question, whether it is a risk, and language.", PURPLE],
    ["Normalise", "Engagement onto a 0–100 index, weighted and capped per platform, so a Discord reaction and a Twitch clip view can sit in one column honestly.", NEU],
    ["Classify", "The region the content was published in, from publisher-side signals only. No commenter is ever geolocated.", NEU],
    ["Detect", "Volume spikes against a trailing baseline, ranked risks, and recurring questions clustered into a content shortlist.", POS],
    ["Brief", "A written daily narrative at the top of the page, with the charts underneath as the evidence rather than the interface.", POS],
  ];

  const colW = 3.85, gap = 0.28, x0 = 0.6, y0 = 2.95, rowH = 1.9;
  steps.forEach((it, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = x0 + col * (colW + gap);
    const y = y0 + row * (rowH + 0.25);
    card(s, x, y, colW, rowH);
    s.addShape("ellipse", { x: x + 0.28, y: y + 0.26, w: 0.44, h: 0.44, fill: { color: it[2] }, line: { type: "none" } });
    s.addText(String(i + 1), { x: x + 0.28, y: y + 0.26, w: 0.44, h: 0.44, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 14, bold: true, color: BG_DARK, margin: 0 });
    s.addText(it[0], { x: x + 0.85, y: y + 0.26, w: colW - 1.1, h: 0.44, fontFace: "Calibri", fontSize: 15, bold: true, color: TEXT, valign: "middle", margin: 0 });
    s.addText(it[1], { x: x + 0.28, y: y + 0.8, w: colW - 0.56, h: rowH - 0.95, fontFace: "Calibri", fontSize: 10.5, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.12 });
  });

  footer(s, pres, 2);
}

// ---------------------------------------------------------------------
// Slide 3: What v1 delivered, and what it shipped with
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Where We Started", "What version 1 delivered — and the three limitations it shipped with");

  card(s, 0.6, 1.65, 4.05, 4.55);
  eyebrow(s, 0.9, 1.88, 3.5, "Version 1 delivered", POS);
  bullets(s, 0.9, 2.28, 3.5, 3.7, [
    "Five titles, three platforms, one dashboard page",
    "Real YouTube comments, captured live",
    "Lexicon sentiment on a −1 to +1 scale",
    "Theme, engagement and question panels",
    "Four written documents",
  ], { fontSize: 12, color: TEXT });

  const limits = [
    ["The data was mostly manufactured", "452 of 507 records — around 89% — were synthetic. Only 55 YouTube comments were observed. Reddit was not partly built: there was no Reddit code at all."],
    ["Sentiment was keyword matching", "A flat lexicon of roughly 60 words, summed and normalised. No negation, no intensity, no emoji, no context."],
    ["Engagement summed incomparable units", "YouTube likes plus Reddit upvotes plus Discord reactions, untransformed. The total largely reflected which platform contributed the most rows."],
  ];

  let y = 1.65;
  limits.forEach((l, i) => {
    card(s, 4.9, y, 7.8, 1.42, { fill: TINT_RED });
    s.addText(String(i + 1), { x: 5.15, y: y + 0.22, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: "Cambria", fontSize: 20, bold: true, color: NEG, margin: 0 });
    s.addText(l[0], { x: 5.75, y: y + 0.18, w: 6.7, h: 0.38, fontFace: "Calibri", fontSize: 14, bold: true, color: TEXT, margin: 0 });
    s.addText(l[1], { x: 5.75, y: y + 0.58, w: 6.75, h: 0.72, fontFace: "Calibri", fontSize: 11, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.1 });
    y += 1.57;
  });

  card(s, 0.6, 6.35, 12.1, 0.72, { fill: TINT_BLUE });
  s.addText("None of v1's figures are restated in this deck. The scale, the scorer and the engagement metric have all changed, so the old numbers are not comparable to the new ones — they are withdrawn, not updated.", {
    x: 0.95, y: 6.45, w: 11.4, h: 0.55, fontFace: "Calibri", fontSize: 12.5, color: TEXT, valign: "middle", margin: 0,
  });

  footer(s, pres, 3);
}

// ---------------------------------------------------------------------
// Slide 4: The nine questions
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Your Questions", "You asked nine questions. This is what happened to each one.");

  const qs = [
    "Can sentiment go beyond keyword matching — and be shown on −100 to +100?",
    "Explain the engagement score: inputs, weights, normalisation, meaning.",
    "Can content be categorised by the region it was published in?",
    "What are the data sources, and how does data flow through to the dashboard?",
    "Put media channel and time range at the top as global filters.",
    "Add an AI-written daily summary — and say how long it should be.",
    "Make it usable in a few minutes each morning, not another chart wall.",
    "Deliver business value: risks, trends, campaign ideas, notable changes.",
    "Confirm the complete source code ships for internal deployment.",
  ];

  const colW = 5.85, gap = 0.4, x0 = 0.6, y0 = 1.62, rowH = 0.86;
  qs.forEach((q, i) => {
    const col = Math.floor(i / 5), row = i % 5;
    const x = x0 + col * (colW + gap);
    const y = y0 + row * rowH;
    card(s, x, y, colW, rowH - 0.12);
    s.addShape("ellipse", { x: x + 0.24, y: y + 0.16, w: 0.42, h: 0.42, fill: { color: ACCENT }, line: { type: "none" } });
    s.addText(String(i + 1), { x: x + 0.24, y: y + 0.16, w: 0.42, h: 0.42, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 13, bold: true, color: BG_DARK, margin: 0 });
    s.addText(q, { x: x + 0.8, y: y + 0.08, w: colW - 1.05, h: rowH - 0.28, fontFace: "Calibri", fontSize: 11.5, color: TEXT, valign: "middle", margin: 0, lineSpacingMultiple: 1.05 });
  });

  card(s, 7.1, 5.98, 5.6, 1.1, { fill: TINT_GREEN });
  s.addText("All nine are built and running, not proposed.", { x: 7.4, y: 6.1, w: 5.1, h: 0.35, fontFace: "Calibri", fontSize: 14, bold: true, color: POS, margin: 0 });
  s.addText("The one judgement call rather than a build is the word-count recommendation in question six — which you asked us for.", {
    x: 7.4, y: 6.45, w: 5.05, h: 0.55, fontFace: "Calibri", fontSize: 10.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.1,
  });

  card(s, 0.6, 5.98, 6.1, 1.1, { fill: TINT_BLUE });
  s.addText("Two gaps you did not ask about were also closed.", { x: 0.9, y: 6.1, w: 5.6, h: 0.35, fontFace: "Calibri", fontSize: 14, bold: true, color: ACCENT, margin: 0 });
  s.addText("We found them while working through your list. They are on slide 14.", {
    x: 0.9, y: 6.45, w: 5.6, h: 0.55, fontFace: "Calibri", fontSize: 10.5, color: MUTED, margin: 0,
  });

  footer(s, pres, 4);
}

// ---------------------------------------------------------------------
// Slide 5: Q1a — sentiment, the two failures
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Question 1 — Sentiment", "Your example was right. Here is the old scorer failing, twice.");
  askedStrip(s, "“Could you clarify how the current sentiment analysis works and whether it could be developed beyond keyword-based matching? … sarcasm or irony can result in a statement such as ‘This game is amazing’ expressing a negative sentiment.”");

  // v2 figures are the measured output of the rebuilt lexicon in
  // server/lib/sentiment.js, not estimates — reproduce with:
  //   node -e 'console.log(require("./server/lib/sentiment").analyzeSentiment("<text>"))'
  const cases = [
    {
      quote: "“This game is not good at all”",
      score: "+0.33",
      verdict: "scored POSITIVE",
      color: POS,
      why: "The word good was matched. Nothing in the scorer reversed it.",
      now: "−30",
      nowVerdict: "negative",
      nowColor: NEG,
    },
    {
      quote: "“INSANE 1v5 clutch!!!”",
      score: "−0.33",
      verdict: "scored NEGATIVE",
      color: NEG,
      why: "Insane sat in the negative list, because in general English it is negative. In gaming it is praise.",
      now: "+100",
      nowVerdict: "positive",
      nowColor: POS,
    },
  ];

  cases.forEach((c, i) => {
    const x = 0.6 + i * 6.25;
    card(s, x, BODY_Y, 5.85, 2.82);
    s.addShape("roundRect", { x: x + 0.02, y: BODY_Y + 0.2, w: 0.1, h: 2.42, rectRadius: 0.05, fill: { color: NEG }, line: { type: "none" } });
    eyebrow(s, x + 0.35, BODY_Y + 0.18, 5.2, "Version 1 scored this", MUTED);
    s.addText(c.quote, { x: x + 0.35, y: BODY_Y + 0.5, w: 5.2, h: 0.52, fontFace: "Cambria", fontSize: 19, italic: true, color: TEXT, margin: 0 });
    s.addText(c.score, { x: x + 0.35, y: BODY_Y + 1.06, w: 1.5, h: 0.46, fontFace: "Cambria", fontSize: 25, bold: true, color: c.color, margin: 0 });
    s.addText(c.verdict, { x: x + 1.85, y: BODY_Y + 1.12, w: 3.6, h: 0.38, fontFace: "Calibri", fontSize: 13, bold: true, color: c.color, valign: "middle", margin: 0 });
    s.addText(c.why, { x: x + 0.35, y: BODY_Y + 1.56, w: 5.2, h: 0.52, fontFace: "Calibri", fontSize: 11, color: MUTED, margin: 0, lineSpacingMultiple: 1.1 });

    // Version 2, on the same card, so the contrast reads at a glance.
    s.addShape("rect", { x: x + 0.35, y: BODY_Y + 2.14, w: 5.2, h: 0.012, fill: { color: BORDER }, line: { type: "none" } });
    s.addText("Version 2 scores it", { x: x + 0.35, y: BODY_Y + 2.24, w: 2.3, h: 0.34, fontFace: "Calibri", fontSize: 11, color: MUTED, valign: "middle", margin: 0 });
    s.addText(c.now, { x: x + 2.55, y: BODY_Y + 2.2, w: 1.2, h: 0.42, fontFace: "Cambria", fontSize: 23, bold: true, color: c.nowColor, margin: 0 });
    s.addText(c.nowVerdict, { x: x + 3.75, y: BODY_Y + 2.26, w: 1.7, h: 0.34, fontFace: "Calibri", fontSize: 13, bold: true, color: c.nowColor, valign: "middle", margin: 0 });
  });

  card(s, 0.6, 5.5, 12.1, 1.28, { fill: TINT_BLUE });
  s.addText("Both are reproducible against the old code, and neither is an edge case. The second systematically mis-scored the most enthusiastic content on Twitch and Discord — the material a marketing team most wants to find.", {
    x: 0.95, y: 5.62, w: 11.4, h: 0.5, fontFace: "Calibri", fontSize: 12.5, color: TEXT, margin: 0, lineSpacingMultiple: 1.05,
  });
  s.addText("The version 2 figures above are the rebuilt lexicon alone — the fallback layer, with no API key. The semantic layer is better still.", {
    x: 0.95, y: 6.18, w: 11.4, h: 0.42, fontFace: "Calibri", fontSize: 12.5, bold: true, color: ACCENT, margin: 0,
  });

  whereLine(s, "server/lib/sentiment.js  ·  server/lib/nlp.js");
  footer(s, pres, 5);
}

// ---------------------------------------------------------------------
// Slide 6: Q1b — how sentiment works now, and the scale
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Question 1 — Sentiment", "Two layers, and one scale everywhere");

  card(s, 0.6, 1.55, 6.0, 3.5, { fill: TINT_GREEN });
  eyebrow(s, 0.95, 1.75, 5.3, "Primary — semantic scoring", POS);
  s.addText("Every record is read by Claude with a schema-constrained response. It judges the author's attitude rather than matching words, and returns in one pass:", {
    x: 0.95, y: 2.1, w: 5.3, h: 0.7, fontFace: "Calibri", fontSize: 11, color: MUTED, margin: 0, lineSpacingMultiple: 1.1,
  });
  bullets(s, 0.95, 2.82, 5.3, 2.0, [
    "sentiment, −100 to +100",
    "confidence, 0–1, lowered for short or ambiguous text",
    "sarcasm, when the wording differs from the meaning",
    "theme, from a 17-label controlled vocabulary",
    "is_question · is_risk · language",
  ], { fontSize: 11.5, spaceAfter: 4 });
  s.addText("Batched 40 records at a time, four batches in parallel, cached by content hash — a repeat refresh only pays for genuinely new text.", {
    x: 0.95, y: 4.55, w: 5.3, h: 0.42, fontFace: "Calibri", fontSize: 10, color: MUTED, italic: true, margin: 0, lineSpacingMultiple: 1.05,
  });

  card(s, 6.85, 1.55, 5.85, 3.5);
  eyebrow(s, 7.2, 1.75, 5.15, "Fallback — gaming-tuned lexicon", NEU);
  s.addText("Runs when no API key is configured, or when a batch errors. It is not the old lexicon. It now handles:", {
    x: 7.2, y: 2.1, w: 5.15, h: 0.45, fontFace: "Calibri", fontSize: 11, color: MUTED, margin: 0,
  });
  bullets(s, 7.2, 2.6, 5.15, 2.2, [
    "negation in a three-token window, damped not mirrored",
    "intensifiers and diminishers",
    "gaming slang polarity, corrected",
    "emoji, which the old tokeniser discarded entirely",
    "emphasis — shouting amplifies whatever is there",
    "sarcasm markers, which damp rather than guess",
  ], { fontSize: 11.5, spaceAfter: 3 });

  card(s, 0.6, 5.2, 12.1, 1.32, { fill: TINT_BLUE });
  s.addText("−100  to  +100", { x: 0.95, y: 5.34, w: 3.0, h: 0.55, fontFace: "Cambria", fontSize: 24, bold: true, color: ACCENT, margin: 0 });
  s.addText("The only scale now used. Record scores, game and channel averages, theme sentiment, the time-series overlay, deltas and the headline tile.", {
    x: 4.1, y: 5.32, w: 8.35, h: 0.5, fontFace: "Calibri", fontSize: 12, color: TEXT, margin: 0, lineSpacingMultiple: 1.05,
  });
  s.addText("Positive above +15, negative below −15, neutral between — the same proportional band as before, so directional comparisons still hold. The dashboard banner always states which engine actually ran, so fallback output is never mistaken for semantic scoring.", {
    x: 0.95, y: 5.92, w: 11.5, h: 0.5, fontFace: "Calibri", fontSize: 10.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.05,
  });

  whereLine(s, "server/lib/nlp.js  ·  server/lib/sentiment.js");
  footer(s, pres, 6);
}

// ---------------------------------------------------------------------
// Slide 7: Q2 — the Engagement Index
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Question 2 — Engagement", "The old metric did not deserve an explanation. We replaced it.");
  askedStrip(s, "“Could you provide a clear explanation of the formula and logic used to calculate the engagement score? … How is each metric weighted? … Is the score normalised in any way? What does a particular score represent in practical terms?”", 1.42, 0.78);

  card(s, 0.6, 2.35, 12.1, 0.72, { fill: TINT_BLUE });
  s.addText("index = 100 × clamp( ln(1 + Σ metric×weight) / ln(1 + ceiling_platform), 0, 1 )", {
    x: 0.8, y: 2.45, w: 11.7, h: 0.52, fontFace: "Consolas", fontSize: 15, bold: true, color: ACCENT, align: "center", valign: "middle", margin: 0,
  });

  s.addText("1  Weight each native metric by the author effort it represents     2  Compress logarithmically so one viral post cannot dominate     3  Divide by that platform's own viral ceiling", {
    x: 0.6, y: 3.16, w: 12.1, h: 0.32, fontFace: "Calibri", fontSize: 11, color: MUTED, align: "center", margin: 0,
  });

  dataTable(s, 0.6, 3.56, 8.15, [0.17, 0.36, 0.2, 0.27], ["Channel", "Inputs and weights", "Viral ceiling", "Aggregation"], [
    ["YouTube", { text: "likes ×1  +  replies ×3", color: TEXT, mono: true }, { text: "5,000", color: NEU }, "mean, never sum"],
    ["Reddit", { text: "upvotes ×1  +  comments ×5", color: TEXT, mono: true }, { text: "20,000", color: NEU }, "mean, never sum"],
    ["Discord", { text: "reactions ×10  +  replies ×5", color: TEXT, mono: true }, { text: "400", color: NEU }, "mean, never sum"],
    ["Twitch", { text: "clip views ×1", color: TEXT, mono: true }, { text: "500,000", color: NEU }, "mean, never sum"],
  ], { rowH: 0.46, fontSize: 11 });

  card(s, 9.0, 3.56, 3.7, 2.42);
  eyebrow(s, 9.3, 3.74, 3.1, "What a score means", MUTED);
  const bands = [
    ["0–20", "background", MUTED],
    ["20–40", "modest", MUTED],
    ["40–60", "solid", NEU],
    ["60–80", "high", POS],
    ["80–100", "exceptional", POS],
  ];
  bands.forEach((b, i) => {
    const by = 4.08 + i * 0.36;
    s.addText(b[0], { x: 9.3, y: by, w: 1.0, h: 0.32, fontFace: "Consolas", fontSize: 11, color: TEXT, valign: "middle", margin: 0 });
    s.addText(b[1], { x: 10.3, y: by, w: 2.1, h: 0.32, fontFace: "Calibri", fontSize: 11, color: b[2], valign: "middle", margin: 0 });
  });

  s.addText("Normalised per platform — which is the normalisation that matters. Without it the figure is a proxy for platform mix rather than community reaction. Volume is reported separately as a record count, because “how much is being said” and “how hard it lands” are different questions.", {
    x: 0.6, y: 6.06, w: 12.1, h: 0.55, fontFace: "Calibri", fontSize: 11, color: MUTED, margin: 0, lineSpacingMultiple: 1.05,
  });

  whereLine(s, "server/lib/engagement.js  ·  GET /api/methodology", 6.68);
  footer(s, pres, 7);
}

// ---------------------------------------------------------------------
// Slide 8: Q3 — publication region
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Question 3 — Region", "Where the content was published. Never where the commenter is.");
  askedStrip(s, "“Could posts/video content be classified according to the region in which the video was published? … rather than attempting to determine the geographic region of individual commenters.”", 1.42, 0.72);

  dataTable(s, 0.6, 2.3, 8.6, [0.09, 0.26, 0.45, 0.2], ["#", "Signal", "The field it comes from", "Confidence"], [
    ["1", { text: "channel_country", color: TEXT, mono: true }, "YouTube channels.list → snippet.country", { text: "0.95", color: POS }],
    ["2", { text: "source_config", color: TEXT, mono: true }, "A region we declare in server/config/*.json", { text: "0.90", color: POS }],
    ["3", { text: "guild_locale", color: TEXT, mono: true }, "Discord guilds → preferred_locale", { text: "0.80", color: NEU }],
    ["4", { text: "content_language", color: TEXT, mono: true }, "YouTube defaultAudioLanguage; Twitch language", { text: "0.70", color: NEU }],
    ["5", { text: "text_language", color: TEXT, mono: true }, "Detected by the semantic layer — weakest", { text: "0.40", color: NEG }],
  ], { rowH: 0.44, fontSize: 10.5 });

  card(s, 9.45, 2.3, 3.25, 2.9, { fill: TINT_GREEN });
  eyebrow(s, 9.75, 2.48, 2.7, "Buckets", POS);
  ["Americas", "EMEA", "APAC", "Undetermined"].forEach((b, i) => {
    s.addText(b, { x: 9.75, y: 2.82 + i * 0.42, w: 2.7, h: 0.36, fontFace: "Calibri", fontSize: 13, bold: i < 3, color: i < 3 ? TEXT : MUTED, valign: "middle", margin: 0 });
  });
  s.addText("Records with no usable signal show as Undetermined rather than being quietly defaulted into a region.", {
    x: 9.75, y: 4.55, w: 2.7, h: 0.6, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, lineSpacingMultiple: 1.1,
  });

  card(s, 0.6, 5.32, 6.0, 1.22);
  s.addText("Every record stores the region, which signal decided it, and a confidence — so any regional figure is auditable back to a specific API field. Region is a global filter with its own panel.", {
    x: 0.9, y: 5.45, w: 5.45, h: 0.95, fontFace: "Calibri", fontSize: 11, color: TEXT, valign: "middle", margin: 0, lineSpacingMultiple: 1.1,
  });

  card(s, 6.85, 5.32, 5.85, 1.22, { fill: TINT_RED });
  eyebrow(s, 7.15, 5.42, 5.2, "The honest limitation", NEG);
  s.addText("The tracked channels are global publisher channels. Each declares one country, so a whole catalogue lands in one bucket. Regional sources are config entries, not code — and given your China/West position, that is the highest-value change available.", {
    x: 7.15, y: 5.72, w: 5.25, h: 0.72, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, lineSpacingMultiple: 1.08,
  });

  whereLine(s, "server/lib/region.js  ·  server/config/*.json", 6.65);
  footer(s, pres, 8);
}

// ---------------------------------------------------------------------
// Slide 9: Q4 — sources and processing logic
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Question 4 — Sources & Processing", "Four official APIs in, one shared schema out");
  askedStrip(s, "“What data sources are currently being used? … How is the data processed and structured? How does the data flow from the original source through to the dashboard?”", 1.42, 0.72);

  dataTable(s, 0.6, 2.28, 7.55, [0.15, 0.5, 0.35], ["Channel", "Method", "Compliance position"], [
    ["YouTube", "Data API v3 — uploads, then comment threads", "API key. A full refresh costs ~95 of the 10,000 daily units"],
    ["Reddit", "Official OAuth API — top posts and recent comments", "Application-only, read-only, identifying User-Agent. No scraping"],
    ["Discord", "Bot REST API, where permissioned", "The bot must be invited by a server owner. Nothing read without permission"],
    ["Twitch", "Helix — top clips plus a live snapshot per category", "Client credentials, no per-user login. Category level by design"],
  ], { rowH: 0.56, fontSize: 10 });

  card(s, 8.4, 2.28, 4.3, 2.88);
  eyebrow(s, 8.7, 2.42, 3.7, "The flow, end to end", ACCENT);
  const stages = [
    ["Collect", "four wrappers in parallel, one schema"],
    ["Enrich", "scored once: sentiment, index, region"],
    ["Aggregate", "series, spikes, themes, risks, questions"],
    ["Compare", "today against the last stored snapshot"],
    ["Brief", "the narrative, written from the analysis"],
    ["Serve", "aggregates and rows together, so filters re-derive instantly"],
  ];
  stages.forEach((st, i) => {
    const sy = 2.74 + i * 0.4;
    s.addText(String(i + 1), { x: 8.7, y: sy, w: 0.3, h: 0.3, fontFace: "Consolas", fontSize: 11, bold: true, color: ACCENT, margin: 0 });
    s.addText(st[0], { x: 9.05, y: sy, w: 1.05, h: 0.3, fontFace: "Calibri", fontSize: 11.5, bold: true, color: TEXT, margin: 0 });
    s.addText(st[1], { x: 10.05, y: sy - 0.01, w: 2.4, h: 0.4, fontFace: "Calibri", fontSize: 9, color: MUTED, margin: 0, lineSpacingMultiple: 1.0 });
  });

  card(s, 0.6, 5.3, 7.55, 1.2, { fill: TINT_BLUE });
  eyebrow(s, 0.9, 5.4, 6.9, "Per record", ACCENT);
  s.addText("Collected: platform, game, source, content type, public handle, timestamp, text, native engagement, region signals, URL.   Derived: sentiment score, label, confidence, method, sarcasm, theme, is_question, is_risk, language, engagement index, region, region source, region confidence.", {
    x: 0.9, y: 5.7, w: 6.95, h: 0.7, fontFace: "Calibri", fontSize: 9.5, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.1,
  });

  card(s, 8.4, 5.3, 4.3, 1.2, { fill: TINT_GREEN });
  s.addText("Public data only. Official APIs with credentials. No scraping, no rate-limit evasion.", {
    x: 8.7, y: 5.4, w: 3.75, h: 0.5, fontFace: "Calibri", fontSize: 11, bold: true, color: POS, margin: 0, lineSpacingMultiple: 1.05,
  });
  s.addText("Served as data too, so it cannot drift out of date relative to the code the way a document can.", {
    x: 8.7, y: 5.92, w: 3.75, h: 0.5, fontFace: "Calibri", fontSize: 9.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.08,
  });

  whereLine(s, "GET /api/methodology  ·  server/server.js", 6.62);
  footer(s, pres, 9);
}

// ---------------------------------------------------------------------
// Slide 10: Q5 + Q7 — global filters and the morning read
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Questions 5 & 7 — Filters and the Morning Read", "The filter bar at the top, and the page reordered behind it");
  askedStrip(s, "“The Media Channel filter should be positioned prominently at the top of the dashboard as a global filter. A Time Range filter should also be included alongside it.”   +   “The objective is not simply to create another dashboard.”", 1.42, 0.85);

  card(s, 0.6, 2.42, 6.0, 4.05);
  eyebrow(s, 0.9, 2.6, 5.4, "Global filters", ACCENT);
  s.addText("A sticky bar sits directly under the header and stays visible while scrolling.", {
    x: 0.9, y: 2.92, w: 5.45, h: 0.35, fontFace: "Calibri", fontSize: 11, color: MUTED, margin: 0,
  });
  bullets(s, 0.9, 3.32, 5.45, 2.0, [
    "Media channel — multi-select, with live record counts",
    "Product / game — multi-select, with counts",
    "Time range — today / 7 / 30 / 90 / all, plus custom dates",
    "Publication region",
    "A plain-English line stating what is currently in view",
  ], { fontSize: 11.5, spaceAfter: 5 });
  s.addText("Every panel derives from one filtered() function. Adding a panel that ignored a filter would mean deliberately bypassing it. Two exceptions are labelled on screen: the Twitch live snapshot, and the briefing, which is written server-side from the full dataset.", {
    x: 0.9, y: 5.45, w: 5.45, h: 0.9, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.1,
  });

  card(s, 6.85, 2.42, 5.85, 4.05);
  eyebrow(s, 7.15, 2.6, 5.2, "Ordered by what you need first", POS);
  const order = [
    ["The briefing", "headline, then a one-minute narrative"],
    ["Five headline tiles", "each carries its own scale in one line"],
    ["Charts as evidence", "spikes named in words, not left as a bump"],
    ["Themes, questions, top posts", "the reading material"],
    ["The raw records", "so any figure traces back to its rows"],
    ["Methodology, collapsed", "every number on the page, explained"],
  ];
  order.forEach((o, i) => {
    const oy = 2.9 + i * 0.45;
    s.addText(String(i + 1), { x: 7.15, y: oy, w: 0.3, h: 0.3, fontFace: "Consolas", fontSize: 11, bold: true, color: POS, margin: 0 });
    s.addText(o[0], { x: 7.5, y: oy, w: 2.4, h: 0.3, fontFace: "Calibri", fontSize: 11.5, bold: true, color: TEXT, margin: 0 });
    s.addText(o[1], { x: 9.9, y: oy - 0.01, w: 2.55, h: 0.42, fontFace: "Calibri", fontSize: 9, color: MUTED, margin: 0, lineSpacingMultiple: 1.0 });
  });
  s.addText("Also fixed for the end user: developer instructions no longer render in the UI; every third-party string is HTML-escaped, closing a stored-XSS hole; accessibility throughout; Chart.js served locally so charts render on an egress-restricted network.", {
    x: 7.15, y: 5.7, w: 5.25, h: 0.72, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.1,
  });

  card(s, 0.6, 6.55, 12.1, 0.5, { fill: TINT_RED, shadow: false });
  s.addText("Previously: the platform dropdown sat at the bottom of the page, inside the raw-data panel, drove only that one table, and omitted Twitch entirely — despite Twitch records being collected.", {
    x: 0.95, y: 6.55, w: 11.4, h: 0.5, fontFace: "Calibri", fontSize: 11, color: MUTED, valign: "middle", margin: 0,
  });

  footer(s, pres, 10);
}

// ---------------------------------------------------------------------
// Slide 11: Q6 — the AI daily briefing, and how long it should be
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Question 6 — The Daily Briefing", "First thing on the page, above the metrics");
  askedStrip(s, "“Could an AI-generated daily summary be incorporated into the dashboard? … Please also suggest how many words would be proper to present.”", 1.42, 0.72);

  const sections = [
    ["Headline", "one sentence naming the most important thing today", ACCENT],
    ["Narrative", "150–200 words of plain-English judgement", ACCENT],
    ["Watch today", "2–4 things to pay attention to", POS],
    ["Community risks", "anything that could become a PR problem, with a severity", NEG],
    ["Campaign opportunities", "discussions that could inspire content", POS],
    ["Changed since last snapshot", "movement against the previous stored day", NEU],
  ];
  card(s, 0.6, 2.3, 6.0, 3.05);
  eyebrow(s, 0.9, 2.44, 5.4, "What it returns, every refresh", MUTED);
  sections.forEach((sec, i) => {
    const sy = 2.78 + i * 0.4;
    s.addShape("ellipse", { x: 0.92, y: sy + 0.1, w: 0.11, h: 0.11, fill: { color: sec[2] }, line: { type: "none" } });
    s.addText(sec[0], { x: 1.15, y: sy, w: 2.0, h: 0.32, fontFace: "Calibri", fontSize: 11, bold: true, color: TEXT, valign: "middle", margin: 0 });
    s.addText(sec[1], { x: 3.15, y: sy, w: 3.25, h: 0.32, fontFace: "Calibri", fontSize: 9.5, color: MUTED, valign: "middle", margin: 0 });
  });

  card(s, 6.85, 2.3, 5.85, 3.05, { fill: TINT_BLUE });
  s.addText("150–200 words", { x: 7.15, y: 2.45, w: 5.2, h: 0.6, fontFace: "Cambria", fontSize: 30, bold: true, color: ACCENT, margin: 0 });
  s.addText("for the narrative — everything else as scannable bullets", { x: 7.15, y: 3.05, w: 5.2, h: 0.3, fontFace: "Calibri", fontSize: 11, color: TEXT, margin: 0 });
  bullets(s, 7.15, 3.42, 5.25, 1.8, [
    "Reads in 45–60 seconds — the real attention budget before standup",
    "Long enough for a judgement plus three or four points with specifics",
    "Below ~120 words it degrades into horoscope text",
    "Above ~250 words people skim, which is worse than a list",
  ], { fontSize: 10.5, spaceAfter: 4 });

  card(s, 0.6, 5.5, 12.1, 1.05, { fill: TINT_GREEN });
  eyebrow(s, 0.9, 5.6, 11.4, "Three constraints built into the prompt deliberately", POS);
  s.addText("It may not invent a comparison — with no earlier snapshot it must say so.     An empty risks section is a valid answer; it is told not to fill the section to look busy.     It must distinguish collected data from the labelled sample, and say so in the narrative.", {
    x: 0.9, y: 5.92, w: 11.5, h: 0.5, fontFace: "Calibri", fontSize: 10.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.05,
  });

  s.addText("The brief reports its own word count in the panel footer, so drift is visible. With no API key it is composed deterministically from the same figures — blunter, but never empty, and always labelled with which path produced it.", {
    x: 0.6, y: 6.62, w: 8.9, h: 0.4, fontFace: "Calibri", fontSize: 9.5, color: MUTED, italic: true, margin: 0,
  });
  s.addText("server/lib/briefing.js", { x: 9.6, y: 6.62, w: 3.1, h: 0.32, fontFace: "Consolas", fontSize: 10.5, color: ACCENT, align: "right", margin: 0 });

  footer(s, pres, 11);
}

// ---------------------------------------------------------------------
// Slide 12: Q8 — business value
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Question 8 — Business Value", "Each of your five questions is now computed, not left to the reader");

  const rows = [
    ["What should we pay attention to today?", "“Watch today” in the briefing, ranked, each naming a game or theme", "lib/briefing.js", ACCENT],
    ["Are there community risks?", "Risk detection from two independent sources, severity-scored and ranked", "detectRisks", NEG],
    ["Emerging trends needing a response?", "Statistical spike detection, plus theme movement against the last snapshot", "detectSpikes", NEU],
    ["Discussions that could inspire campaigns?", "Questions clustered by topical overlap, plus highest-impact posts", "clusterQuestions", POS],
    ["What changed significantly?", "Day-over-day deltas on sentiment, volume, engagement and theme counts", "computeDeltas", PURPLE],
  ];

  let y = 1.62;
  rows.forEach((r) => {
    card(s, 0.6, y, 12.1, 0.78);
    s.addShape("roundRect", { x: 0.85, y: y + 0.14, w: 0.1, h: 0.5, rectRadius: 0.05, fill: { color: r[3] }, line: { type: "none" } });
    s.addText(r[0], { x: 1.15, y: y + 0.08, w: 4.0, h: 0.62, fontFace: "Calibri", fontSize: 11.5, bold: true, color: TEXT, valign: "middle", margin: 0, lineSpacingMultiple: 1.0 });
    s.addText(r[1], { x: 5.3, y: y + 0.08, w: 5.5, h: 0.62, fontFace: "Calibri", fontSize: 10.5, color: MUTED, valign: "middle", margin: 0, lineSpacingMultiple: 1.05 });
    s.addText(r[2], { x: 10.95, y: y + 0.08, w: 1.6, h: 0.62, fontFace: "Consolas", fontSize: 9.5, color: r[3], valign: "middle", align: "right", margin: 0 });
    y += 0.88;
  });

  card(s, 0.6, 6.05, 12.1, 1.0, { fill: TINT_RED });
  eyebrow(s, 0.9, 6.14, 11.4, "Three of these were described in v1 but never implemented", NEG);
  s.addText("Spikes were hardcoded into the synthetic data generator and then narrated as findings.     “Recurring questions” was text.endsWith(\"?\"), sorted by score — it never tested recurrence.     Risk detection did not exist at all.", {
    x: 0.9, y: 6.45, w: 11.5, h: 0.5, fontFace: "Calibri", fontSize: 10.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.05,
  });

  footer(s, pres, 12);
}

// ---------------------------------------------------------------------
// Slide 13: Q9 — the source code and handover
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Question 9 — The Deliverable", "Confirmed: the repository is the deliverable in full");
  askedStrip(s, "“Please confirm that the final deliverable will include the complete source code. The source code will then be deployed internally by the technical team.”", 1.42, 0.72);

  card(s, 0.6, 2.3, 6.0, 3.9);
  eyebrow(s, 0.9, 2.48, 5.4, "Prepared for your technical team", POS);
  bullets(s, 0.9, 2.85, 5.45, 3.2, [
    ".env.example — every variable, and what happens when it is absent",
    "It runs with no credentials at all; unconfigured sources are labelled on screen",
    "Lockfiles committed at the root and in server/",
    "render.yaml declares seven credentials and two behaviour flags",
    "vercel.json rewritten — the previous one was schema-invalid and would not have deployed",
    "Chart.js vendored and committed, so charts render without CDN access",
    "GET /api/health reports exactly what is configured",
  ], { fontSize: 11, spaceAfter: 5 });

  card(s, 6.85, 2.3, 5.85, 1.85, { fill: TINT_BLUE });
  eyebrow(s, 7.15, 2.42, 5.2, "Two operational notes", ACCENT);
  s.addText("Day-over-day deltas need durable storage. Free-tier Render and Vercel have ephemeral filesystems, so point SNAPSHOT_DIR at a mounted volume to keep history.", {
    x: 7.15, y: 2.74, w: 5.25, h: 0.5, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, lineSpacingMultiple: 1.08,
  });
  s.addText("Semantic scoring calls a paid API per new record. Scoring is cached by content hash and sample rows are never sent, so cost scales with new comments, not with dashboard opens.", {
    x: 7.15, y: 3.3, w: 5.25, h: 0.6, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, lineSpacingMultiple: 1.08,
  });

  card(s, 6.85, 4.3, 5.85, 1.9, { fill: TINT_RED });
  eyebrow(s, 7.15, 4.42, 5.2, "Credential hygiene", NEG);
  s.addText("The Discord bot token and the Twitch client secret were shared in chat during earlier work.", {
    x: 7.15, y: 4.74, w: 5.25, h: 0.4, fontFace: "Calibri", fontSize: 10.5, color: TEXT, margin: 0, lineSpacingMultiple: 1.05,
  });
  s.addText("No secrets are present in git history — we checked — but both should be regenerated before this goes into a real business environment: Discord in the Developer Portal, Twitch in the developer console.", {
    x: 7.15, y: 5.18, w: 5.25, h: 0.8, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, lineSpacingMultiple: 1.08,
  });

  whereLine(s, "this repository — server/, scripts/, report/, config and datasets", 6.5);
  footer(s, pres, 13);
}

// ---------------------------------------------------------------------
// Slide 14: Two gaps closed that were not asked about
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Not On Your List", "Two gaps we found while working through it, and closed");

  const gaps = [
    {
      title: "Reddit was never implemented",
      was: "Every Reddit row in v1 was synthetic. Reddit was not partly built — there was no Reddit code at all, and the report described its figures as findings.",
      now: "Live through the official OAuth API: top posts over a trailing week, recent comments, and subreddit metadata. Application-only, read-only, identifying User-Agent. No scraping, no unauthenticated endpoints, no rate-limit evasion.",
      color: NEG,
    },
    {
      title: "Themes only existed on synthetic rows",
      was: "Themes were mapped onto the generated data. Nothing assigned a theme to a real comment, so the theme chart could never reflect live conversation.",
      now: "The semantic layer assigns every live record one of 17 controlled labels, so themes aggregate across all four channels. The honest caveat: on a lexicon-only run, with no API key, live records still carry no theme.",
      color: NEU,
    },
  ];

  gaps.forEach((g, i) => {
    const x = 0.6 + i * 6.25;
    card(s, x, 1.7, 5.85, 4.6);
    s.addShape("roundRect", { x: x + 0.02, y: 1.95, w: 0.1, h: 4.1, rectRadius: 0.05, fill: { color: g.color }, line: { type: "none" } });
    s.addText(g.title, { x: x + 0.35, y: 1.92, w: 5.2, h: 0.45, fontFace: "Cambria", fontSize: 17, bold: true, color: TEXT, margin: 0 });
    eyebrow(s, x + 0.35, 2.52, 5.2, "In version 1", NEG);
    s.addText(g.was, { x: x + 0.35, y: 2.84, w: 5.2, h: 1.1, fontFace: "Calibri", fontSize: 11, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.12 });
    eyebrow(s, x + 0.35, 4.05, 5.2, "Now", POS);
    s.addText(g.now, { x: x + 0.35, y: 4.37, w: 5.2, h: 1.7, fontFace: "Calibri", fontSize: 11, color: TEXT, margin: 0, valign: "top", lineSpacingMultiple: 1.12 });
  });

  card(s, 0.6, 6.45, 12.1, 0.6, { fill: TINT_BLUE });
  s.addText("Neither was on your list. Both would have quietly undermined the answers to the questions that were.", {
    x: 0.95, y: 6.5, w: 11.4, h: 0.5, fontFace: "Calibri", fontSize: 12, color: TEXT, valign: "middle", margin: 0,
  });

  footer(s, pres, 14);
}

// ---------------------------------------------------------------------
// Slide 15: Honest limitations
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Limitations", "Stated plainly — a tool whose limits are unclear is more dangerous than one that is less capable");

  const left = [
    ["The sample data still ships, on by default", "452 illustrative rows drawn from only 63 distinct text strings. Its 46 question rows are seven distinct questions. Absolute figures from a default run are not measurements."],
    ["Sample rows are not scored like live rows", "They are pre-scored by the lexicon, never sent to the semantic layer, and always carry no risk, no region and no sarcasm."],
    ["Nobody has measured the scorer", "There is no hand-labelled validation set. It is better than a lexicon on the cases it was built for — that is an argument, not an accuracy figure."],
    ["Non-English text is unvalidated", "Nobody has checked whether a Simplified Chinese comment is scored as reliably as an English one. For an agency working between China and the West, this is the most important open assumption."],
  ];
  const right = [
    ["The engagement ceilings are guesses, honestly labelled", "Calibration constants from observed orders of magnitude, not licensed benchmarks. Re-tune them against your own campaign data before client reporting."],
    ["Regional splits are coarse today", "Global publisher channels collapse into one bucket, and a meaningful share of records will read Undetermined until regional sources are configured."],
    ["Twitch sentiment should be read sceptically", "Clip titles are promotional copy written to attract clicks, not player opinion."],
    ["Nothing is scheduled and nothing alerts", "Collection happens when someone opens the page. A risk appears on a dashboard; it does not email, message or page anyone."],
  ];

  [left, right].forEach((col, ci) => {
    const x = 0.6 + ci * 6.25;
    let y = 1.7;
    col.forEach((item) => {
      card(s, x, y, 5.85, 1.12);
      s.addText(item[0], { x: x + 0.3, y: y + 0.11, w: 5.25, h: 0.32, fontFace: "Calibri", fontSize: 12, bold: true, color: NEG, margin: 0 });
      s.addText(item[1], { x: x + 0.3, y: y + 0.43, w: 5.25, h: 0.62, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, valign: "top", lineSpacingMultiple: 1.1 });
      y += 1.22;
    });
  });

  s.addText("Also true: two snapshots are not a trend. There is no deduplication, bot filtering or influencer weighting. Discord coverage is one test channel deep. Without an API key the theme, risk and question panels run on a much thinner signal. The API has no authentication. This is a prototype, not a product.", {
    x: 0.6, y: 6.6, w: 12.1, h: 0.5, fontFace: "Calibri", fontSize: 10.5, color: MUTED, italic: true, margin: 0, lineSpacingMultiple: 1.08,
  });

  footer(s, pres, 15);
}

// ---------------------------------------------------------------------
// Slide 16: What we would do next
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  titleBar(s, "Next", "In the order we would actually do it");

  const next = [
    ["Build a hand-labelled validation set", "200 records per platform, scored by a human and measured against the model — including a non-English portion. Until it exists we can demonstrate quality but not quantify it.", NEG],
    ["Add regional sources", "Per-region publisher channels, language-specific subreddits, regional Discord servers. Configuration, not code — and the change that makes the region split matter for your China/West work.", ACCENT],
    ["Schedule automatic collection", "Daily and unattended, so trends accumulate without someone remembering to open the page. Every baseline and delta depends on it.", ACCENT],
    ["Add alerting on the risk thresholds", "The detection logic already exists. Alerting turns community monitoring from something someone checks into something proactive.", NEU],
    ["Re-tune the Engagement Index ceilings", "Against your own campaign benchmarks, so the index reflects RS's reality rather than a reasonable guess.", NEU],
    ["Pilot with one account team, one real title", "A few weeks, with a standing instruction to note every time the tool was wrong. Their feedback should set the next build, not our guess.", POS],
  ];

  let y = 1.7;
  next.forEach((n, i) => {
    card(s, 0.6, y, 12.1, 0.82);
    s.addShape("ellipse", { x: 0.85, y: y + 0.17, w: 0.48, h: 0.48, fill: { color: n[2] }, line: { type: "none" } });
    s.addText(String(i + 1), { x: 0.85, y: y + 0.17, w: 0.48, h: 0.48, align: "center", valign: "middle", fontFace: "Calibri", fontSize: 15, bold: true, color: BG_DARK, margin: 0 });
    s.addText(n[0], { x: 1.5, y: y + 0.1, w: 3.9, h: 0.62, fontFace: "Calibri", fontSize: 13, bold: true, color: TEXT, valign: "middle", margin: 0, lineSpacingMultiple: 1.0 });
    s.addText(n[1], { x: 5.5, y: y + 0.08, w: 7.0, h: 0.66, fontFace: "Calibri", fontSize: 10.5, color: MUTED, valign: "middle", margin: 0, lineSpacingMultiple: 1.08 });
    y += 0.88;
  });

  s.addText("The first two are what turn this from a working prototype into something whose numbers can be put in front of a client.", {
    x: 0.6, y: 6.98, w: 8.5, h: 0.3, fontFace: "Calibri", fontSize: 10, color: MUTED, italic: true, margin: 0,
  });
  s.addText("16", { x: 12.4, y: 7.15, w: 0.4, h: 0.3, fontFace: "Calibri", fontSize: 9, color: MUTED, align: "right", margin: 0 });
}

// ---------------------------------------------------------------------
// Slide 17: Closing / how to run it
// ---------------------------------------------------------------------
{
  const s = bgSlide(pres);
  s.addShape("ellipse", { x: -1.5, y: -1.5, w: 5, h: 5, fill: { color: ACCENT, transparency: 90 }, line: { type: "none" } });
  s.addShape("ellipse", { x: 11.2, y: 5.0, w: 3.4, h: 3.4, fill: { color: PURPLE, transparency: 90 }, line: { type: "none" } });

  s.addText("Thank you", { x: 0.8, y: 0.9, w: 11, h: 0.9, fontFace: "Cambria", fontSize: 34, bold: true, color: TEXT, margin: 0 });
  s.addText("Everything described here is running in the repository you have been given.", {
    x: 0.8, y: 1.85, w: 11, h: 0.4, fontFace: "Calibri", fontSize: 14, color: MUTED, margin: 0,
  });

  card(s, 0.8, 2.5, 5.6, 2.5, { fill: TINT_BLUE });
  eyebrow(s, 1.1, 2.65, 5.0, "How to run it", ACCENT);
  s.addText("cd server\ncp .env.example .env\nnpm install\nnpm start", {
    x: 1.1, y: 3.0, w: 5.0, h: 1.2, fontFace: "Consolas", fontSize: 13, color: TEXT, margin: 0, lineSpacingMultiple: 1.25,
  });
  s.addText("Then open http://localhost:3000. Nothing in .env is mandatory — with an empty file the dashboard still boots, and every unconfigured source is labelled on screen.", {
    x: 1.1, y: 4.25, w: 5.0, h: 0.65, fontFace: "Calibri", fontSize: 10, color: MUTED, margin: 0, lineSpacingMultiple: 1.1,
  });

  card(s, 6.75, 2.5, 5.8, 2.5);
  eyebrow(s, 7.05, 2.65, 5.2, "Before quoting a figure to a client", POS);
  bullets(s, 7.05, 3.0, 5.2, 1.9, [
    "Configure credentials for as many channels as you can",
    "Set DEMO_DATA=false so the sample is excluded entirely",
    "Set ANTHROPIC_API_KEY so sentiment is semantic",
    "Let it run a fortnight, with snapshots on durable storage",
  ], { fontSize: 10.5, spaceAfter: 5 });

  card(s, 0.8, 5.25, 11.75, 1.05);
  eyebrow(s, 1.1, 5.36, 11.2, "The written deliverable", MUTED);
  s.addText("GAMING_COMMUNITY_PULSE_REPORT.md   ·   CLIENT_ANSWERS.md   ·   PLATFORM_LANDSCAPE.md   ·   TOOL_LANDSCAPE.md   ·   README.md   ·   the running dashboard in server/", {
    x: 1.1, y: 5.68, w: 11.2, h: 0.45, fontFace: "Consolas", fontSize: 10.5, color: ACCENT, margin: 0,
  });

  s.addText("No current sentiment, engagement or record figures appear anywhere in this deck. They come from a live run and change on every refresh — the defensible claim today is about the tool, not about the titles.", {
    x: 0.8, y: 6.55, w: 11.75, h: 0.5, fontFace: "Calibri", fontSize: 10.5, color: MUTED, italic: true, margin: 0, lineSpacingMultiple: 1.08,
  });
}

const outFile = path.join(__dirname, "..", "slides", "summary_deck.pptx");
pres.writeFile({ fileName: outFile }).then(() => console.log("wrote " + outFile));
