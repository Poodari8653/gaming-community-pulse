// ---------------------------------------------------------------------------
// Access control for the dashboard.
//
// This is an internal RS tool, not a public product -- it must not be openly
// readable on the internet. A real /login page plus a signed session cookie
// gates every route, static assets included, before anything else runs.
//
// ACCOUNT MODEL
// People create their own account with an email and a password, then sign in
// with the same pair. There is no email verification or one-time code: the
// deployment is expected to sit behind the organisation's network or VPN, so
// the login is defence in depth rather than the only control. Accounts live in
// Supabase (see lib/user-store.js and server/sql/001_app_users.sql).
//
// WHAT CHANGED FROM THE ENV-VAR VERSION
//   * Users were a plaintext AUTH_USERS list compared with a string equality
//     check. Passwords are now hashed with scrypt and never stored or logged
//     in a recoverable form.
//   * Accounts were operator-provisioned. People now self-register.
//   * The gate used to FAIL OPEN -- with no users configured it called next()
//     and served everything publicly. It now FAILS CLOSED: if Supabase is not
//     configured, every route returns 503 rather than exposing the dashboard
//     because a variable was forgotten.
//
// SESSION MECHANICS
// Stateless: an HMAC-SHA256 signed cookie carrying the user id, email and an
// expiry. Nothing is stored server-side, which is what lets this work on a
// serverless host with no shared memory. The trade-off is that signing out
// clears the browser's copy but cannot revoke a token already issued -- see
// SESSION_TTL_MS and the notes in README.
// ---------------------------------------------------------------------------

const crypto = require("crypto");
const path = require("path");
const users = require("./user-store");

const COOKIE_NAME = "gcp_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const MIN_PASSWORD_LENGTH = 8;

// The rich sign-in UI. Served by an explicit route rather than from the static
// mount, because express.static sits behind the gate this page exists to get
// you through. The inline loginPageHtml/signupPageHtml are still used to render
// form-POST failures, which is the path for anyone without JavaScript.
const AUTH_PAGE = path.join(__dirname, "..", "public", "auth.html");

// scrypt at N=16384 costs roughly 50-100ms per verification, which is the
// point: it makes offline cracking of a stolen hash expensive while staying
// imperceptible on a single login. 128 * N * r = 16 MiB, which fits inside
// Node's default 32 MiB maxmem -- raising N further needs maxmem raised too.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Hashes a password as  scrypt$N$r$p$<salt-b64>$<hash-b64>. */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

/** Constant-time verification. Returns false on any malformed input. */
async function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scryptAsync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

// Verified against when the email is unknown, so a missing account costs the
// same time as a wrong password. Without it, response timing tells an attacker
// which emails have accounts.
let dummyHashPromise = null;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(32).toString("hex"));
  return dummyHashPromise;
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // Pad to equal length first -- timingSafeEqual throws on mismatched lengths,
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

// ---------------------------------------------------------------------------
// Login throttle
//
// Per-process, so on a serverless host each instance keeps its own counter and
// the effective limit is looser than it looks. It raises the cost of a naive
// scripted attempt and puts a line in the logs; the real protections are
// scrypt's per-attempt cost and the network the deployment sits behind.
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function attemptKey(req, email) {
  return `${req.ip || "unknown"}|${users.normaliseEmail(email)}`;
}

function throttled(req, email) {
  const rec = attempts.get(attemptKey(req, email));
  if (!rec || Date.now() > rec.resetAt) return 0;
  return rec.count >= MAX_ATTEMPTS ? Math.ceil((rec.resetAt - Date.now()) / 1000) : 0;
}

function recordFailure(req, email) {
  const key = attemptKey(req, email);
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now > rec.resetAt) attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  else rec.count += 1;
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
  }
}

