#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Markdown → Word converter for the project's written deliverables.
//
// The three original docx builders hardcode their content, which means the Word
// versions drift away from the markdown the moment either is edited. This
// converter renders a markdown file directly, so the .docx is always a faithful
// rendering of the source document rather than a parallel copy.
//
// Handles the subset the deliverables actually use: ATX headings, paragraphs,
// bullet and numbered lists, pipe tables, blockquotes, horizontal rules, and
// inline bold / italic / code / links.
//
// Usage:
//   node scripts/md_to_docx.js report/CLIENT_ANSWERS.md report/client_answers.docx
//   node scripts/md_to_docx.js src.md out.docx "Findings Summary"   # one section only
//   node scripts/md_to_docx.js            # converts the default deliverable set
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle,
} = require("docx");

const PAGE_WIDTH_DXA = 9360; // usable width on US Letter with 1.5cm margins
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
                  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

// --- inline formatting -----------------------------------------------------

/** Splits a line into TextRuns, honouring **bold**, *italic*, `code` and [links](url). */
function inline(text, base = {}) {
  const runs = [];
  // Order matters: links first (their labels may contain other markup), then
  // code (its contents must not be re-parsed), then bold, then italic.
  const pattern = /(\[[^\]]+\]\([^)]+\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;
  let last = 0;
  let m;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: decode(text.slice(last, m.index)), ...base }));
    const tok = m[0];

    if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]"));
      const url = tok.slice(tok.indexOf("(") + 1, -1);
      runs.push(new TextRun({ text: decode(label), ...base, color: "1A4FBF", underline: {} }));
      runs.push(new TextRun({ text: ` (${url})`, ...base, size: 16, color: "777777" }));
    } else if (tok.startsWith("`")) {
      runs.push(new TextRun({ text: decode(tok.slice(1, -1)), ...base, font: "Consolas", size: 19, color: "8A2B6B" }));
    } else if (tok.startsWith("**")) {
      runs.push(new TextRun({ text: decode(tok.slice(2, -2)), ...base, bold: true }));
    } else {
      runs.push(new TextRun({ text: decode(tok.slice(1, -1)), ...base, italics: true }));
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) runs.push(new TextRun({ text: decode(text.slice(last)), ...base }));
  return runs.length ? runs : [new TextRun({ text: "", ...base })];
}

function decode(s) {
  return s
    .replace(/&mdash;/g, "—").replace(/&minus;/g, "−").replace(/&hellip;/g, "…")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

// --- block parsing ---------------------------------------------------------

function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }
function isTableDivider(line) { return /^\s*\|[\s:|-]+\|\s*$/.test(line); }
function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function buildTable(rows) {
  const header = rows[0];
  const body = rows.slice(1);
  const cols = header.length;
  const width = Math.floor(PAGE_WIDTH_DXA / cols);
  const widths = new Array(cols).fill(width);

  const makeCell = (text, isHeader) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: isHeader ? { type: ShadingType.CLEAR, fill: "1F2937" } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [
        new Paragraph({
          spacing: { after: 0 },
          children: inline(text, isHeader ? { bold: true, color: "FFFFFF", size: 19 } : { size: 19 }),
        }),
      ],
    });

  return new Table({
    width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((c) => makeCell(c, true)) }),
      ...body.map((r) => {
        // Pad or trim so a malformed row can't throw off the whole table.
        const cells = r.slice(0, cols);
        while (cells.length < cols) cells.push("");
        return new TableRow({ children: cells.map((c) => makeCell(c, false)) });
      }),
    ],
  });
}

