# Deploying Gaming Community Pulse to Vercel

The repository is configured for Vercel: `api/index.js` re-exports the Express
app as a serverless function, and `vercel.json` routes every request to it, so
the dashboard at `/` and the three API endpoints all work from one function.

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
   - **Framework Preset**: leave as **Other** — Vercel picks up `vercel.json`.
   - **Root Directory**: `./` (default). Do **not** set it to `server/`; the
     function entry point is `api/index.js` at the repository root.
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
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add YOUTUBE_API_KEY production
# …and so on for each variable in §4
npx vercel --prod
```

---

## 4. Environment variables

Seven credentials and two behaviour flags. Earlier versions of this document
listed only two variables — that predates Reddit going live, the semantic
scoring layer and the snapshot store.

### Credentials

| Key | Unlocks | If you leave it blank |
|---|---|---|
| `ANTHROPIC_API_KEY` | Semantic sentiment (sarcasm, negation, gaming slang, non-English text), themes on live records, question and risk flags, and the AI daily briefing | Gaming-tuned lexicon fallback; live records carry no theme; no record-level risk flags, though theme-level risk detection still runs; the brief is computed from the figures and labelled as such on screen |
| `YOUTUBE_API_KEY` | YouTube comments and video stats for the five tracked channels | YouTube absent from the dashboard — there is no YouTube sample data |
| `REDDIT_CLIENT_ID` | Live Reddit via the official OAuth API (needs the secret too) | Labelled illustrative sample rows stand in, or nothing if `DEMO_DATA=false` |
| `REDDIT_CLIENT_SECRET` | As above | As above |
| `DISCORD_BOT_TOKEN` | Live Discord messages from channels the bot has been invited to | Labelled illustrative sample rows stand in, or nothing if `DEMO_DATA=false` |
| `TWITCH_CLIENT_ID` | Twitch top clips and the live-viewer snapshot (needs the secret too) | Twitch absent — there is no Twitch sample data |
| `TWITCH_CLIENT_SECRET` | As above | As above |

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
  you see a timeout error on first load, either raise `maxDuration` for
  `api/index.js` in `vercel.json` (on a plan that allows it) or reduce the
  collection constants at the top of `server/server.js`.
- **The 5-minute response cache** is also in-process, so it only helps within the
  life of one instance.

---

## 7. What `vercel.json` does

```json
{
  "version": 2,
  "functions": {
    "api/index.js": {
      "includeFiles": "{server/public/**,server/config/**,data/processed/**}"
    }
  },
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index.js" }]
}
```

- **`rewrites`** sends every path to the Express app, which serves the dashboard
  at `/`, static assets from `server/public/`, and the three API endpoints.
- **`includeFiles`** forces three trees into the function bundle that static
  analysis would otherwise miss, because they are read at runtime rather than
  `require`d:
  - `server/public/**` — the dashboard and the vendored Chart.js
  - `server/config/**` — which channels, subreddits, Discord channels and Twitch
    categories are tracked
  - `data/processed/**` — the illustrative sample CSV used when `DEMO_DATA` is on

  `server/lib/**` and `server/server.js` are pulled in automatically through
  `require`.

Chart.js is served from `server/public/vendor/chart.umd.min.js`, which lives in
the repository rather than being loaded from a CDN. Nothing on the page fetches a
third-party asset at runtime, which also means an egress-restricted network
cannot leave the charts silently blank. Vercel builds from the repository, so the
file has to be tracked by git — it is untracked at the time of writing, so run
`git ls-files server/public/vendor/` and commit it if that comes back empty,
otherwise the deployed dashboard has no charting library.

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
  "demo_data_enabled": true,
  "storage": { "mode": "ephemeral", "directory": "/tmp/…", "snapshots_held": 0, "retention_days": 90, "durable": false }
}
```

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
static, no credentials needed, useful as a first smoke test because it works
even with nothing configured).

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
