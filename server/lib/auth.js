// ---------------------------------------------------------------------------
// Internal access control.
//
// This is an internal RS tool, not a public product — it must not be openly
// reachable by anyone who finds the URL. There's no user-management
// requirement beyond that (no roles, no self-signup, no password reset flow),
// so this deliberately stays simple: HTTP Basic Auth against a small, fixed
// list of username:password pairs set in the environment. No database, no
// sessions, no cookies — which also means it works identically whether the
// app is running as a long-lived Render process or a stateless Vercel
// serverless function, with nothing to keep durable between requests.
//
// Configure via AUTH_USERS in .env, e.g.:
//   AUTH_USERS=alice:correct-horse-battery,bob:another-passphrase
//
// SECURITY NOTES
//   • Basic Auth sends credentials base64-encoded on every request, not
//     encrypted — this is fine ONLY because deployments already run behind
//     HTTPS (both Render and Vercel terminate TLS by default). Do not run
//     this over plain HTTP anywhere credentials would cross a real network.
//   • Credential comparison uses crypto.timingSafeEqual so a wrong guess
//     can't be distinguished by response timing.
//   • If AUTH_USERS is unset, the middleware is a deliberate no-op — the app
//     still boots (matching every other optional integration in this
//     codebase), but it means the instance is WIDE OPEN. server.js logs a
//     loud warning on startup when this is the case. Set AUTH_USERS before
//     deploying anywhere reachable off your own machine.
// ---------------------------------------------------------------------------

const crypto = require("crypto");

function parseUsers(raw) {
  const users = new Map();
  for (const pair of (raw || "").split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue; // malformed entry — skip rather than crash the server
    const user = trimmed.slice(0, idx).trim();
    const pass = trimmed.slice(idx + 1);
    if (user && pass) users.set(user, pass);
  }
  return users;
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // Pad to equal length first — timingSafeEqual throws on mismatched lengths,
  // and a length-based early exit would itself leak timing information.
  const len = Math.max(bufA.length, bufB.length, 1);
  const paddedA = Buffer.alloc(len);
  const paddedB = Buffer.alloc(len);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return bufA.length === bufB.length && crypto.timingSafeEqual(paddedA, paddedB);
}

/**
 * Builds the auth middleware from AUTH_USERS. Returns { middleware, configured, userCount }
 * so server.js can both mount it and report its status on /api/health and at startup.
 */
function buildAuth(rawUsers) {
  const users = parseUsers(rawUsers);
  const configured = users.size > 0;

  function middleware(req, res, next) {
    if (!configured) return next(); // see SECURITY NOTES above

    const header = req.headers.authorization || "";
    const match = /^Basic\s+(.+)$/i.exec(header);
    if (match) {
      let decoded = "";
      try {
        decoded = Buffer.from(match[1], "base64").toString("utf-8");
      } catch (_) {
        decoded = "";
      }
      const sep = decoded.indexOf(":");
      if (sep !== -1) {
        const user = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);
        const expected = users.get(user);
        // Compare against a fixed dummy value when the user doesn't exist, so
        // an unknown username takes the same code path/timing as a known one
        // with a wrong password, rather than short-circuiting.
        if (timingSafeStringEqual(pass, expected ?? "\0invalid-user-placeholder")) {
          req.authUser = user;
          return next();
        }
      }
    }

    res.set("WWW-Authenticate", 'Basic realm="Gaming Community Pulse", charset="UTF-8"');
    res.status(401).send("Authentication required.");
  }

  return { middleware, configured, userCount: users.size };
}

module.exports = { buildAuth };
