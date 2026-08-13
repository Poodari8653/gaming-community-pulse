# Gaming Community Pulse — Server

The Node/Express service behind the dashboard. It collects public gaming
discussion from **YouTube, Reddit, Discord and Twitch** via those platforms'
official APIs, scores every record for sentiment, theme, question and risk
signals, normalises engagement onto a comparable 0–100 index, classifies the
region content was published in, computes what has changed since yesterday,
writes a daily briefing, and serves the whole thing at `http://localhost:3000`.

This file is the operational reference. For the client-facing story, see
`../report/GAMING_COMMUNITY_PULSE_REPORT.md`.

---

## 1. Run it

```bash
cd server
cp .env.example .env      # then fill in whichever credentials you have
npm install
npm start
```

Open **http://localhost:3000**.

**There is no pre-populated `.env` in the repository.** `.env` is gitignored and
does not exist in a fresh clone — `cp .env.example .env` is a required step, not
an optional one. Any earlier documentation claiming credentials are "already
saved in `server/.env`" was describing one developer's machine.

Nothing in `.env` is mandatory. The server boots with an empty file; every
unconfigured source is labelled "not configured" on screen rather than failing,
and sentiment falls back to the local lexicon. You add credentials to switch
each source from *absent or sample* to *live*.

Node 18 or newer is required (the platform wrappers use the global `fetch`).

`npm start` from the repository root works too — `server.js` loads `.env` from
its own directory regardless of where you started the process.

---

## 2. Environment variables

Every variable in `.env.example`, what it unlocks, and what happens without it.

### Credentials

| Variable | Unlocks | If absent |
|---|---|---|
| `ANTHROPIC_API_KEY` | Semantic scoring (sentiment on −100..+100, sarcasm, controlled-vocabulary themes, `is_question`, `is_risk`, language) **and** the AI-written daily briefing | Sentiment falls back to the gaming-tuned lexicon in `lib/sentiment.js`; live records get **no theme**, so the themes panel is driven by sample rows only; `is_risk` is never set, so the only risks detected are theme-level ones; the briefing is composed deterministically from the computed figures and labelled `generated_by: "rule-based fallback"`. The dashboard's source banner states which engine actually ran. |
| `YOUTUBE_API_KEY` | YouTube Data API v3 — recent uploads per configured channel and their comments, plus `snippet.country`, the strongest publication-region signal available | No YouTube records at all. There are **no** YouTube sample rows, so the platform simply disappears from the dashboard, marked "not configured — set YOUTUBE_API_KEY". |
| `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Live Reddit via the official OAuth API — top posts of the week plus recent comments per configured subreddit | With `DEMO_DATA=true`, 295 labelled illustrative sample rows stand in. With `DEMO_DATA=false`, no Reddit data at all. |
| `DISCORD_BOT_TOKEN` | Live Discord via the bot REST API — recent messages and reaction counts from channels the bot has been invited to, plus the guild's `preferred_locale` | With `DEMO_DATA=true`, 157 labelled illustrative sample rows stand in. With `DEMO_DATA=false`, no Discord data at all. |
| `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` | Twitch Helix — top clips per game category (last 30 days) and a live-viewer snapshot | No Twitch records and an empty "Twitch — live right now" panel. There are **no** Twitch sample rows. |

Both halves of a pair are required. `REDDIT_CLIENT_ID` without
`REDDIT_CLIENT_SECRET` counts as unconfigured, and likewise for Twitch.

### Optional

| Variable | Purpose | Default |
|---|---|---|
| `ANTHROPIC_MODEL` | Model used for scoring and the briefing. Set a cheaper tier to trade some accuracy for cost on high-volume scoring. | `claude-opus-5` |
| `REDDIT_USERNAME` + `REDDIT_PASSWORD` | Switches Reddit auth from application-only to the script-app password grant. Only needed for installs that require it. | Unset — application-only (`client_credentials`), which is read-only access to public subreddits with no user account acting on anyone's behalf |
| `REDDIT_USER_AGENT` | Reddit requires a descriptive, identifying User-Agent and treats generic ones as abuse. Override to add your own contact address. | `nodejs:gaming-community-pulse:v2.0 (social listening prototype for Ruisheng Holdings)` |

### Behaviour flags

| Variable | Purpose | Default |
|---|---|---|
| `DEMO_DATA` | `false` excludes the illustrative sample entirely and runs on collected data only. Any other value (including unset) leaves it on. | `true` |
| `SNAPSHOT_DIR` | Where daily snapshots are written. Point it at a mounted volume in production so day-over-day history survives restarts and redeploys. | `<repo>/data/snapshots`, falling back to the OS temp directory |
| `PORT` | Listening port. Render, Vercel and most PaaS providers inject this — leave it unset there. | `3000` |

---

## 3. What is live and what is sample

Rebuilt from `server.js`. "Live" means the platform is collected from its
official API when its credentials are present.

| Media channel | Live? | What is collected | Sample fallback |
|---|---|---|---|
| **YouTube** | Live with `YOUTUBE_API_KEY` | Last 8 uploads per configured channel, plus up to 25 comments per video in each of two orderings (`time` and `relevance`), merged and deduplicated. Channel country and content language captured as region signals. | None — the platform is simply absent |
| **Reddit** | **Live** with `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Top 50 posts of the trailing week and 100 recent comments per configured subreddit, via `oauth.reddit.com`. Subreddit name, subscriber count and declared language captured. | 295 sample rows when unconfigured and `DEMO_DATA=true` |
| **Discord** | **Live** with `DISCORD_BOT_TOKEN` | Last 100 messages per configured channel, with reaction totals as the engagement metric and the guild's declared locale as a region signal. | 157 sample rows when unconfigured and `DEMO_DATA=true` |
| **Twitch** | Live with `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` | Top 20 clips per game category from the last 30 days, plus a point-in-time live-viewer snapshot per category (never sentiment-scored, never in the time series). The text scored for a clip is its **title**, which a streamer wrote as promotion — read Twitch sentiment as broadcaster framing, not player opinion. | None — the platform is simply absent |

