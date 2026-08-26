# Gaming Community Pulse — Technical Metrics & Architecture Reference

This document describes, in detail, every metric, formula, and algorithm currently implemented in the codebase (`server/lib/*.js` and `server/server.js`), plus how data flows from each platform's API into the numbers shown on the dashboard. It reflects the code as it stands — v2.0.0 — not the original prototype.

---

## 1. Pipeline overview

Every call to `/api/analysis` runs the same six-stage pipeline (defined in `server/server.js`):

1. **Collect** — four platform modules (`lib/youtube.js`, `lib/reddit.js`, `lib/discord.js`, `lib/twitch.js`) pull public data in parallel via each platform's official API, normalised into one shared row shape.
2. **Enrich** — every row is scored once by `lib/nlp.js` (sentiment, sarcasm, theme, question/risk flags, language), `lib/engagement.js` (Engagement Index), and `lib/region.js` (publication region).
3. **Aggregate** — `lib/analytics.js` turns the enriched rows into time series, spike detections, theme aggregates, risk scores, and recurring-question clusters.
4. **Compare** — `lib/store.js` persists a compact daily snapshot; the current run is diffed against the most recent earlier one.
5. **Brief** — `lib/briefing.js` writes a short daily narrative from the finished analysis (AI-generated, or a deterministic fallback).
6. **Serve** — the API returns both the aggregates and the row-level records, so the dashboard's global filters (channel, game, time range) recompute every panel client-side without another round trip.

Results are cached in memory for 5 minutes (`CACHE_TTL_MS`) per server process; `?force=1` bypasses the cache.

---

## 2. Sentiment

Two engines exist. Which one actually runs is reported per-record (`sentiment_method`) and in aggregate (`/api/health` → `semantic_analysis`, `/api/methodology` → `sentiment.primary_engine.active`).

### 2.1 Primary engine — semantic scoring via Claude (`lib/nlp.js`)

- Model: `claude-opus-5` by default (`ANTHROPIC_MODEL` env var to override).
- Runs only when `ANTHROPIC_API_KEY` is set and the `@anthropic-ai/sdk` package is installed.
- Records are batched **40 at a time**, with up to **4 batches in flight concurrently** (`BATCH_SIZE`, `MAX_CONCURRENT_BATCHES`).
- Each record's text is truncated to **600 characters** before scoring (`MAX_TEXT_CHARS`).
- The model returns, per record, a strict JSON object (schema-enforced via `output_config.format`):
  - `sentiment`: integer, **-100 to +100**
  - `confidence`: float, **0.0–1.0**
  - `sarcasm`: boolean
  - `theme`: one of a **17-item controlled vocabulary** (see §4)
  - `is_question`: boolean — a genuine, answerable question, not just text ending in "?"
  - `is_risk`: boolean — flags a brewing community problem worth same-day escalation
  - `language`: ISO 639-1 code
- **Caching**: every scored text is cached in-process by SHA-1 hash of its content (`hashText`), so identical text is never re-scored within the same server lifetime.
- **Failure isolation**: if a batch errors (rate limit, refusal, malformed response), only that batch's records fall back to the lexicon engine — one bad batch never fails the whole refresh.
- **Reported engine honesty**: `getStats()` computes the *actual* engine used from real counters (`scored` vs `fallback`), not merely whether the API key is present — so a configured-but-fully-failing run correctly reports as lexicon, not silently as "claude".

### 2.2 Fallback engine — gaming-tuned lexicon (`lib/sentiment.js`)

Runs when `ANTHROPIC_API_KEY` is absent, when the SDK isn't installed, or per-batch on a semantic scoring failure. Also used to pre-score the static sample data.

Word weights are on a **-3 to +3** scale per token, normalised to -100..+100 at the end. It handles four cases a naive keyword bag gets wrong on gaming text:

| Mechanism | Effect | Example |
|---|---|---|
| **Negation** | A negator (`not`, `never`, `doesn't`, …) flips the polarity of tokens within a **3-token window** after it, and damps the magnitude by ×0.75 | "not good" → mildly negative |
| **Intensifiers / diminishers** | Multiply the next token's value (`absolutely` ×1.8, `extremely` ×1.8, `kinda` ×0.6, `barely` ×0.4, …) | "absolutely bad" scales up; "kinda bad" scales down |
| **Gaming slang** | A curated set of terms scored as praise despite sounding negative in general English (`insane` +2, `sick` +2, `cracked` +2, `goated` +3, `fire` +2, `nuts` +2, `filthy` +2, `pog` +2, …) | "insane clutch" → positive |
| **Emoji** | 38 emoji mapped to explicit values (🔥 +2, 😍 +3, 💯 +3 … 👎 −2, 🤬 −3, 😡 −3), matched via a Unicode Extended_Pictographic regex so a naive `[a-zA-Z]+` tokenizer doesn't drop them | "🔥🔥🔥" → positive even with no words |

Additional handling:
- **Multi-word phrases** (`"pay to win"`, `"cash grab"`, `"content drought"`, `"can't wait"`, etc.) are matched and masked out before single-token scanning, so they aren't double-counted or split incorrectly.
- **Emphasis**: a capitalisation ratio > 60% (of a text ≥6 letters) multiplies the total by ×1.3; 2+ exclamation marks multiply by ×1.2.
- **Sarcasm markers** (`/s`, "yeah right", "sure buddy", "shocking", "well done", etc.) don't flip polarity — a lexicon can't reliably invert sarcasm — but positive text carrying a marker is pulled to ~10% of its value (an honest "we don't know" rather than false praise), and negative text is damped to ~50%.
- **Normalisation**: `total / max(2.5, hits × 1.4)`, clamped to [-1, 1], then × 100 and rounded — so one strong word can't saturate the score, but a long list of mild ones still accumulates.
- **Confidence**: `min(0.85, 0.3 + hits × 0.12)`, halved if sarcasm markers are present, ×0.7 if the token count is under 4.

### 2.3 Labels and scale

- Scale: **-100 (extremely negative) to +100 (extremely positive)**.
- Labels: `positive` if score > +15, `negative` if score < −15, `neutral` otherwise (±15 chosen to mirror the ±0.15 threshold used on the original -1..+1 scale, so historical figures stay comparable).
- Every record also carries `sentiment_confidence` (0–1) so low-confidence records can be visually discounted rather than treated as fact.

---

## 3. Engagement Index (`lib/engagement.js`)

**Problem it replaces**: the original build summed raw platform counts (YouTube likes + Reddit upvotes + Discord reactions + Twitch views) into one number. Different platforms measure different intents at wildly different scales, so the sum mostly reflected which API returned the most rows — not genuine popularity.

**Formula**, in three steps, applied per record:

1. **Weighted raw signal** — combine a platform's native metrics, weighting replies higher than passive likes (effort ∝ signal strength):

   `raw = score × weight_score + num_comments × weight_replies`

2. **Log compression** — engagement is heavy-tailed (one viral post can be 1000× the median), so it's compressed logarithmically rather than linearly, to stop one outlier dominating a game's average.

3. **Per-platform normalisation** — divide by that platform's own calibrated "viral ceiling" so 100 means *"as viral as this platform gets,"* not just *"a big number":*

   ```
   index = 100 × clamp( ln(1 + raw) / ln(1 + ceiling_platform), 0, 1 )
   ```

   Result is rounded to one decimal, range **0–100**.

### Per-platform weights and ceilings

| Platform | Weights | Ceiling | Rationale |
|---|---|---|---|
| YouTube | likes ×1, replies ×3 | 5,000 | 5,000 weighted likes ≈ a top-of-thread, screenshotted comment on an official trailer |
| Reddit | upvotes ×1, comments ×5 | 20,000 | 20,000 weighted upvotes ≈ front-page-of-the-subreddit territory |
| Discord | reactions ×1, replies ×2 | **40** | Reactions are rare per message; a *low ceiling* (not a large multiplier) is what puts 40 reactions on the same viral footing as a big YouTube comment |
| Twitch | clip views ×1, replies ×0 | 500,000 | Views are passive; it takes far more of them to mean the same thing as an active like/reaction |
| *(unlisted platform)* | score ×1, replies ×2 | 10,000 | Generic fallback |

### Score bands

