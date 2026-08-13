# Responses to RS's Questions

**Gaming Community Pulse — v2**
Prepared for Ruisheng Holdings Limited · Attn: Jen So

This document answers the nine questions RS raised, in order. Each answer states what was asked, what
has been built in response, where the code lives, and — where relevant — what the limits still are.

Everything described here is implemented and running, not proposed. The one thing that is a judgement
call rather than a build is the word-count recommendation in §6, which RS explicitly asked for.

---

## Summary

| # | What RS asked for | Status | Where |
|---|---|---|---|
| 1 | Sentiment beyond keyword matching; NLP; −100…+100 scale | **Delivered** | `server/lib/nlp.js`, `server/lib/sentiment.js` |
| 2 | Explain the engagement score formula and logic | **Delivered — and the old metric was replaced** | `server/lib/engagement.js`, `/api/methodology` |
| 3 | Categorise posts/videos by publication region | **Delivered** | `server/lib/region.js` |
| 4 | Overview of data sources and processing logic | **Delivered, and served as live data** | `/api/methodology`, dashboard methodology panel |
| 5 | Global Media Channel + Time Range filters driving all components | **Delivered** | `server/public/dashboard-live.html` |
| 6 | AI-generated daily summary, plus a view on length | **Delivered; 150–200 words recommended** | `server/lib/briefing.js` |
| 7 | End-user experience — usable in a few minutes each morning | **Rebuilt around this** | dashboard layout |
| 8 | Business value — actionable insight, not just data | **Delivered** | `server/lib/analytics.js`, briefing panel |
| 9 | Complete source code for internal deployment | **Confirmed** | this repository |

Two gaps RS did not raise, but which we found while working through the questions, were also closed:
**Reddit was never actually implemented** (its data was synthetic), and **themes only existed on the
synthetic rows**, so the theme chart could never reflect live conversation. Both are now real.

---

## 1. Sentiment analysis

> *"Could you clarify how the current sentiment analysis works and whether it could be developed
> beyond keyword-based matching? … sarcasm or irony can result in a statement such as 'This game is
> amazing' expressing a negative sentiment … It would also be useful to consider displaying the
> sentiment score on a −100 to +100 scale."*

### How it worked before

A flat lexicon of roughly 60 words. Each word carried a fixed weight; the weights were summed and
normalised. There was no handling of negation, intensity, emoji or context. Two consequences worth
being blunt about, because RS's example was exactly right:

- **"This game is not good at all" scored +0.33 — positive.** The word *good* was matched and nothing
  reversed it.
- **"INSANE 1v5 clutch!!!" scored −0.33 — negative.** *Insane* was in the negative list, because in
  general English it is negative. In gaming it is praise.

Both are reproducible against the old code. They are not edge cases; the second one systematically
mis-scored the most enthusiastic content on Twitch and Discord.

### How it works now

Sentiment is scored in two layers.

**Primary — semantic scoring.** Every record is sent to Claude (`claude-opus-5` by default,
overridable via `ANTHROPIC_MODEL`) with a schema-constrained response. The model reads the author's
actual attitude rather than matching words, and returns:

| Field | What it is |
|---|---|
| `sentiment` | −100 to +100 |
| `confidence` | 0–1, lowered for short, ambiguous, mixed or non-English text |
| `sarcasm` | true when the literal wording differs from the intended meaning |
| `theme` | one of 17 controlled themes, so themes aggregate across all four channels |
| `is_question` | a genuine question, not merely a string ending in "?" |
| `is_risk` | signals a brewing community problem worth escalating today |
| `language` | ISO code, so non-English content is scored on meaning rather than ignored |

The system prompt teaches the model the gaming vocabulary the old scorer got backwards — that
*insane*, *sick*, *filthy*, *cracked*, *goated*, *fire* are praise; that *broken* is negative for bugs
but positive when a character is overpowered; that *dead game*, *copium*, *cash grab*, *p2w* and
*content drought* are strongly negative. RS's own example — praise-shaped wording following a list of
complaints — is called out explicitly as sarcasm to be scored negative.

Requests are batched 40 records at a time, run four batches in parallel, and are **cached by content
hash**, so a repeat refresh only pays to score genuinely new text.