Reddit and Discord were static in v1; both are live now. This table supersedes
the v1 one, which listed them as static.

**How the sample is displaced.** Sample rows only stand in for a media channel
that returned **no live rows in this refresh**. The moment a channel produces
live records, its sample rows are dropped rather than stacked on top of real
data. Two consequences worth knowing:

- The substitution is per-channel, not per-channel-and-game. The shipped
  `discord_channels.json` contains a single test channel, so as soon as
  `DISCORD_BOT_TOKEN` is set, **all** Discord sample rows disappear — including
  the ones standing in for the five tracked titles. Discord coverage then
  reflects only the channels you have actually been invited to.
- If a platform is configured but its call fails (bad credentials, revoked bot),
  it returns zero rows, so its sample rows come back. Check the red error banner
  or `fetch_errors` in the API response before reading a sample-heavy dashboard
  as a live one.

Sample rows are labelled everywhere: `data_type: "sample"`, `is_sample: true`,
a tag on every row in the UI, and a provenance banner stating what share of the
dataset they represent. They are pre-scored by the lexicon and are **never sent
to the semantic API**.

---

## 4. The pipeline

`server.js` runs six steps on every uncached request:

1. **Collect** — the four platform wrappers run in parallel. Each returns rows
   in one shared schema plus whatever publication-region signal that platform
   exposes. A failure in one wrapper is recorded in `fetch_errors` and does not
   stop the others.
2. **Enrich** — every collected row is scored once by `lib/nlp.js` (sentiment,
   sarcasm, theme, `is_question`, `is_risk`, language), given an Engagement
   Index by `lib/engagement.js`, and classified by `lib/region.js`.
3. **Aggregate** — `lib/analytics.js` produces the time series, spike
   detections, theme aggregates, risk scores and question clusters.
4. **Compare** — `lib/store.js` reads the most recent earlier daily snapshot,
   deltas are computed against it, and today's snapshot is written.
5. **Brief** — `lib/briefing.js` writes the daily narrative from the finished
   analysis.
6. **Serve** — aggregates **and** row-level records are returned together, so
   the dashboard's global filters re-derive every panel client-side with no
   round trip.

### Derived measures, briefly

- **Sentiment** runs −100 to +100. Positive above +15, negative below −15.
  Records carry a 0–1 confidence and a `sentiment_method` of `claude` or
  `lexicon`, so you can always tell which engine produced a figure.