| Range | Label | Meaning |
|---|---|---|
| 0–20 | background | Normal for the median post — no action implied |
| 20–40 | modest | Noticed by the immediate community |
| 40–60 | solid | Outperforming typical posts in its community |
| 60–80 | high | Broke out beyond the core audience — worth reading |
| 80–100 | exceptional | Platform-level viral — treat as a signal in its own right |

### Aggregation

A game's or theme's headline Engagement Index is the **mean** of its records' indices, not the sum — a sum would just reward whichever game happened to have more rows collected. Total volume is reported separately as `record_count`, since "how much is being said" and "how hard it lands" are different questions.

### Stated limitations (from the module's own methodology export)

- Ceilings are calibration constants set from observed orders of magnitude, not a licensed platform benchmark — intended to be re-tuned against real campaign data.
- The index measures reach/reaction intensity, not sentiment — a 90 can be 90 units of anger.
- Twitch's index reflects streamer reach as much as community feeling (views are creator-driven, not organic per-viewer action).
- Records from a platform with no live feed configured inherit the static sample's figures and are labelled as such.

---

## 4. Theme classification

Two paths, unified into one **17-item controlled vocabulary** so themes aggregate consistently across all platforms and both live/sample data:

```
monetization · bugs & technical issues · cheating & fair play · matchmaking & netcode ·
game balance · new content & updates · character & roster · story & world ·
graphics & performance · grind & progression · community & social ·
onboarding & new players · platform & availability · esports & competitive ·
nostalgia · praise · other
```

- **Live records**: assigned directly by the semantic scoring layer (`lib/nlp.js`) as part of its per-record JSON output, constrained to this exact enum.
- **Sample records**: the original free-text theme labels from the synthetic generator (e.g. `"netcode/matchmaking"`, `"bug/cheating complaints"`) are mapped onto the same controlled vocabulary via a lookup table in `lib/dataset.js` (`THEME_MAP`), so old and new data land in the same buckets instead of splitting into near-duplicate labels. The original label is preserved separately as `theme_original`.
- **Aggregation** (`lib/analytics.js: aggregateThemes`): per theme, computes `count`, mean sentiment, mean Engagement Index, `negative_share`/`positive_share` (%), and up to 3 example records. Themes with fewer than **2** records (`minCount`) are dropped from the output.

---

## 5. Publication region (`lib/region.js`)

**Scope, explicitly**: classifies the region content was **published in** — the channel/subreddit/server/broadcaster's own declared location or language — never the geography of an individual commenter. That would be personal data outside this project's scope, and the platforms don't expose it anyway.

Four buckets: `Americas`, `EMEA`, `APAC`, `Undetermined`.

### Signal precedence (first usable signal wins)

| Priority | Signal | Source | Confidence |
|---|---|---|---|
| 1 | `channel_country` | YouTube `channels.list → snippet.country` | 0.95 |
| 2 | `source_config` | A region declared in our own config for a known-regional source | 0.90 |
| 3 | `guild_locale` | Discord `guilds → preferred_locale` | 0.80 |
| 4 | `content_language` | YouTube `videos.list → defaultAudioLanguage/defaultLanguage`; Twitch clip/stream `language` | 0.70 |
| 5 | `text_language` | Language detected by the semantic scoring layer on the text itself | 0.40 |

Countries map to buckets via a **53-entry ISO 3166-1 alpha-2 table**. Languages map via a **29-entry ISO 639-1 table** for unambiguous languages (zh/ja/ko → APAC, de/fr/ru → EMEA, etc.), plus a **16-entry regional-variant table** to disambiguate languages spoken across regions (`en-US`→Americas, `en-GB`→EMEA, `en-AU`→APAC, `pt-BR`→Americas, `pt-PT`→EMEA, `zh-CN`/`zh-TW`/`zh-HK`→APAC, etc.).

Records with no usable signal are reported honestly as `Undetermined` rather than defaulted into a bucket. Every classified record carries `region`, `region_source` (which signal decided it — auditable back to a field), and `region_confidence`.

### Stated limitations

- Global publisher channels (e.g. `@PUBG`) declare one country for their whole catalogue — a genuine regional split would need regional sub-channels tracked separately.
- Twitch category-level data has no publisher country at all; it's classified by stream language, which is a proxy.
- `Undetermined` should be expected at meaningful volume until more regional sources are configured.

---

## 6. Spike detection (`lib/analytics.js: detectSpikes`)