**Fallback — gaming-tuned lexicon.** When `ANTHROPIC_API_KEY` is not configured, or a batch errors,
scoring falls back to a substantially rebuilt lexicon in `server/lib/sentiment.js`. It is not the old
one. It now handles:

- **negation** within a three-token window, damped rather than mirrored — *"not great"* is mildly
  negative, not the exact opposite of *"great"*;
- **intensifiers and diminishers** — *absolutely terrible* scales up, *kinda bad* scales down;
- **gaming slang polarity**, corrected;
- **emoji**, which the old `/[a-z]+/` tokenizer discarded entirely — this matters because Discord and
  Twitch reaction culture is heavily emoji-carried;
- **emphasis** — shouting and repeated exclamation marks amplify whatever polarity is present;
- **sarcasm markers** — praise-shaped text carrying an explicit marker is pulled to neutral and its
  confidence lowered, rather than being reported as praise. A lexicon cannot reliably invert sarcasm,
  but it must not read *"Great, another battle pass /s"* as positive either; neutral is the honest
  "we don't know". That case is precisely why the semantic layer exists.

The dashboard's source banner always states which engine actually ran, so fallback output is never
mistaken for semantic scoring.

### The −100 to +100 scale

Done, and it is the only scale now used. Record scores, game and channel averages, theme sentiment,
the time-series overlay, deltas and the KPI tile are all on −100…+100. Labels are positive above +15,
negative below −15, neutral between — the same proportional band as before, so directional comparisons
against the old figures still hold even though the numbers look different.

*(The archived v1 dashboard at `dashboard.html` still shows the old −1…+1 scale. It is labelled as a
frozen snapshot and should not be compared against the live tool.)*

### What we would still want before trusting it in client reporting

A hand-labelled validation set. Two hundred records per platform, scored by a human, measured against
the model. Without that we can say the scorer is far better than the old one and demonstrate it on
examples, but we cannot put an accuracy figure in a client deck. It is the first item on the roadmap.

---

## 2. Engagement score

> *"Could you provide a clear explanation of the formula and logic used to calculate the engagement
> score? What inputs and metrics contribute? How is each metric weighted? How are the different
> metrics combined? Is the score normalised in any way? What does a particular score represent in
> practical terms?"*

The honest answer to the original question is that the old metric did not deserve an explanation,
because it was not defensible. Rather than document it, we replaced it. Both answers follow.

### What the old metric did

It summed each record's native engagement count into one number, untransformed:

```
total_engagement = Σ ( YouTube likes + Reddit upvotes + Discord reactions + Twitch clip views )
```

Those are four different units, measuring four different acts, at wildly different scales. A Twitch
clip routinely carries five figures of passive views; a Discord message carries single-digit
reactions. Adding them means the total is largely a function of how much Twitch data happened to be
fetched. It was not comparable across games and should not have been presented as if it were.

### The Engagement Index

Every record now gets an index from **0 to 100**, in three steps.

**Step 1 — weighted raw signal.** Combine a platform's native metrics, weighting each by the author
effort it represents. Replying costs more than liking; liking costs more than passively viewing.

**Step 2 — logarithmic compression.** Engagement is heavy-tailed: one viral post can be a thousand
times the median. On a linear scale a single outlier dominates a game's average, so the raw signal is
compressed.

**Step 3 — per-platform normalisation.** Divide by that platform's own viral ceiling, so 100 means
"as viral as this platform gets" rather than "a large number". **This step is what makes cross-channel
comparison valid.**

```
index = 100 × clamp( ln(1 + Σ metric × weight) / ln(1 + ceiling_platform), 0, 1 )
```

**Inputs, weights and ceilings:**

| Channel | Inputs and weights | Viral ceiling | Why that ceiling |
|---|---|---|---|
| YouTube | likes ×1 + replies ×3 | 5,000 | The point at which a comment on an official trailer is a top-of-thread, screenshotted comment |
| Reddit | upvotes ×1 + comments ×5 | 20,000 | Front-page-of-the-subreddit territory for a large gaming community |
| Discord | reactions ×1 + replies ×2 | 40 | 40 reactions on one message is exceptional in a busy channel. The low ceiling — rather than a multiplier — is what puts that on the same footing as a viral YouTube comment |
| Twitch | clip views ×1 | 500,000 | A clip that escaped the category and circulated elsewhere |

**Is it normalised?** Yes — per platform, which is the normalisation that matters here. Without it the
figure is a proxy for platform mix rather than community reaction.

