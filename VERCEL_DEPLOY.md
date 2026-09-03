# Deploying Gaming Community Pulse to Vercel

The repository is configured for Vercel using the **Services** model: `vercel.json`
declares the Express app as a single service and routes every request to it, so
the dashboard at `/` and the three API endpoints all work from one deployment.
See §7 for the configuration, and for the alternative if you would rather run the
project with Framework Preset **Other**.

**Read §5 first if day-over-day deltas matter to you, and §6 if cost does.**
Vercel's serverless model has two consequences for this particular application
that are not obvious until you hit them. Render (see [`DEPLOY.md`](DEPLOY.md))
is the better fit if either bites.

---

## 1. The repository

The code and its Vercel configuration (`vercel.json`, `package.json`,
`api/index.js`) live at:

- **Repository**: [https://github.com/Poodari8653/gaming-community-pulse](https://github.com/Poodari8653/gaming-community-pulse)
- **Branches**: `main` and `dev` (`dev` is the default)

Vercel builds the branch you connect and creates preview deployments for the
others.

---

## 2. Deploy via the Vercel dashboard (recommended)

1. Go to **[vercel.com/new](https://vercel.com/new)** and sign in with GitHub.
2. Under **Import Git Repository**, select
   **`Poodari8653/gaming-community-pulse`**.
3. In the project setup screen:
   - **Framework Preset**: **Services** — the committed `vercel.json` uses the
     services model (see §7). If you set it to **Other** instead, swap in the
     alternative config shown in §7.
   - **Root Directory**: `./` (default). Do **not** set it to `server/` — the
     app reads `data/processed/` from the repository root at runtime, so the
     build context has to include it.
4. Expand **Environment Variables** and add the ones you need (§4).
5. Click **Deploy**.

Vercel builds the function and gives you the deployment URL for the project.
Use whatever URL Vercel shows you — it is generated from your project and team
names, so it is not something this document can predict.

---

## 3. Deploy via the CLI (alternative)

```bash
npx vercel login
npx vercel --prod
```

Add environment variables one at a time, then redeploy so they take effect:

```bash
npx vercel env add AUTH_USERS production
npx vercel env add SESSION_SECRET production
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add GEMINI_API_KEY production
npx vercel env add YOUTUBE_API_KEY production
# …and so on for each variable in §4
npx vercel --prod
```

---

## 4. Environment variables

Ten credentials and two behaviour flags. Earlier versions of this document
listed only two variables — that predates Reddit going live, the semantic
scoring layer, the snapshot store, the login form, and the Gemini discussion
panel.

**Set `AUTH_USERS` and `SESSION_SECRET` before you deploy.** Every other
credential below is optional — the app boots and runs fine without it, just
with that source marked unavailable on screen. These two are different: this
project is meant to be an internal RS tool, and a Vercel deployment URL is
reachable by anyone who has it unless `AUTH_USERS` is set. Leaving it blank
means the dashboard — including every real comment, clip and message it has
collected — is public.

`SESSION_SECRET` matters more on Vercel than anywhere else this app runs.
Vercel functions are stateless and can spin up a fresh instance per request;
if `SESSION_SECRET` is left unset, each instance generates its own random
secret, so a session cookie signed by one instance fails verification on the
next — people get logged out constantly, sometimes mid-session. Set it
explicitly (`openssl rand -hex 32` is a good way to generate one) so every
instance verifies the same cookies.

### Credentials

| Key | Unlocks | If you leave it blank |
|---|---|---|
| `AUTH_USERS` | **Required.** Comma-separated `username:password` pairs (e.g. `alice:correct-horse-battery,bob:another-passphrase`) — gates a real `/login` page in front of every route, including the static dashboard | The deployment is publicly reachable with no login. Vercel's function logs print a loud warning at every cold start when this is the case. |
| `SESSION_SECRET` | **Required for stable logins.** Signs the session cookie `/login` issues. Any long random string. | A random secret is generated per instance, so sessions break across cold starts — see above. |
| `ANTHROPIC_API_KEY` | Semantic sentiment (sarcasm, negation, gaming slang, non-English text), themes on live records, question and risk flags, and the AI daily briefing | Gaming-tuned lexicon fallback; live records carry no theme; no record-level risk flags, though theme-level risk detection still runs; the brief is computed from the figures and labelled as such on screen |
| `YOUTUBE_API_KEY` | YouTube comments and video stats for the five tracked channels | YouTube absent from the dashboard — there is no YouTube sample data |
| `REDDIT_CLIENT_ID` | Live Reddit via the official OAuth API (needs the secret too) | Labelled illustrative sample rows stand in, or nothing if `DEMO_DATA=false` |
| `REDDIT_CLIENT_SECRET` | As above | As above |
| `DISCORD_BOT_TOKEN` | Live Discord messages from channels the bot has been invited to | Labelled illustrative sample rows stand in, or nothing if `DEMO_DATA=false` |
| `TWITCH_CLIENT_ID` | Twitch top clips and the live-viewer snapshot (needs the secret too) | Twitch absent — there is no Twitch sample data |
| `TWITCH_CLIENT_SECRET` | As above | As above |
| `GEMINI_API_KEY` | The "Top discussions" panel — a second, independent AI pass (Gemini, not Claude) that clusters each game's live discussion, across whichever of YouTube/Reddit/Discord/Twitch are configured this deployment, into sub-topics with grounded quotes. Never clusters the illustrative sample — a platform you haven't configured just doesn't contribute records. | Just that one panel is unavailable; every other panel, including Claude's own sentiment and theme detection, is unaffected |

### Behaviour flags

| Key | Suggested value | Meaning |
|---|---|---|
| `DEMO_DATA` | `true` | Include the labelled illustrative sample data. Set to `false` to run on collected data only. Defaults to `true` when unset. |
| `SNAPSHOT_DIR` | `/tmp/gcp-snapshots` | Where daily snapshots are written. On Vercel the only writable path is `/tmp`, and it does not survive a cold start — see §5. Setting this makes `/api/health` report `mode: "configured"` and `durable: true`; that flag only means "a writable non-fallback directory was found", and on Vercel it is not durable in any useful sense. |

Optional: `ANTHROPIC_MODEL` (use a cheaper tier for bulk scoring),
`REDDIT_USER_AGENT` (add your own contact address — Reddit treats generic agents
as abuse), `REDDIT_USERNAME` / `REDDIT_PASSWORD` (script-app password grant
instead of application-only auth).

**Do not set `PORT`.** Vercel manages it. Nothing here is mandatory — the app
boots with none of it and labels each unconfigured source on screen.

---

## 5. Day-over-day deltas will not persist on Vercel

The "what changed since yesterday" panel compares today's aggregates against a
daily JSON snapshot written to disk. A Vercel function's filesystem is read-only
apart from `/tmp`, and `/tmp` is scoped to a single function instance — a cold
start gets a fresh one.

The snapshot store handles this without crashing: it tries `SNAPSHOT_DIR`, then
`<repo>/data/snapshots` (read-only here), then the OS temp directory, and
reports `mode: "ephemeral"` when it lands on the last of those. When no earlier
snapshot exists, the dashboard says the comparison is not available yet rather
than implying nothing changed.

The practical outcome: on Vercel, expect deltas to be unavailable most of the
time. If day-over-day trend is a requirement, deploy to a host with a persistent
disk and point `SNAPSHOT_DIR` at it — [`DEPLOY.md` §4](DEPLOY.md) covers this for
Render.

## 6. Cold starts re-score everything, which costs money

Semantic scoring is cached by content hash **in the process**, so on a
long-lived server a repeat refresh only pays for genuinely new text. A serverless
function has no long-lived process: every cold start begins with an empty cache
and re-scores the whole corpus through the paid API. Sample rows are pre-scored
locally and are never sent to the API, so `DEMO_DATA=true` does not add to the
bill, but everything collected does.

Two related things to watch:

- **Function duration.** An uncached `/api/analysis` collects from four
  platforms and then scores every new record in batches. That is a slow request
  by serverless standards. Vercel's per-invocation timeout varies by plan; if
  you see a timeout error on first load, either raise `maxDuration` via the
  service's `functions` block in `vercel.json` (on a plan that allows it) or
  reduce the collection constants at the top of `server/server.js`.
- **The 5-minute response cache** is also in-process, so it only helps within the
  life of one instance.

---

## 7. What `vercel.json` does

This project deploys using **[Vercel Services](https://vercel.com/docs/services)**,
which is what its Framework Preset is set to in the Vercel dashboard. Services
mode requires a `services` key; the deployment fails at build time with
*"Project framework is set to `services`, but no services are declared"* if it is
absent.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "dashboard": {
      "root": "./",
      "framework": "express",
      "entrypoint": "server/server.js",
      "installCommand": "npm install"
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": { "service": "dashboard" } }
  ]
}
```

- **`services.dashboard`** declares the one service this project contains: the
  Express app.
- **`root: "./"`** is the repository root, deliberately **not** `server/`.
  `server/lib/dataset.js` reads `data/processed/synthetic_reddit_discord.csv`,
  which sits outside `server/`. Rooting the service at the repository keeps that
  file — and the rest of the tree — inside the build context, so behaviour
  matches a local run and a Render deploy. Install therefore uses the root
  `package.json`, which carries the same five runtime dependencies.
- **`entrypoint`** points at the Express app. `server.js` exports the app
  (`module.exports = app`) and only calls `listen()` when run directly, so it
  works both as a service entrypoint and as `node server.js` locally.
- **`rewrites`** exposes the service publicly. A service is internal by default:
  without a top-level rewrite naming it as `destination`, it receives no traffic
  at all.

**In services mode, top-level build keys are invalid.** `functions`,
`buildCommand`, `installCommand`, `outputDirectory` and `framework` are rejected
at the top level, because their owner would be ambiguous across services — they
belong inside a service object instead. An earlier version of this file used the
non-services shape (a top-level `functions.includeFiles` plus a rewrite to
`api/index.js`); that is the correct configuration only if the project's
Framework Preset is **Other**.

`api/index.js` is retained for that alternative: it re-exports the Express app as
a plain serverless function. If you prefer the non-services model, change the
Framework Preset to **Other** and use:

```json
{
  "functions": {
    "api/index.js": {
      "includeFiles": "{server/public/**,server/config/**,data/processed/**}"
    }
  },
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index.js" }]
}
```

There, `includeFiles` is required because those three trees are read at runtime
rather than `require`d, so Vercel's static analysis does not find them on its own.

Chart.js is served from `server/public/vendor/chart.umd.min.js`, which is
committed to the repository rather than loaded from a CDN. Nothing on the page
fetches a third-party asset at runtime, so an egress-restricted network cannot
leave the charts silently blank. Because Vercel builds from the repository rather
than your working tree, the file must be tracked — confirm with
`git ls-files server/public/vendor/`. `server/scripts/vendor-chartjs.js` refreshes
it from either `node_modules` location and exits cleanly if neither is present,
falling back to the committed copy.

---

## 8. Verify the deployment

Open `/api/health` on the deployment URL Vercel gave you. Expect roughly:

```json
{
  "ok": true,
  "games": ["PUBG", "Once Human", "Marvel Rivals", "Where Winds Meet", "World of Warcraft", "Community Test Channel"],
  "platforms": {
    "youtube": { "configured": true, "channels": 5 },
    "reddit":  { "configured": true, "subreddits": 5 },
    "discord": { "configured": false, "channels": 1 },
    "twitch":  { "configured": true, "categories": 5 }
  },
  "semantic_analysis": { "configured": true, "model": "claude-opus-5" },
  "discussion_summary": { "configured": true, "model": "gemini-3.8-flash", "engine": "Gemini", "scope": "All live platforms (never sample)" },
  "demo_data_enabled": true,
  "storage": { "mode": "ephemeral", "directory": "/tmp/…", "snapshots_held": 0, "retention_days": 90, "durable": false },
  "access_control": { "configured": true, "user_count": 2, "login_url": "/login", "session_secret_set": true }
}
```

You need to be signed in at `/login` just to load this page — `/api/health`
is behind the same access control as every other route, deliberately, so an
unauthenticated status check can't leak configuration state. If
`access_control.configured` is `false`, stop here: the deployment is
currently open to the public internet, and §4 above is what to fix. If
`access_control.session_secret_set` is `false`, set `SESSION_SECRET` — without
it, cold starts will keep signing people out (see §4).

`configured` means the credentials are present, not that the last call
succeeded. The `games` list is the union of the `game` values across all four
config files, which is why the placeholder `"Community Test Channel"` from
`server/config/discord_channels.json` appears alongside the five titles.

The `storage` block above is what you see with `SNAPSHOT_DIR` **unset**: the
store falls through to the OS temp directory and reports `mode: "ephemeral"`,
`durable: false`, which is the point made in §5. If you did set
`SNAPSHOT_DIR=/tmp/gcp-snapshots` as suggested in §4, the same deployment reports
`mode: "configured"`, `directory: "/tmp/gcp-snapshots"` and `durable: true`.
Nothing has actually become durable — the flag only records that a writable
directory was found before the temp-directory fallback. Either way, expect
deltas to reset on a cold start.

Then open the dashboard and check the three banners at the top: the source
banner should show your configured platforms as **live**, the provenance banner
should report the sample share you expect, and the red error banner should be
absent. If a platform you configured is failing, its sample rows quietly return
in its place, so a higher-than-expected sample share is the first sign of a
credentials problem. Per-source failures are listed in the red banner and in
`fetch_errors` on `/api/analysis`.

The other two endpoints are `/api/analysis` (the full payload; `?force=1`
bypasses the cache) and `/api/methodology` (how every figure is calculated —
static, no *platform* credentials needed, useful as a first smoke test since
it works even with nothing else configured). All three still need valid
`AUTH_USERS` credentials if you've set them, same as every other route.

---

## 9. Subsequent deployments

Any push to the connected branch triggers a new deployment:

```bash
git add -A
git commit -m "describe your change"
git push
```

Changing which sources are tracked needs no code change — edit the JSON files in
`server/config/` and push. Changing an environment variable in the Vercel
dashboard requires a redeploy before it takes effect.