Applied to the weekly time series (`buildSeries(rows, "week")`). For each week `i`, computes the mean and standard deviation of the trailing window (default **6 prior points**, `window`), then flags a spike when **both**:

- `z ≥ 2` (`minZ`) — the week's volume is at least 2 standard deviations above the trailing baseline, **and**
- `count ≥ mean × 1.5` — a secondary floor so a very flat, low-volume stretch can't make a single extra record look dramatic via z-score alone.

`minCount = 3` — weeks with fewer than 3 records are never flagged, however their z-score looks. A degenerate case (standard deviation of exactly 0) falls back to a simple 2× multiple-of-mean check. Each flagged spike reports its `baseline` (trailing mean), `z`, and `multiple` (how many times the baseline it represents).

---

## 7. Risk detection (`lib/analytics.js: detectRisks`)

Two independent sources, merged and sorted by severity (0–100):

**1. Theme-level thresholds** — a theme qualifies when it has at least **4 records** (`minThemeCount`) AND its negative share is **≥ 55%** (`negShareThreshold`) AND its mean sentiment is **below −10**. Severity:

```
severity = round( negative_share × 0.6 + |avg_sentiment| × 0.3 + min(count, 40) × 0.25 )
```

**2. Record-level flags** — records the semantic layer marked `is_risk: true` (refund/uninstall talk, review-bombing, bad-faith accusations, outage reports, monetization backlash), grouped by game so the panel shows one entry per game rather than dozens of individual rows. Severity:

```
severity = min(100, round(30 + flagged_count × 6 + top_record_engagement_index × 0.4))
```

Every risk carries its type (`theme` or `flagged`), a label, severity, a plain-language detail string, the games it touches, and up to 3 example records.

---

## 8. Recurring question clustering (`lib/analytics.js: clusterQuestions`)

Replaces the original "any text ending in a question mark" heuristic with genuine topical clustering, so "recurring" means the community is actually asking the *same* thing repeatedly, not just that many unrelated questions exist.

1. Candidate pool: records where `is_question` is true (set by the semantic layer) and text length > 12 characters.
2. Each question is tokenised: lowercased, non-alphanumeric stripped, split on whitespace, and filtered against a **78-word stopword list** (the, a, is, are, how, what, why, …), leaving only content-bearing tokens.
3. Questions with fewer than 2 remaining tokens are discarded (too little signal to cluster meaningfully).
4. Clustering uses **Jaccard similarity** on token sets: a question joins the first existing cluster whose token-set overlap is **≥ 0.4** (`threshold`); otherwise it starts a new cluster.

   `jaccard(A, B) = |A ∩ B| / |A ∪ B|`

5. Each cluster reports: its highest-engagement member as the representative `question` text, `asked` (cluster size), the distinct games/platforms it spans, and that member's Engagement Index/band/URL.
6. Output is sorted by cluster size (most-asked first), then by top engagement, capped at **10 clusters** (`maxClusters`).

---

## 9. Day-over-day deltas (`lib/store.js`, `lib/analytics.js: computeDeltas`)

The original build had no persistent history — only a 5-minute in-memory cache that died with the process — so "what changed since yesterday" wasn't answerable even in principle. This is the fix.

### Storage (`lib/store.js`)

- One compact JSON file per day (aggregates only — no raw record text — so the directory stays a few KB/day and no user-authored content is persisted beyond the short examples already shown on screen).
- Location resolves in order: `SNAPSHOT_DIR` env var → `<repo>/data/snapshots` → OS temp dir (`os.tmpdir()`) as a last resort for read-only filesystems like Vercel's serverless bundle. The dashboard reports which mode is active (`storage.mode`) and whether it's `durable` — an ephemeral temp-dir snapshot won't survive a cold start, and this is surfaced honestly rather than silently.
- **Retention**: 90 days (`RETENTION_DAYS`); older snapshots are pruned automatically on every write.

### Comparison

`previousSnapshot(date)` finds the most recent snapshot **strictly before** today — not literally "yesterday" — so a weekend gap in collection still produces a meaningful comparison instead of finding nothing.