**What a score means in practice:**

| Range | Band | Meaning |
|---|---|---|
| 0–20 | background | Normal for the median post. No action implied. |
| 20–40 | modest | Noticed by the immediate community. |
| 40–60 | solid | Outperforming typical posts in its community. |
| 60–80 | high | Broke out beyond the core audience — worth reading. |
| 80–100 | exceptional | Platform-level viral. Treat as a signal in its own right. |

**Aggregation.** A game's headline figure is the **mean** index of its records, not the sum. A sum
rewards whichever game we happened to collect more rows for. Volume is reported separately as a record
count, because "how much is being said" and "how hard it lands" are different questions and a
marketer needs both.

The full methodology is served as structured data at **`GET /api/methodology`** and rendered on the
dashboard under *"How every number on this page is calculated"* — RS should not have to read source to
audit a number.

### Limits, stated plainly

- The ceilings are **calibration constants** chosen from observed orders of magnitude, not from a
  licensed platform benchmark. They should be re-tuned against RS's own campaign data before the index
  goes into client reporting.
- The index measures **reach and intensity, not sentiment**. A score of 90 can be 90 units of anger.
  Always read it alongside the sentiment figure.
- A high **Twitch** index reflects streamer reach as much as community feeling, because clip views are
  driven by the broadcaster's audience.

---

## 3. Categorisation by publication region

> *"Could posts/video content be classified according to the region in which the video was published?
> The objective is to understand whether posts/videos can be categorised by their publication region,
> rather than attempting to determine the geographic region of individual commenters."*

Yes — and RS's framing is respected exactly. **No commenter is ever geolocated.** That would be
personal data outside this placement's data-source rules, and the platforms do not expose it in any
case. Every signal used is a property of the publisher or of the content.

Records are classified into **Americas / EMEA / APAC / Undetermined** using this precedence:

| Priority | Signal | Where it comes from | Confidence |
|---|---|---|---|
| 1 | `channel_country` | YouTube `channels.list` → `snippet.country` — the country the channel itself declares | 0.95 |
| 2 | `source_config` | A region we declare for a source we know is regional, in `server/config/*.json` | 0.90 |
| 3 | `guild_locale` | Discord `guilds` → `preferred_locale` — the server's own declared locale | 0.80 |
| 4 | `content_language` | YouTube `defaultAudioLanguage`/`defaultLanguage`; Twitch clip and stream `language` | 0.70 |
| 5 | `text_language` | Language of the text, detected by the semantic layer | 0.40 |

Each record stores the region, **which signal decided it**, and a confidence — so any regional figure
on the dashboard is auditable back to a specific API field. Region is a global dashboard filter, has
its own breakdown panel, and the panel states the signal mix underneath it.

Records with no usable signal are shown as **Undetermined** rather than being quietly defaulted into a
region.

### The honest limitation

The five channels currently tracked are **global publisher channels** — `@PUBG`, `@WorldofWarcraft`
and so on. Each declares a single country, so its whole catalogue lands in one bucket. The mechanism
is right, but it will not produce an interesting regional split until regional sources are tracked:
per-region publisher channels, language-specific subreddits, or regional Discord servers. Those are
config entries, not code changes — `server/config/channels.json` and `subreddits.json` both take an
optional `region`. Given RS's China/West positioning, this is the single highest-value configuration
change available, and it is where we would point RS first.

---

## 4. Data sources and processing logic

> *"What data sources are currently being used? What dimensions and data points are being collected?
> How is the data processed and structured? How are the different metrics generated? How does the data
> flow from the original source through to the dashboard?"*

### Sources

| Channel | Method | Status | Compliance position |
|---|---|---|---|
| **YouTube** | Data API v3 — channel → uploads playlist → recent videos → comment threads | Live | Official API with a key. `search.list` is deliberately avoided (100 units/call); a full refresh of all five channels costs ~95 of the 10,000 daily units. |
| **Reddit** | Official OAuth API — top posts + recent comments per subreddit | Live | Application-only OAuth: read-only access to public subreddits, no user account acting on anyone's behalf. Identifying User-Agent as Reddit requires. No scraping. |
| **Discord** | Bot REST API | Live where permissioned | Requires the bot to be invited by a server owner with View Channels + Read Message History. Private-by-default is respected; nothing is read without permission. |
| **Twitch** | Helix API — top clips + live snapshot per category | Live | Client-credentials flow, no per-user login. Category-level, because most discussion happens on creator channels rather than a publisher's own Twitch presence. |

