// ---------------------------------------------------------------------------
// Daily snapshot store — Supabase-backed.
//
// Stores one compact aggregate snapshot per day in public.daily_snapshots.
// Uses Supabase REST directly so it works reliably in Vercel Services without
// depending on @supabase/supabase-js at runtime.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const RETENTION_DAYS = 90;

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Writes or overwrites today's snapshot. Never throws. */
async function saveSnapshot(snapshot) {
  if (!isConfigured()) {
    return {
      saved: false,
      mode: "unavailable",
      error: "Supabase snapshot storage is not configured",
    };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_snapshots?on_conflict=date`,
      {
        method: "POST",
        headers: headers({
          Prefer: "resolution=merge-duplicates,return=minimal",
        }),
        body: JSON.stringify([snapshot]),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase snapshot save failed: ${response.status} ${body}`);
    }

    await pruneOld();

    return {
      saved: true,
      mode: "supabase",
    };
  } catch (err) {
    console.error(err.message);

    return {
      saved: false,
      mode: "supabase",
      error: err.message,
    };
  }
}

/** Lists stored snapshot dates, newest first. */
async function listSnapshots() {
  if (!isConfigured()) return [];

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_snapshots?select=date&order=date.desc`,
      {
        headers: headers(),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase snapshot list failed: ${response.status} ${body}`);
    }

    const rows = await response.json();
    return rows.map((row) => row.date);
  } catch (err) {
    console.error(err.message);
    return [];
  }
}

/** Reads one snapshot by exact date. */
async function readSnapshot(date) {
  if (!isConfigured()) return null;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_snapshots?date=eq.${encodeURIComponent(
        date
      )}&limit=1`,
      {
        headers: headers(),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase snapshot read failed: ${response.status} ${body}`);
    }

    const rows = await response.json();
    return rows[0] || null;
  } catch (err) {
    console.error(err.message);
    return null;
  }
}

/**
 * Returns the newest snapshot strictly older than beforeDate.
 */
async function previousSnapshot(beforeDate) {
  if (!isConfigured()) return null;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_snapshots?date=lt.${encodeURIComponent(
        beforeDate
      )}&order=date.desc&limit=1`,
      {
        headers: headers(),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Supabase previous snapshot read failed: ${response.status} ${body}`
      );
    }

    const rows = await response.json();
    return rows[0] || null;
  } catch (err) {
    console.error(err.message);
    return null;
  }
}

/** Deletes snapshots older than the retention window. */
async function pruneOld() {
  if (!isConfigured()) return;

  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 86400_000
  )
    .toISOString()
    .slice(0, 10);

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_snapshots?date=lt.${encodeURIComponent(
        cutoff
      )}`,
      {
        method: "DELETE",
        headers: headers({
          Prefer: "return=minimal",
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase snapshot prune failed: ${response.status} ${body}`);
    }
  } catch (err) {
    console.error(err.message);
  }
}

function storageInfo() {
  return {
    mode: isConfigured() ? "supabase" : "unavailable",
    directory: null,
    snapshots_held: null,
    retention_days: RETENTION_DAYS,
    durable: isConfigured(),
  };
}

module.exports = {
  saveSnapshot,
  readSnapshot,
  listSnapshots,
  previousSnapshot,
  storageInfo,
};