- **Engagement Index** is 0–100 per record:
  `index = 100 × clamp( ln(1 + Σ metric×weight) / ln(1 + ceiling_platform), 0, 1 )`.
  Weights reflect author effort (a Reddit comment counts 5× an upvote; a Discord
  reaction 10×, since Discord has no like button), and each platform is divided
  by its own viral ceiling so cross-platform comparison is valid. A game's figure
  is the **mean** of its records, never the sum; volume is reported separately as
  `record_count`. The ceilings are calibration constants, not licensed
  benchmarks — re-tune them against RS's own campaign data before using the index
  in client reporting.
- **Publication region** is the region content was *published* in, decided from
  publisher-side signals in this precedence: channel country (0.95 confidence) →
  region declared in our own config (0.9) → Discord guild locale (0.8) → content
  language (0.7) → detected text language (0.4). Individual commenters are never
  geolocated. Anything with no usable signal is reported as `Undetermined` rather
  than bucketed into a default.
- **Spikes** are volume outliers against a trailing six-bucket baseline: at least
  2 standard deviations above it *and* at least 1.5× its mean, with a minimum of
  3 records so a flat low-volume stretch cannot manufacture drama. The `spikes`
  array in the API is computed on **weekly** buckets across the whole dataset;
  the dashboard recomputes the same test over whatever your filters currently
  select, switching to daily buckets for windows under about ten weeks, so the
  two lists will not always match.
- **Risks** come from two sources: records the semantic layer flagged as
  escalation-worthy (grouped by game), and themes with at least 4 mentions whose
  negative share reaches 55% and whose mean sentiment is at or below −10. Each
  carries a 0–100 severity.
- **Recurring questions** are clustered by Jaccard overlap of content words
  (threshold 0.4), so "asked 11×" means eleven people asked the same thing, not
  that eleven strings ended in a question mark.

---

## 5. API endpoints

### `GET /api/analysis`

The full payload the dashboard renders: `overall`, `games_summary`,
`platform_summary`, `region_summary`, `themes`, `risks`, `spikes`,
`daily_series`, `weekly_series`, `recurring_questions`, `top_posts`, `videos`,
`twitch_live`, `reddit_communities`, `data_sources`, `fetch_errors`,
`sentiment_engine`, `storage`, `provenance`, `deltas`, `briefing`, and
`records` (every row, so the global filters work client-side).

Results are cached in memory for **5 minutes**. Append `?force=1` to bypass the
cache and run a full collection — this is what the dashboard's "Refresh data"
button does. Note that a forced refresh re-collects from every platform and
re-scores any text not already in the content-hash cache, so it is the expensive
call.

The response includes row-level text. It is not a small payload, and it is not
access-controlled — see §9.

### `GET /api/methodology`

Static, machine-readable methodology: the Engagement Index formula, weights,
ceilings, bands and limitations; the region signal precedence with the API field
behind each; the sentiment scale, both engines and what each can and cannot do;
the six-step data flow with the dimensions collected and fields derived; and the
briefing's recommended word count with the reasoning for it. Makes no external
calls and needs no credentials. The dashboard renders it in the "How every
number on this page is calculated" panel.

### `GET /api/health`

Deployment check. Returns:

```json
{
  "ok": true,
  "games": ["PUBG", "Once Human", "Marvel Rivals", "Where Winds Meet", "World of Warcraft", "Community Test Channel"],
  "platforms": {
    "youtube": { "configured": true,  "channels": 5 },
    "reddit":  { "configured": true,  "subreddits": 5 },
    "discord": { "configured": false, "channels": 1 },
    "twitch":  { "configured": true,  "categories": 5 }
  },
  "semantic_analysis": { "configured": true, "model": "claude-opus-5" },
  "demo_data_enabled": true,
  "storage": {
    "mode": "repo",
    "directory": "/path/to/data/snapshots",
    "snapshots_held": 3,
    "retention_days": 90,
    "durable": true
  }
}
```

`configured` means the credentials are present, not that the last call
succeeded. For collection failures, read `fetch_errors` in `/api/analysis`.
`"Community Test Channel"` in the `games` list is the placeholder entry in
`discord_channels.json` — see §8.

---

## 6. Daily snapshots and day-over-day deltas

`lib/store.js` writes one compact JSON snapshot per day — aggregates only, no
raw records, a few KB. The next day's refresh reads the most recent *earlier*
snapshot and computes deltas from it, so a weekend gap in collection still
produces a meaningful comparison. Snapshots older than 90 days are pruned.

The directory resolves in this order, taking the first that is writable:

1. `SNAPSHOT_DIR`, if set
2. `<repo>/data/snapshots`
3. the OS temp directory (`mode: "ephemeral"`)

**Deltas need durable storage.** On the first day, or any time the previous
snapshot has been wiped, `deltas.available` is `false` and the UI says the
comparison is not available yet rather than implying nothing changed. Free-tier
**Render** and **Vercel** both have ephemeral filesystems: the repo directory is
recreated from the build on every deploy, and Vercel's function filesystem is
read-only apart from `/tmp`, which does not survive a cold start. On those
plans, expect deltas to reset. Attach a persistent disk (or any durable mount)
and point `SNAPSHOT_DIR` at it to keep history.

One caveat when reading `/api/health`: `storage.durable` is `true` for modes
`configured` and `repo`, which means "a writable non-temp directory was found",
not "this survives a redeploy". On free-tier PaaS you will see `durable: true`
and still lose history at the next deploy.

---

## 7. Cost

Semantic scoring calls a paid API. Three things keep that bounded, and one
undoes them:

- **Batching.** Records are scored 40 to a request, at most 4 requests in flight.
- **Content-hash caching.** Each record is keyed by a SHA-1 of its text, so a
  repeat refresh only pays for text that is genuinely new. A dashboard reload
  within the 5-minute cache window costs nothing at all.
- **Sample rows never reach the API.** Rows loaded under `DEMO_DATA` are
  pre-scored by the local lexicon in `lib/dataset.js` and are excluded from the
  scoring path entirely.
- **The cache is in-process.** It dies with the process. On a serverless host
  every cold start re-scores the whole corpus, and on a free tier that spins down
  when idle, every wake-up does the same. If cost matters, run this on a
  long-lived instance rather than serverless, and use a cheaper `ANTHROPIC_MODEL`
  for bulk scoring.

The daily briefing is one additional call per uncached refresh.

Set no `ANTHROPIC_API_KEY` at all and the API cost is zero — you lose semantic
sentiment, themes on live records, risk flags and the written brief, and the
dashboard says so on screen.

The platform APIs used here are free at this volume. A full YouTube refresh of
five channels costs roughly 95 units against a 10,000/day quota. Reddit's
free-tier OAuth allows 100 queries/minute averaged over ten minutes; this makes
three calls per subreddit per refresh.

---

## 8. Configuration files

All under `server/config/`. Restart the server after editing; no code changes
are needed to add a source.

| File | Shape | Notes |
|---|---|---|
| `channels.json` | `{ "game", "handle" }` | `handle` is the part after `@` in the channel URL (`youtube.com/@PUBG` → `"PUBG"`) |
| `subreddits.json` | `{ "game", "subreddit", "region" }` | `subreddit` without the `r/`. `region` optionally declares a known regional community — set it to `Americas`, `EMEA` or `APAC` and it is trusted at 0.9 confidence, above language inference. |
| `discord_channels.json` | `{ "game", "channelId", "region" }` | The bot must be invited to the server that channel belongs to |
| `twitch_games.json` | `{ "game", "twitchCategory" }` | Must match Twitch's exact category display name, e.g. `"PUBG: BATTLEGROUNDS"` |

The set of games shown on the dashboard is the union of the `game` values across
all four files, so a game only needs to appear in the config for the channels you
actually track it on. That is also why the placeholder `"Community Test Channel"`
in `discord_channels.json` shows up as a sixth "game" in `/api/health` — replace
that entry with real channels and it goes away.

Collection volumes are constants near the top of `server.js`:
`VIDEOS_PER_CHANNEL` (8), `COMMENTS_PER_VIDEO_PER_ORDER` (25),
`REDDIT_POSTS_PER_SUB` (50), `REDDIT_COMMENTS_PER_SUB` (100), `REDDIT_WINDOW`
(`week`), `DISCORD_MESSAGES_PER_CHANNEL` (100), `TWITCH_CLIPS_PER_GAME` (20),
`TWITCH_CLIPS_WINDOW_DAYS` (30), `CACHE_TTL_MS` (5 minutes).

---

## 9. Dashboard notes

- **Global filter bar.** Media channel, product/game, time range and publication
  region sit in a sticky bar at the top and drive every chart, table and metric
  below. Filtering is client-side over the records returned with the analysis, so
  it is instant. One exception: "Twitch — live right now" is a point-in-time
  viewer snapshot rather than a set of records, so it responds to the
  product/game filter only, and the panel says so.
