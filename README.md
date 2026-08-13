# Gaming Community Pulse

A lightweight social-listening dashboard for gaming communities, built for
**Ruisheng Holdings**. It reads what players are publicly saying about five
titles — PUBG, Once Human, Marvel Rivals, Where Winds Meet and World of Warcraft
— across **YouTube, Reddit, Discord and Twitch**, and turns it into a one-minute
morning read: an AI-written briefing at the top, with the charts underneath as
the evidence.

The test it is built to pass is the client's own: someone should open this each
morning and understand what is happening across the gaming community within a
few minutes, without manually interpreting a wall of charts.

---

## Quick start

```bash
cd server
cp .env.example .env      # then fill in whichever credentials you have
npm install
npm start
```

Open **http://localhost:3000**.

**`server/.env` does not exist in a fresh clone.** It is gitignored, so
`cp .env.example .env` is a required step. Earlier versions of this README
claimed API keys were "already saved" there; that was true only on the original
author's machine.

Nothing in `.env` is mandatory. With an empty file the dashboard still boots —
every unconfigured source is labelled "not configured" on screen, sentiment falls
back to a local lexicon, and the illustrative sample data stands in where it can.
Credentials are what move each source from *absent or sample* to *live*.

Node 18 or newer. Full operational detail — endpoints, tuning constants,
troubleshooting — is in **[`server/README.md`](server/README.md)**.

---

## What you need to configure

| Variable | Unlocks | If absent |
|---|---|---|
| `ANTHROPIC_API_KEY` | Semantic sentiment (sarcasm, negation, gaming slang, non-English text), themes on live records, question and risk flags, and the AI daily briefing | Gaming-tuned lexicon fallback; live records carry no theme; no record-level risk flags, though theme-level risk detection still runs; briefing is composed from the computed figures and labelled as such |
| `YOUTUBE_API_KEY` | YouTube comments and video stats per tracked channel | YouTube absent from the dashboard — there is no YouTube sample data |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Live Reddit via the official OAuth API | Labelled illustrative sample rows stand in (or nothing, with `DEMO_DATA=false`) |
| `DISCORD_BOT_TOKEN` | Live Discord messages from channels the bot has been invited to | Labelled illustrative sample rows stand in (or nothing, with `DEMO_DATA=false`) |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Twitch top clips and the live-viewer snapshot | Twitch absent — there is no Twitch sample data |
| `DEMO_DATA` | `false` runs on collected data only | Defaults to `true` — the sample is included and labelled everywhere |
| `SNAPSHOT_DIR` | Where daily snapshots live, which is what makes day-over-day deltas possible | Defaults to `data/snapshots`, falling back to the OS temp directory. On ephemeral hosts, history resets |

Optional: `ANTHROPIC_MODEL`, `REDDIT_USERNAME` / `REDDIT_PASSWORD`,
`REDDIT_USER_AGENT`, `PORT`. Each is explained in `server/.env.example` and in
[`server/README.md` §2](server/README.md), which also states exactly what breaks
when a variable is missing.

---

## What it does

1. **Collects** public data in parallel from four platforms via their official
   APIs. Reddit is live through the OAuth API; Discord through a permissioned
   bot; YouTube through the Data API v3; Twitch through Helix.
2. **Scores** every record once — sentiment on a −100..+100 scale, sarcasm, a
   theme from a controlled vocabulary, whether it is a genuine question, and
   whether it signals a brewing community problem.
3. **Normalises engagement** onto a 0–100 Engagement Index, weighted and capped
   per platform so a Discord reaction and a Twitch clip view can sit in the same
   column honestly.
4. **Classifies publication region** — the region content was *published* in,
   from publisher-side signals. Individual commenters are never geolocated.
5. **Detects** volume spikes, ranks risks, and clusters recurring questions into
   a content shortlist.
6. **Compares** today against the last stored daily snapshot.
7. **Writes** the daily briefing that sits at the top of the dashboard.

