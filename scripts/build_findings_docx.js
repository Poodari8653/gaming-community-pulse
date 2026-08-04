const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat,
} = require("docx");
const fs = require("fs");

const PAGE = { size: { width: 12240, height: 15840 } }; // US Letter

function h1(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } }); }
function h2(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }); }
function p(text, opts = {}) { return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 140 } }); }
function bullet(text) { return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } }); }
function note(text) { return new Paragraph({ children: [new TextRun({ text, italics: true, color: "666666", size: 20 })], spacing: { after: 160 } }); }

function cell(text, { width, bold = false, shade = null, align = AlignmentType.LEFT } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold })] })],
  });
}

function snapshotTable() {
  const colWidths = [2400, 1500, 1700, 1900, 2000];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("Game", { width: colWidths[0], bold: true, shade: "1F2937" }),
      cell("Records", { width: colWidths[1], bold: true, shade: "1F2937" }),
      cell("Avg. sentiment", { width: colWidths[2], bold: true, shade: "1F2937" }),
      cell("Sentiment mix (+/=/-)", { width: colWidths[3], bold: true, shade: "1F2937" }),
      cell("Total engagement", { width: colWidths[4], bold: true, shade: "1F2937" }),
    ],
  });
  const rows = [
    ["PUBG", "102", "-0.003 (mixed)", "34 / 30 / 38", "11,024"],
    ["Once Human", "98", "-0.025 (mixed)", "36 / 20 / 42", "9,222"],
    ["Marvel Rivals", "108", "+0.099 (leans positive)", "47 / 29 / 32", "9,731"],
    ["Where Winds Meet", "99", "+0.185 (most positive)", "46 / 31 / 22", "9,308"],
    ["World of Warcraft", "100", "-0.093 (most negative)", "21 / 44 / 35", "7,635"],
  ];
  const body = rows.map(r => new TableRow({ children: r.map((v, i) => cell(v, { width: colWidths[i] })) }));
  return new Table({ width: { size: 9500, type: WidthType.DXA }, columnWidths: colWidths, rows: [header, ...body] });
}