Public data only. No client-confidential information, internal campaign data, private community
content, commercial performance data, or personal data beyond public display names.

### Dimensions collected per record

`platform`, `game`, `source` (channel / subreddit / server / broadcaster), `content_type`, public
author handle, `timestamp`, `text`, native engagement metrics, publication-region signals, and `url`.

### Fields derived

`sentiment_score` (−100…100), `sentiment_label`, `sentiment_confidence`, `sentiment_method`,
`sarcasm`, `theme`, `is_question`, `is_risk`, `language`, `engagement_index` (0–100), `region`,
`region_source`, `region_confidence`.

### The flow, end to end

1. **Collect** — four platform wrappers pull in parallel; each returns rows in one shared schema plus
   whatever region signal that platform exposes.
2. **Enrich** — each row is scored once: semantic analysis, Engagement Index, region classification.
3. **Aggregate** — rows become time series, spike detections, theme aggregates, risk scores and
   question clusters.
4. **Compare** — a compact daily snapshot is persisted; today is compared against the most recent
   earlier snapshot to produce deltas.
5. **Brief** — the daily narrative is written from the finished analysis.
6. **Serve** — `/api/analysis` returns aggregates **and** row-level records together, which is what
   lets all three global filters re-derive every panel instantly with no round trip.

This same description is served as structured data at **`GET /api/methodology`** and rendered in the
dashboard, so it cannot drift out of date relative to the code the way a document can.

---

## 5. Global dashboard filters

> *"The Media Channel filter should be positioned prominently at the top of the dashboard as a global
> filter. A Time Range filter should also be included alongside it. When a Media Channel, Product /
> Game, or Time Range is selected, the dashboard components should update accordingly."*

Done, and this drove the layout.

A **sticky filter bar sits directly under the header**, above everything else, and stays visible while
scrolling. It carries four controls:

- **Media channel** — All / YouTube / Reddit / Discord / Twitch, multi-select, with live record counts
- **Product / game** — All plus each tracked title, multi-select, with counts
- **Time range** — Today / 7 / 30 / 90 days / All, plus custom start and end dates
- **Publication region** — the §3 buckets

Underneath, a plain-English line states exactly what is currently in view.

**Every panel derives from one filtered set.** There is a single `filtered()` function; the briefing
context note, KPI tiles, volume-and-sentiment chart, spike list, sentiment mix, Engagement Index
chart, channel comparison, theme table, region table, question clusters, top posts and the raw browser
all read from it. Adding a panel that ignores a filter would require deliberately bypassing that
function.

Two deliberate exceptions, both labelled on screen:

- **Twitch — live right now** responds to the game filter but not the time range, because a
  current-viewers snapshot is a point-in-time figure with no history to filter.
- **The briefing narrative** is written from the full dataset, since it is generated server-side before
  filters are applied. When any filter is active, a note above it says so rather than letting the
  reader assume the prose reflects their selection.

For reference, the previous behaviour: the platform dropdown was at the *bottom* of the page inside the
raw-data panel, drove only that one table, and omitted Twitch entirely despite Twitch records being
collected.

---

## 6. AI-generated daily summary

> *"Could an AI-generated daily summary be incorporated into the dashboard? … Please also suggest how
> many words would be proper to present."*

Yes. It is the **first thing on the page**, above the metrics.

Each refresh sends the finished analysis to Claude, which returns a structured brief:

| Section | Content |
|---|---|
| **Headline** | One sentence naming the single most important thing today |
| **Narrative** | 150–200 words of plain-English judgement, citing specific games, themes and numbers |
| **Watch today** | 2–4 things the team should pay attention to, one sentence each |
| **Community risks** | Anything that could become a PR or retention problem, with a severity |
| **Campaign opportunities** | Discussions that could inspire content, each tied to observed data |
| **Changed since last snapshot** | Movements against the previous stored day |

It covers every item RS listed: key discussions, trending topics, sentiment changes, emerging issues,
community risks, and notable changes versus previous days.

Three constraints are built into the prompt deliberately:

- **It may not invent a comparison.** If no earlier snapshot exists, it must say the comparison is not
  available rather than manufacture movement.
