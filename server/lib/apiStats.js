// ---------------------------------------------------------------------------
// In-memory API error/quota tracking — no database, resets whenever the
// process restarts (the same tradeoff every other "no database" piece of
// this codebase already makes). This exists so an admin can see "how close
// are we to a rate limit" or "is Gemini actually failing a lot" from
// /api/health, instead of the only signal being a live error banner that's
// gone as soon as the next successful refresh clears it.
//
// Scope deliberately stops at counts, not raw response bodies or request
// payloads — this is a quota/health signal, not a request log, so there's
// nothing here that needs redacting or that grows unbounded.
// ---------------------------------------------------------------------------

const stats = new Map(); // source -> { total, byStatus: Map<string,number>, last }

function recordApiError(source, status, message) {
  const key = String(source || "unknown");
  if (!stats.has(key)) stats.set(key, { total: 0, byStatus: new Map(), last: null });
  const entry = stats.get(key);
  entry.total += 1;
  const statusKey = status == null ? "unknown" : String(status);
  entry.byStatus.set(statusKey, (entry.byStatus.get(statusKey) || 0) + 1);
  entry.last = {
    status: status == null ? null : status,
    message: message ? String(message).slice(0, 300) : null,
    at: new Date().toISOString(),
  };
}

// Plain-object snapshot — callers (server.js's /api/health handler) get a
// copy, never the live Map, so nothing outside this module can mutate
// tracked state.
function getStats() {
  const out = {};
  for (const [source, entry] of stats.entries()) {
    out[source] = {
      total: entry.total,
      by_status: Object.fromEntries(entry.byStatus),
      last: entry.last,
    };
  }
  return out;
}

function reset() {
  stats.clear();
}

module.exports = { recordApiError, getStats, reset };