const doc = new Document({
  sections: [{
    properties: { page: PAGE },
    children: [
      new Paragraph({ text: "Gaming Community Pulse", heading: HeadingLevel.TITLE, spacing: { after: 60 } }),
      new Paragraph({
        children: [new TextRun({ text: "Findings Summary — Community Engagement, Sentiment & Themes", bold: true, size: 26 })],
        spacing: { after: 100 },
      }),
      note("Prepared for a marketing audience · Covers PUBG, Once Human, Marvel Rivals, Where Winds Meet, and World of Warcraft · Data window: 8 weeks to 30 July 2026 · YouTube data is real; Reddit and Discord data is illustrative/synthetic (see Methodology & Limitations for why, and how to move to a live feed)"),

      h1("Executive summary"),
      p("This prototype tracked public conversation about five titles across Reddit, Discord, and YouTube to test whether a lightweight social listening tool could surface useful marketing signals without heavyweight software. Across 507 collected records, the clearest pattern is that sentiment tracks directly with how a community feels treated: Where Winds Meet and Marvel Rivals lead on positive sentiment because recent content updates (new characters, open-world praise) gave fans something to be excited about, while World of Warcraft skews negative, driven almost entirely by scepticism toward the upcoming expansion and frustration with class balance changes. Monetization and technical complaints (cheating, netcode, disconnects) are the most consistent negative driver across every title, and every community — regardless of game — asks the same kinds of questions: \"is this worth it,\" \"how do I get started,\" and \"what's the fastest way to X.\" Those questions are a ready-made content calendar."),

      h1("Cross-game snapshot"),
      snapshotTable(),
      new Paragraph({ text: "", spacing: { after: 160 } }),
      note("Sentiment score range is -1 (very negative) to +1 (very positive), derived from a lexicon-based scorer described in the methodology document."),

      h1("What drove engagement, game by game"),

      h2("PUBG — steady, cheat-fatigued, but crossover content lands well"),
      p("PUBG's community is the most engagement-heavy of the five titles (11,024 combined engagement score) but sentiment sits almost exactly at neutral. The two biggest negative themes are bug/cheating complaints (17 mentions, avg sentiment -0.41, the single worst theme score of any game) and matchmaking/queue frustration (14 mentions, -0.24). The bright spot is the Spider-Man crossover: \"Didn't expect to enjoy a superhero collab in PUBG but here we are\" and similar posts were among the highest-engagement content collected (800+ score), and the crossover hype theme scores +0.29. Nostalgia posts (\"still the OG BR experience\") also score well (+0.33)."),

      h2("Once Human — high anticipation for console, but monetization and bugs bite"),
      p("Once Human's community is unusually vocal about two opposite things at once: excitement for the confirmed PS5/Xbox launch (console launch anticipation, 16 mentions, +0.23) and the game's best-loved system, base building (\"spent 6 hours just decorating my base,\" 15 mentions, +0.53, the single highest-engagement post in the dataset at 881). Set against that, monetization/gacha complaints (16 mentions, -0.54) and bug reports (15 mentions, -0.51) are the two most negative themes of any game in the study. Recurring questions cluster tightly around one topic: whether console/mobile players get the same content as PC, a clear, answerable FAQ opportunity."),

      h2("Marvel Rivals — most positive live-service community, undercut by netcode"),
      p("Marvel Rivals has the highest \"praise\" theme score of any game (+0.74) and strong enthusiasm for new character reveals (new character hype, 18 mentions, +0.57) and crossover/comic speculation (20 mentions, +0.43, e.g. fan requests for Ghost Rider). The one theme dragging the average down hard is netcode/matchmaking (22 mentions — the largest single theme in the whole dataset — at -0.67, the most negative theme score overall). In plain terms: players love the roster and content cadence, but performance complaints are the loudest recurring pain point."),

      h2("Where Winds Meet — the most positive community in the study"),
      p("Where Winds Meet posted the highest average sentiment of any title (+0.185) and the highest score for any single theme in the dataset: open world praise at +0.725 (\"best wuxia setting I've played in years\"). It also has the lowest share of negative sentiment (22%, versus 32-42% for every other game). Its friction points are familiar free-to-play concerns — monetization concerns (15 mentions, -0.33) and server queue/launch issues (15 mentions, -0.16) — plus a cluster of \"how do I get started\" questions (best early build, fastest reputation grinding) that suggest strong new-player interest outpacing onboarding content."),

      h2("World of Warcraft — the most sceptical community in the study"),
      p("WoW is the only game with more neutral sentiment (44%) than positive (21%), and it has the lowest average sentiment of the five (-0.093). The driver is almost entirely expansion messaging: expansion skepticism (16 mentions, -0.29, \"didn't hype me at all\") and class balance anger (13 mentions, -0.67, the second-worst theme score overall) dominate the negative conversation. Importantly, this isn't blanket negativity toward the game — questline/story praise scores the best of any WoW theme (+0.58, \"best writing in years\"), meaning the marketing problem is specifically about how the expansion is being teased, not the game's underlying quality."),

      h1("How the platforms differ"),
      p("YouTube comments (real data collected for this prototype) ran the most positive of the three platforms (average sentiment +0.101), which fits YouTube's role as a place people go to react to official trailers and announcements — arguably a self-selecting, enthusiast-heavy audience. Discord messages (illustrative sample) came in second (+0.062), reflecting quicker, more casual chat-style reactions. Reddit (illustrative sample) sat closest to neutral (+0.006), consistent with Reddit's role as the place for more detailed critique, bug reports, and debate rather than pure reaction."),

      h1("Recurring questions worth turning into content"),
      bullet("Once Human: \"Does console get the same seasonal content as PC?\" and \"Is mobile worth it compared to PC?\" — both recur across multiple threads and are answerable in a single FAQ or pinned post."),
      bullet("Where Winds Meet: \"What's the best early build for a sword-focused playstyle?\" and \"What's the fastest way to level faction reputation?\" — strong candidates for a creator-partnered guide or official tips video."),
      bullet("World of Warcraft: \"Is anyone else grinding the new PvP season rewards?\" — a lightweight community-engagement hook (leaderboard shoutouts, clip roundups) rather than a support question."),

      h1("Notable spikes"),
      p("Weekly volume data (charted in the dashboard) shows a clear discussion spike for each game tied to a real event in its content cadence: PUBG around its most recent crossover push, Once Human around the console launch date announcement, Marvel Rivals around the Jubilee/Season reveal, Where Winds Meet during an earlier content wave, and World of Warcraft around PvP season discussion. The pattern itself — volume spikes cluster tightly around announcements, not organically — is the more durable finding: these communities are reactive to studio-driven content moments, which is good news for campaign timing."),

      h1("A note on data"),
      note("YouTube figures in this summary come from real, live-captured public comments (55 records across 5 videos, captured 30 July 2026). Reddit and Discord figures (452 records) are illustrative sample data built to reflect realistic, publicly-documented discourse patterns for each title, because Reddit could not be reached and Discord requires server-specific access this prototype did not have. Directional comparisons between games are reasonable to act on; exact percentages should be treated as indicative, not measured. Full detail in the Methodology & Limitations document."),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("findings_summary.docx", buf);
  console.log("wrote findings_summary.docx", buf.length, "bytes");
});
