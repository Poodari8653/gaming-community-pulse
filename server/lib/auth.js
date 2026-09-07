// ---------------------------------------------------------------------------
// Internal access control — a real login page with session cookies, plus
// two roles ("admin" and "user"), all still without a database.
//
// This is an internal RS tool, not a public product — it must not be openly
// reachable by anyone who finds the URL. Beyond that, the only user-
// management requirement is a coarse split: a small, fixed set of people who
// can trigger cost-incurring actions and see operational status (admin), and
// everyone else, who gets full read access to the dashboard itself (user).
// Nobody self-signs-up, nobody changes their own role — RS decides who's who
// by editing one environment variable — so there's nothing here that needs
// to persist beyond that variable. What sits on top of it is a real /login
// page (not a browser-native Basic Auth popup) backed by a signed, stateless
// session cookie — no session store, no database, so this works identically
// whether the app is a long-lived Render process or a stateless Vercel
// function, with nothing that needs to stay durable between requests.
//
// Configure via:
//   AUTH_USERS=alice:correct-horse-battery:admin,bob:another-passphrase
//   SESSION_SECRET=<any long random string>   (recommended — see below)
//
// ROLE FORMAT
//   Each pair is `username:password` or `username:password:role`, where
//   role is "admin" or "user". Omit the role and it defaults to "user" —
//   existing two-part AUTH_USERS values keep working unchanged. A password
//   must not itself contain a ":" — that makes the entry ambiguous with the
//   role suffix, so it's treated as malformed and skipped (a loud enough
//   failure mode: that person simply can't sign in, which is easy to notice
//   and fix, rather than a colon silently becoming part of the password).
//
// SECURITY NOTES
//   • The session cookie is a signed, not encrypted, payload — HMAC-SHA256
//     over { user, role, exp }, so it can be verified but not forged without
//     the secret. The role travelling in the cookie is never trusted on its
//     own, though: every request re-looks-up the user's *current* role from
//     AUTH_USERS by username, so demoting or removing someone in the env
//     var takes effect on their very next request, not just their next
//     login.
//   • Password comparison and cookie signature comparison both use
//     crypto.timingSafeEqual so a wrong guess can't be distinguished by
//     response timing.
//   • Cookie is HttpOnly (no JS access, blunts XSS token theft), SameSite=Lax
//     (blunts CSRF on state-changing cross-site requests), and Secure
//     whenever the request arrived over HTTPS (Render/Vercel both terminate
//     TLS in front of the app — server.js sets `trust proxy` so req.secure
//     reflects that correctly).
//   • If SESSION_SECRET is unset, a random one is generated at process
//     start. This works fine on a single long-lived process, but on a host
//     that runs multiple instances or restarts per-request (serverless cold
//     starts), everyone gets logged out whenever a new instance spins up
//     with a fresh random secret. Set SESSION_SECRET explicitly for any real
//     deployment — server.js warns loudly at startup when it's missing.
//   • If AUTH_USERS is unset, the whole thing is a deliberate no-op — the
//     app still boots (matching every other optional integration in this
//     codebase), but the instance is WIDE OPEN and every request is treated
//     as admin (there's no one to distinguish). server.js logs a loud
//     warning on startup when this is the case.
// ---------------------------------------------------------------------------

const crypto = require("crypto");

const COOKIE_NAME = "gcp_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ROLES = ["admin", "user"];
const DEFAULT_ROLE = "user";

function parseUsers(raw) {
  const users = new Map();
  for (const pair of (raw || "").split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(":");
    if (parts.length === 2) {
      const [user, pass] = parts;
      if (user.trim() && pass) users.set(user.trim(), { password: pass, role: DEFAULT_ROLE });
    } else if (parts.length === 3 && ROLES.includes(parts[2].trim())) {
      const [user, pass, role] = parts;
      if (user.trim() && pass) users.set(user.trim(), { password: pass, role: role.trim() });
    }
    // Anything else (0/1 parts, or a 3rd segment that isn't a real role) is
    // malformed — skipped rather than guessed at or crashing the process.
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

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch (_) {
        out[k] = v;
      }
    }
  }
  return out;
}