- **An empty risks section is a valid answer.** It is instructed not to fill the section to look busy.
- **It must distinguish collected data from the labelled sample**, and say so in the narrative when a
  finding rests mainly on sample data.

When no API key is configured the panel is composed deterministically from the same computed figures.
It is blunter and offers no interpretation, but the panel is never empty and the footer always states
which path produced it.

### How many words — the recommendation

**150–200 words for the narrative**, with everything else as scannable bullets. The reasoning:

- 150–200 words reads in roughly **45–60 seconds**, which is the realistic attention budget for a
  daily operational check before standup.
- It is long enough to carry a headline judgement plus three or four supporting points **with
  specifics** — names and numbers — and short enough that nothing can hide in it.
- **Below about 120 words** the brief loses its specifics and degrades into horoscope text
  ("sentiment is mixed this week"), which is worse than no brief at all.
- **Above about 250 words** people skim — and a skimmed narrative is strictly worse than a list. So
  everything past the narrative is structured as bullets rather than more prose.

The generated brief reports its own word count in the panel footer, so drift is visible.

---

## 7. End-user experience

> *"The objective is not simply to create another dashboard … someone should be able to open the
> dashboard each morning and understand what is happening across the gaming community within a few
> minutes, without having to manually interpret a large number of charts and metrics. If I were a
> member of the marketing team, what information would I want to see first every morning?"*

This question changed the shape of the product more than any other. The previous version was, honestly,
a chart wall: nine panels of charts and tables, and all interpretation left to the reader.

The page is now ordered by **what a marketing manager needs first**:

1. **The briefing** — headline, then a one-minute narrative, then watch-today / risks / opportunities /
   what changed. This alone answers "what is happening".
2. **Five KPI tiles** — records in view, mean sentiment, Engagement Index, risk-signal count, negative
   share. Each carries a one-line explanation of its own scale, so no tile requires prior knowledge.
3. **Charts as evidence**, not as the primary interface — volume with statistically detected spikes
   called out in words underneath, sentiment mix, Engagement Index, channel comparison.
4. **Reading material** — themes, recurring questions clustered by topic, highest-impact posts.
5. **The raw records**, so any figure can be traced to the rows behind it.
6. **A methodology panel**, collapsed by default, explaining every number on the page.

Specific things fixed for the end user:

- **Developer instructions no longer appear in the UI.** The old build rendered "add
  `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` to `server/.env` and restart the server" inside a
  visible panel, to a marketing audience.
- **Provenance is visible, not buried.** A banner states what share of the dataset is illustrative
  sample data, and every sample row is tagged wherever it appears.
- **Spikes are named in words** — "3.2× the trailing baseline" — rather than left as a bump on a line.
- **Accessibility**, which was absent: real `<button>` elements with `aria-pressed` instead of clickable
  `<div>`s, labelled controls, visible focus outlines, a skip link, live regions on the briefing and
  KPI row, and a text-equivalent table behind every chart for screen readers.
- **Every piece of third-party text is HTML-escaped.** The previous build interpolated raw comment,
  clip and video text straight into `innerHTML`, which was a stored-XSS vector — worth flagging
  precisely because RS intends to deploy this internally.
- **Chart.js is served locally** rather than from a CDN, so the dashboard renders on an
  egress-restricted internal network instead of silently showing blank charts.

---

## 8. Business value and actionable insights

> *"What topics should the marketing team pay attention to today? Are there any potential community
> risks? Are there emerging trends that may require a response? Are there discussions that could
> inspire future campaign ideas? What changes or developments are particularly significant?"*

Each of the five is now computed and surfaced, rather than left for the reader to infer.

| RS's question | How it is answered | Implementation |
|---|---|---|
| What should we pay attention to today? | "Watch today" in the briefing, ranked, each naming a game or theme | `lib/briefing.js` |
| Are there community risks? | Risk detection from two independent sources, severity-scored and ranked | `lib/analytics.js` → `detectRisks` |
| Emerging trends needing a response? | Statistical spike detection plus theme movement against the previous snapshot | `detectSpikes`, `computeDeltas` |
| Discussions that could inspire campaigns? | Topic-clustered recurring questions and highest-impact posts | `clusterQuestions` |
| What changed significantly? | Day-over-day deltas on sentiment, volume, engagement and theme counts | `lib/store.js`, `computeDeltas` |

