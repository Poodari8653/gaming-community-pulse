// ---------------------------------------------------------------------------
// Daily snapshot store.
//
// The dashboard has to answer "what changed since yesterday?" (Questionary §6
// and §8), which needs history. The previous build had none — its only state
// was a 5-minute in-memory cache that died with the process, so no delta was
// computable at all.
//
// This writes one compact JSON snapshot per day: aggregates only, no raw
// records, so the directory stays small (a few KB/day) and no user-authored
// text is persisted beyond the short examples already shown on screen.
//
// Storage location resolves in this order:
//   1. SNAPSHOT_DIR env var — set this to a mounted volume in production.
//   2. <repo>/data/snapshots — the default for local runs and Render.
//   3. os.tmpdir() — fallback for read-only filesystems (e.g. Vercel's
//      serverless bundle). Ephemeral, so deltas won't survive a cold start;
//      the dashboard reports that honestly rather than showing stale numbers.
// ---------------------------------------------------------------------------

const fs = require("fs");
const os = require("os");
const path = require("path");

const { createClient } = require("@supabase/supabase-js");

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
    : null;

const RETENTION_DAYS = 90;

let resolvedDir = null;
let resolvedMode = null;

function resolveDir() {
  if (resolvedDir) return resolvedDir;

  const candidates = [
    process.env.SNAPSHOT_DIR && { dir: process.env.SNAPSHOT_DIR, mode: "configured" },
    { dir: path.join(__dirname, "..", "..", "data", "snapshots"), mode: "repo" },
    { dir: path.join(os.tmpdir(), "gaming-community-pulse-snapshots"), mode: "ephemeral" },
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      fs.mkdirSync(c.dir, { recursive: true });
      fs.accessSync(c.dir, fs.constants.W_OK);
      resolvedDir = c.dir;
      resolvedMode = c.mode;
      return resolvedDir;
    } catch (_) {
      // try the next candidate
    }
  }

  resolvedDir = null;
  resolvedMode = "unavailable";
  return null;
}

function snapshotPath(date) {
  const dir = resolveDir();
  return dir ? path.join(dir, `${date}.json`) : null;
}

/** Writes (or overwrites) today's snapshot. Never throws — storage is best-effort. */
function saveSnapshot(snapshot) {
  const p = snapshotPath(snapshot.date);
  if (!p) return { saved: false, mode: resolvedMode };
  try {
    fs.writeFileSync(p, JSON.stringify(snapshot), "utf-8");
    pruneOld();
    return { saved: true, mode: resolvedMode, path: p };
  } catch (err) {
    return { saved: false, mode: resolvedMode, error: err.message };
  }
}

/** Lists stored snapshot dates, newest first. */
function listSnapshots() {
  const dir = resolveDir();
  if (!dir) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch (_) {
    return [];
  }
}

function readSnapshot(date) {
  const p = snapshotPath(date);
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

/**
 * The most recent snapshot strictly older than `beforeDate` — the baseline the
 * "what changed" panel compares against. Using the most recent *earlier* day
 * rather than literally yesterday means a weekend gap in collection still
 * produces a meaningful comparison.
 */
function previousSnapshot(beforeDate) {
  const earlier = listSnapshots().filter((d) => d < beforeDate);
  if (!earlier.length) return null;
  return readSnapshot(earlier[0]);
}

function pruneOld() {
  const dir = resolveDir();
  if (!dir) return;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString().slice(0, 10);
  for (const d of listSnapshots()) {
    if (d < cutoff) {
      try {
        fs.unlinkSync(path.join(dir, `${d}.json`));
      } catch (_) {
        /* ignore */
      }
    }
  }
}

function storageInfo() {
  resolveDir();
  return {
    mode: resolvedMode,
    directory: resolvedDir,
    snapshots_held: listSnapshots().length,
    retention_days: RETENTION_DAYS,
    durable: resolvedMode === "configured" || resolvedMode === "repo",
  };
}
async function saveRawRecords(rows) {
  if (!supabase || !Array.isArray(rows) || rows.length === 0) {
    return { saved: false, count: 0 };
  }

  const records = rows
    .filter((row) => !row.is_sample && row.data_type !== "sample")
    .map((row) => ({
      record_key: `${row.platform || ""}|${row.game || ""}|${row.source || ""}|${row.published_at || ""}|${row.author || ""}|${row.url || ""}|${row.text_content || row.text || ""}`,
      platform: row.platform || null,
      game: row.game || null,
      source: row.source || null,
      content_type: row.content_type || null,
      author: row.author || null,
      published_at: row.published_at || null,
      text_content: row.text_content || row.text || null,
      engagement: row.engagement || null,
      sentiment: row.sentiment || null,
      sentiment_score: row.sentiment_score || null,
      language: row.language || null,
      region: row.region || null,
      url: row.url || null,
      raw_data: row,
      collected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

  if (records.length === 0) {
    return { saved: false, count: 0 };
  }

  const { error } = await supabase
    .from("community_records")
    .upsert(records, { onConflict: "record_key" });

  if (error) {
    console.error("Supabase raw record save failed:", error.message);
    return { saved: false, count: 0, error: error.message };
  }

  return { saved: true, count: records.length };
}
module.exports = {saveSnapshot, readSnapshot, listSnapshots, previousSnapshot, storageInfo, saveRawRecords };