function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verify(token, secret) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (!timingSafeStringEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function loginPageHtml({ error, redirect }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — Gaming Community Pulse</title>
<style>
  :root{ --bg:#0f1117; --panel:#171a24; --border:#262b3a; --text:#e8eaf0; --muted:#9aa1b4; --accent:#6c8cff; --neg:#ff6b6b; }
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:var(--bg);color:var(--text);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
  .card{width:100%;max-width:360px;margin:20px;background:var(--panel);border:1px solid var(--border);
    border-radius:14px;padding:32px 28px;}
  h1{margin:0 0 4px;font-size:18px}
  p.sub{margin:0 0 22px;color:var(--muted);font-size:13px}
  label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);
    margin:14px 0 6px;font-weight:700}
  input{width:100%;background:#0f1117;color:var(--text);border:1px solid var(--border);
    border-radius:8px;padding:10px 12px;font:inherit;font-size:14px}
  input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  button{width:100%;margin-top:20px;background:var(--accent);color:#0b0d13;border:none;
    border-radius:8px;padding:11px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  button:hover{filter:brightness(1.08)}
  .error{margin-top:16px;background:#241618;border:1px solid #5a2a2a;color:#ffbcbc;
    border-radius:8px;padding:10px 12px;font-size:13px}
</style>
</head>
<body>
  <div class="card">
    <h1>Gaming Community Pulse</h1>
    <p class="sub">Internal tool — sign in to continue.</p>
    <form method="POST" action="/login">
      <input type="hidden" name="redirect" value="${escapeHtml(redirect || "/")}">
      <label for="u">Username</label>
      <input type="text" id="u" name="username" autocomplete="username" required autofocus>
      <label for="p">Password</label>
      <input type="password" id="p" name="password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    </form>
  </div>
</body>
</html>`;
}

function forbiddenPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Admins only — Gaming Community Pulse</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0f1117;color:#e8eaf0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .card{max-width:360px;margin:20px;background:#171a24;border:1px solid #262b3a;border-radius:14px;padding:28px}
  a{color:#6c8cff}
</style>
</head>
<body><div class="card"><h1 style="font-size:17px;margin:0 0 8px">Admins only</h1>
<p style="color:#9aa1b4;margin:0">Your account doesn't have access to this page. <a href="/">Back to the dashboard</a>.</p>
</div></body>
</html>`;
}

/**
 * Builds everything server.js needs to mount: the gate middlewares, the
 * login/logout handlers, and status flags for /api/health and the startup
 * log.
 */
function buildAuth(rawUsers, rawSecret) {
  const users = parseUsers(rawUsers);
  const configured = users.size > 0;
  const adminCount = [...users.values()].filter((u) => u.role === "admin").length;
  const userCount = users.size - adminCount;

  let secret = rawSecret;
  let secretEphemeral = false;
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    secretEphemeral = true;
  }

  function setSessionCookie(req, res, username, role) {
    const token = sign({ user: username, role, exp: Date.now() + SESSION_TTL_MS }, secret);
    const attrs = [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ];
    if (req.secure) attrs.push("Secure");
    res.set("Set-Cookie", attrs.join("; "));
  }

  function clearSessionCookie(req, res) {
    const attrs = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
    if (req.secure) attrs.push("Secure");
    res.set("Set-Cookie", attrs.join("; "));
  }

  /**
   * Verifies the session cookie proves who the caller is, then looks up
   * that username's CURRENT role from AUTH_USERS rather than trusting
   * whatever role was baked into the cookie at login time — so editing
   * AUTH_USERS and restarting is enough to change someone's access; they
   * don't need to log out and back in, and a removed user is locked out
   * immediately even with an otherwise-valid, unexpired cookie.
   */
  function sessionIdentity(req) {
    if (!configured) return null;
    const cookies = parseCookies(req);
    const payload = verify(cookies[COOKIE_NAME], secret);
    if (!payload) return null;
    const record = users.get(payload.user);
    if (!record) return null;
    return { user: payload.user, role: record.role };
  }

  /** Gate every route except /login and /logout themselves. */
  function requireAuth(req, res, next) {
    if (!configured) {
      // Wide open — see SECURITY NOTES. Treated as admin since there's no
      // one to distinguish from anyone else in this mode.
      req.authUser = null;
      req.authRole = "admin";
      return next();
    }
    if (req.path === "/login" || req.path === "/logout") return next();

    const identity = sessionIdentity(req);
    if (identity) {
      req.authUser = identity.user;
      req.authRole = identity.role;
      return next();
    }

    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Not signed in.", login_url: "/login" });
    }
    const redirect = encodeURIComponent(req.originalUrl || "/");
    res.redirect(302, `/login?redirect=${redirect}`);
  }

  /**
   * Gate a route to admins only. Must run after requireAuth (relies on
   * req.authRole). Kept separate from requireAuth so most routes — the
   * dashboard itself included — stay open to every signed-in user, and only
   * the specific cost-incurring or operational routes opt into this.
   */
  function requireAdmin(req, res, next) {
    if (req.authRole === "admin") return next();
    if (req.path.startsWith("/api/")) {
      return res.status(403).json({ error: "Admins only.", your_role: req.authRole || "user" });
    }
    res.status(403).type("html").send(forbiddenPageHtml());
  }

  function loginPage(req, res) {
    if (!configured) return res.redirect(302, "/");
    if (sessionIdentity(req)) return res.redirect(302, req.query.redirect ? String(req.query.redirect) : "/");
    res.status(200).type("html").send(
      loginPageHtml({
        error: req.query.error ? "Incorrect username or password." : null,
        redirect: req.query.redirect ? String(req.query.redirect) : "/",
      })
    );
  }

  function loginSubmit(req, res) {
    const { username, password, redirect } = req.body || {};
    const record = users.get(String(username || ""));
    const ok = record != null && timingSafeStringEqual(String(password || ""), record.password);
    if (!ok) {
      const back = redirect ? `&redirect=${encodeURIComponent(String(redirect))}` : "";
      return res.redirect(302, `/login?error=1${back}`);
    }
    setSessionCookie(req, res, String(username), record.role);
    const dest = redirect && String(redirect).startsWith("/") ? String(redirect) : "/";
    res.redirect(302, dest);
  }

  function logout(req, res) {
    clearSessionCookie(req, res);
    res.redirect(302, "/login");
  }

  /** Read-only roster for the admin-only users list — usernames + roles, never passwords. */
  function listUsers() {
    return [...users.entries()].map(([user, r]) => ({ user, role: r.role }));
  }

  return {
    configured,
    userCount: users.size,
    adminCount,
    viewerCount: userCount,
    sessionSecretEphemeral: secretEphemeral,
    requireAuth,
    requireAdmin,
    loginPage,
    loginSubmit,
    logout,
    listUsers,
  };
}

module.exports = { buildAuth };
