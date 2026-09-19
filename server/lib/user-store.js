// ---------------------------------------------------------------------------
// User accounts, stored in Supabase.
//
// Talks to PostgREST with plain fetch, matching lib/supabase-store.js rather
// than pulling in the Supabase JS client -- the server has five dependencies
// and this needs no sixth.
//
// The table is created by server/sql/001_app_users.sql, which has to be run in
// the Supabase SQL editor once: PostgREST cannot execute DDL.
//
// SECURITY POSTURE
//   * Only ever handles password HASHES. Plaintext passwords are hashed in
//     lib/auth.js and never reach this module's storage calls.
//   * SUPABASE_SECRET_KEY bypasses Row Level Security, so it must stay
//     server-side. It is never sent to the browser and never logged.
//   * app_users has RLS enabled with no policies, so the publishable key
//     cannot read it even if it leaks.
// ---------------------------------------------------------------------------

const TABLE = "app_users";

function config() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY,
  };
}

function isConfigured() {
  const { url, key } = config();
  return Boolean(url && key);
}

function headers(extra = {}) {
  const { key } = config();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Normalises an email for storage and lookup: trimmed and lower-cased. */
function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Deliberately permissive: enough to catch a typo like a missing "@", not an
 * attempt to fully validate an address by regex (which cannot be done). The
 * real check is whether the person can use the account.
 */
function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function request(path, options = {}) {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/${path}`, options);
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = text;
    }
  }
  return { ok: res.ok, status: res.status, body };
}

/** Returns the user row for an email, or null. Never throws on "not found". */
async function findByEmail(email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;

  const { ok, status, body } = await request(
    `${TABLE}?email=eq.${encodeURIComponent(normalised)}&select=id,email,password_hash,display_name,created_at&limit=1`,
    { headers: headers() }
  );

  if (!ok) {
    throw new Error(
      status === 404
        ? `The ${TABLE} table does not exist. Run server/sql/001_app_users.sql in the Supabase SQL editor.`
        : `Supabase lookup failed (${status}): ${JSON.stringify(body).slice(0, 200)}`
    );
  }
  return Array.isArray(body) && body.length ? body[0] : null;
}

/**
 * Creates an account. Returns { user } on success, or { error } with a reason
 * safe to show the person signing up.
 */
async function createUser({ email, passwordHash, displayName }) {
  const normalised = normaliseEmail(email);

  const { ok, status, body } = await request(TABLE, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({
      email: normalised,
      password_hash: passwordHash,
      display_name: displayName ? String(displayName).slice(0, 120) : null,
    }),
  });

  if (ok) {
    return { user: Array.isArray(body) ? body[0] : body };
  }

  // 23505 is Postgres' unique-violation code, surfaced by PostgREST as 409.
  const code = body && body.code;
  if (status === 409 || code === "23505") {
    return { error: "An account with that email already exists." };
  }
  if (status === 404) {
    throw new Error(`The ${TABLE} table does not exist. Run server/sql/001_app_users.sql in the Supabase SQL editor.`);
  }
  throw new Error(`Supabase insert failed (${status}): ${JSON.stringify(body).slice(0, 200)}`);
}

/** Best-effort sign-in timestamp. A failure here must never block a login. */
async function touchLastLogin(id) {
  try {
    await request(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify({ last_login_at: new Date().toISOString() }),
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Number of accounts, or null if it cannot be determined. Used for the health
 * endpoint and to decide whether to show "create the first account" wording.
 */
async function countUsers() {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/${TABLE}?select=id`, {
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    });
    const range = res.headers.get("content-range"); // e.g. "0-0/12"
    if (range && range.includes("/")) {
      const total = Number(range.split("/")[1]);
      return Number.isFinite(total) ? total : null;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** Confirms the table is reachable, for a clear startup diagnostic. */
async function checkTable() {
  if (!isConfigured()) return { ok: false, reason: "SUPABASE_URL and SUPABASE_SECRET_KEY are not set." };
  try {
    const { ok, status } = await request(`${TABLE}?select=id&limit=1`, { headers: headers() });
    if (ok) return { ok: true };
    if (status === 404) {
      return { ok: false, reason: `The ${TABLE} table does not exist. Run server/sql/001_app_users.sql in the Supabase SQL editor.` };
    }
    return { ok: false, reason: `Supabase returned ${status} for ${TABLE}.` };
  } catch (err) {
    return { ok: false, reason: `Could not reach Supabase: ${err.message}` };
  }
}

module.exports = {
  TABLE,
  isConfigured,
  normaliseEmail,
  looksLikeEmail,
  findByEmail,
  createUser,
  touchLastLogin,
  countUsers,
  checkTable,
};
