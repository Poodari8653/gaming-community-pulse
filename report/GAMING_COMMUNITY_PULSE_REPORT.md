# Gaming Community Pulse

**A Lightweight Social Listening Prototype for Gaming Marketing — Version 2**

Prepared for Ruisheng Holdings Ltd (RS), London. Contact: Jen So.
Titles tracked: **PUBG, Once Human, Marvel Rivals, Where Winds Meet, World of Warcraft.**
Platforms: **YouTube, Reddit, Discord, Twitch.**

---

## Data note — read this before quoting any figure

Version 1 of this prototype covered three platforms and ran on a dataset that was roughly 89% synthetic. Version 2 is a substantial rebuild. All four platforms now have working collectors against official APIs, and the tool will collect live data from any of them for which credentials are configured.

| Platform | Live collection | What happens with no credentials |
|---|---|---|
| **YouTube** | Data API v3 — recent uploads per configured channel, plus their public comments | Nothing. YouTube is absent from the dataset and labelled "not configured" on the dashboard. There is no YouTube sample. |
| **Reddit** | Official OAuth API — top posts (trailing week) and recent comments per configured subreddit | Falls back to the labelled illustrative sample (295 rows) while `DEMO_DATA` is on, which is the default; nothing at all with `DEMO_DATA=false` |
| **Discord** | Bot REST API, in channels a server owner has invited the bot into | Falls back to the labelled illustrative sample (157 rows) on the same terms |
| **Twitch** | Helix API — top clips per category, plus a live-viewer snapshot | Nothing. Twitch is absent and labelled "not configured". There is no Twitch sample. |

**The illustrative sample is still included by default.** The environment variable `DEMO_DATA` defaults to `true`, which loads 452 synthetic Reddit and Discord rows so the dashboard demonstrates a complete tool rather than a half-empty one. This was the client's choice and it is a reasonable one for a demonstration build, but it has consequences that this report states plainly rather than buries.

Three safeguards apply to that sample, and all three are enforced in code:

1. **It never stacks on top of real data.** Sample rows are only added for a platform that produced *no* live rows in that refresh. The moment Reddit credentials are configured and Reddit returns data, the 295 Reddit sample rows are dropped rather than mixed in.
2. **Every sample row is tagged.** Each carries `data_type: "sample"` and `is_sample: true`, and is marked as sample wherever it appears on screen — in the top-posts list, in the record browser, and in the provenance banner.
3. **The share is reported, not hidden.** The API returns a `provenance` block giving the total record count, the collected count, the sample count and the sample share as a percentage. The dashboard shows this as a standing amber banner whenever any sample data is present.

To run on collected data only, set `DEMO_DATA=false`. Everything below distinguishes what the tool *measures* from what the sample *illustrates*.

---

## Table of contents