`computeDeltas` returns, when a previous snapshot exists:
- Overall sentiment/volume/engagement deltas.
- Per-game deltas (`sentiment_delta`, `volume_delta`, `volume_pct`, `engagement_delta`); a game with no prior record is marked `is_new: true` rather than given a misleading delta from zero.
- Top 8 theme movements, sorted by absolute count change.

When no previous snapshot exists, `available: false` is returned explicitly with a reason — deltas are **never fabricated or implied** from a single day of data.

---

## 10. AI daily briefing (`lib/briefing.js`)

The first thing on the dashboard, designed to pass the test: *"someone should understand what's happening within a few minutes, without manually interpreting a wall of charts."*

### Target length: 150–200 words for the narrative

Reasoning baked into the code comments: 150–200 words reads in ~45–60 seconds (a realistic pre-standup attention budget); below ~120 words it loses specifics and becomes generic ("sentiment is mixed"); above ~250 words people skim, and a skimmed narrative is worse than a scannable list — so everything beyond the narrative (`watch_today`, `risks`, `opportunities`) is structured as short bulleted items instead of more prose.

### Primary path — Claude-generated

- Model: `claude-opus-5` (same `ANTHROPIC_MODEL` override as sentiment).
- `output_config.effort: "high"` — deliberately the most quality-sensitive single call on the page.
- Schema-enforced JSON output: `headline` (≤100 chars), `narrative` (150–200 words), `watch_today` (2–4 items), `risks` (0+ items, each with `severity: low|medium|high`), `opportunities` (0+ items), `changes_vs_previous` (0+ strings).
- System prompt instructs the model to: lead with judgement not preamble, cite specific numbers/games/themes, never invent deltas without real delta data, distinguish sample from collected data explicitly when a finding rests on sample data, leave `risks` empty rather than invent one, write British English with no emoji/exclamation marks.

### Fallback path — deterministic

Runs when `ANTHROPIC_API_KEY` is unset, the model call errors, or the model refuses. Composes the same structure from the already-computed figures (best/worst game by sentiment, top theme, risk count, delta summary if available) — blunter, no interpretive judgement, but never blank and never silently pretending to be AI-written. The `generated_by` field on the response distinguishes `"claude-opus-5"` from `"rule-based fallback"`, and the dashboard displays this.

---

## 11. Data collection per platform

| Platform | Module | Auth | What's pulled | Per-refresh volume |
|---|---|---|---|---|
| **YouTube** | `lib/youtube.js` | API key (`YOUTUBE_API_KEY`) | Channel resolve (+ declared country, for region) → last 8 uploads per channel → merged `time`+`relevance` comment threads per video (dedup'd by comment ID) | `VIDEOS_PER_CHANNEL=8`, `COMMENTS_PER_VIDEO_PER_ORDER=25` per order (50 requested, deduplicated) |
| **Reddit** | `lib/reddit.js` | OAuth2 client-credentials (`REDDIT_CLIENT_ID`/`SECRET`), optional script-app password grant | Subreddit info (for subscriber count + declared language) → top posts (trailing window) → recent comments across the subreddit | `REDDIT_POSTS_PER_SUB=50`, `REDDIT_COMMENTS_PER_SUB=100`, window = `week` |
| **Discord** | `lib/discord.js` | Bot token (`DISCORD_BOT_TOKEN`), bot must be invited with View Channels + Read Message History + Message Content Intent | Channel info + guild's `preferred_locale` → up to 100 most recent messages, reactions summed as the engagement "score" | `DISCORD_MESSAGES_PER_CHANNEL=100` (API's own max) |
| **Twitch** | `lib/twitch.js` | App access token via client-credentials (`TWITCH_CLIENT_ID`/`SECRET`) | Category resolve → top clips over trailing 30 days (community highlights, closest Twitch analogue to a "post") → live-stream snapshot (viewer counts, not sentiment-scored, not part of the time series) | `TWITCH_CLIPS_PER_GAME=20`, `TWITCH_CLIPS_WINDOW_DAYS=30` |

**Compliance notes**: Reddit access is official OAuth only (no scraping, no unauthenticated JSON endpoints), with a descriptive `User-Agent` on every request as Reddit's terms require; free-tier OAuth allows 100 queries/minute averaged over 10 minutes, and this collection pattern sits far inside that.