The dashboard has a sticky global filter bar — media channel, product/game, time
range, publication region — and all four drive every chart, table and metric on
the page. Two panels are deliberately outside that: the briefing is written from
the full dataset (the panel says so when a filter is active), and the "Twitch —
live right now" snapshot is a point-in-time figure that responds to the
product/game filter only.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /` | The dashboard |
| `GET /api/analysis` | Full analysis plus row-level records. Cached 5 minutes; `?force=1` re-collects |
| `GET /api/methodology` | How every figure is calculated — formulae, weights, ceilings, region signal precedence, both sentiment engines and their limits |
| `GET /api/health` | Which platforms are configured, whether semantic scoring is active, and the snapshot storage mode |

---

## Cost

Semantic scoring calls a paid API once per batch of up to 40 **new** records.
Scoring is cached by content hash, so a repeat refresh only pays for text that
is genuinely new, and a reload inside the 5-minute cache window costs nothing.
Sample rows are pre-scored locally and are never sent to the API. The daily
briefing is one additional call per uncached refresh.

The cache lives in the process, so a serverless host or a free tier that spins
down when idle re-scores the whole corpus on every cold start. Run this on a
long-lived instance if cost matters. Leaving `ANTHROPIC_API_KEY` unset reduces
the API cost to zero, at the price of semantic sentiment, live-record themes,
record-level risk flags and the written brief.

The platform APIs themselves are free at this volume.

---

## Honest limitations

- **Sample data ships on by default.** 452 illustrative Reddit and Discord rows
  (295 Reddit, 157 Discord) are included unless you set `DEMO_DATA=false`. They
  are synthetic — generated to exercise the pipeline, not observed. Every one is
  tagged in the UI and counted in a provenance banner. Directional comparisons
  are reasonable; absolute figures are not measurements. With no credentials
  configured at all, the dashboard is 100% sample data, every record's region
  reads `Undetermined`, and sentiment comes from the lexicon rather than the
  semantic layer — the banners say all three, but it is worth knowing before a
  demo.
- **Sample rows are displaced per platform, not per game.** Configuring one
  Discord channel removes the Discord sample for *all* games, so coverage then
  reflects only the servers the bot has actually joined.
- **Engagement ceilings are calibration constants**, chosen as orders of
  magnitude, not licensed benchmarks. Re-tune them against RS's own campaign
  data before using the index in client reporting.
- **Regional splits are coarse for global publishers.** A channel like @PUBG
  declares one country, so its whole catalogue lands in one bucket. Records with
  no usable signal are reported as `Undetermined` rather than guessed at.
- **Day-over-day deltas need durable snapshot storage.** Free-tier Render and
  Vercel have ephemeral filesystems and will lose history.
- **No authentication.** The API returns row-level public post text to anyone who
  can reach the deployment. Put it behind access control before treating it as an
  internal tool.

---

## Repository structure

```
.
├── README.md                        ← this file
├── DEPLOY.md                        ← deploying to Render
├── VERCEL_DEPLOY.md                 ← deploying to Vercel
├── package.json                     ← root scripts; `npm start` runs the server
├── render.yaml                      ← Render blueprint
├── vercel.json                      ← Vercel routing and function bundling
├── api/index.js                     ← Vercel entry point (re-exports the Express app)
├── dashboard.html                   ← archived v1 static snapshot, frozen 30 Jul 2026
│
├── server/
│   ├── README.md                    ← operational reference: variables, endpoints, tuning
│   ├── server.js                    ← the pipeline and the API surface
│   ├── .env.example                 ← copy to .env
│   ├── package.json
│   ├── config/
│   │   ├── channels.json            ← YouTube channel per game
│   │   ├── subreddits.json          ← subreddit per game
│   │   ├── discord_channels.json    ← permissioned Discord channels
│   │   └── twitch_games.json        ← Twitch category per game
│   ├── lib/
│   │   ├── youtube.js               ← YouTube Data API v3
│   │   ├── reddit.js                ← Reddit OAuth API (live)
│   │   ├── discord.js               ← Discord bot REST API
│   │   ├── twitch.js                ← Twitch Helix API
│   │   ├── nlp.js                   ← semantic sentiment, themes, question/risk flags
│   │   ├── sentiment.js             ← gaming-tuned lexicon fallback
│   │   ├── engagement.js            ← the 0–100 Engagement Index
│   │   ├── region.js                ← publication-region classification
│   │   ├── analytics.js             ← spikes, themes, risks, question clusters, deltas
│   │   ├── store.js                 ← daily snapshots
│   │   ├── briefing.js              ← AI daily briefing
│   │   └── dataset.js               ← illustrative sample loader
│   ├── scripts/vendor-chartjs.js    ← copies Chart.js into public/vendor
│   └── public/
│       ├── dashboard-live.html      ← the live dashboard
│       └── vendor/
│           └── chart.umd.min.js     ← vendored Chart.js — no CDN dependency
│
├── report/
│   ├── GAMING_COMMUNITY_PULSE_REPORT.md   ← findings, methodology, recommendations
│   ├── PLATFORM_LANDSCAPE.md              ← how each platform's communities behave
│   ├── TOOL_LANDSCAPE.md                  ← the social-listening market and where this fits
│   ├── CLIENT_ANSWERS.md                  ← the client's questions, answered
│   ├── PRESENTATION_SCRIPT.md
│   └── *.docx                             ← Word versions: findings_summary,
│                                             methodology_and_limitations,
│                                             recommendations, platform_landscape,
│                                             tool_landscape, client_answers
│
├── slides/summary_deck.pptx
│
├── data/
│   ├── raw/                         ← one-time YouTube captures from v1
│   ├── processed/                   ← v1 dataset, v1 analysis, and the sample CSV
│   └── snapshots/                   ← daily snapshots written at runtime (gitignored)
│
└── scripts/                         ← v1 Python/Node generators, kept for transparency
```

Chart.js lives under `server/public/vendor/` and is deliberately **not**
gitignored, so the dashboard renders on an internal network with no CDN access.
It must be committed along with the rest of the source — at the time of writing
the file is present on disk but still untracked, so confirm
`git ls-files server/public/vendor/` returns it before deploying, or the hosted
dashboard will have no charting library. `npm run vendor` (from `server/`)
refreshes it after an upgrade.

`data/snapshots/` is gitignored: it is runtime state, regenerated on every
refresh.

Two root `package.json` scripts generate the document deliverables. Neither is
needed to run or deploy the dashboard.

- **`npm run build:docs`** runs `scripts/md_to_docx.js`, which renders the
  markdown deliverables in `report/` to Word. The three per-outcome documents
  (`findings_summary.docx`, `methodology_and_limitations.docx`,
  `recommendations.docx`) are sliced out of `GAMING_COMMUNITY_PULSE_REPORT.md`
  rather than maintained separately, so they cannot drift away from the report
  the way the hand-written v1 copies did.
- **`npm run build:deck`** regenerates `slides/summary_deck.pptx`.

Both need the root devDependencies (`docx`, `pptxgenjs`) — run `npm install` at
the repository root first.

---

## Other things in here

- **The reports** in `report/` are the client-facing deliverables. The two newest
  are `PLATFORM_LANDSCAPE.md` (what each platform's engagement metrics actually
  measure, and how to read the dashboard without drawing the wrong conclusion)
  and `TOOL_LANDSCAPE.md` (the existing social-listening market, what the
  incumbents do well, and why this exists).
- **`dashboard.html`** is the archived v1 snapshot, frozen at 30 July 2026, kept
  for reference. It is not the live tool and its Reddit and Discord figures are
  synthetic.
- **Deployment**: [`DEPLOY.md`](DEPLOY.md) for Render,
  [`VERCEL_DEPLOY.md`](VERCEL_DEPLOY.md) for Vercel. Read the snapshot-storage
  section in either before relying on day-over-day deltas.