1. [What changed in v2](#what-changed-in-v2)
2. [Findings Summary](#findings-summary)
3. [Methodology, Scope & Limitations](#methodology-scope--limitations)
4. [Recommendations for Marketing Use](#recommendations-for-marketing-use)

Companion documents in this folder:

- **`PLATFORM_LANDSCAPE.md`** — how Reddit, Discord, YouTube and Twitch communities actually behave, what each platform's engagement signals really measure, and how to read the dashboard without drawing the wrong conclusion.
- **`TOOL_LANDSCAPE.md`** — the existing social listening market, what the incumbents do well, where the gaps are for a gaming agency specifically, and an honest capability comparison.
- **`CLIENT_ANSWERS.md`** — the nine questions RS raised, answered one by one, each pointing at the code that implements the answer.
- **`PRESENTATION_SCRIPT.md`** — the walkthrough script for presenting this work.

The running tool lives in `server/`. The dashboard is `server/public/dashboard-live.html`, served at `/`.

---

## What changed in v2

The client set out nine questions. This is what the rebuild does about each of them.

| # | Client question | What v2 does | Where in the code |
|---|---|---|---|
| 1 | Can sentiment go beyond keyword matching, read sarcasm and context, and report on −100 to +100? | Sentiment is now assigned by a semantic layer that reads meaning, sarcasm, negation, gaming slang and non-English text, returning a score, a confidence, a theme, a question flag and a risk flag in one pass. Scores are on the −100 to +100 scale throughout. A much-improved gaming-tuned lexicon is the fallback when no key is configured. | `server/lib/nlp.js`, `server/lib/sentiment.js` |
| 2 | Explain the engagement score — inputs, weights, combination, normalisation, meaning. | Replaced with a normalised **Engagement Index**, 0–100 per record, with a published formula, per-platform weights and viral ceilings, five plain-English bands, and aggregation by mean rather than sum. The full methodology is served as data at `/api/methodology` and rendered on the dashboard. | `server/lib/engagement.js` |
| 3 | Can content be classified by *publication* region rather than commenter geography? | Yes. Four publisher-side signals in strict precedence order — channel country, a region declared in our own config, Discord guild locale, content language — plus a deliberately weak fifth fallback on the language of the text itself. Each carries a stated confidence, and there is an honest "Undetermined" bucket. No individual is ever geolocated. | `server/lib/region.js` |
| 4 | Overview of data sources and processing logic. | Six documented pipeline stages — Collect, Enrich, Aggregate, Compare, Brief, Serve — with the collected dimensions and derived fields both listed in the methodology endpoint. | `server/server.js` header, `/api/methodology` |
| 5 | Media channel, product/game and time-range filters as prominent global filters. | A sticky global filter bar at the top of the dashboard: media channel, product/game, time range (presets plus custom dates) and publication region. All four re-derive every panel that is built from the record set. Two things sit outside them: the briefing, written server-side from the full dataset, and the Twitch live-viewer snapshot, which responds to the game filter only. | `server/public/dashboard-live.html` |
| 6 | An AI-generated daily summary, and how long should it be? | An AI-written briefing is the first thing on the page: headline, 150–200 word narrative, and four scannable columns — watch today, community risks, campaign opportunities, changes since the last snapshot. The word-count reasoning is documented and served in the methodology endpoint. | `server/lib/briefing.js` |
| 7 | End-user experience — usable in a few minutes each morning. | Briefing-first layout with the charts underneath as evidence, five headline metrics, and accessibility built in (real buttons with `aria-pressed`, labelled controls, focus styles, a skip link, and text-equivalent tables behind every chart). | `server/public/dashboard-live.html` |
| 8 | Business value — risks, trends, campaign ideas, notable changes. | Spike detection, risk scoring and recurring-question clustering are now genuinely computed rather than described. Daily snapshots are persisted, so day-over-day deltas are real. | `server/lib/analytics.js`, `server/lib/store.js` |
| 9 | Complete source code for internal deployment. | The whole tool is in this repository, with `render.yaml`, `vercel.json`, a documented `server/.env.example`, and Chart.js vendored locally so nothing depends on a CDN at runtime. | repository root, `server/` |

**Things that were true in v1 and are no longer true.** Reddit is no longer unimplemented and its rows are no longer synthetic when credentials are present. Sentiment is no longer a lexicon-only score on a −1 to +1 scale. Themes are no longer available only on synthetic rows, provided the semantic layer is running — the lexicon fallback still assigns none. Engagement is no longer a sum of incomparable raw counts. Spikes are no longer hardcoded into a data generator. "Recurring questions" is no longer `text.endsWith("?")` for any row the semantic layer scores — though that heuristic still stands in for the sample rows and for a lexicon-only run, so it survives when `ANTHROPIC_API_KEY` is unset. There is no longer zero history — snapshots persist.

---

## Findings Summary

### 1. A necessary correction on the version 1 numbers

Version 1 of this report presented a cross-game table of average sentiment, sentiment mixes and total engagement, plus theme-level scores to two decimal places. **Those figures should not be quoted to a client, and they are not restated here.** There are three independent reasons why.

**The dataset was mostly manufactured.** 452 of 507 records — approximately 89% — were synthetic. Only 55 YouTube comments were observed data. Any cross-game comparison, any platform comparison involving Reddit or Discord, and every theme score in that table was computed largely or wholly from text written to demonstrate the pipeline.

**The scale and the scorer have both changed.** Those numbers were produced by a lexicon on a −1 to +1 scale. Sentiment is now reported on −100 to +100 and, when configured, produced by a semantic layer that reads sarcasm and negation. A v1 score of −0.093 is not the same measurement as a v2 score of −9, even before the change of engine. The two are not comparable and should not be presented on the same axis.

**The engagement figures measured the wrong thing.** The v1 "total engagement" column summed YouTube likes, Reddit upvotes and Discord reactions untransformed. Those are different units at wildly different scales measuring different intents, so the column largely reflected which platform happened to contribute the most rows. It has been replaced, not adjusted.

What follows instead is (a) what the pipeline now measures and how a marketer should read each metric, and (b) the qualitative findings from v1 that genuinely survive, each labelled with the confidence it deserves.

### 2. What the tool now measures, and how to read it

| Metric | Scale | What it means | How to read it | What it is not |
|---|---|---|---|---|
| **Sentiment** | −100 to +100 per record; a group's figure is the mean | The author's judged attitude toward the game or publisher, accounting for sarcasm, negation and gaming slang | Labels are positive above +15, negative below −15, neutral in between. Every record also carries a 0–1 confidence — low-confidence records still appear but should not drive a decision alone | Not a satisfaction score, and not a survey. It measures the tone of people who chose to post |
| **Engagement Index** | 0–100 per record; a group's figure is the mean | How hard a post landed *relative to what is normal on its own platform* | Bands: 0–20 background, 20–40 modest, 40–60 solid, 60–80 high, 80–100 exceptional. A high index on Discord and a high index on Twitch mean comparable things by design | Not sentiment. An index of 90 can be 90 units of anger. Not a reach figure in absolute terms |
| **Record count** | Integer | How much is being said | Reported separately from the index on purpose. "How much is being said" and "how hard it lands" are different questions and a marketer needs both | Not a measure of audience size. It reflects how much the tool collected, which is capped by configuration |
| **Theme** | One of seventeen controlled labels | What a post is about, chosen from a fixed vocabulary so themes aggregate across five games and four platforms | Read the negative share alongside the mean sentiment. A theme with 60 mentions at 55% negative is a different problem from one with 6 mentions at 100% negative | Not a topic model. The vocabulary is fixed; genuinely novel topics land in "other" |
| **Publication region** | Americas / EMEA / APAC / Undetermined | The region the *content* was published in | Check the "classified from" note under the region table — it lists how many records in the current view each signal decided. Channel country is strong; detected text language is weak | Never the location of a commenter. No individual is geolocated at any point |
| **Spike** | Flagged time bucket | A volume bucket that is a genuine statistical outlier against its own trailing baseline | A spike is a prompt to read the posts in that bucket, not a finding in itself | Not causal. The tool detects the spike; a human explains it |
| **Risk signal** | Severity 0–100 | Either a theme whose negative share has crossed a threshold, or posts the semantic layer flagged as escalation-worthy | Rank by severity, then read the examples before acting | Not a crisis alert. Nothing is pushed to anyone; someone has to open the dashboard |
| **Recurring question** | "Asked N×" | A cluster of questions with high topical overlap — the same thing asked several ways | N is the size of the cluster, not the number of distinct people. Treat it as a content shortlist | Not a support ticket queue, and not deduplicated against your existing FAQ |
| **Day-over-day delta** | Signed change | Movement against the most recent earlier stored snapshot | Only meaningful once at least two days of snapshots exist; until then the panel says so rather than showing zeros | Not a trend. Two points are not a trend line |

### 3. The findings that survive, with confidence stated

Three qualitative patterns from v1 are worth carrying forward. None of them depends on the discredited numbers — but each depends on it to a different degree, so each is labelled.

#### 3.1 Discussion volume clusters around studio-driven announcements, not organically

**Confidence: moderate — externally supported, not yet evidenced by this tool's own data.**

The claim is that these communities are reactive: volume spikes around trailers, patches, season reveals and launch-date announcements rather than rising and falling on their own. If true, it is good news for campaign timing, because it means a publisher largely controls when its community is loudest.

The honest position on the evidence is this. In v1 the "spikes" in the Reddit and Discord data were *placed there by the data generator* — a deliberate volume cluster was written into each game's synthetic timeline to show what a spike would look like on the chart. Citing that as evidence would be circular. The pattern is nonetheless well supported from outside this dataset: `PLATFORM_LANDSCAPE.md` documents Twitch Drops campaigns moving a category from 29,000 to 210,000 hours watched in a day, and the Helldivers 2 PSN episode in which a single announcement produced 330,000 negative Steam reviews inside three days.

**What is new is that v2 can now test it.** Spike detection is genuinely computed: for each time bucket the tool takes the mean and standard deviation of the preceding six buckets and flags the point when it sits at least two standard deviations above that baseline *and* at least 1.5 times the baseline mean, with a minimum of three records so a quiet stretch cannot make a one-record bump look dramatic. Run the tool across a real content calendar for a month and the pattern is either there or it is not.

#### 3.2 The four platforms carry systematically different tone, for structural reasons

**Confidence: high on the mechanism, low on any specific number.**

The mechanisms are properties of the platforms rather than of any dataset, and they are documented with sources in `PLATFORM_LANDSCAPE.md`:

| Platform | Structural bias | Consequence for reading the dashboard |
|---|---|---|
| **YouTube** | The audience self-selected by clicking a trailer, and the dislike count has been private since November 2021 | Skews positive, and the negative half of the signal is structurally missing from the ratios. Sentiment must come from comment *text* |
| **Reddit** | The format rewards the sharpest dissenting take; complaint threads out-earn praise threads; score is net of downvotes | Skews critical. A rising comment-to-upvote ratio is an argument starting, not enthusiasm |
| **Discord** | No like button; reacting requires already being in the server, in that channel, at that moment; messages are short and full of in-jokes | Reactions are expensive and therefore meaningful, but the text is the hardest of the four for any scorer to read |
| **Twitch** | Clip titles are written by streamers to attract clicks | Clip titles are promotional copy, not player opinion. This is a genuine measurement problem, discussed under Limitations |

In v1, YouTube came out most positive, Discord second and Reddit closest to neutral. That ordering is consistent with the mechanisms above — but it is not evidence *for* them, because only the YouTube portion was observed data and the Reddit and Discord portions were generated. **Treat the direction as a prior worth carrying into a live run; treat the v1 figures as worthless.** The practical instruction stands regardless: compare each platform against its own trailing baseline, never against another platform's absolute score.

#### 3.3 Communities ask the same three categories of question, everywhere

**Confidence: moderate on the categories, zero on the counts.**

The three archetypes are "is this worth it", "how do I get started", and "what is the fastest way to X". They recur across genres and across platforms, and they are the single most directly actionable output this tool produces, because each one is a finished brief for an FAQ post, a pinned dev response or a creator-partnered guide.

The counts from v1 must be discarded, and the reason is worth stating precisely because it is a good illustration of how synthetic data misleads. The sample contains **452 rows drawn from only 63 distinct text strings**. Of those, 46 rows end in a question mark — but they represent just **seven distinct questions**. The sample's "recurring questions" recur *by construction*: the generator repeated a small pool of strings across games and dates. Any cluster size computed from it is an artefact of the generator's repetition rate, not a measurement of community behaviour.

The categories themselves survive because they are independently supported. `PLATFORM_LANDSCAPE.md` records that Question was among the most-used flairs on both r/wow and r/MarvelRivals in a recent month, that "is it worth it in 2026" threads are a recognised Reddit archetype representing re-acquisition intent, and that tutorial comment Q&A on YouTube is effectively a ranked list of friction points in a game.

**What is new is that v2 clusters questions properly.** Where the semantic layer runs, a record counts as a question only if the model judges it to be a genuine, answerable one — not merely because the text ends in "?". The old trailing-question-mark test survives in two places and should be read as a weaker signal: on the sample rows, and on any run with no `ANTHROPIC_API_KEY`, where there is no semantic layer to ask. Questions are then clustered by topical overlap using a Jaccard similarity of 0.4 on stopword-stripped token sets, so "asked 11×" means eleven separate posts asking the same thing, however each was worded. On a live, semantically scored dataset that number is meaningful. On the sample, it is not.

### 4. How to produce figures you can actually put in front of a client

There are no fresh absolute figures in this report, on purpose. Producing them takes a live run:

1. **Configure credentials** for as many of the four platforms as RS can obtain — see `server/.env.example`. Each is independent; the tool runs with any subset.
2. **Set `DEMO_DATA=false`** so the illustrative sample is excluded entirely.
3. **Set `ANTHROPIC_API_KEY`** so sentiment is semantic rather than lexicon-based, and the briefing is written rather than assembled.
4. **Let it run for at least a fortnight** with snapshots persisted to durable storage, so the day-over-day deltas and the trailing baselines that spike detection needs have something to work with.
5. **Read the provenance banner and the source banner on every screenshot** before it goes into a deck. They state the sample share, which sources were live, when they were fetched, and which sentiment engine actually ran.

Until that has happened, the defensible claim to a client is about the *tool*, not about the *titles*: "here is a working pipeline that will tell you X about your community", not "your community currently feels Y".

---

## Methodology, Scope & Limitations

Everything in this section is derived from the code as it stands. Where a figure is a tunable constant, its value is stated so it can be argued with.

### 1. Scope

Five titles: PUBG, Once Human, Marvel Rivals, Where Winds Meet, World of Warcraft. The spread is deliberate — a long-running battle royale, a survival hybrid, a live-service hero shooter, a wuxia open-world action RPG and a twenty-year-old subscription MMORPG — so the prototype is exercised against genuinely different community dynamics rather than five similar shooters.

Four platforms: YouTube, Reddit, Discord, Twitch. The prototype covers public announcement reactions, patch and balance feedback, monetisation discussion, bug and technical complaints, community questions, praise and nostalgia. It does not cover private servers, direct messages, paywalled content, or anything requiring a login it has not been explicitly granted.

`TOOL_LANDSCAPE.md` sets out why a lightweight in-house tool is worth building at all given what Brandwatch, Talkwalker, Brand24 and the rest already sell, and is not repeated here.

### 2. The pipeline, end to end

Six stages, run on every refresh:

| Stage | What happens |
|---|---|
| **1. Collect** | Four platform wrappers pull public data in parallel via official APIs. Each returns rows in one shared schema, plus whatever publication-region signal that platform exposes |
| **2. Enrich** | Every row is scored once: sentiment, sarcasm flag, theme, question flag, risk flag and language from the semantic layer; Engagement Index; publication region and the signal that decided it |
| **3. Aggregate** | Rows become time series, statistically detected spikes, theme aggregates, ranked risks and clustered recurring questions |
| **4. Compare** | A compact daily snapshot is persisted and today is compared against the most recent earlier one |
| **5. Brief** | The daily narrative is written from the finished analysis |
| **6. Serve** | `/api/analysis` returns the aggregates *and* the row-level records, so all four global filters re-derive the record-driven panels client-side with no round trip |

**Dimensions collected per record:** platform, game, source (channel / subreddit / server / broadcaster), content type, author handle (public display name only), timestamp, text, native engagement metrics, publication-region signals, URL.

**Fields derived per record:** `sentiment_score`, `sentiment_label`, `sentiment_confidence`, `sentiment_method`, `sarcasm`, `theme`, `is_question`, `is_risk`, `language`, `engagement_index`, `region`, `region_source`, `region_confidence`.

Results are cached server-side for five minutes; the dashboard's "Refresh data" button forces an immediate re-collection.

### 3. Collection, platform by platform, with the compliance position

#### YouTube — Data API v3

Per configured channel, the tool resolves the handle to the channel's uploads playlist, takes the eight most recent uploads, batches one stats lookup for all of them, and then fetches comments for each video twice — once ordered by time and once by relevance — merging and deduplicating the two. The dual order matters: time order gives genuine spread across real weeks for the volume chart, relevance order catches the most-liked comments that time order would miss if a viral comment is old.

*Compliance and cost.* Official API with an API key; no browser scraping, which is what v1 used. `search.list` is deliberately never called — it costs 100 quota units against a 10,000/day default, so the collector works from configured channel handles instead. A full refresh of all five channels costs roughly 95 units, so quota is not a practical constraint. Channel country arrives free on the same call that resolves the channel.

#### Reddit — official OAuth API

Per configured subreddit, three calls: top posts over a trailing week (limit 50), recent comments across the whole subreddit (limit 100), and a metadata lookup for the display name, subscriber count and any declared language. Deleted and removed comments are filtered out; stickied posts are skipped.

*Compliance.* This is the single biggest change from v1, where Reddit was unreachable and its rows were fabricated. Collection is via the official OAuth API only — no scraping, no `old.reddit` HTML parsing, no unauthenticated JSON endpoints, no rate-limit evasion. Authentication is application-only (`client_credentials`) by default, which is read-only access to public subreddit content with no user account acting on anyone's behalf; a script-app password grant is supported for installs that need it. Reddit requires a descriptive, identifying User-Agent and treats a generic one as abuse, so the tool sends one naming the application and version. Free-tier OAuth permits 100 queries per minute averaged over ten minutes; three calls per subreddit per refresh across five subreddits sits far inside that.

#### Discord — Bot REST API, permissioned

Per configured channel, the tool fetches channel information (including the guild's declared `preferred_locale`) and up to 100 recent messages, taking each message's total reaction count as its engagement signal, since Discord has no like button. Messages with no text content are skipped.

*Compliance.* This is the only compliant route and it is a deliberate constraint, not a workaround. The bot must be invited to each server by an owner or admin, with "View Channels" and "Read Message History" permissions, and with the Message Content Intent enabled — without that intent, message text returns empty even though the call succeeds. Discord's Developer Policy prohibits mining or scraping data available on or through its services. Coverage therefore grows one relationship at a time, and will always be partial and deliberately chosen. This is a scoping decision to state openly to clients rather than a bug to hide.

#### Twitch — Helix API

Twitch does not organise around one official channel per game — most discussion happens on individual streamers' channels — so the tool listens at *category* level instead. Per configured category it resolves the display name to Twitch's internal game ID, then fetches the top 20 clips of the last 30 days and the current live streams. Clips become rows in the dataset. The live-viewer figures become a separate "right now" snapshot which is **never sentiment-scored and never enters the time series**, because it is a point-in-time number rather than a text record.

*Compliance.* Official Helix API using the client-credentials grant, so no per-user Twitch login is involved. No usage fee; the API is rate-limited by a token bucket with most endpoints costing one point per call.

### 4. The sentiment engine

**Primary: semantic scoring.** Records are batched 40 at a time, with a maximum of four batches in flight, and sent to Claude (default model `claude-opus-5`, overridable via `ANTHROPIC_MODEL`) with a structured JSON schema. Text is truncated to 600 characters for scoring. One pass returns, per record: a sentiment integer from −100 to +100, a 0–1 confidence, a sarcasm boolean, a theme from the controlled vocabulary, an `is_question` boolean, an `is_risk` boolean and an ISO 639-1 language code.

The system prompt is explicit about gaming vocabulary a general-purpose model gets backwards — that "insane", "sick", "cracked", "goated" and "fire" are praise; that "broken" is negative for bugs but positive-leaning for an overpowered character the author enjoys; that "dead game", "copium", "L update", "cash grab", "p2w" and "content drought" are strongly negative; that "cooked" flips meaning by context. It instructs the model to judge sarcasm by context, so "Great, another battle pass" scores negative, and to score non-English text on its meaning while lowering confidence slightly rather than dropping it. `is_risk` is instructed to be set sparingly — only for something a community manager would want escalated the same day.

Results are cached by content hash for the lifetime of the process, so a repeated refresh re-scores only genuinely new text. A batch that errors degrades to the lexicon **for those records only** and never takes down the refresh.

**Fallback: the gaming-tuned lexicon.** Active when `ANTHROPIC_API_KEY` is unset, when the SDK is unavailable, or when a batch errors. It is deliberately more than a keyword bag and handles the four things a naive lexicon gets wrong on gaming text: negation windows ("not good" scores negative, with the magnitude damped because "not great" is not the mirror image of "great"), intensifiers and diminishers ("absolutely bad" scaled up, "kinda bad" scaled down), gaming slang polarity, and emoji — which a naive `/[a-z]+/` tokeniser drops entirely, scoring an emoji-only Discord reaction as flat neutral. It also amplifies for shouting and repeated exclamation marks, and dampens and flags on explicit sarcasm markers rather than guessing.

**What the fallback cannot do**, and the dashboard says so: genuine sarcasm, context-dependent irony, and long-range mixed sentiment. It also assigns no theme, so on a lexicon-only run the theme panel is driven by the sample's mapped labels alone. It never sets `is_risk`, so on a lexicon-only run no record-level risk can be raised and the risk panel is left with theme thresholds only. And its question flag is the old trailing-question-mark test, so the recurring-questions panel is materially weaker without a key. In short: without `ANTHROPIC_API_KEY` the tool still runs end to end, but three of its panels — themes, risks and recurring questions — are running on a much thinner signal than this report otherwise describes.

**Reporting.** Labels are positive above +15, negative below −15, neutral in between — mirroring the ±0.15 band v1 used, so the *shape* of the distribution stays comparable even though the numbers do not. Every record carries a `sentiment_method` field, and the dashboard's source banner states which engine actually ran, so nobody can mistake fallback output for semantic scoring.

### 5. The Engagement Index

The v1 metric summed each record's native engagement count into one number — YouTube likes plus Reddit upvotes plus Discord reactions plus Twitch clip views, all added together untransformed. Those are different units measuring different intents at wildly different scales, so "total engagement" was largely a proxy for how much Twitch data happened to be fetched.

The replacement gives every record an index from 0 to 100 in three steps:

```
index = 100 × clamp( ln(1 + Σ metric×weight) / ln(1 + ceiling_platform), 0, 1 )
```

1. **Weighted raw signal.** Combine the platform's native metrics, weighting each by the author effort it represents. A reply costs more than a like; a like costs more than a passive view.
2. **Log compression.** Engagement is heavy-tailed — one viral post can be a thousand times the median — so a linear scale lets a single outlier dominate a whole game's average.
3. **Per-platform normalisation.** Divide by that platform's own viral ceiling, so 100 means "as viral as this platform gets" rather than "large number". This is what makes cross-platform comparison valid.

| Platform | Inputs and weights | Viral ceiling | Why that ceiling |
|---|---|---|---|
| YouTube | likes + 3×replies | 5,000 | The point at which a comment on an official trailer is a top-of-thread, screenshotted comment |
| Reddit | upvotes + 5×comments | 20,000 | Front-page-of-the-subreddit territory for a large gaming community |
| Discord | reactions + 2×replies | 40 | 40 reactions on one message is exceptional in a busy channel. The low ceiling — rather than a multiplier — is what puts that on the same footing as a viral YouTube comment |
| Twitch | clip views | 500,000 | A clip that escaped the category and circulated on other platforms |

One honest wrinkle in that table: the Discord collector does not fetch per-message reply counts, so every Discord row carries zero replies and the `5×replies` term contributes nothing. In practice Discord is scored on reactions alone. The weight is stated as the code holds it, not as it currently bites, and it would start to matter only if the collector were extended to read thread replies.

**Bands:** 0–20 background, 20–40 modest, 40–60 solid, 60–80 high, 80–100 exceptional.

**Aggregation is by mean, never sum.** A sum rewards whichever game the tool happened to collect more rows for. Volume is reported separately as `record_count`.

### 6. Publication region

Classified in strict precedence order from four publisher-side signals, with a fifth, deliberately weak fallback on the language of the text itself when nothing better exists. Each carries a stated confidence, and `region_source` on every record names the signal that decided it, so any regional figure on the dashboard is auditable back to a field.

| Priority | Signal | API field | Confidence |
|---|---|---|---|
| 1 | `channel_country` | YouTube `channels.list` → `snippet.country` | 0.95 |
| 2 | `source_config` | A region declared for a source in `server/config/*.json` | 0.90 |
| 3 | `guild_locale` | Discord guild → `preferred_locale` | 0.80 |
| 4 | `content_language` | YouTube `defaultAudioLanguage`/`defaultLanguage`; Twitch clip and stream `language` | 0.70 |
| 5 | `text_language` | Language detected by the semantic layer | 0.40 |

Buckets are Americas, EMEA, APAC and Undetermined — the split RS's campaign planning actually uses, given it works between Eastern and Western markets. Country codes map through an explicit table; languages map only where unambiguous. English, Spanish and Portuguese each span more than one bucket, so a bare `en`, `es` or `pt` resolves to nothing and only a regional variant tag decides it (`en-gb` → EMEA, `en-au` → APAC, `pt-br` → Americas) rather than being guessed.

Text language is the weakest signal and is treated as such: a Spanish comment on a US channel tells you about the commenter, not the publication. It is used only where nothing better exists and always reported at 0.4 confidence. Anything with no usable signal is shown as **Undetermined** rather than silently bucketed into a default region.

**No individual is ever geolocated.** That would be personal data outside this placement's data-source rules, and the platforms do not expose it.

### 7. Spikes, risks and recurring questions

**Spike detection.** For each bucket in a time series, the tool computes the mean and standard deviation of the preceding six buckets. A bucket is flagged when it is at least two standard deviations above that baseline *and* at least 1.5× the baseline mean, with a minimum of three records. The second condition stops a very flat, low-volume stretch from making a one-record bump look dramatic; where the baseline standard deviation is zero, a bucket must be at least double the baseline mean. The server computes spikes on the weekly series; the dashboard recomputes them client-side on whatever the filters produce, switching from daily to weekly buckets once the window exceeds seventy days.

**Risk scoring.** Two independent sources, ranked by severity. *Theme-level:* a theme with at least four mentions whose negative share reaches 55% or more and whose mean sentiment is −10 or lower; severity weights the negative share, the magnitude of the mean sentiment and the volume. *Record-level:* posts the semantic layer flagged as `is_risk`, grouped by game so the panel ranks rather than dumps, with severity rising with the number of flagged posts and the engagement of the loudest one.

**Recurring questions.** Where the semantic layer has run, only records it judged to be genuine, answerable questions are considered — this is the change from v1, where any string ending in "?" qualified. That older test is still what flags sample rows and what the lexicon fallback uses, so it has not disappeared, it has been demoted. Each question's text is reduced to a stopword-stripped token set, and questions are clustered greedily by Jaccard similarity at a 0.4 threshold. Each cluster reports its size, the games and platforms it spans, and the highest-engagement phrasing as its representative. A question asked once is not a content opportunity; the same question asked eleven ways is.

### 8. The snapshot store and day-over-day deltas

v1 had no history at all — its only state was a five-minute in-memory cache that died with the process, so no delta was computable. v2 writes one compact JSON snapshot per day.

Snapshots hold **aggregates only** — overall summary, per-game, per-platform and per-region summaries, theme counts and sentiment, the risk count and the provenance block. **No raw records are persisted**, so the directory stays at a few kilobytes a day and no user-authored text is stored beyond the short examples already shown on screen. Retention is 90 days, with older snapshots pruned automatically.

Storage resolves in order: `SNAPSHOT_DIR` if set, then `<repo>/data/snapshots`, then the OS temporary directory as a last resort for read-only filesystems. The third case is explicitly reported as ephemeral rather than pretending durability. Comparison is against the most recent snapshot *strictly earlier* than today rather than literally yesterday, so a weekend gap in collection still produces a meaningful comparison. Where no earlier snapshot exists, deltas return nulls with a stated reason so the interface can say "no comparison available yet" rather than implying nothing changed.

### 9. The daily briefing

The brief sits at the top of the dashboard because the client's test is that someone should open this each morning and understand what is happening within a few minutes without manually interpreting a wall of charts. A chart wall fails that test; a short written brief with the charts underneath as evidence passes it.

It returns a headline, a narrative, and four scannable sections: watch today, community risks, campaign opportunities, and changes against the previous snapshot.

**On length — the client asked what word count is appropriate. The answer is 150–200 words for the narrative**, and the reasoning is:

- 150–200 words reads in roughly 45–60 seconds, which is the realistic attention budget for a daily operational check before a standup.
- It is long enough for a headline judgement plus three or four supporting points with specifics — numbers, game names, theme names — and short enough that nothing can hide in it.
- Below about 120 words the brief loses its specifics and becomes horoscope text ("sentiment is mixed"), which is worse than no brief.
- Above about 250 words people skim, and a skimmed narrative is strictly worse than a scannable list. So everything beyond the narrative is structured as bullets instead of more prose.

The prompt instructs British English, no emoji, no exclamation marks; lead with the judgement then the evidence; cite the actual figures; claim something changed only when given delta data; distinguish collected data from the labelled sample and say so in the narrative when a finding rests mainly on the sample; and never invent a risk to fill the section — an empty risks array is a valid, honest answer.

**Fallback.** With no API key the brief is composed deterministically from the same computed figures. It is blunter and carries no interpretation, but the panel is never empty and never pretends an AI wrote it — a `generated_by` field states which path produced it, and the dashboard prints that field under the brief along with the reason the fallback was used. The measured word count is shown for the AI-written brief; the fallback reports only the 150–200 target, because it is assembled from fixed sentences rather than written to a length.

### 10. The dashboard

**Global filters.** A sticky bar at the top of the page carries four filters — media channel, product/game, time range and publication region — and all four re-derive every panel that is built from the record set. Channel and game are multi-select chips showing record counts; time range offers Today / 7 / 30 / 90 days / All plus custom start and end dates; region is a select populated from the regions actually present. Because `/api/analysis` returns the row-level records alongside the aggregates, filtering re-derives those panels client-side with no round trip. Two things sit outside the filters, and both are listed under Limitations: the briefing, which is generated server-side from the full dataset, and the Twitch live-viewer snapshot, which responds to the game filter only because it is a point-in-time figure rather than a set of records.

One deliberate behaviour worth knowing: the time-range presets anchor to the **newest record in the dataset**, not to the wall clock. With the historical sample loaded, anchoring to "now" would show an empty dashboard on first load.

**Accessibility.** Filter chips are real `<button>` elements with `aria-pressed`, not styled divs. Every control has a label, visually hidden where the design does not show one. Focus is visible via a three-pixel `:focus-visible` outline. There is a skip link straight to the briefing. Each of the three canvas charts has a visually-hidden text-equivalent table carrying the same numbers, and every panel table carries a caption and scoped column headers. Polite live regions announce the filter summary, the headline metrics and the briefing when they change, and the loading state is announced as a status. The loading spinner is disabled under `prefers-reduced-motion`. Every string that reaches `innerHTML` passes through an HTML-escaping helper.

**No CDN dependency.** Chart.js is vendored into `server/public/vendor/` by a postinstall script that copies it out of `node_modules`. RS's technical team deploys this internally, and an egress-restricted network would otherwise leave every chart blank with no visible error.

**API surface.** `GET /api/analysis` (add `?force=1` to bypass the five-minute cache), `GET /api/methodology` — the sentiment, Engagement Index, publication-region, pipeline and briefing-length methodology, i.e. sections 2, 4, 5, 6 and 9 above, served as data so the dashboard can render it on screen rather than pointing at a document — and `GET /api/health` for configuration status. The spike, risk and question-clustering thresholds in section 7 and the snapshot behaviour in section 8 are documented here and in the source, but are not served by that endpoint.

### 11. Ethical and compliance position

Only publicly accessible content is collected. No private messages, no paywalled content, no login-gated data beyond the Discord channels a server owner has explicitly invited the bot into. No client-confidential, internal campaign or commercial performance data is used anywhere.

Every platform is accessed through its official API with credentials, under that platform's terms. There is no scraping, no rate-limit evasion and no bot-detection bypass anywhere in the codebase. The v1 approach of capturing YouTube comments through a browser has been replaced with the Data API.

Personal data is limited to public display names attached to public posts. No commenter is ever geolocated. The snapshot store persists aggregates only — no raw user text is retained beyond the short examples shown on screen.

### 12. Limitations

These are stated plainly because a tool whose limits are unclear is more dangerous than one that is simply less capable.

**On the data**

- **The illustrative sample is present by default.** `DEMO_DATA` defaults to `true`. Any figure produced without turning it off is a blend of collected and synthetic data. The share is reported in the API and banner-flagged on screen, but it does mean that **absolute figures from a default run are not measurements**. Directional comparisons within a run are reasonable; the numbers themselves are not.
- **The sample has very low text diversity.** 452 rows are drawn from only **63 distinct text strings**. Its 46 question rows represent just **seven distinct questions**. Its "recurring questions" therefore recur by construction, and any cluster size, theme count or sentiment distribution computed from it reflects the generator's repetition rate rather than community behaviour.
- **The sample is scored differently from live data.** Sample rows are pre-scored by the lexicon at load time and never pass through the semantic layer, even when `ANTHROPIC_API_KEY` is set. They also always carry `is_risk: false`, `sarcasm: false`, `language: "en"`, region `Undetermined`, and a naive question flag based on a trailing question mark. So in a mixed run, sample and collected rows are **not scored on the same basis** — sample rows can never raise a risk, never contribute a region, and their sentiment comes from the weaker engine.
- **Sample rows only fill a platform with no live feed.** This is the right behaviour, but it means the sample share moves as credentials are added, so two runs a week apart may not be comparable if configuration changed in between.
- **Sample sizes are small.** A full refresh across all four platforms produces hundreds to low thousands of records. That supports direction-of-travel judgements and nothing more. `TOOL_LANDSCAPE.md` puts this in context: enterprise suites work with millions of mentions.
- **There is no deduplication, bot filtering or influencer weighting.** A copy-pasted campaign slogan, a spam bot and a 2-million-follower creator all count as one record each.

**On the metrics**

- **The Engagement Index ceilings are calibration constants, not licensed benchmarks.** They were chosen as the order of magnitude at which a post is unambiguously viral on each platform. They are stated in the code rather than buried precisely so they can be argued with, and they should be re-tuned against RS's own campaign data before the index appears in client reporting.
- **The index measures reach and reaction intensity, not sentiment.** A score of 90 can be 90 units of anger.
- **Twitch clip titles are promotional copy, not community opinion.** They are written by whoever clipped the moment — the broadcaster or a viewer — to attract clicks. Sentiment-scoring them measures a clipper's marketing instincts, not how players feel. Twitch rows are included because clip volume and virality are genuinely informative, but **Twitch sentiment should be read with heavy scepticism, and arguably excluded from any headline sentiment figure.**
- **Twitch clip views are passive.** A view can be an autoplay in a browse grid requiring no intent at all, so a high Twitch index reflects streamer reach as much as community feeling.
- **Global publisher channels collapse to a single region.** @PUBG and @WorldofWarcraft each declare one country, so an entire catalogue lands in one bucket. For those titles the regional split is an artefact of where the corporate channel is registered, not a genuine regional reading. Regional sub-channels would need to be tracked separately.
- **Twitch has no publisher country at all** at category level, so it is classified by stream language — a proxy, at 0.7 confidence.
- **Expect a meaningful share of "Undetermined"** until more regional sources are configured. That is honest reporting, not a failure, but it does thin out the regional panel.
- **Two snapshots are not a trend.** Deltas are a comparison against the most recent earlier day, nothing more.

**On the sentiment engine**

- **Semantic scoring costs money on every refresh.** Records are batched 40 per call, so a full live collection across four platforms is dozens of API calls per cold refresh, plus one higher-effort call for the briefing. The content-hash cache makes repeats cheap — but **the cache lives in process memory and dies with the process**, so a serverless deployment such as Vercel re-scores from scratch on every cold start. Budget for this before scheduling frequent automatic collection.
- **There is no hand-labelled validation set.** Nobody has measured this scorer's accuracy against human judgement on any of these five communities. It is better than a lexicon on the cases it is designed for, and that is an argument, not a measurement. Until a validation set exists, sentiment figures should carry a caveat in any client-facing deck.
- **There is no multilingual validation either.** Non-English text is scored on meaning and flagged with a language code, at slightly lower confidence — but nobody has checked whether a Simplified Chinese comment is scored as reliably as an English one. For an agency working between Chinese and Western markets, this is the most important unvalidated assumption in the tool.
- **The theme vocabulary is fixed at seventeen labels.** Genuinely novel topics land in "other". The vocabulary is a deliberate trade — themes that aggregate across five games and four platforms are useful in a chart; free-text themes are not — but it does mean an emerging topic with no existing label is invisible until someone adds one.
- **Low-confidence records still appear.** Every record carries a 0–1 confidence, but nothing filters on it automatically. A short, ambiguous or non-English comment counts the same as a clear one in a mean.
- **Without `ANTHROPIC_API_KEY` the tool is materially less capable than most of this report describes.** The lexicon fallback produces a sentiment score and nothing else: no theme, so the theme panel runs on the sample's mapped labels alone; no `is_risk`, so no record-level risk can ever be raised; and a trailing-question-mark test in place of genuine question detection. The dashboard's source banner says which engine ran, but a lexicon-only run should not be presented as a demonstration of the semantic layer.

**On operations and coverage**

- **Nothing is scheduled.** Collection happens when someone opens the dashboard or clicks refresh. There is no cron, no queue, no automatic daily run.
- **Nothing alerts.** A risk signal appears on the dashboard; it does not email, message or page anyone. The tool cannot wake anybody at 3am.
- **Snapshot durability depends on deployment.** On Vercel the filesystem is read-only and snapshots fall back to a temporary directory, so deltas do not survive a cold start. On Render's free plan the filesystem is ephemeral across redeploys. Durable history requires `SNAPSHOT_DIR` pointed at a mounted volume.
- **Discord coverage is one channel deep and is currently a test channel.** `server/config/discord_channels.json` holds a single entry labelled "Community Test Channel", which means it also appears as an option in the product/game filter alongside the five real titles. Genuine Discord coverage requires a server owner to invite the bot per server, and the config to name real game communities.
- **Reddit coverage is five subreddits, English-language and PC-skewed**, with no regional community configured — every entry has `region: null`, so no Reddit row can be classified by source config.
- **YouTube coverage is official publisher channels only.** Creator and press channels, where a great deal of the actual discussion happens, are not tracked.
- **The briefing is written from the full dataset, not the filtered view.** Apply a filter and the record-driven panels update, but the brief above them does not re-generate. The dashboard states this in a banner when filters are active, but it is a real limitation: there is currently no way to get a written brief for a single title or a single week.
- **The Twitch "live right now" panel ignores three of the four filters.** It is a point-in-time viewer snapshot rather than a set of scored records, so it responds to the product/game filter and nothing else. The panel says as much on screen, but do not read it as being in the same time window as the charts around it.
- **This is a prototype, not a product.** No support arrangement, no SLA, no SSO, no data-processing agreement, no audit trail. `TOOL_LANDSCAPE.md` sets out the full honest comparison against what the commercial market provides.

---

## Recommendations for Marketing Use

### 1. Where this tool earns its place inside a gaming marketing agency

**Content planning — the strongest use, available immediately.** The recurring-questions panel is a ready-made content shortlist. With `ANTHROPIC_API_KEY` configured, questions are identified semantically and clustered by topic, so "asked 11×" means eleven separate posts asking the same thing rather than eleven strings that happen to end in a question mark. Without a key the trailing-question-mark test is all that is available and the panel is worth considerably less. Each cluster is a finished brief for an FAQ post, a pinned dev response, a creator-partnered guide or a short-form video. Run weekly, this turns "what should we make content about" from a guess into a data-backed list with a size attached to each item.

**Campaign research and baselining.** Before a launch, season or crossover, take a fortnight of daily snapshots to establish baseline sentiment, volume and Engagement Index for the community. Then measure the lift once the campaign lands. The snapshot store makes this possible for the first time. The Engagement Index makes it comparable across platforms — which the v1 metric did not.

**Early warning on community problems.** Theme-level sentiment plus the risk panel flags a monetisation backlash, a balance controversy or a technical failure while it is still a theme rather than a press story. `PLATFORM_LANDSCAPE.md` makes the operational point: Discord gives the earliest warning and Reddit gives the loudest, and watching Discord message volume alongside Reddit comment velocity would have flagged the Helldivers 2 PSN episode within hours of the announcement. Note the honest limit — the tool surfaces this on a dashboard, it does not alert. Someone has to look.

**Portfolio and pitch work.** Running the same five metrics — sentiment, Engagement Index, themes, spikes, platform tone — across every title in a portfolio gives account teams a consistent way to characterise a community in a pitch or a quarterly review, without commissioning a bespoke study each time. Given RS's position between Eastern and Western markets, the publication-region split is the differentiating view here, with the caveat that global publisher channels currently collapse to one bucket.

**Cost positioning.** As `TOOL_LANDSCAPE.md` sets out, the market sells annual contracts with keyword and mention caps — Brand24's entry plan is three keywords and 2,000 mentions a month; enterprise suites run into tens of thousands a year. This tool costs API quota plus LLM usage. That makes it the thing you point at a title *before* anyone has approved a budget, which is precisely the moment an agency most needs a read.

### 2. Where AI genuinely helps, and where it does not

**It genuinely helps with:**

- Reading volume no human can. Theme assignment and question clustering across thousands of short posts scale in a way manual monitoring does not.
- Resolving meaning rather than matching words — sarcasm, negation, gaming slang and non-English text are exactly the cases a lexicon gets wrong, and they are common in this material.
- Translating figures into a judgement. The daily brief does the "which three things changed and what do I do about them" step that dashboards traditionally leave to a human at 9am. `TOOL_LANDSCAPE.md` identifies this as the clearest gap in the incumbent products.
- Producing a structured, searchable, shareable artefact instead of a pile of screenshots.

**It does not help with:**

- Accuracy you have not measured. Without a hand-labelled validation set, the sentiment engine's quality is an argument rather than a number — and for non-English text nobody has checked it at all.
- Explaining *why*. The tool detects a spike; a human explains what caused it. It flags a risk; a human decides the right response, the right voice and the right timing.
- Small samples. A handful of viral posts can swing a theme's mean sharply. Any figure below a few dozen records is noise.
- Anything that needs to be right rather than roughly right. A human should sanity-check every sentiment-driven claim before it enters a client-facing deck.

### 3. The roadmap

**Already delivered in v2 — do not re-scope these.** Official Reddit API access via OAuth. A permissioned Discord bot rather than scraping. Official YouTube Data API rather than browser capture. Twitch coverage, which was not in the original brief at all. Semantic NLP sentiment on a −100 to +100 scale with a documented fallback. A normalised, documented Engagement Index. Publication-region classification. Genuine spike detection, risk scoring and question clustering. Persisted daily snapshots and real deltas. An AI daily briefing. Global filters. Accessibility. Locally vendored charting.

**What genuinely remains.** In rough order of value per unit of effort:

| # | Item | Why it matters | Rough effort |
|---|---|---|---|
| 1 | **Scheduled automatic collection** | Nothing runs unless someone opens the page. A daily cron writing a snapshot is what turns deltas, baselines and spike detection from theoretically-working into actually-useful. Everything else on this list is worth less without it | Small — a scheduler and a durable `SNAPSHOT_DIR` |
| 2 | **Alerting thresholds** | The tool detects risk; it cannot tell anyone. An email or Slack message when a theme's negative share crosses a threshold, when volume spikes, or when a game's sentiment drops more than N points day-over-day, turns community monitoring from something someone remembers to check into something proactive | Small–medium; the detection logic already exists |
| 3 | **A hand-labelled validation set** | 200–300 records per community, labelled by a human, scored against the tool, reported as accuracy by platform and by language. This is the cheapest way to make sentiment figures defensible in a client deck — and, given RS's Chinese-market work, **it must include a non-English portion**. Until this exists, every sentiment figure needs a caveat | Medium — mostly human time, and it only needs doing once per major model change |
| 4 | **Regional sub-channel tracking** | Global publisher channels declare one country, so an entire catalogue lands in one region bucket. Adding regional YouTube channels, language-specific subreddits and regional Discord servers to the config — each with an explicit `region` where known — is what makes the regional split genuinely useful for an agency bridging two markets. The `source_config` signal already exists and is currently unused | Medium — mostly research into which sources exist per title |
| 5 | **Creator and influencer tracking** | The tool currently watches official publisher channels. A great deal of opinion formation happens on creator channels, and RS runs influencer campaigns. Tracking a configured set of creators per title — their videos, their comment sections, their Twitch clips — would connect community sentiment to the specific creators driving it | Medium — on YouTube this is config only, since the collector already works from channel handles; Twitch would need a broadcaster-level clips call, which it currently does not have |
| 6 | **Competitor comparison view** | Add competitor titles to the config and the same five metrics become a share-of-voice and relative-sentiment story. This is the view that sells work in a pitch, and it needs no new collection logic — only config and a comparison panel | Medium |
| 7 | **Export to deck** | Client-facing work ends in a slide. A one-click export of the briefing plus the headline charts, with the provenance and data-source notes carried through automatically, removes the manual screenshot step and — more importantly — makes it hard to accidentally present a figure without its caveat | Medium |

**Two further items worth flagging, outside the seven.** First, **a filtered briefing**: the brief is currently written from the full dataset, so there is no way to get a written summary for a single title or a single week. Second, **confidence-weighted aggregates**: every record already carries a 0–1 confidence, but nothing uses it in the means. Weighting by confidence, or simply reporting the mean confidence alongside each figure, would make the low-signal records visible instead of silently equal.

### 4. Suggested sequencing

**Weeks 1–2 — make it real.** Configure all four platforms with live credentials, set `DEMO_DATA=false`, point `SNAPSHOT_DIR` at durable storage, and add scheduled daily collection. From that point the tool accumulates the history that everything else depends on.

**Weeks 3–4 — make it trustworthy.** Build the hand-labelled validation set, including a non-English portion, and publish the accuracy numbers alongside the tool. Re-tune the Engagement Index ceilings against RS's own campaign data so the index reflects RS's benchmarks rather than a reasonable guess.

**Weeks 5–8 — make it proactive and broader.** Add alerting thresholds. Expand the source config: regional sub-channels, real Discord communities in place of the test channel, creator channels, and one competitor title per tracked game.

**Then pilot it properly.** One real account team, one real title, four weeks, with a standing instruction to note every time the tool was wrong and every time it told them something they did not already know. That feedback should drive the next phase — including whether export-to-deck or competitor comparison is the more valuable next build.

---

*Version 2, August 2026. This report, the running dashboard in `server/`, `PLATFORM_LANDSCAPE.md`, `TOOL_LANDSCAPE.md` and `CLIENT_ANSWERS.md` together form the written deliverable for this placement. The complete source code is in this repository.*
