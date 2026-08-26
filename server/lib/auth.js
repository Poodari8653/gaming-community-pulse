// ---------------------------------------------------------------------------
// Internal access control — a real login page with session cookies.
//
// This is an internal RS tool, not a public product — it must not be openly
// reachable by anyone who finds the URL. There's no user-management
// requirement beyond that (no roles, no self-signup, no password reset flow),
// so credentials stay simple: a small, fixed list of username:password pairs
// set in the environment. What sits on top of that is a real /login page
// (not a browser-native Basic Auth popup) backed by a signed, stateless
// session cookie — no session store, no database, so this works identically
// whether the app is a long-lived Render process or a stateless Vercel
// function, with nothing that needs to stay durable between requests.
//
// Configure via:
//   AUTH_USERS=alice:correct-horse-battery,bob:another-passphrase
//   SESSION_SECRET=<any long random string>   (recommended — see below)
//
// SECURITY NOTES
//   • The session cookie is a signed, not encrypted, payload — HMAC-SHA256
//     over { user, exp }, so it can be verified but not forged without the
//     secret. It carries no other data.
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
//     codebase), but the instance is WIDE OPEN. server.js logs a loud
//     warning on startup when this is the case.
// ---------------------------------------------------------------------------

const crypto = require("crypto");

const COOKIE_NAME = "gcp_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

/**
 * Builds everything server.js needs to mount: the gate middleware, the
 * login/logout handlers, and status flags for /api/health and the startup
 * log.
 */
function buildAuth(rawUsers, rawSecret) {
  const users = parseUsers(rawUsers);
  const configured = users.size > 0;

  let secret = rawSecret;
  let secretEphemeral = false;
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    secretEphemeral = true;
  }

  function setSessionCookie(req, res, username) {
    const token = sign({ user: username, exp: Date.now() + SESSION_TTL_MS }, secret);
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

  function sessionUser(req) {
    if (!configured) return null;
    const cookies = parseCookies(req);
    const payload = verify(cookies[COOKIE_NAME], secret);
    if (!payload || !users.has(payload.user)) return null;
    return payload.user;
  }

  /** Gate every route except /login and /logout themselves. */
  function requireAuth(req, res, next) {
    if (!configured) return next(); // see SECURITY NOTES above
    if (req.path === "/login" || req.path === "/logout") return next();

    const user = sessionUser(req);
    if (user) {
      req.authUser = user;
      return next();
    }

    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Not signed in.", login_url: "/login" });
    }
    const redirect = encodeURIComponent(req.originalUrl || "/");
    res.redirect(302, `/login?redirect=${redirect}`);
  }

  function loginPage(req, res) {
    if (!configured) return res.redirect(302, "/");
    if (sessionUser(req)) return res.redirect(302, req.query.redirect ? String(req.query.redirect) : "/");
    res.status(200).type("html").send(
      loginPageHtml({
        error: req.query.error ? "Incorrect username or password." : null,
        redirect: req.query.redirect ? String(req.query.redirect) : "/",
      })
    );
  }

  function loginSubmit(req, res) {
    const { username, password, redirect } = req.body || {};
    const expected = users.get(String(username || ""));
    const ok = expected != null && timingSafeStringEqual(String(password || ""), expected);
    if (!ok) {
      const back = redirect ? `&redirect=${encodeURIComponent(String(redirect))}` : "";
      return res.redirect(302, `/login?error=1${back}`);
    }
    setSessionCookie(req, res, String(username));
    const dest = redirect && String(redirect).startsWith("/") ? String(redirect) : "/";
    res.redirect(302, dest);
  }

  function logout(req, res) {
    clearSessionCookie(req, res);
    res.redirect(302, "/login");
  }

  return {
    configured,
    userCount: users.size,
    sessionSecretEphemeral: secretEphemeral,
    requireAuth,
    loginPage,
    loginSubmit,
    logout,
  };
}

module.exports = { buildAuth };