**Sample-data fallback**: any platform with no credentials configured (and `DEMO_DATA` left at its default `true`) is backfilled from the labelled synthetic sample (`data/processed/synthetic_reddit_discord.csv`, generated by `scripts/generate_synthetic.py`) so the dashboard still demonstrates a complete tool. The moment a platform's credentials go live, its sample rows are dropped entirely rather than mixed with real data. Every row everywhere carries `is_sample`/`data_type` so this is auditable per-record, and the overall API response reports `provenance.sample_share_pct` — the exact percentage of the current dataset that's illustrative.

**Status honesty**: each platform's `data_sources` string in the API response reflects what actually happened this refresh, not just whether credentials exist — a configured-but-failing source (e.g. a revoked token) never reports as `"live"` even though its keys are present; it reports the actual error and that it's showing the sample in its place.

---

## 12. Access control (`lib/auth.js`)

This is an internal RS tool and must not be reachable by anyone who finds the
URL. A real `/login` page — styled to match the dashboard, not the browser's
native Basic Auth popup — backed by a signed session cookie gates every
route: the static dashboard included, not just the API. `auth.requireAuth` is
mounted as Express middleware before `express.static` and before any route
handler; `/login` and `/logout` are registered as ordinary routes that the
middleware explicitly lets through.

- **Configuration**: `AUTH_USERS`, a comma-separated list of
  `username:password` pairs (`alice:pass1,bob:pass2`), parsed once at startup
  into a `Map`; malformed entries (no `:`) are skipped rather than crashing
  the process. `SESSION_SECRET` is a separate signing key for the session
  cookie — see below.
- **Session cookie, signed not stored.** `POST /login` validates the
  submitted credentials, then issues a cookie (`gcp_session`) whose value is
  `base64url({ user, exp }) + "." + HMAC-SHA256(that, SESSION_SECRET)`.
  Verifying a request recomputes the HMAC and compares it with
  `crypto.timingSafeEqual`, then checks `exp` against the current time. There
  is no server-side session store and no database — the cookie itself is the
  only state, which is what makes this work identically whether the process
  is a long-lived Render service or a stateless Vercel serverless function.
  Sessions last 7 days from issuance.
- **Cookie attributes**: `HttpOnly` (unreadable from page JavaScript, blunting
  XSS token theft), `SameSite=Lax` (not attached to cross-site requests that
  change state), and `Secure` whenever the request arrived over HTTPS
  (`server.js` sets `app.set("trust proxy", 1)` so `req.secure` reflects the
  `X-Forwarded-Proto` header set by Render's and Vercel's TLS-terminating
  proxies, rather than always reading `false`).
- **Credential check**: on `POST /login`, the submitted password is compared
  against the configured value with `crypto.timingSafeEqual` (after padding
  both buffers to equal length, since `timingSafeEqual` throws on a length
  mismatch and a length-based early exit would itself leak timing
  information). An unknown username is looked up and, on a miss, compared
  against `undefined` coerced to a non-matching value rather than
  short-circuited immediately, so a wrong username and a wrong password stay
  close in timing.
- **Route behaviour when signed out**: requests to `/api/*` get a `401` JSON
  body (`{ error, login_url }`) rather than a redirect, so the dashboard's own
  `fetch()` calls fail in a way client-side code can handle instead of
  receiving an HTML login page where JSON was expected. Requests to any other
  path get a `302` redirect to `/login?redirect=<original path>`, and a
  successful login sends the user back to that original destination.
- **Fail-open by design when unconfigured.** If `AUTH_USERS` is unset, the
  middleware is a deliberate no-op and `/login` redirects straight through to
  `/` — matching how every other optional integration in this codebase
  behaves (it boots regardless, with the feature simply unavailable). A loud,
  multi-line warning prints to the console at startup when this is the case,
  and `/api/health` reports `access_control.configured: false` so this is
  checkable on a live deployment without shell access to its logs.
- **`SESSION_SECRET` and process restarts.** If unset, a random secret is
  generated at process start so the server still boots, but that secret is
  per-process: any restart, redeploy, or new serverless instance invalidates
  every existing session cookie, signing everyone out. This is a materially
  bigger deal on Vercel, where a fresh instance can spin up per request. A
  second startup warning covers this case specifically, and
  `/api/health` reports `access_control.session_secret_set` so it's
  checkable remotely.