function convert(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank
    if (!line.trim()) { i++; continue; }

    // horizontal rule
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      out.push(new Paragraph({
        text: "",
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 6 } },
        spacing: { before: 120, after: 200 },
      }));
      i++; continue;
    }

    // fenced code block — rendered verbatim in a monospace block
    if (/^\s*```/.test(line)) {
      i++;
      const code = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      for (const c of code) {
        out.push(new Paragraph({
          spacing: { after: 0 },
          shading: { type: ShadingType.CLEAR, fill: "F4F5F7" },
          children: [new TextRun({ text: c || " ", font: "Consolas", size: 18 })],
        }));
      }
      out.push(new Paragraph({ text: "", spacing: { after: 140 } }));
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(new Paragraph({
        heading: HEADINGS[level - 1],
        spacing: { before: level === 1 ? 260 : 240, after: 130 },
        children: inline(h[2].replace(/\s*#+\s*$/, "")),
      }));
      i++; continue;
    }

    // table
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const rows = [splitRow(line)];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      out.push(buildTable(rows));
      out.push(new Paragraph({ text: "", spacing: { after: 160 } }));
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(new Paragraph({
        spacing: { after: 160 },
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: "9AA1B4", space: 12 } },
        children: inline(quote.join(" "), { italics: true, color: "555555" }),
      }));
      continue;
    }

    // bullet list
    if (/^\s*[-*+]\s+/.test(line)) {
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const indent = Math.floor((lines[i].match(/^\s*/)[0].length) / 2);
        out.push(new Paragraph({
          bullet: { level: Math.min(indent, 2) },
          spacing: { after: 70 },
          children: inline(lines[i].replace(/^\s*[-*+]\s+/, "")),
        }));
        i++;
      }
      out.push(new Paragraph({ text: "", spacing: { after: 90 } }));
      continue;
    }

    // numbered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      let n = 1;
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        out.push(new Paragraph({
          spacing: { after: 70 },
          indent: { left: 360, hanging: 240 },
          children: [new TextRun({ text: `${n}.  `, bold: true }), ...inline(lines[i].replace(/^\s*\d+[.)]\s+/, ""))],
        }));
        n++; i++;
      }
      out.push(new Paragraph({ text: "", spacing: { after: 90 } }));
      continue;
    }

    // paragraph — join soft-wrapped lines
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|---)/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    out.push(new Paragraph({ spacing: { after: 150 }, children: inline(para.join(" ")) }));
  }

  return out;
}

/**
 * Extracts a single `## Section` (up to the next heading of the same level) so
 * the three per-outcome Word documents the brief asks for can be generated from
 * the one report, instead of being maintained as parallel copies that drift.
 */
function extractSection(md, heading) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.replace(/^##\s+/, "").trim() === heading.trim());
  if (start === -1) throw new Error(`Section "${heading}" not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  // Promote to H1 so the extracted section reads as its own document.
  const body = lines.slice(start, end);
  body[0] = body[0].replace(/^##\s+/, "# ");
  return body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function build(srcPath, outPath, section) {
  let md = fs.readFileSync(srcPath, "utf-8");
  if (section) {
    md = `${extractSection(md, section)}\n`;
  }
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { line: 300 } } },
        heading1: { run: { size: 34, bold: true, color: "111827" } },
        heading2: { run: { size: 27, bold: true, color: "1F2937" } },
        heading3: { run: { size: 23, bold: true, color: "374151" } },
        heading4: { run: { size: 22, bold: true, color: "4B5563" } },
      },
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      children: convert(md),
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${(buffer.length / 1024).toFixed(0)} KB) from ${srcPath}`);
}

const REPORT = "report/GAMING_COMMUNITY_PULSE_REPORT.md";

const DEFAULTS = [
  // Standalone documents
  ["report/CLIENT_ANSWERS.md", "report/client_answers.docx"],
  ["report/PLATFORM_LANDSCAPE.md", "report/platform_landscape.docx"],
  ["report/TOOL_LANDSCAPE.md", "report/tool_landscape.docx"],
  [REPORT, "report/gaming_community_pulse_report.docx"],
  // The brief's three outcome documents, sliced out of the one report so they
  // can never drift away from it the way the hand-written v1 copies did.
  [REPORT, "report/findings_summary.docx", "Findings Summary"],
  [REPORT, "report/methodology_and_limitations.docx", "Methodology, Scope & Limitations"],
  [REPORT, "report/recommendations.docx", "Recommendations for Marketing Use"],
];

async function main() {
  const [src, out, section] = process.argv.slice(2);
  const root = path.join(__dirname, "..");
  if (src && out) {
    await build(path.resolve(root, src), path.resolve(root, out), section);
    return;
  }
  for (const [s, o, sec] of DEFAULTS) {
    const sp = path.join(root, s);
    if (!fs.existsSync(sp)) { console.warn(`Skipping ${s} — not found.`); continue; }
    try {
      await build(sp, path.join(root, o), sec);
    } catch (err) {
      console.warn(`Skipping ${o} — ${err.message}`);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
