# Deploying to Render

Render is the recommended host for this project: it runs a long-lived Node
process, which means the in-memory scoring cache survives between requests, and
it can mount a persistent disk, which is what day-over-day deltas need.

The repository ships a `render.yaml` blueprint that defines the service. Two
steps need a human: pushing to GitHub, and entering credentials in Render's
dashboard. Budget about ten minutes.

**Prerequisites:** a GitHub account, a Render account, and whichever platform
credentials you intend to use (see the table in §3 — none are strictly
mandatory).

---

## 1. Push the code to GitHub

The repository already has a remote at
`https://github.com/Poodari8653/gaming-community-pulse`, with `main` and `dev`
branches. If you are working in that repository, push as normal from wherever
you cloned it:

```bash
cd /path/to/gaming-community-pulse   # your local clone
git push
```

If you are setting up a fresh repository instead:

1. Create an empty repo at [github.com/new](https://github.com/new) — **do not**
   initialise it with a README.
2. From your clone:

```bash
cd /path/to/gaming-community-pulse
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

`.env` and `node_modules/` are gitignored, so no credentials leave your machine.
`server/public/vendor/chart.umd.min.js` is deliberately **not** ignored — it must
be committed, or the deployed dashboard has no charting library. It is present on
disk but untracked at the time of writing, so check it before you push:

```bash
git ls-files server/public/vendor/     # must print chart.umd.min.js
git add server/public/vendor/chart.umd.min.js
```

---

## 2. Create the Render service

1. Go to [render.com](https://render.com) and sign in.
2. **New +** → **Blueprint**, and point it at the repository. Render reads
   `render.yaml` and pre-fills the service: name `gaming-community-pulse`, root
   directory `server`, build `npm install`, start `npm start`.
3. Choose the branch you want deployed. This repository's default branch is
   `dev`; `main` also exists. Render auto-deploys on every push to whichever
   branch you connect.

To set it up manually instead: **New +** → **Web Service** → select the repo →
**Root Directory** `server`, **Build Command** `npm install`, **Start Command**
`npm start`.

---

## 3. Add the environment variables

`render.yaml` declares ten credentials as `sync: false`, meaning Render will
prompt for them rather than storing them in the repository. Add them in the
service's **Environment** tab.

**Set `AUTH_USERS` and `SESSION_SECRET` before you finish this section.**
Every other row in this table is optional — the dashboard boots and runs
without it, just with that source marked unavailable. These two are not like
that: leaving `AUTH_USERS` unset means the deployed URL is open to anyone on
the internet who finds it, with no login; leaving `SESSION_SECRET` unset means
signed-in users get logged out every time Render restarts the service. This is
meant to be an internal RS tool, so treat both rows as mandatory even though
Render will happily let you skip them.

| Key | Unlocks | If you leave it blank |
|---|---|---|
| `AUTH_USERS` | **Required.** Comma-separated `username:password` pairs (e.g. `alice:correct-horse-battery,bob:another-passphrase`) — gates a real `/login` page in front of every route, dashboard included | The deployment is publicly reachable with no login. A loud warning prints in the Render service logs at every startup when this is the case — treat that warning as blocking. |
| `SESSION_SECRET` | **Required.** Signs the session cookie `/login` issues. Any long random string, e.g. `openssl rand -hex 32`. | A random secret is generated per process start, so every restart or redeploy signs everyone out. A loud warning prints in the logs when this is the case. |
| `ANTHROPIC_API_KEY` | Semantic sentiment (sarcasm, negation, gaming slang, non-English text), themes on live records, question and risk flags, and the AI daily briefing | Lexicon fallback; live records carry no theme; no record-level risk flags, though theme-level risk detection still runs; the brief is computed rather than written, and says so |
| `YOUTUBE_API_KEY` | YouTube comments and video stats | YouTube absent — there is no YouTube sample data to stand in |
| `REDDIT_CLIENT_ID` | Live Reddit (with the secret below) | Labelled sample rows stand in, or nothing if `DEMO_DATA=false` |
| `REDDIT_CLIENT_SECRET` | Live Reddit (with the ID above) | As above |
| `DISCORD_BOT_TOKEN` | Live Discord from channels the bot has joined | Labelled sample rows stand in, or nothing if `DEMO_DATA=false` |
| `TWITCH_CLIENT_ID` | Twitch clips and live-viewer snapshot (with the secret below) | Twitch absent — there is no Twitch sample data |
| `TWITCH_CLIENT_SECRET` | Twitch clips and live-viewer snapshot (with the ID above) | As above |
| `GEMINI_API_KEY` | The "Top discussions" panel — a second, independent AI pass (Gemini, not Claude) that clusters each game's live Reddit discussion into sub-topics with grounded quotes | Just that one panel is unavailable; everything else, including Claude's own sentiment and theme detection, is unaffected |

Two behaviour flags are already set in `render.yaml` and can be edited in the
same tab:

| Key | Blueprint value | Meaning |
|---|---|---|
| `DEMO_DATA` | `"true"` | Include the labelled illustrative sample. Set to `"false"` to run on collected data only. |
| `SNAPSHOT_DIR` | `/opt/render/project/src/data/snapshots` | Where daily snapshots are written — read §4 before trusting this for history |

Optional extras, none of which are set by the blueprint: `ANTHROPIC_MODEL` (to
use a cheaper tier for bulk scoring), `REDDIT_USER_AGENT` (add your own contact
address), `REDDIT_USERNAME` / `REDDIT_PASSWORD` (script-app password grant
instead of application-only auth).

**Do not set `PORT`.** Render injects it and `server.js` already reads
`process.env.PORT`.

If any of these credentials — including `AUTH_USERS` passwords — have
previously been shared over chat or email, rotate them before deploying:
Discord in the
[Developer Portal](https://discord.com/developers/applications) (Bot → Reset
Token), Twitch in the [developer console](https://dev.twitch.tv/console) (open
the app → New Secret), Reddit at
[reddit.com/prefs/apps](https://www.reddit.com/prefs/apps), YouTube in the Google
Cloud Console, Anthropic in the
[console](https://console.anthropic.com/settings/keys).

---

## 4. Snapshot storage — read this before relying on deltas

The "what changed since yesterday" figures come from a daily JSON snapshot
written to disk. If that directory is wiped, the dashboard honestly reports that
no comparison is available yet — it never fabricates movement — but you also
never accumulate history.

**The blueprint's default is not durable.** `/opt/render/project/src/data/snapshots`
sits inside the deployed source tree, which Render rebuilds from the repository
on every deploy. It is writable, so snapshots accumulate while the service is up,
and they are lost at the next deploy or when a free instance is recycled.

To keep history across deploys, attach a persistent disk (Render's disks require
a paid instance type; they are not available on the free plan):

1. Service → **Disks** → **Add Disk**, mount path e.g. `/var/data`.
2. Change `SNAPSHOT_DIR` to `/var/data/snapshots`.

One thing to be aware of when checking `/api/health`: `storage.durable` reports
`true` whenever a writable non-temporary directory was found. It means "we can
write here", not "this survives a redeploy". On the free plan you will see
`durable: true` and still lose history.

Snapshots are aggregates only — a few KB per day, no raw records — and anything
older than 90 days is pruned automatically.

---

## 5. Deploy

Click **Create Web Service** (or **Apply**, from the Blueprint flow). The first
deploy takes a couple of minutes and you get a public URL of the form
`https://<service-name>.onrender.com`.

**Free tier behaviour worth planning around:**

- The service spins down after about 15 minutes of inactivity, so the first
  request after idle takes roughly 30–50 seconds to wake. Fine for a demo link;
  upgrade to a paid instance if it needs to be always-on.
- Every spin-down also clears the in-memory scoring cache, so the next refresh
  re-scores the corpus through the paid semantic API. On a long-lived instance
  that cache persists and only genuinely new text is scored. This is a cost
  consideration, not just a latency one.

---

## 6. Verify

Open `https://<your-service>.onrender.com/api/health`. You should see something
like:

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
  "discussion_summary": { "configured": true, "model": "gemini-3.8-flash", "engine": "Gemini", "scope": "Reddit only" },
  "demo_data_enabled": true,
  "storage": { "mode": "configured", "directory": "/var/data/snapshots", "snapshots_held": 1, "retention_days": 90, "durable": true },
  "access_control": { "configured": true, "user_count": 2, "login_url": "/login", "session_secret_set": true }
}
```

Note you need to be signed in at `/login` just to load this page at all, which
is correct — `/api/health` is behind the same access control as everything
else. If `access_control.configured` is `false` here, stop and go back to §3;
that means the deployment is currently open to the public internet. If
`access_control.session_secret_set` is `false`, set `SESSION_SECRET` — every
restart will otherwise sign people out.

Check each `configured` flag matches what you entered, and that
`semantic_analysis.configured` is `true` if you added an Anthropic key.
`configured` means the credentials are present — it does not mean the last call
succeeded.

The `games` list is the union of the `game` values across all four config files,
which is why the placeholder `"Community Test Channel"` from
`server/config/discord_channels.json` appears alongside the five titles. Replace
that entry with real channels and it disappears.

Then open the dashboard itself and confirm:

- The source banner shows each configured platform as **live** with a fetch
  timestamp, and the sentiment line names the semantic model rather than the
  lexicon fallback.
- The provenance banner reports the sample share you expect. If it says a higher
  percentage than you think it should, a platform you configured is failing —
  its sample rows come back when it returns no live data.
- The red error banner is absent. If it is showing, it lists the exact per-source
  failures (also available as `fetch_errors` in `/api/analysis`).
- Charts render. If they do not, `server/public/vendor/chart.umd.min.js` did not
  make it into the commit.

---

## 7. Subsequent deploys

Render auto-deploys on every push to the connected branch:

```bash
git add -A
git commit -m "describe your change"
git push
```

Changing which sources are tracked needs no code change — edit the JSON files in
`server/config/` (`channels.json`, `subreddits.json`, `discord_channels.json`,
`twitch_games.json`), commit, and push. See
[`server/README.md` §9](server/README.md) for the shape of each.