- **Transport security is assumed, not provided.** The login form posts a
  plain username/password and the session cookie is signed, not encrypted.
  This is acceptable only because both deployment targets (Render, Vercel)
  terminate HTTPS in front of the app by default.

## 13. API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/analysis` | Runs the full 6-stage pipeline (or serves the 5-minute cache); returns aggregates, row-level records, videos, Twitch live snapshot, Reddit community info, data-source statuses, fetch errors, sentiment-engine stats, storage info, deltas, and the AI briefing. `?force=1` bypasses the cache. |
| `GET /api/methodology` | Machine-readable documentation of the engagement formula, region signal precedence, sentiment engines/scale, the 6-stage data flow, and briefing length rationale — rendered live in the dashboard's "How is this calculated?" panel rather than requiring a separate doc. |
| `GET /api/health` | Configuration status per platform, semantic-analysis engine/model, `demo_data_enabled`, and snapshot storage info. |

---

## 14. Front-end (`server/public/dashboard-live.html`)

- Single-file HTML/CSS/JS, Chart.js **vendored locally** (`server/public/vendor/chart.umd.min.js`, refreshed via `npm run postinstall` → `server/scripts/vendor-chartjs.js`) rather than loaded from a CDN, so the dashboard renders on an egress-restricted internal network.
- **Global sticky filter bar**: channel (platform), game, and time-range — all three apply client-side to every panel below, computed from the row-level `records` the API already returned (no extra round trip per filter change).
- **Panels**: Today's briefing → KPI row → Discussion volume & sentiment over time → Sentiment mix by game → Engagement Index by game → How the channels differ (platform breakdown) → Recurring themes → Publication region → Recurring questions → Highest-impact posts → Twitch live-right-now → Browse the underlying records (raw table) → live "How is this calculated?" methodology panel.
- **Accessibility**: ARIA roles/labels throughout (`role="status"`, `role="group"`, `role="img"` with descriptive `aria-label` on each chart canvas, `aria-live="polite"` on the briefing/filter-summary/loading regions, `aria-pressed` on filter chips), and `@media (prefers-reduced-motion: reduce)` disables the loading spinner's animation.

---

## 15. Stack & dependencies

- **Runtime**: Node.js ≥18, Express 4.
- **AI**: `@anthropic-ai/sdk` (^0.68.0) — Claude Opus 5 by default, used for both semantic sentiment scoring and the daily briefing.
- **Charting**: Chart.js (^4.4.1), vendored (not CDN-loaded).
- **CSV parsing**: `csv-parse` (^5.5.6) for the sample dataset.
- **Config**: `dotenv` (^16.4.5), loaded relative to `server.js`'s own directory (not the process working directory), so behaviour doesn't depend on where the process is launched from.
- **Document generation** (dev-only, used by `scripts/`): `docx` (^8.5.0), `pptxgenjs` (^3.12.0).
- **Deployment**: configured for both Render (`render.yaml`) and Vercel (`vercel.json` + `api/index.js` serverless wrapper around the same Express app).

---

## 16. Known limitations, stated in the code itself

Collected here from each module's own documented caveats, so nothing is overstated to a reader who only sees this summary:

- Engagement ceilings are calibration constants from observed orders of magnitude, not a licensed benchmark — intended to be re-tuned against RS's real campaign data.
- Engagement Index measures reach/reaction intensity, not sentiment — a high score can represent anger, not approval.
- Region classification never geolocates individual commenters — only publisher/content-level signals — so a meaningful share of records will legitimately be "Undetermined" until more regional sources are configured.
- Global publisher channels declare one country for their whole catalogue, flattening any real regional split.
- The lexicon sentiment fallback cannot reliably resolve genuine sarcasm/irony — that's precisely why the semantic (Claude) engine exists as the primary path.
- Deltas and spike detection both require enough historical snapshots/weeks to be meaningful — a fresh deployment with no prior snapshot correctly reports "not available yet" rather than a fabricated comparison.
- Ephemeral snapshot storage (e.g. on Vercel's serverless filesystem, if `SNAPSHOT_DIR` isn't pointed at a mounted volume) won't survive a cold start, and the dashboard reports this via `storage.durable` rather than silently losing history.