function clearFailures(req, email) {
  attempts.delete(attemptKey(req, email));
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const PAGE_CSS = `
  :root{ --bg:#0f1117; --panel:#171a24; --border:#262b3a; --text:#e8eaf0; --muted:#9aa1b4; --accent:#6c8cff; --neg:#ff6b6b; --pos:#3ecf8e; }
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:var(--bg);color:var(--text);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
  .card{width:100%;max-width:380px;margin:20px;background:var(--panel);border:1px solid var(--border);
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
  .ok{margin-top:16px;background:#14261d;border:1px solid #245c3c;color:#a6e7c3;
    border-radius:8px;padding:10px 12px;font-size:13px}
  .alt{margin:18px 0 0;text-align:center;font-size:13px;color:var(--muted)}
  .alt a{color:var(--accent);text-decoration:none}
  .alt a:hover{text-decoration:underline}
  .hint{margin:6px 0 0;font-size:11.5px;color:#6f7688}
`;

function page({ title, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} — Gaming Community Pulse</title>
<style>${PAGE_CSS}</style>
</head>
<body>
  <div class="card">
    <h1>Gaming Community Pulse</h1>
    ${body}
  </div>
</body>
</html>`;
}

function loginPageHtml({ error, notice, redirect, email }) {
  return page({
    title: "Sign in",
    body: `
    <p class="sub">Internal tool — sign in to continue.</p>
    ${notice ? `<div class="ok">${escapeHtml(notice)}</div>` : ""}
    <form method="POST" action="/login">
      <input type="hidden" name="redirect" value="${escapeHtml(redirect || "/")}">
      <label for="e">Email</label>
      <input type="email" id="e" name="email" autocomplete="username" inputmode="email"
             autocapitalize="none" spellcheck="false" required autofocus
             value="${escapeHtml(email || "")}">
      <label for="p">Password</label>
      <input type="password" id="p" name="password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    </form>
    <p class="alt">No account? <a href="/signup${redirect && redirect !== "/" ? `?redirect=${encodeURIComponent(redirect)}` : ""}">Create one</a></p>`,
  });
}

function signupPageHtml({ error, redirect, email, displayName, firstAccount }) {
  return page({
    title: "Create an account",
    body: `
    <p class="sub">${firstAccount ? "Create the first account for this deployment." : "Create an account to access the dashboard."}</p>
    <form method="POST" action="/signup">
      <input type="hidden" name="redirect" value="${escapeHtml(redirect || "/")}">
      <label for="n">Name <span style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label>
      <input type="text" id="n" name="display_name" autocomplete="name" value="${escapeHtml(displayName || "")}">
      <label for="e">Email</label>
      <input type="email" id="e" name="email" autocomplete="username" inputmode="email"
             autocapitalize="none" spellcheck="false" required value="${escapeHtml(email || "")}">
      <label for="p">Password</label>
      <input type="password" id="p" name="password" autocomplete="new-password" required
             minlength="${MIN_PASSWORD_LENGTH}">
      <p class="hint">At least ${MIN_PASSWORD_LENGTH} characters. A few words you will remember beats a short complex string.</p>
      <label for="p2">Confirm password</label>
      <input type="password" id="p2" name="password_confirm" autocomplete="new-password" required>
      <button type="submit">Create account</button>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    </form>
    <p class="alt">Already have an account? <a href="/login${redirect && redirect !== "/" ? `?redirect=${encodeURIComponent(redirect)}` : ""}">Sign in</a></p>`,
  });
}

function unconfiguredPageHtml(reason) {
  return page({
    title: "Not configured",
    body: `
    <p class="sub">This deployment is not configured.</p>
    <div class="error">${escapeHtml(reason)}</div>
    <p class="hint" style="margin-top:16px">The dashboard is refusing every request rather than serving
    without access control. Set <code>SUPABASE_URL</code> and <code>SUPABASE_SECRET_KEY</code>, run
    <code>server/sql/001_app_users.sql</code> in the Supabase SQL editor, and restart.</p>`,
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/** Only same-site paths are accepted, so ?redirect= cannot bounce off-site. */
function safeRedirect(value) {
  const v = String(value || "");
  return /^\/(?!\/)[^\s\\]{0,512}$/.test(v) ? v : "/";
}

const PUBLIC_PATHS = new Set(["/login", "/logout", "/signup", "/healthz"]);

// The auth API is how the sign-in UI talks to the server, so it cannot sit
// behind the gate it exists to get you through. /api/auth/me is included and
// returns its own 401 when there is no session, which is what lets the front
// end ask "am I signed in?" without being redirected.
const PUBLIC_PREFIXES = ["/api/auth/"];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function buildAuth(rawSecret) {
  let secret = rawSecret;
  let secretEphemeral = false;
  if (!secret) {
    // A random per-process secret still works, but every restart invalidates
    // all sessions. Flagged in /api/health and at startup.
    secret = crypto.randomBytes(32).toString("hex");
    secretEphemeral = true;
  }

  const configured = () => users.isConfigured();

  // Credentials being present is not the same as the table existing. A missing
  // app_users table is the likeliest setup slip, and without this the person
  // signing up would only see a vague "temporarily unavailable". Cached briefly
  // so a broken deployment does not probe Supabase on every request.
  let storeCheck = { at: 0, result: null };
  const STORE_CHECK_TTL_MS = 30_000;
  async function storeReady() {
    if (storeCheck.result && Date.now() - storeCheck.at < STORE_CHECK_TTL_MS) return storeCheck.result;
    const result = await users.checkTable();
    storeCheck = { at: Date.now(), result };
    return result;
  }

  function setSessionCookie(req, res, user) {
    const token = sign(
      { uid: user.id, email: user.email, name: user.display_name || null, exp: Date.now() + SESSION_TTL_MS },
      secret
    );
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
   * The signed cookie is self-contained, so this does not hit Supabase on
   * every request -- one HMAC check, microseconds. The cost is that an account
   * deleted in Supabase keeps a working session until the token expires.
   */
  function sessionUser(req) {
    const payload = verify(parseCookies(req)[COOKIE_NAME], secret);
    if (!payload || !payload.email) return null;
    return { id: payload.uid, email: payload.email, name: payload.name || null };
  }

  function refuseUnconfigured(req, res) {
    const reason = "SUPABASE_URL and SUPABASE_SECRET_KEY are not set, so accounts cannot be read.";
    res.status(503).set("Retry-After", "3600").set("Cache-Control", "no-store");
    if (req.path.startsWith("/api/")) return res.json({ error: "Not configured", detail: reason });
    res.type("html").send(unconfiguredPageHtml(reason));
  }

  /** Gates every route except the public ones above. */
  function requireAuth(req, res, next) {
    if (!configured()) {
      // Fail closed. The previous version called next() here, which served the
      // whole dashboard publicly whenever configuration was missing.
      if (req.path === "/healthz") return next();
      return refuseUnconfigured(req, res);
    }

    if (isPublicPath(req.path)) return next();

    const user = sessionUser(req);
    if (user) {
      req.authUser = user.email;
      req.authUserRecord = user;
      return next();
    }

    res.set("Cache-Control", "no-store").set("Vary", "Cookie");
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Not signed in.", login_url: "/login" });
    }
    res.redirect(302, `/login?redirect=${encodeURIComponent(req.originalUrl || "/")}`);
  }


  // -------------------------------------------------------------------------
  // Shared core
  //
  // The form-POST handlers and the JSON API are two front ends onto these two
  // functions, so validation, throttling, hashing and timing behaviour cannot
  // drift between them. Each returns a plain result object; the callers decide
  // whether to answer with a redirect or JSON.
  // -------------------------------------------------------------------------

  /** @returns {{ok:true,user}} | {{ok:false,status:number,error:string,retryAfter?:number}} */
  async function attemptLogin(req, rawEmail, rawPassword) {
    const email = typeof rawEmail === "string" ? rawEmail : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";

    const wait = throttled(req, email);
    if (wait) {
      console.warn(`[auth] throttled sign-in for ${users.normaliseEmail(email)} from ${req.ip}`);
      return { ok: false, status: 429, retryAfter: wait, error: `Too many attempts. Try again in ${wait} seconds.` };
    }

    if (!email || !password) {
      return { ok: false, status: 400, error: "Enter your email and password." };
    }

    let record = null;
    try {
      record = await users.findByEmail(email);
    } catch (err) {
      console.error(`[auth] account lookup failed: ${err.message}`);
      return { ok: false, status: 503, error: "Accounts are temporarily unavailable. Try again shortly." };
    }

    // Always exactly one scrypt derivation, so an unknown email costs the same
    // as a wrong password and timing cannot reveal which emails exist.
    const passwordOk = await verifyPassword(password, record ? record.password_hash : await dummyHash());
    if (!record || !passwordOk) {
      recordFailure(req, email);
      console.warn(`[auth] failed sign-in for ${users.normaliseEmail(email)} from ${req.ip}`);
      return { ok: false, status: 401, error: "Incorrect email or password." };
    }

    clearFailures(req, email);
    users.touchLastLogin(record.id);
    console.log(`[auth] ${record.email} signed in from ${req.ip}`);
    return { ok: true, user: record };
  }

  /** @returns {{ok:true,user}} | {{ok:false,status:number,error:string,field?:string}} */
  async function attemptSignup(req, { email: rawEmail, password: rawPassword, confirm: rawConfirm, displayName: rawName }) {
    const email = users.normaliseEmail(typeof rawEmail === "string" ? rawEmail : "");
    const password = typeof rawPassword === "string" ? rawPassword : "";
    const confirm = typeof rawConfirm === "string" ? rawConfirm : "";
    const displayName = typeof rawName === "string" ? rawName.trim() : "";

    if (!users.looksLikeEmail(email)) {
      return { ok: false, status: 400, field: "email", error: "Enter a valid email address." };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, status: 400, field: "password", error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    // The confirm field is optional for API callers, enforced when supplied.
    if (rawConfirm !== undefined && password !== confirm) {
      return { ok: false, status: 400, field: "password_confirm", error: "The two passwords do not match." };
    }

    let result;
    try {
      result = await users.createUser({ email, passwordHash: await hashPassword(password), displayName });
    } catch (err) {
      console.error(`[auth] account creation failed: ${err.message}`);
      return { ok: false, status: 503, error: "Accounts are temporarily unavailable. Try again shortly." };
    }

    if (result.error) {
      return { ok: false, status: 409, field: "email", error: result.error };
    }

    console.log(`[auth] account created for ${email} from ${req.ip}`);
    return { ok: true, user: result.user };
  }

  function publicUser(user) {
    return { email: user.email, name: user.display_name ?? user.name ?? null };
  }

  // --- GET pages -----------------------------------------------------------

  /**
   * Both /login and /signup serve the same document; it opens on the tab the
   * path implies and switches without a reload. The guards stay server-side so
   * an already-signed-in visitor or a misconfigured backend is handled before
   * any UI renders.
   */
  async function servePage(req, res) {
    if (!configured()) return refuseUnconfigured(req, res);
    if (sessionUser(req)) return res.redirect(302, safeRedirect(req.query.redirect));

    const ready = await storeReady();
    if (!ready.ok) {
      return res.status(503).set("Cache-Control", "no-store").type("html").send(unconfiguredPageHtml(ready.reason));
    }
    res.set("Cache-Control", "no-store").sendFile(AUTH_PAGE);
  }

  const loginPage = servePage;
  const signupPage = servePage;

  // --- form-POST handlers (work without JavaScript) ------------------------

  async function loginSubmit(req, res) {
    if (!configured()) return refuseUnconfigured(req, res);
    const body = req.body || {};
    const redirect = safeRedirect(body.redirect);
    const email = typeof body.email === "string" ? body.email : "";

    const result = await attemptLogin(req, email, body.password);
    if (!result.ok) {
      if (result.retryAfter) res.set("Retry-After", String(result.retryAfter));
      return res.status(result.status).set("Cache-Control", "no-store").type("html").send(
        loginPageHtml({ error: result.error, redirect, email })
      );
    }
    setSessionCookie(req, res, result.user);
    res.redirect(302, redirect);
  }

  async function signupSubmit(req, res) {
    if (!configured()) return refuseUnconfigured(req, res);
    const body = req.body || {};
    const redirect = safeRedirect(body.redirect);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";

    const result = await attemptSignup(req, {
      email,
      password: body.password,
      confirm: body.password_confirm,
      displayName,
    });

    if (!result.ok) {
      return res.status(result.status).set("Cache-Control", "no-store").type("html").send(
        signupPageHtml({ error: result.error, redirect, email, displayName, firstAccount: false })
      );
    }
    // Signed in immediately — there is no verification step to wait for.
    setSessionCookie(req, res, result.user);
    res.redirect(302, redirect);
  }

  // --- JSON API (what the sign-in UI calls) --------------------------------

  async function apiLogin(req, res) {
    if (!configured()) return refuseUnconfigured(req, res);
    const body = req.body || {};
    const result = await attemptLogin(req, body.email, body.password);
    if (!result.ok) {
      if (result.retryAfter) res.set("Retry-After", String(result.retryAfter));
      return res.status(result.status).json({ error: result.error });
    }
    setSessionCookie(req, res, result.user);
    res.status(200).json({ user: publicUser(result.user), redirect: safeRedirect(body.redirect) });
  }

  async function apiSignup(req, res) {
    if (!configured()) return refuseUnconfigured(req, res);
    const body = req.body || {};
    const result = await attemptSignup(req, {
      email: body.email,
      password: body.password,
      confirm: body.password_confirm,
      displayName: body.display_name,
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error, field: result.field || null });
    }
    setSessionCookie(req, res, result.user);
    res.status(201).json({ user: publicUser(result.user), redirect: safeRedirect(body.redirect) });
  }

  /** Lets the front end ask "am I signed in, and as whom?" */
  function apiMe(req, res) {
    if (!configured()) return refuseUnconfigured(req, res);
    const user = sessionUser(req);
    res.set("Cache-Control", "no-store");
    if (!user) return res.status(401).json({ error: "Not signed in.", login_url: "/login" });
    res.json({ user: publicUser(user) });
  }

  function apiLogout(req, res) {
    clearSessionCookie(req, res);
    res.set("Cache-Control", "no-store").status(200).json({ ok: true });
  }

  /** Whether any account exists yet, so the UI can open on the right tab. */
  async function apiStatus(req, res) {
    res.set("Cache-Control", "no-store");
    if (!configured()) {
      return res.status(503).json({ configured: false, error: "Accounts are not configured." });
    }
    const ready = await storeReady();
    if (!ready.ok) return res.status(503).json({ configured: false, error: ready.reason });
    const count = await users.countUsers();
    res.json({ configured: true, has_accounts: count === null ? null : count > 0, signed_in: Boolean(sessionUser(req)) });
  }

  function logout(req, res) {
    clearSessionCookie(req, res);
    res.set("Cache-Control", "no-store").redirect(302, "/login");
  }

  return {
    get configured() {
      return configured();
    },
    sessionSecretEphemeral: secretEphemeral,
    requireAuth,
    loginPage,
    loginSubmit,
    signupPage,
    signupSubmit,
    logout,
    sessionUser,
    // JSON API
    apiLogin,
    apiSignup,
    apiLogout,
    apiMe,
    apiStatus,
    // exported for tests and diagnostics
    hashPassword,
    verifyPassword,
    checkTable: users.checkTable,
    countUsers: users.countUsers,
  };
}

module.exports = { buildAuth, hashPassword, verifyPassword, MIN_PASSWORD_LENGTH };