Three of these were previously described in the report but not implemented, which is worth being
explicit about:

- **Spikes were never detected.** They were hardcoded into the synthetic data generator as
  `SPIKE_WEEKS` and then narrated as findings. Detection now runs a rolling z-score against a trailing
  baseline, requiring both statistical significance and a meaningful multiple of the baseline so a
  quiet stretch cannot make a one-record bump look dramatic.
- **"Recurring questions" did not test recurrence.** It was `text.endsWith("?")`, sorted by score.
  Questions are now clustered by topical overlap, and the panel reports "asked N×" — a question asked
  once is not a content opportunity; the same question asked eleven ways is.
- **Risk detection did not exist.** It now combines record-level flags from the semantic layer
  (refund and uninstall talk, review-bombing, accusations of bad faith) with theme-level thresholds
  (meaningful volume, negative share above 55%, clearly negative mean sentiment).

---

## 9. Final deliverable — source code

> *"Please confirm that the final deliverable will include the complete source code. The source code
> will then be deployed internally by the technical team."*

Confirmed. The repository is the deliverable in full: server, all library modules, all configuration,
both dashboards, the data-build scripts, the datasets, and every written document.

Handover items specifically prepared for RS's technical team:

- **`server/.env.example`** — every environment variable, what it unlocks, and what happens when it is
  absent. Previous documentation told the reader the keys were "already saved in `server/.env`"; that
  file is gitignored and does not exist in a fresh clone.
- **It runs with no credentials at all.** Every unconfigured source is labelled "not configured" on
  screen rather than failing, so a first deploy is never a blank error page.
- **Dependency lockfiles** are committed at both the root and in `server/`.
- **`render.yaml`** declares all seven credentials plus the two behaviour flags. **`vercel.json`** has
  been rewritten — the previous version was schema-invalid (a duplicate catch-all route, an object
  where a string was required, and an unrecognised top-level key) and would have failed validation
  rather than deployed.
- **Chart.js is vendored** into `server/public/vendor/` and committed, so the dashboard renders
  without CDN access on an internal network.
- **`GET /api/health`** reports exactly which integrations are configured, whether semantic analysis is
  active, and whether snapshot storage is durable.

Two operational notes for deployment:

- **Day-over-day deltas need durable storage.** Snapshots default to `data/snapshots`; free-tier
  Render and Vercel have ephemeral filesystems, so history resets on redeploy. Set `SNAPSHOT_DIR` to a
  mounted volume to keep trends.
- **Semantic scoring calls a paid API per new record.** Scoring is cached by content hash so repeat
  refreshes only pay for genuinely new text, and sample rows are never sent. Costs scale with how many
  new comments appear between refreshes, not with how often the dashboard is opened.

### Credential hygiene

The Discord bot token and Twitch client secret were shared in chat during earlier work. No secrets are
present in git history — we checked — but both should be regenerated before this goes into a real
business environment: Discord in the Developer Portal (Bot → Reset Token), Twitch in the developer
console (New Secret).

---

## What we would do next

In the order we would actually do it. The full version of this list, with effort estimates, is in the
report's Recommendations section; this is the short form.

1. **Schedule automatic collection** — daily and unattended. Nothing runs unless someone opens the
   page, which means deltas, baselines and spike detection are all technically working but rarely
   fed. Everything below is worth less without this, which is why it is first despite being the
   smallest job on the list.
2. **Add alerting** on the risk thresholds already computed. The tool detects risk; it cannot yet tell
   anyone. This is what turns community monitoring from something someone remembers to check into
   something proactive.
3. **Build a hand-labelled validation set** — 200–300 records per community, including a non-English
   portion given RS's Chinese-market work — and measure the scorer against it. Until it exists we can
   demonstrate sentiment quality but not quantify it, and every figure needs a caveat.
4. **Add regional sources** so the §3 region split becomes genuinely informative for RS's China/West
   positioning. Configuration, not code — the `source_config` signal already exists and is unused.
5. **Re-tune the Engagement Index ceilings** against RS's own campaign benchmarks, so the index stops
   resting on our calibration judgement.
6. **Pilot with one account team on one real title for a few weeks**, and let their feedback set the
   next build — our guess is creator/influencer tracking and a competitor comparison view, but that
   should be their call rather than ours.