- **The briefing is written from the full dataset**, not from your filter
  selection. The briefing panel raises a notice when a channel, game, region or
  custom date filter is active. It does **not** raise that notice when you only
  switch between the time-range presets, and the default preset is 30 days — so
  on first load the panels below can already be showing a narrower window than
  the briefing was written from.
- **Time range anchors to the newest record**, not to the wall clock, so the
  historical sample data does not produce an empty dashboard on first load.
- **Chart.js is vendored**, not loaded from a CDN — see §10.
- **Accessibility.** Skip link to the briefing; filters are real `<button>`
  elements with `aria-pressed`; every control has a label; visible focus outlines
  throughout; `aria-live` regions on the briefing, KPI row and filter summary;
  a visually-hidden text-equivalent table for every chart; captions on data
  tables; and the loading spinner respects `prefers-reduced-motion`. All
  interpolated text passes through an HTML-escaping helper.
- **No authentication.** `/api/analysis` returns row-level public post text to
  anyone who can reach it. Public posts are public, but put the deployment behind
  access control before treating it as an internal tool.

---

## 10. Chart.js is vendored locally

`server/public/vendor/chart.umd.min.js` is a copy of Chart.js that belongs in the
repository, and the dashboard loads it from there. There is **no CDN
dependency**, so the dashboard renders correctly on an egress-restricted
internal network — which would otherwise leave every chart blank with no visible
error.

The path is deliberately excluded from `.gitignore`, but at the time of writing
the file is present on disk and still untracked. Confirm
`git ls-files server/public/vendor/` returns it before deploying: a host builds
from the repository, not from your working tree.

`server/scripts/vendor-chartjs.js` copies the file out of `node_modules`. Run
`npm run vendor` from `server/` to refresh it after a Chart.js upgrade. Both
`package.json` files call it from `postinstall` with `|| true`, so a failure
never breaks an install: the script looks for `server/node_modules/chart.js`
specifically, so a root-level `npm install` cannot satisfy it, and the vendored
copy is expected to be in the repository already.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Startup logs "Not configured: …" | Expected with an empty `.env`. Those sources are skipped; everything else still runs. |
| Sentiment banner says "gaming-tuned lexicon fallback" | `ANTHROPIC_API_KEY` is unset or the `@anthropic-ai/sdk` package is missing. The banner reflects only whether the key and SDK are present — if the key is set but batches are failing, the banner still names the model, so check `sentiment_engine.errors` and `sentiment_engine.fallback` in `/api/analysis`, and the per-record `sentiment_method`, to see what was actually scored semantically. |
| Themes panel looks thin, or only shows sample data | Themes on live records come from the semantic layer. Without `ANTHROPIC_API_KEY`, live rows carry no theme. |
| `Reddit auth failed: …` | Wrong client ID/secret, or the app at reddit.com/prefs/apps is not of type "script". A generic User-Agent can also be rejected — set `REDDIT_USER_AGENT`. |
| Discord returns messages with empty text | **Message Content Intent** is not enabled in the Developer Portal (app → Bot → Privileged Gateway Intents). The call succeeds but content comes back blank. |
| Discord 403 / "Missing Access" | The bot token alone is not enough — the bot must be invited to the server with **View Channels** and **Read Message History**. |
| `Could not resolve Twitch category "…"` | `twitchCategory` must match Twitch's display name exactly, including case and punctuation. Check the category page on twitch.tv. |
| YouTube 403 / quota exceeded | The 10,000-unit daily quota resets at midnight Pacific. `search.list` is deliberately avoided; recent uploads come from the free uploads playlist. |
| `Could not resolve channel handle "@…"` | The handle in `channels.json` is wrong or the channel was renamed. Use the part after `@` in the channel URL. |
| Deltas always say "no comparison available yet" | No earlier snapshot exists. Check `storage` in `/api/health` — if `mode` is `ephemeral`, or the host wipes the directory between deploys, set `SNAPSHOT_DIR` to a durable mount. |
| Charts are blank | The vendored Chart.js is missing from `public/vendor/`. Run `npm install && npm run vendor` in `server/`. |
| Port already in use | Set `PORT` in `.env`. |
| First load is slow | Expected on an uncached refresh: four platform collections plus semantic scoring of everything new. Subsequent loads are served from the 5-minute cache. |
