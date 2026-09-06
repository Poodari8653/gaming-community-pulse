```js
// ---------------------------------------------------------------------------
// Daily snapshot store — Supabase
//
// Stores one compact JSON snapshot per day in the Supabase
// `daily_snapshots` table.
//
// The rest of the application continues to use the same interface:
//   saveSnapshot(snapshot)
//   readSnapshot(date)
//   listSnapshots()
//   previousSnapshot(beforeDate)
//   storageInfo()
//
// Supabase credentials are supplied through environment variables:
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY
// ---------------------------------------------------------------------------

const RETENTION_DAYS = 90;

let client = null;
let initialised = false;
let initError = null;

function getClient() {
  if (initialised) return client;

  initialised = true;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    initError = "SUPABASE_URL or SUPABASE_SECRET_KEY is not configured";
    return null;
  }

  try {
    // Use the Supabase REST API directly so no additional npm package
    // is required.
    client = {
      url: url.replace(/\/$/, ""),
      key,
    };
  } catch (err) {
    initError = err.message;
    client = null;
  }

  return client;
}

async function supabaseRequest(endpoint, options = {}) {
  const supabase = getClient();

  if (!supabase) {
    throw new Error(initError || "Supabase is not configured");
  }

  const response = await fetch(`${supabase.url}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body}`);
  }

  if (response.status === 204) return null;

  return response.json();
}

/**
 * Writes (or overwrites) today's snapshot.
 *
 * `date` is the primary key, so upsert replaces an existing snapshot
 * for the same day.
 */
async function saveSnapshot(snapshot) {
  try {
    await supabaseRequest("daily_snapshots?on_conflict=date", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        date: snapshot.date,
        generated_at: snapshot.generated_at,
        overall: snapshot.overall,
        games_summary: snapshot.games_summary,
        platform_summary: snapshot.platform_summary,
        region_summary: snapshot.region_summary,
        themes: snapshot.themes,
        risk_count: snapshot.risk_count,
        provenance: snapshot.provenance,
      }),
    });

    return {
      saved: true,
      mode: "supabase",
    };
  } catch (err) {
    return {
      saved: false,
      mode: "supabase",
      error: err.message,
    };
  }
}

/**
 * Lists stored snapshot dates, newest first.
 */
async function listSnapshots() {
  try {
    const rows = await supabaseRequest(
      "daily_snapshots?select=date&order=date.desc"
    );

    return rows
      .map((row) => row.date)
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Reads one daily snapshot.
 */
async function readSnapshot(date) {
  try {
    const rows = await supabaseRequest(
      `daily_snapshots?select=*&date=eq.${encodeURIComponent(date)}&limit=1`
    );

    return rows.length ? rows[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Returns the most recent snapshot strictly older than beforeDate.
 *
 * This preserves the behaviour of the original filesystem store:
 * the comparison baseline is the most recent earlier snapshot, rather
 * than necessarily yesterday.
 */
async function previousSnapshot(beforeDate) {
  try {
    const rows = await supabaseRequest(
      `daily_snapshots?select=*&date=lt.${encodeURIComponent(
        beforeDate
      )}&order=date.desc&limit=1`
    );

    return rows.length ? rows[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Deletes snapshots older than RETENTION_DAYS.
 *
 * This keeps the same 90-day retention policy as the original store.
 */
async function pruneOld() {
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 86400_000
  )
    .toISOString()
    .slice(0, 10);

  try {
    await supabaseRequest(
      `daily_snapshots?date=lt.${encodeURIComponent(cutoff)}`,
      {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      }
    );
  } catch (_) {
    // Retention cleanup is best-effort.
  }
}

function storageInfo() {
  const configured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
  );

  return {
    mode: configured ? "supabase" : "unavailable",
    directory: null,
    snapshots_held: null,
    retention_days: RETENTION_DAYS,
    durable: configured,
    configured,
    error: configured ? null : initError,
  };
}

module.exports = {
  saveSnapshot,
  readSnapshot,
  listSnapshots,
  previousSnapshot,
  storageInfo,
  pruneOld,
};
```
